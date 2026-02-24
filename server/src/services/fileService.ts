import fs from 'fs';
import path from 'path';
import { diffLines } from 'diff';
import { exec, ChildProcess } from 'child_process';
import util from 'util';
import net from 'net';

const execAsync = util.promisify(exec);

const WORKSPACE_ROOT = path.join(__dirname, '../../workspace');
const TEMPLATE_ROOT = path.join(__dirname, '../../templates');

// Track running dev servers by sessionId
const devServers = new Map<string, { process: ChildProcess; port: number; logs: string; command: string }>();
let nextPort = 5173;

/**
 * Install npm dependencies in a workspace directory.
 * Only runs once per session (when node_modules doesn't exist).
 */
export async function installDependencies(sessionId: string, onProgress?: (data: string) => void): Promise<void> {
    const workspaceDir = path.join(WORKSPACE_ROOT, sessionId);
    const nodeModulesDir = path.join(workspaceDir, 'node_modules');

    // Skip if already installed
    if (fs.existsSync(nodeModulesDir)) return;

    return new Promise((resolve, reject) => {
        console.log(`[${sessionId}] Installing dependencies...`);
        const cmd = 'npm install --prefer-offline --no-audit --no-fund';
        if (onProgress) onProgress(`$ ${cmd}\n`);

        const child = exec(cmd, {
            cwd: workspaceDir,
            timeout: 120_000, // 2 minute timeout
        });

        child.stdout?.on('data', (data: string) => {
            if (onProgress) onProgress(data);
        });

        child.stderr?.on('data', (data: string) => {
            if (onProgress) onProgress(data);
        });

        child.on('exit', (code) => {
            if (code === 0) {
                console.log(`[${sessionId}] Dependencies installed successfully.`);
                resolve();
            } else {
                console.error(`[${sessionId}] npm install failed with code ${code}`);
                // Don't reject — verification will just degrade gracefully
                resolve();
            }
        });

        child.on('error', (err) => {
            console.error(`[${sessionId}] npm install spawn error:`, err.message);
            resolve();
        });
    });
}

/**
 * Helper to dynamically find a free port starting from a given port.
 */
async function getFreePort(startPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                resolve(getFreePort(startPort + 1));
            } else {
                reject(err);
            }
        });
        server.listen(startPort, () => {
            const port = (server.address() as net.AddressInfo).port;
            server.close(() => resolve(port));
        });
    });
}

/**
 * Start a Vite dev server for a workspace session.
 * Returns the port number the server is running on along with the startup logs.
 */
export async function startDevServer(sessionId: string): Promise<{ port: number; logs: string; command: string } | null> {
    // Don't start a second server for the same session
    if (devServers.has(sessionId)) {
        const cached = devServers.get(sessionId)!;
        return { port: cached.port, logs: cached.logs, command: cached.command };
    }

    const workspaceDir = path.join(WORKSPACE_ROOT, sessionId);
    if (!fs.existsSync(path.join(workspaceDir, 'node_modules'))) {
        console.warn(`[${sessionId}] Cannot start dev server — node_modules missing`);
        return null;
    }

    try {
        const port = await getFreePort(nextPort);
        // Advance nextPort so future searches start higher
        nextPort = port + 1;

        const cmd = `npx vite --port ${port} --strictPort --host`;
        const child = exec(cmd, {
            cwd: workspaceDir,
        });

        return new Promise((resolve) => {
            let startupLogs = '';
            let resolved = false;

            const handleData = (data: string) => {
                startupLogs += data;
                if (!resolved && (data.includes('ready in') || data.includes('Local:'))) {
                    console.log(`[${sessionId}] Dev server ready on port ${port}`);
                    devServers.set(sessionId, { process: child, port, logs: startupLogs.trim(), command: cmd });
                    resolved = true;
                    resolve({ port, logs: startupLogs.trim(), command: cmd });
                }
            };

            child.stdout?.on('data', handleData);
            child.stderr?.on('data', (data: string) => {
                startupLogs += data;
                // Vite logs some info to stderr, only log if it looks like a real error
                if (data.includes('Error') || data.includes('error')) {
                    console.error(`[${sessionId}] Dev server error:`, data.trim());
                }
            });

            child.on('exit', (code) => {
                console.log(`[${sessionId}] Dev server exited with code ${code}`);
                devServers.delete(sessionId);
                if (!resolved) {
                    resolved = true;
                    resolve(null);
                }
            });

            console.log(`[${sessionId}] Dev server starting on port ${port}`);

            // Timeout after 15 seconds if it never says "ready in"
            setTimeout(() => {
                if (!resolved) {
                    console.warn(`[${sessionId}] Dev server ready timeout. Proceeding anyway.`);
                    devServers.set(sessionId, { process: child, port, logs: startupLogs.trim(), command: cmd });
                    resolved = true;
                    resolve({ port, logs: startupLogs.trim(), command: cmd });
                }
            }, 15000);
        });
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
