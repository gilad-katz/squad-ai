import fs from 'fs';
import path from 'path';
import { diffLines } from 'diff';

const WORKSPACE_ROOT = path.join(__dirname, '../../workspace');
const TEMPLATE_ROOT = path.join(__dirname, '../../templates');

/**
 * Resolve a safe path within the workspace, preventing traversal attacks.
 */
export function safePath(sessionId: string, filepath: string): string {
    const sessionDir = path.join(WORKSPACE_ROOT, sessionId);
    const resolved = path.resolve(sessionDir, filepath);
    if (!resolved.startsWith(sessionDir + path.sep)) {
        throw new Error(`Path traversal attempt blocked: ${filepath}`);
    }
    return resolved;
}

/**
 * Copy template files recursively into a target directory.
 */
function copyTemplates(srcDir: string, destDir: string) {
    if (!fs.existsSync(srcDir)) return;
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        if (entry.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyTemplates(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * Ensure the workspace directory for a session exists.
 * On first creation, copies standard project scaffolding templates.
 */
export function ensureWorkspace(sessionId: string): { dir: string; isNew: boolean } {
    const dir = path.join(WORKSPACE_ROOT, sessionId);
    const isNew = !fs.existsSync(dir);
    fs.mkdirSync(dir, { recursive: true });

    // Copy template scaffolding into brand-new workspaces
    if (isNew) {
        copyTemplates(TEMPLATE_ROOT, dir);
    }

    return { dir, isNew };
}

/**
 * Write a file to the workspace. Creates parent directories automatically.
 * Returns the old content if the file existed (for diff computation).
 */
export function writeFile(sessionId: string, filepath: string, content: string): string | null {
    const fullPath = safePath(sessionId, filepath);
    let oldContent: string | null = null;

    if (fs.existsSync(fullPath)) {
        if (fs.statSync(fullPath).isDirectory()) {
            throw new Error(`Cannot write file over directory: ${filepath}`);
        }
        oldContent = fs.readFileSync(fullPath, 'utf8');
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    return oldContent;
}

/**
 * Read a file from the workspace.
 */
export function readFile(sessionId: string, filepath: string): string {
    const fullPath = safePath(sessionId, filepath);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        throw new Error(`Cannot read directory as file: ${filepath}`);
    }
    return fs.readFileSync(fullPath, 'utf8');
}

/**
 * Delete a file from the workspace.
 */
export function deleteFile(sessionId: string, filepath: string): void {
    const fullPath = safePath(sessionId, filepath);
    if (fs.existsSync(fullPath)) {
        if (fs.statSync(fullPath).isDirectory()) {
            throw new Error(`Cannot delete directory: ${filepath}`);
        }
        fs.unlinkSync(fullPath);
    }
}

// Directories to exclude from file listings
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', '.vite']);

/**
 * List all files in a workspace recursively.
 */
export function listFiles(sessionId: string): string[] {
    const sessionDir = path.join(WORKSPACE_ROOT, sessionId);
    if (!fs.existsSync(sessionDir)) return [];

    const results: string[] = [];
    function walk(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (EXCLUDED_DIRS.has(entry.name)) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else {
                results.push(path.relative(sessionDir, full));
            }
        }
    }
    walk(sessionDir);
    return results;
}

/**
 * Generate a unified diff string between old and new content.
 */
export function generateDiff(oldContent: string, newContent: string, filepath: string): string {
    const changes = diffLines(oldContent, newContent);
    const lines: string[] = [`--- a/${filepath}`, `+++ b/${filepath}`];
    for (const part of changes) {
        const prefix = part.added ? '+' : part.removed ? '-' : ' ';
        const partLines = part.value.replace(/\n$/, '').split('\n');
        for (const line of partLines) {
            lines.push(prefix + line);
        }
    }
    return lines.join('\n');
}
