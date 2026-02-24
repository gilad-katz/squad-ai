import { Router } from 'express';
import { validateChat } from '../middleware/validateChat';
import { ai } from '../services/gemini';
import { ensureWorkspace, writeFile, deleteFile, generateDiff, listFiles, readFile, installDependencies, startDevServer, ensureViteTypes } from '../services/fileService';
import { getWorkspaceConfig } from '../services/gitService';
import { executeFileAction, runWithConcurrency } from '../services/executor';
import { globalFileQueue } from '../services/fileQueue';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import { lintWorkspace, typeCheckWorkspace, checkMissingImports, formatVerificationErrorsForPrompt, extractFilePathFromTscError, extractModulePathFromTscError } from '../services/lintService';

const execAsync = util.promisify(exec);

// Prompt paths — read fresh on each request so changes take effect without restart
const orchestratorPromptPath = path.join(__dirname, '../../prompts/orchestrator.txt');
const fePromptPath = path.join(__dirname, '../../prompts/fe-senior-01.txt');

function loadPrompt(promptPath: string): string {
    return fs.readFileSync(promptPath, 'utf8');
}

const router = Router();

// ─── Types ───────────────────────────────────────────────────────────────────

interface TaskChat {
    type: 'chat';
    content: string;
}

interface TaskCreateFile {
    type: 'create_file';
    filepath: string;
    prompt: string;
}

interface TaskEditFile {
    type: 'edit_file';
    filepath: string;
    prompt: string;
}

interface TaskDeleteFile {
    type: 'delete_file';
    filepath: string;
}

interface TaskGenerateImage {
    type: 'generate_image';
    filepath: string;
    prompt: string;
}

interface TaskGitAction {
    type: 'git_action';
    command: string;
}

type ExecutionTask = TaskChat | TaskCreateFile | TaskEditFile | TaskDeleteFile | TaskGenerateImage | TaskGitAction;

interface ExecutionPlan {
    title?: string;
    reasoning: string;
    tasks: ExecutionTask[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classifyError(err: any): string {
    if (err?.message?.includes('429')) return 'Rate limit exceeded. Please try again later.';
    if (err?.message?.includes('timeout')) return 'Request timed out. Please try again.';
    return err?.message || 'Unknown error occurred while generating response.';
}

function detectLanguage(filepath: string): string {
    const ext = filepath.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
        ts: 'typescript', tsx: 'typescriptreact',
        js: 'javascript', jsx: 'javascriptreact',
        css: 'css', scss: 'scss', less: 'less',
        html: 'html', json: 'json', md: 'markdown',
        py: 'python', go: 'go', rs: 'rust',
        java: 'java', rb: 'ruby', sh: 'bash',
        yml: 'yaml', yaml: 'yaml', sql: 'sql',
        xml: 'xml', svg: 'svg',
        jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image',
    };
    return map[ext] || 'text';
}

function robustJsonParse(input: string): any {
    const trimmed = input.trim();

    // Attempt 1: Standard parse
    try {
        return JSON.parse(trimmed);
    } catch (e) {
        // Fall through
    }

    // Attempt 2: Strip markdown code fences
    const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/;
    const fenceMatch = trimmed.match(fenceRegex);
    if (fenceMatch) {
        try {
            return JSON.parse(fenceMatch[1].trim());
        } catch (e) {
            // Fall through
        }
    }

    // Attempt 3: Extract first valid JSON object
    // This is a bit naive but can catch text before/after JSON
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const candidate = trimmed.substring(firstBrace, lastBrace + 1);
        try {
            return JSON.parse(candidate);
        } catch (e) {
            // Fall through
        }
    }

    throw new Error('Could not parse execution plan as JSON');
}

// ─── Route ───────────────────────────────────────────────────────────────────

router.post('/', validateChat, async (req, res) => {
    const { messages, sessionId: rawSessionId } = req.body;
    const sessionId = rawSessionId || `session-${Date.now()}`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const emit = (event: object) => {
        if (!res.destroyed) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
    };

    // Send sessionId back to the client
    emit({ type: 'session', sessionId });

    try {
        // ── Step 1: Orchestrator LLM Call ──────────────────────────────────
        // Convert messages for Gemini API format
        const geminiContents = messages.map((m: any) => {
            const parts: any[] = [{ text: m.content }];
            if (m.attachments && Array.isArray(m.attachments)) {
                for (const att of m.attachments) {
                    if (att.type === 'image') {
                        parts.push({
                            inlineData: {
                                data: att.data,
                                mimeType: att.mimeType
                            }
                        });
                    }
                }
            }
            return {
                role: m.role === 'assistant' ? 'model' : m.role,
                parts
            };
        });

        // persistence: Initialize workspace and save full messages history
        const { dir: currentWorkspaceDir, isNew: isSessionNew } = ensureWorkspace(sessionId);

        // Ensure type definitions for CSS/assets are present (prevents LLM 'as any' hacks)
        ensureViteTypes(sessionId);

        // Install npm dependencies if missing (required for tsc/eslint verification)
        const nodeModulesPath = path.join(currentWorkspaceDir, 'node_modules');
        if (!fs.existsSync(nodeModulesPath)) {
            emit({ type: 'phase', phase: 'installing' });
            await installDependencies(sessionId);
        }

        try {
            const historyPath = path.join(currentWorkspaceDir, 'chat_history.json');
            fs.writeFileSync(historyPath, JSON.stringify(messages, null, 2));
        } catch (err) {
            console.error('Failed to save chat history:', err);
        }

        // Extract attachments/images from the current user message for persistence
        for (const m of messages) {
            if (m.role === 'user' && m.attachments) {
                for (const att of m.attachments) {
                    if (att.type === 'image' && att.name && att.data) {
                        try {
                            const uploadsDir = path.join(currentWorkspaceDir, 'uploads');
                            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
                            const filePath = path.join(uploadsDir, `${Date.now()}-${att.name}`);
                            fs.writeFileSync(filePath, Buffer.from(att.data, 'base64'));
                        } catch (err) {
                            console.error('Failed to save user attachment:', err);
                        }
                    }
                }
            }
        }

        emit({ type: 'phase', phase: 'planning' });
        emit({ type: 'delta', text: '' }); // Signal stream start

        // Build workspace-aware system instruction
        const existingFiles = listFiles(sessionId);

        // If this is a brand new workspace, emit file_action events for the scaffolded template files
        // so they appear in the chat thread as "created" files.
        if (isSessionNew) {
            for (const filepath of existingFiles) {
                try {
                    const content = readFile(sessionId, filepath);
                    emit({
                        type: 'file_action',
                        id: `scaffold-${Date.now()}-${filepath}`,
                        filename: filepath.split('/').pop() || filepath,
                        filepath: filepath,
                        language: detectLanguage(filepath),
                        action: 'created',
                        content,
                        linesAdded: content.split('\n').length,
                        linesRemoved: 0,
                        diff: null,
                        status: 'complete'
                    });
                } catch (err) {
                    console.error(`Failed to emit scaffolding file action for ${filepath}:`, err);
                }
            }
        }
        let systemInstruction = loadPrompt(orchestratorPromptPath);
        if (existingFiles.length > 0) {
            systemInstruction += `\n\nEXISTING WORKSPACE FILES (do NOT recreate these unless the user explicitly asks):\n${existingFiles.map(f => `- ${f}`).join('\n')}`;
        }

        let planJson: string;
        try {
            const planResponse = await ai.models.generateContent({
                model: process.env.MODEL_ID || 'gemini-2.5-flash',
                contents: geminiContents,
                config: {
                    systemInstruction,
                    responseMimeType: 'application/json'
                }
            });

            planJson = planResponse.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        } catch (err: any) {
            emit({ type: 'error', message: classifyError(err) });
            res.end();
            return;
        }

        let plan: ExecutionPlan;
        try {
            plan = robustJsonParse(planJson);
            if (!plan.tasks || !Array.isArray(plan.tasks)) {
                throw new Error('Invalid plan: missing tasks array');
            }

            // Persistence: Save session metadata (title)
            if (plan.title) {
                try {
                    const metadataPath = path.join(currentWorkspaceDir, 'metadata.json');
                    const metadata = {
                        id: sessionId,
                        title: plan.title,
                        timestamp: Date.now()
                    };
                    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
                    emit({ type: 'metadata', data: { title: plan.title } });
                } catch (err) {
                    console.error('Failed to save session metadata:', err);
                }
            }
        } catch (err) {
            console.error('Failed to parse orchestrator plan. Raw response:', planJson);
            // Fallback: treat the entire response as a conversational reply
            emit({ type: 'delta', text: planJson });
            emit({ type: 'done', usage: null, sessionId });
            res.end();
            return;
        }


        // ── Step 2: Dispatch Tasks ─────────────────────────────────────────
        emit({ type: 'phase', phase: 'executing' });

        // ── Build Transparency Data from the Orchestrator Plan ─────────────
        // Filter out "chat" tasks from the transparency task list (they're not actionable)
        const actionableTasks = plan.tasks
            .map((t, i) => ({ task: t, originalIndex: i }))
            .filter(({ task }) => task.type !== 'chat');

        const transparencyTasks = actionableTasks.map(({ task, originalIndex }, i) => {
            let description = '';
            if (task.type === 'create_file' || task.type === 'edit_file') {
                description = `${task.type === 'create_file' ? 'Create' : 'Edit'} ${task.filepath}`;
            } else if (task.type === 'delete_file') {
                description = `Delete ${task.filepath}`;
            } else if (task.type === 'generate_image') {
                description = `Generate image: ${task.filepath}`;
            } else if (task.type === 'git_action') {
                description = `Git: ${task.command}`;
            }
            return { id: i + 1, description, status: 'pending' as const, _planIndex: originalIndex };
        });

        // Emit initial transparency with all tasks pending
        const emitTransparency = () => {
            emit({
                type: 'transparency',
                data: {
                    reasoning: plan.reasoning || '',
                    tasks: transparencyTasks.map(t => ({ id: t.id, description: t.description, status: t.status })),
                    assumptions: 'None'
                }
            });
        };

        emitTransparency();

        // First, send all chat messages
        for (const task of plan.tasks) {
            if (task.type === 'chat') {
                emit({ type: 'delta', text: task.content });
            }
        }

        // Build executor context: a lightweight summary of chat history  
        // We don't send the full monster history to each executor — just enough context
        const executorHistory = geminiContents.slice(-6); // Last 3 exchanges for context

        // Helper to update a transparency task status and re-emit
        const updateTaskStatus = (planIndex: number, status: 'in_progress' | 'done') => {
            const tTask = transparencyTasks.find(t => t._planIndex === planIndex);
            if (tTask) {
                (tTask as any).status = status;
                emitTransparency();
            }
        };

        // Result collectors for persistence
        const completedServerFileActions: any[] = [];
        const completedGitActions: any[] = [];

        // Collect all async task factories (lazy — won't execute until invoked by the pool)
        const taskFactories: (() => Promise<void>)[] = [];

        // Pre-generate stable task IDs and emit all placeholders first
        const taskMeta = plan.tasks.map((task, index) => ({
            task,
            index,
            taskId: `task-${Date.now()}-${index}`
        }));

        // Emit placeholders for all file/image tasks immediately so the UI shows them
        for (const { task, taskId } of taskMeta) {
            if (task.type === 'create_file' || task.type === 'edit_file') {
                emit({
                    type: 'file_action',
                    id: taskId,
                    filename: task.filepath.split('/').pop() || task.filepath,
                    filepath: task.filepath,
                    language: detectLanguage(task.filepath),
                    action: task.type === 'create_file' ? 'created' : 'edited',
                    content: '',
                    linesAdded: 0,
                    linesRemoved: 0,
                    diff: null,
                    status: 'executing'
                });
            } else if (task.type === 'generate_image') {
                emit({
                    type: 'file_action',
                    id: taskId,
                    filename: task.filepath.split('/').pop() || task.filepath,
                    filepath: task.filepath,
                    language: 'image',
                    action: 'created',
                    content: '',
                    linesAdded: 0,
                    linesRemoved: 0,
                    diff: null,
                    status: 'executing',
                    prompt: task.prompt
                });
            }
        }

        // Build file manifest from the plan — every executor will know ALL sibling file paths
        const fileManifest = plan.tasks
            .filter((t: any) => t.filepath)
            .map((t: any) => t.filepath as string);

        // Build lazy task factories — execution only starts when the pool invokes the factory
        for (const { task, index, taskId } of taskMeta) {
            if (task.type === 'create_file' || task.type === 'edit_file') {
                taskFactories.push(() => globalFileQueue.enqueue(task.filepath, async () => {
                    updateTaskStatus(index, 'in_progress');
                    try {
                        // For edit_file tasks, read the existing file content so the executor can merge changes
                        let existingContent: string | null = null;
                        const relatedFiles: Record<string, string> = {};
                        if (task.type === 'edit_file') {
                            try {
                                existingContent = readFile(sessionId, task.filepath);

                                // Extract imports and read their contents for cross-file context
                                if (existingContent) {
                                    const importRegex = /import\s+(?:.*?\s+from\s+)?['"](\.\/.+?|\.\.\/.+?)['"]/g;
                                    let importMatch;
                                    while ((importMatch = importRegex.exec(existingContent)) !== null) {
                                        const importPath = importMatch[1];
                                        const importDir = path.dirname(task.filepath);
                                        const resolvedBase = path.join(importDir, importPath);

                                        // If it has an explicit extension (.css, .svg, etc.), try directly
                                        if (path.extname(importPath)) {
                                            try {
                                                const content = readFile(sessionId, resolvedBase);
                                                if (content) relatedFiles[resolvedBase] = content;
                                            } catch { /* file doesn't exist */ }
                                        } else {
                                            // Try TS/JS extensions
                                            const exts = ['.ts', '.tsx', '.js', '.jsx'];
                                            for (const ext of exts) {
                                                try {
                                                    const content = readFile(sessionId, resolvedBase + ext);
                                                    if (content) {
                                                        relatedFiles[resolvedBase + ext] = content;
                                                        break;
                                                    }
                                                } catch { /* file doesn't exist */ }
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                                // File might not exist yet — treat as create
                                existingContent = null;
                            }
                        }

                        const code = await executeFileAction(
                            executorHistory,
                            sessionId,
                            task.filepath,
                            task.prompt,
                            fileManifest,
                            existingContent,
                            Object.keys(relatedFiles).length > 0 ? relatedFiles : undefined
                        );

                        const oldContent = writeFile(sessionId, task.filepath, code);
                        const diff = oldContent !== null ? generateDiff(oldContent, code, task.filepath) : null;
                        const lines = code.split('\n').length;

                        const actionResult = {
                            type: 'file_action',
                            id: taskId,
                            filename: task.filepath.split('/').pop() || task.filepath,
                            filepath: task.filepath,
                            language: detectLanguage(task.filepath),
                            action: task.type === 'create_file' ? 'created' : 'edited',
                            content: code,
                            linesAdded: lines,
                            linesRemoved: 0,
                            diff,
                            status: 'complete'
                        };
                        completedServerFileActions.push(actionResult);
                        emit(actionResult);
                        updateTaskStatus(index, 'done');
                    } catch (err: any) {
                        console.error(`Executor failed for ${task.filepath}:`, err.message);
                        const failureResult = {
                            type: 'file_action',
                            id: taskId,
                            filename: task.filepath.split('/').pop() || task.filepath,
                            filepath: task.filepath,
                            language: detectLanguage(task.filepath),
                            action: task.type === 'create_file' ? 'created' : 'edited',
                            content: `[Execution failed: ${err.message}]`,
                            linesAdded: 0,
                            linesRemoved: 0,
                            diff: null,
                            status: 'complete'
                        };
                        completedServerFileActions.push(failureResult);
                        emit(failureResult);
                        updateTaskStatus(index, 'done');
                    }
                }));

            } else if (task.type === 'delete_file') {
                // Delete is synchronous — execute inline, no factory needed
                updateTaskStatus(index, 'in_progress');
                try {
                    deleteFile(sessionId, task.filepath);
                    const deleteResult = {
                        type: 'file_action',
                        id: taskId,
                        filename: task.filepath.split('/').pop() || task.filepath,
                        filepath: task.filepath,
                        language: detectLanguage(task.filepath),
                        action: 'deleted',
                        content: '',
                        linesAdded: 0,
                        linesRemoved: 0,
                        diff: null,
                        status: 'complete'
                    };
                    completedServerFileActions.push(deleteResult);
                    emit(deleteResult);
                } catch (err: any) {
                    console.warn(`Failed to delete ${task.filepath}:`, err.message);
                }
                updateTaskStatus(index, 'done');

            } else if (task.type === 'generate_image') {
                taskFactories.push(async () => {
                    updateTaskStatus(index, 'in_progress');
                    try {
                        const response = await ai.models.generateContent({
                            model: 'gemini-2.5-flash-image',
                            contents: task.prompt
                        });

                        const candidate = response.candidates?.[0];
                        let imageBuffer: Buffer | null = null;

                        if (candidate?.content?.parts) {
                            for (const part of candidate.content.parts) {
                                if (part.inlineData?.data) {
                                    imageBuffer = Buffer.from(part.inlineData.data, 'base64');
                                    break;
                                }
                            }
                        }

                        if (!imageBuffer) throw new Error('No image data in response');

                        const fullPath = path.join(currentWorkspaceDir, task.filepath);
                        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                        fs.writeFileSync(fullPath, imageBuffer);

                        const imgResult = {
                            type: 'file_action',
                            id: taskId,
                            filename: task.filepath.split('/').pop() || task.filepath,
                            filepath: task.filepath,
                            language: 'image',
                            action: 'created',
                            content: `[Image generated: ${task.filepath}]`,
                            linesAdded: 0,
                            linesRemoved: 0,
                            diff: null,
                            status: 'complete',
                            prompt: task.prompt
                        };
                        completedServerFileActions.push(imgResult);
                        emit(imgResult);
                        updateTaskStatus(index, 'done');
                    } catch (err: any) {
                        console.error(`Image generation failed for ${task.filepath}:`, err.message);
                        const imgFailureResult = {
                            type: 'file_action',
                            id: taskId,
                            filename: task.filepath.split('/').pop() || task.filepath,
                            filepath: task.filepath,
                            language: 'image',
                            action: 'created',
                            content: `[Image generation failed: ${err.message}]`,
                            linesAdded: 0,
                            linesRemoved: 0,
                            diff: null,
                            status: 'complete',
                            prompt: task.prompt
                        };
                        completedServerFileActions.push(imgFailureResult);
                        emit(imgFailureResult);
                        updateTaskStatus(index, 'done');
                    }
                });

            } else if (task.type === 'git_action') {
                taskFactories.push(async () => {
                    updateTaskStatus(index, 'in_progress');
                    const command = task.command;
                    if (!command.trim().startsWith('git ')) {
                        emit({ type: 'git_result', index, error: 'Security Error: Only `git` commands are allowed.' });
                        updateTaskStatus(index, 'done');
                        return;
                    }
                    if (/[;|$<>]/.test(command)) {
                        emit({ type: 'git_result', index, error: 'Security Error: Command contains forbidden shell characters.' });
                        updateTaskStatus(index, 'done');
                        return;
                    }

                    try {
                        const env = { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(currentWorkspaceDir) };
                        let cmdToRun = command;
                        if (cmdToRun.trim() === 'git push') {
                            cmdToRun = 'git push -u origin HEAD';
                        }
                        const { stdout, stderr } = await execAsync(cmdToRun, { cwd: currentWorkspaceDir, env });
                        const out = (stdout || stderr || '').trim() || 'Command completed successfully.';
                        const gitResult = { id: `git-${Date.now()}-${index}`, type: 'git_result', index, output: out };
                        completedGitActions.push(gitResult);
                        emit(gitResult);
                    } catch (err: any) {
                        const errorOut = (err.stdout || err.stderr || err.message || '').trim();
                        const gitErrorResult = { id: `git-${Date.now()}-${index}`, type: 'git_result', index, error: `Failed: ${errorOut}` };
                        completedGitActions.push(gitErrorResult);
                        emit(gitErrorResult);
                    }
                    updateTaskStatus(index, 'done');
                });
            }
        }

        // ── Step 3: Execute with concurrency limit (max 5 parallel API calls) ──
        await runWithConcurrency(taskFactories, 5);

        // ── Step 4: Automated Verification & Repair ────────────────────────
        let verifyRetries = 0;
        const MAX_VERIFY_RETRIES = 3;

        // Helper: build cross-file context for a file's imports
        const buildCrossFileContext = (relPath: string): string => {
            let crossFileContext = '';
            try {
                const fileContent = readFile(sessionId, relPath);
                if (fileContent) {
                    const importRegex = /from\s+['"](\.\/.+?|\.\.\/.+?)['"]/g;
                    let importMatch;
                    const importedContents: string[] = [];
                    while ((importMatch = importRegex.exec(fileContent)) !== null) {
                        const importPath = importMatch[1];
                        const importDir = path.dirname(relPath);
                        const resolvedBase = path.join(importDir, importPath);
                        const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];
                        for (const ext of extensions) {
                            const candidate = resolvedBase + ext;
                            try {
                                const content = readFile(sessionId, candidate);
                                if (content) {
                                    importedContents.push(`--- ${candidate} ---\n${content}`);
                                    break;
                                }
                            } catch { /* file doesn't exist */ }
                        }
                    }
                    if (importedContents.length > 0) {
                        crossFileContext = `\n\nIMPORTED MODULE CONTENTS (use these to verify your imports match actual exports):\n${importedContents.join('\n\n')}`;
                    }
                }
            } catch { /* file doesn't exist */ }
            return crossFileContext;
        };

        // Helper: run a single repair task for a file
        const repairFile = async (relPath: string, verificationReport: string): Promise<void> => {
            const crossFileContext = buildCrossFileContext(relPath);

            // Read existing content so the executor can merge changes (Bug 1 fix)
            let existingContent: string | null = null;
            try {
                existingContent = readFile(sessionId, relPath);
            } catch { /* file doesn't exist */ }

            const code = await executeFileAction(
                geminiContents,
                sessionId,
                relPath,
                `VERIFICATION FAILED for the following reasons:\n\n${verificationReport}${crossFileContext}\n\nREPAIR INSTRUCTIONS for ${relPath}:\n1. Analyze the errors specifically for this file.\n2. Fix any broken imports, missing exports, or type mismatches.\n3. **CRITICAL: NEVER use 'as any' on an import statement.** (e.g. \`import x from 'y' as any\` is INVALID). Remove it if you see it.\n4. You MUST use the EXACT export names from the imported modules shown above.\n5. If you imported a file that doesn't exist, either create it (in a previous task) or remove the import.\n6. Output ONLY the fixed RAW SOURCE CODE for ${relPath}.`,
                listFiles(sessionId),
                existingContent
            );
            const oldContent = writeFile(sessionId, relPath, code);
            const diff = generateDiff(oldContent || '', code, relPath);

            const lines = code.split('\n').length;
            const serverAction = {
                id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type: 'file_action',
                action: 'edited',
                filename: relPath.split('/').pop() || relPath,
                filepath: relPath,
                language: detectLanguage(relPath),
                content: code,
                linesAdded: lines,
                linesRemoved: 0,
                diff,
                status: 'complete'
            };
            completedServerFileActions.push(serverAction);
            emit(serverAction);
        };

        while (verifyRetries <= MAX_VERIFY_RETRIES) {
            emit({ type: 'phase', phase: 'verifying' });

            const [lintResults, tscErrors, missingImportErrors] = await Promise.all([
                lintWorkspace(sessionId),
                typeCheckWorkspace(sessionId),
                checkMissingImports(sessionId)
            ]);

            // Merge missing-import errors into tsc errors so they get reported
            const allTscErrors = [...tscErrors, ...missingImportErrors];

            const hasLintErrors = lintResults.some(r => r.errorCount > 0);
            const hasTscErrors = allTscErrors.length > 0;

            if (!hasLintErrors && !hasTscErrors) break;

            // ── Bug 3 fix: Create missing CSS/asset files ──
            // If a file imports a .css/.scss/.svg etc that doesn't exist, create an empty one
            for (const err of missingImportErrors) {
                const match = err.match(/Missing import '(.+?)'/);
                if (match) {
                    const missingImport = match[1];
                    const ext = path.extname(missingImport).toLowerCase();
                    // Only auto-create asset files (CSS, images, etc.) — NOT .ts/.tsx/.js/.jsx
                    if (['.css', '.scss', '.less', '.svg'].includes(ext)) {
                        // Resolve the full path from the error source file
                        const sourceFile = extractFilePathFromTscError(err);
                        if (sourceFile) {
                            const sourceDir = path.dirname(sourceFile);
                            const resolvedPath = path.join(sourceDir, missingImport);
                            try {
                                const fullPath = path.join(currentWorkspaceDir, resolvedPath);
                                if (!fs.existsSync(fullPath)) {
                                    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                                    fs.writeFileSync(fullPath, ext === '.svg' ? '<svg></svg>' : `/* Auto-generated placeholder for ${missingImport} */\n`, 'utf8');
                                    console.log(`Auto-created missing asset: ${resolvedPath}`);
                                }
                            } catch (e) {
                                console.warn(`Failed to auto-create ${resolvedPath}:`, e);
                            }
                        }
                    }
                }
            }

            // Identify all files that need attention
            const filesToFix = new Set<string>();
            // Track which files are imported by other error files (dependency sources)
            const sourceModules = new Set<string>();

            lintResults.filter(r => r.errorCount > 0).forEach(r => filesToFix.add(path.relative(currentWorkspaceDir, r.filepath)));

            // Extract file paths from tsc errors using robust helper
            allTscErrors.forEach(err => {
                const filePath = extractFilePathFromTscError(err);
                if (filePath) {
                    filesToFix.add(filePath);
                }
                // Also add source modules referenced in "no exported member" / "cannot find module" errors
                const errorFilePath = filePath;
                const modulePath = extractModulePathFromTscError(err);
                if (modulePath && errorFilePath) {
                    const errorFileDir = path.dirname(errorFilePath);
                    const resolvedBase = path.join(errorFileDir, modulePath);
                    const extensions = ['.ts', '.tsx', '.js', '.jsx'];
                    for (const ext of extensions) {
                        const candidate = resolvedBase + ext;
                        if (fs.existsSync(path.join(currentWorkspaceDir, candidate))) {
                            filesToFix.add(candidate);
                            sourceModules.add(candidate); // Mark as a dependency source
                            break;
                        }
                    }
                }
            });

            if (filesToFix.size === 0 && hasTscErrors) {
                if (fs.existsSync(path.join(currentWorkspaceDir, 'src/App.tsx'))) {
                    filesToFix.add('src/App.tsx');
                }
            }

            const verificationReport = formatVerificationErrorsForPrompt(lintResults, allTscErrors, currentWorkspaceDir);

            // ── Bug 2 fix: Two-phase repair ──
            // Phase 1: Fix source/dependency modules first (e.g., theme.ts, routes.ts)
            // so consumers will see the correct exports when they're repaired
            const sourceFiles = Array.from(filesToFix).filter(f => sourceModules.has(f));
            const consumerFiles = Array.from(filesToFix).filter(f => !sourceModules.has(f));

            if (sourceFiles.length > 0) {
                const sourceRepairTasks = sourceFiles.map(relPath => () => repairFile(relPath, verificationReport));
                await runWithConcurrency(sourceRepairTasks, 5);
            }

            // Phase 2: Fix consumer files (now that their dependencies are settled)
            if (consumerFiles.length > 0) {
                const consumerRepairTasks = consumerFiles.map(relPath => () => repairFile(relPath, verificationReport));
                await runWithConcurrency(consumerRepairTasks, 5);
            }

            verifyRetries++;
        }

        // ── Step 4.5: Start Dev Server ────────────────────────────────────
        const devPort = startDevServer(sessionId);
        if (devPort) {
            emit({ type: 'preview', url: `http://localhost:${devPort}` });
        }

        // ── Step 5: Finalize History persistence ──
        const assistantContent = plan.tasks
            .filter(t => t.type === 'chat')
            .map(t => t.content)
            .join('\n\n') || 'Done — files have been created and verified.';

        const finalAssistantMessage = {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: assistantContent,
            displayContent: assistantContent,
            status: 'complete',
            timestamp: Date.now(),
            transparency: {
                reasoning: plan.reasoning || '',
                tasks: transparencyTasks.map(t => ({ id: t.id, description: t.description, status: 'done' })),
                assumptions: 'None'
            },
            fileActions: [],
            serverFileActions: completedServerFileActions,
            gitActions: completedGitActions
        };

        try {
            const finalHistory = [...messages, finalAssistantMessage];
            const historyPath = path.join(currentWorkspaceDir, 'chat_history.json');
            fs.writeFileSync(historyPath, JSON.stringify(finalHistory, null, 2));
        } catch (err) {
            console.error('Failed to finalize chat history:', err);
        }

        emit({ type: 'phase', phase: 'ready' });
        emit({ type: 'done', usage: null, sessionId });

    } catch (err: any) {
        emit({ type: 'error', message: classifyError(err) });
    } finally {
        res.end();
    }
});

// ─── Session Listing ─────────────────────────────────────────────────────────

router.get('/sessions/list', async (_req, res) => {
    try {
        const WORKSPACE_ROOT = path.join(__dirname, '../../workspace');
        if (!fs.existsSync(WORKSPACE_ROOT)) {
            return res.json([]);
        }

        const entries = fs.readdirSync(WORKSPACE_ROOT, { withFileTypes: true });
        const sessions = entries
            .filter(e => e.isDirectory() && e.name.startsWith('session-'))
            .map(e => {
                const id = e.name;
                const timestamp = parseInt(id.replace('session-', ''), 10) || 0;
                const workspaceDir = path.join(WORKSPACE_ROOT, id);
                const historyPath = path.join(workspaceDir, 'chat_history.json');
                const metadataPath = path.join(workspaceDir, 'metadata.json');

                let messageCount = 0;
                try {
                    if (fs.existsSync(historyPath)) {
                        const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
                        messageCount = Array.isArray(history) ? history.length : 0;
                    }
                } catch { /* ignore parse errors */ }

                let title = '';
                try {
                    if (fs.existsSync(metadataPath)) {
                        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                        title = metadata.title || '';
                    }
                } catch { /* ignore parse errors */ }

                return { id, timestamp, messageCount, title };
            })
            .filter(s => s.messageCount > 0) // only sessions with history
            .sort((a, b) => b.timestamp - a.timestamp); // newest first

        res.json(sessions);
    } catch (err: any) {
        console.error('Failed to list sessions:', err);
        res.status(500).json({ error: 'Failed to list sessions' });
    }
});

// ─── History Retrieval ───────────────────────────────────────────────────────

router.get('/:sessionId/history', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const { dir: workspaceDir } = ensureWorkspace(sessionId);
        const historyPath = path.join(workspaceDir, 'chat_history.json');

        if (!fs.existsSync(historyPath)) {
            return res.json([]);
        }

        const history = fs.readFileSync(historyPath, 'utf8');
        res.json(JSON.parse(history));
    } catch (err: any) {
        console.error('Failed to retrieve history:', err);
        res.status(500).json({ error: 'Failed to retrieve chat history' });
    }
});

// ─── Metadata Management ───────────────────────────────────────────────────

router.get('/:sessionId/metadata', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const { dir: workspaceDir } = ensureWorkspace(sessionId);
        const metadataPath = path.join(workspaceDir, 'metadata.json');

        if (!fs.existsSync(metadataPath)) {
            return res.json({ id: sessionId, title: '', timestamp: Date.now() });
        }

        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        res.json(metadata);
    } catch (err: any) {
        console.error('Failed to retrieve metadata:', err);
        res.status(500).json({ error: 'Failed to retrieve metadata' });
    }
});

router.patch('/:sessionId/metadata', async (req, res) => {
    const { sessionId } = req.params;
    const { title } = req.body;

    try {
        const { dir: workspaceDir } = ensureWorkspace(sessionId);
        const metadataPath = path.join(workspaceDir, 'metadata.json');

        let metadata: any = { id: sessionId, timestamp: Date.now() };
        if (fs.existsSync(metadataPath)) {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        }

        if (title !== undefined) metadata.title = title;

        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        res.json(metadata);
    } catch (err: any) {
        console.error('Failed to update metadata:', err);
        res.status(500).json({ error: 'Failed to update metadata' });
    }
});

router.delete('/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const { dir: workspaceDir } = ensureWorkspace(sessionId);

        if (fs.existsSync(workspaceDir)) {
            // recursive: true to delete everything inside
            // force: true to not throw if it doesn't exist (though we check existsSync)
            fs.rmSync(workspaceDir, { recursive: true, force: true });
        }

        res.json({ success: true });
    } catch (err: any) {
        console.error('Failed to delete workspace:', err);
        res.status(500).json({ error: 'Failed to delete workspace' });
    }
});

export default router;
