import fs from 'fs';
import path from 'path';
import { diffLines } from 'diff';
import { exec, ChildProcess } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

const WORKSPACE_ROOT = path.join(__dirname, '../../workspace');
const TEMPLATE_ROOT = path.join(__dirname, '../../templates');

// Track running dev servers by sessionId
const devServers = new Map<string, { process: ChildProcess; port: number }>();
let nextPort = 5173;

/**
 * Install npm dependencies in a workspace directory.
 * Only runs once per session (when node_modules doesn't exist).
 */
export async function installDependencies(sessionId: string): Promise<void> {
    const workspaceDir = path.join(WORKSPACE_ROOT, sessionId);
    const nodeModulesDir = path.join(workspaceDir, 'node_modules');

    // Skip if already installed
    if (fs.existsSync(nodeModulesDir)) return;

    try {
        console.log(`[${sessionId}] Installing dependencies...`);
        await execAsync('npm install --prefer-offline --no-audit --no-fund', {
            cwd: workspaceDir,
            timeout: 120_000, // 2 minute timeout
        });
        console.log(`[${sessionId}] Dependencies installed successfully.`);
    } catch (err: any) {
        console.error(`[${sessionId}] npm install failed:`, err.message);
        // Don't throw — verification will just degrade gracefully
    }
}

/**
 * Start a Vite dev server for a workspace session.
 * Returns the port number the server is running on.
 */
export function startDevServer(sessionId: string): number | null {
    // Don't start a second server for the same session
    if (devServers.has(sessionId)) {
        return devServers.get(sessionId)!.port;
    }

    const workspaceDir = path.join(WORKSPACE_ROOT, sessionId);
    if (!fs.existsSync(path.join(workspaceDir, 'node_modules'))) {
        console.warn(`[${sessionId}] Cannot start dev server — node_modules missing`);
        return null;
    }

    const port = nextPort++;
    try {
        const child = exec(`npx vite --port ${port} --host`, {
            cwd: workspaceDir,
        });

        child.stdout?.on('data', (data: string) => {
            if (data.includes('ready in') || data.includes('Local:')) {
                console.log(`[${sessionId}] Dev server ready on port ${port}`);
            }
        });

        child.stderr?.on('data', (data: string) => {
            // Vite logs some info to stderr, only log if it looks like a real error
            if (data.includes('Error') || data.includes('error')) {
                console.error(`[${sessionId}] Dev server error:`, data.trim());
            }
        });

        child.on('exit', (code) => {
            console.log(`[${sessionId}] Dev server exited with code ${code}`);
            devServers.delete(sessionId);
        });

        devServers.set(sessionId, { process: child, port });
        console.log(`[${sessionId}] Dev server starting on port ${port}`);
        return port;
    } catch (err: any) {
        console.error(`[${sessionId}] Failed to start dev server:`, err.message);
        return null;
    }
}

/**
 * Stop the dev server for a workspace session.
 */
export function stopDevServer(sessionId: string): void {
    const entry = devServers.get(sessionId);
    if (entry) {
        entry.process.kill();
        devServers.delete(sessionId);
        console.log(`[${sessionId}] Dev server stopped.`);
    }
}

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
 * Ensure src/vite-env.d.ts exists in the workspace.
 * This provides type declarations for CSS modules and assets,
 * preventing the LLM from trying to use illegal 'as any' workarounds.
 */
export function ensureViteTypes(sessionId: string): void {
    const workspaceDir = path.join(WORKSPACE_ROOT, sessionId);
    const srcDir = path.join(workspaceDir, 'src');
    const viteEnvPath = path.join(srcDir, 'vite-env.d.ts');
    const templateEnvPath = path.join(TEMPLATE_ROOT, 'src/vite-env.d.ts');

    if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir, { recursive: true });

    if (!fs.existsSync(viteEnvPath) && fs.existsSync(templateEnvPath)) {
        fs.copyFileSync(templateEnvPath, viteEnvPath);
        console.log(`[${sessionId}] ensured vite-env.d.ts presence.`);
    }
}

// Directories to exclude from file listings
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', '.vite', '.DS_Store', 'coverage']);

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
