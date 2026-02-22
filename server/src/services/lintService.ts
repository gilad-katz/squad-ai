import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = util.promisify(exec);
const WORKSPACE_ROOT = path.join(__dirname, '../../workspace');

export interface LintError {
    line: number;
    column: number;
    message: string;
    ruleId: string;
    severity: number;
}

export interface LintResult {
    filepath: string;
    messages: LintError[];
    errorCount: number;
    warningCount: number;
}

/**
 * Runs ESLint on the specified workspace and returns a structured report.
 */
export async function lintWorkspace(sessionId: string): Promise<LintResult[]> {
    const workspaceDir = path.join(WORKSPACE_ROOT, sessionId);
    if (!fs.existsSync(workspaceDir)) {
        return [];
    }

    try {
        // Run ESLint via npx to avoid needing a local install in every workspace immediately
        // We use the JSON format for easy parsing
        // We target the 'src' directory as per our template structure
        const { stdout, stderr } = await execAsync(
            'npx eslint src --format json',
            { cwd: workspaceDir }
        );

        // If it exits with 0 andhas output, it might be empty or clean
        return parseLintOutput(stdout || '[]');
    } catch (err: any) {
        // ESLint exits with non-zero if errors are found
        if (err.stdout) {
            return parseLintOutput(err.stdout);
        }
        console.error(`ESLint failed for session ${sessionId}:`, err.message);
        return [];
    }
}

function parseLintOutput(stdout: string): LintResult[] {
    try {
        const results = JSON.parse(stdout);
        return results.map((r: any) => ({
            filepath: r.filePath, // Note: this is an absolute path
            messages: r.messages.map((m: any) => ({
                line: m.line,
                column: m.column,
                message: m.message,
                ruleId: m.ruleId,
                severity: m.severity
            })),
            errorCount: r.errorCount,
            warningCount: r.warningCount
        }));
    } catch (err) {
        console.error('Failed to parse ESLint JSON output:', err);
        return [];
    }
}

/**
 * Runs TypeScript type checking on the specified workspace.
 */
export async function typeCheckWorkspace(sessionId: string): Promise<string[]> {
    const workspaceDir = path.join(WORKSPACE_ROOT, sessionId);
    if (!fs.existsSync(workspaceDir)) {
        return [];
    }

    try {
        // Use the absolute path to the local project's tsc binary for reliability
        const tscPath = path.join(__dirname, '../../node_modules/.bin/tsc');
        // If local tsc doesn't exist, fallback to npx
        const cmd = fs.existsSync(tscPath) ? tscPath : 'npx tsc';

        await execAsync(`${cmd} --noEmit --pretty false`, { cwd: workspaceDir });
        return []; // No errors
    } catch (err: any) {
        let output = '';
        if (err.stdout) output += err.stdout;
        if (err.stderr) output += '\n' + err.stderr;

        if (output) {
            // Robust regex to match both ": error TS" and "- error TS" formats
            // Matches formats like:
            // src/App.tsx(2,7): error TS2307: ...
            // src/App.tsx:2:7 - error TS2307: ...
            const lines = output.split('\n').filter(line =>
                line.includes('error TS') ||
                line.includes('cannot find module') ||
                line.includes('no exported member')
            );

            if (lines.length > 0) return lines;
        }

        // If we have an error but no recognized output, return the raw error message
        return [err.message || 'Unknown TypeScript error'];
    }
}

/**
 * Scans workspace source files for relative imports that point to non-existent files.
 * This catches CSS/image/asset imports that tsc ignores (moduleResolution: "bundler").
 */
export async function checkMissingImports(sessionId: string): Promise<string[]> {
    const workspaceDir = path.join(WORKSPACE_ROOT, sessionId);
    const srcDir = path.join(workspaceDir, 'src');
    if (!fs.existsSync(srcDir)) return [];

    const errors: string[] = [];
    const sourceFiles = getAllSourceFiles(srcDir);

    for (const absFilePath of sourceFiles) {
        const content = fs.readFileSync(absFilePath, 'utf-8');
        const relFilePath = path.relative(workspaceDir, absFilePath);

        // Match: import ... from './path' or import './path'
        const importRegex = /import\s+(?:.*?\s+from\s+)?['"](\.\/.+?|\.\.\/[^'"]+)['"]/g;
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];
            const importDir = path.dirname(absFilePath);
            const resolvedBase = path.join(importDir, importPath);

            // If the import has an explicit extension (e.g. .css, .png, .svg), check directly
            if (path.extname(importPath)) {
                if (!fs.existsSync(resolvedBase)) {
                    errors.push(`${relFilePath}: Missing import '${importPath}' — file does not exist`);
                }
            } else {
                // No extension — try TS/JS extensions (tsc already handles these, but belt-and-suspenders)
                const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
                const found = extensions.some(ext => fs.existsSync(resolvedBase + ext));
                if (!found) {
                    errors.push(`${relFilePath}: Missing import '${importPath}' — file does not exist`);
                }
            }
        }
    }
    return errors;
}

/** Recursively collect all .ts/.tsx/.js/.jsx files under a directory */
function getAllSourceFiles(dir: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules') {
            files.push(...getAllSourceFiles(fullPath));
        } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
            files.push(fullPath);
        }
    }
    return files;
}

/**
 * Extracts the file path from a tsc error line.
 * Handles both formats:
 *   src/App.tsx(7,10): error TS2305: ...
 *   src/App.tsx:7:9 - error TS2305: ...
 */
export function extractFilePathFromTscError(errorLine: string): string | null {
    // Parenthesis format: src/App.tsx(7,10): error TS...
    const parenMatch = errorLine.match(/^([^(\s]+)\(/);
    if (parenMatch) return parenMatch[1];

    // Colon format: src/App.tsx:7:9 - error TS...
    const colonMatch = errorLine.match(/^(.+?\.\w+):\d+:\d+/);
    if (colonMatch) return colonMatch[1];

    // Simple format: src/components/Card.tsx: Missing import './Card.css'
    const simpleMatch = errorLine.match(/^(src\/.+?\.\w+):\s/);
    if (simpleMatch) return simpleMatch[1];

    return null;
}

/**
 * Extracts the module path from a tsc "no exported member" or "cannot find module" error.
 * Returns the relative module specifier (e.g., './constants/routes').
 */
export function extractModulePathFromTscError(errorLine: string): string | null {
    // tsc --pretty false outputs module paths in various quote-wrapped formats:
    //   Module '"./constants/routes"' has no exported member 'ROUTES'.
    //   Module '"../constants/routes"' has no exported member 'ROUTES'.
    //   Cannot find module './constants/routes' or its corresponding type declarations.
    // Use a broad regex that handles both: look for ./ or ../ after any combination of quotes
    const match = errorLine.match(/[Mm]odule\s+['"]*(\.\.\/.+?|\.\/.+?)["']/);
    if (match) return match[1];

    const cantFindMatch = errorLine.match(/Cannot find module\s+['"]*(\.\.\/.+?|\.\/.+?)["']/);
    if (cantFindMatch) return cantFindMatch[1];

    return null;
}

/**
 * Formats verification results (Lint + TSC) into a string for the LLM.
 */
export function formatVerificationErrorsForPrompt(
    lintResults: LintResult[],
    tscErrors: string[],
    workspaceDir: string
): string {
    let output = '';

    const filesWithLintErrors = lintResults.filter(r => r.errorCount > 0);
    if (filesWithLintErrors.length > 0) {
        output += '### ESLINT ERRORS:\n';
        output += filesWithLintErrors.map(r => {
            const relativePath = path.relative(workspaceDir, r.filepath);
            const errors = r.messages
                .filter(m => m.severity === 2)
                .map(m => `- Line ${m.line}:${m.column}: ${m.message} (${m.ruleId})`)
                .join('\n');
            return `File: ${relativePath}\n${errors}`;
        }).join('\n\n');
        output += '\n\n';
    }

    if (tscErrors.length > 0) {
        output += '### TYPESCRIPT ERRORS (CRITICAL):\n';
        output += tscErrors.map(err => `- ${err}`).join('\n');
    }

    return output || 'No errors found. Verification passed.';
}

export function formatLintErrorsForPrompt(results: LintResult[], workspaceDir: string): string {
    const filesWithErrors = results.filter(r => r.errorCount > 0);
    if (filesWithErrors.length === 0) return 'No lint errors found.';

    return filesWithErrors.map(r => {
        const relativePath = path.relative(workspaceDir, r.filepath);
        const errors = r.messages
            .filter(m => m.severity === 2) // only errors
            .map(m => `- Line ${m.line}:${m.column}: ${m.message} (${m.ruleId})`)
            .join('\n');
        return `File: ${relativePath}\n${errors}`;
    }).join('\n\n');
}
