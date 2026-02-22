import { Router } from 'express';
import { validateChat } from '../middleware/validateChat';
import { ai } from '../services/gemini';
import { ensureWorkspace, writeFile, deleteFile, generateDiff, listFiles, readFile } from '../services/fileService';
import { getWorkspaceConfig } from '../services/gitService';
import { executeFileAction, runWithConcurrency } from '../services/executor';
import { globalFileQueue } from '../services/fileQueue';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';

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
        const geminiContents = messages.map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : m.role,
            parts: [{ text: m.content }]
        }));

        emit({ type: 'phase', phase: 'planning' });
        emit({ type: 'delta', text: '' }); // Signal stream start

        // Build workspace-aware system instruction
        const { dir: workspaceDir, isNew } = ensureWorkspace(sessionId);
        const existingFiles = listFiles(sessionId);

        // If this is a brand new workspace, emit file_action events for the scaffolded template files
        // so they appear in the chat thread as "created" files.
        if (isNew) {
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
            plan = JSON.parse(planJson);
            if (!plan.tasks || !Array.isArray(plan.tasks)) {
                throw new Error('Invalid plan: missing tasks array');
            }
        } catch (err) {
            console.error('Failed to parse orchestrator plan:', planJson);
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
        const executorHistory = geminiContents.slice(-4); // Last 2 exchanges for context

        // Helper to update a transparency task status and re-emit
        const updateTaskStatus = (planIndex: number, status: 'in_progress' | 'done') => {
            const tTask = transparencyTasks.find(t => t._planIndex === planIndex);
            if (tTask) {
                (tTask as any).status = status;
                emitTransparency();
            }
        };

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
                        const code = await executeFileAction(
                            executorHistory,
                            sessionId,
                            task.filepath,
                            task.prompt,
                            fileManifest
                        );

                        const oldContent = writeFile(sessionId, task.filepath, code);
                        const diff = oldContent !== null ? generateDiff(oldContent, code, task.filepath) : null;
                        const lines = code.split('\n').length;

                        emit({
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
                        });
                        updateTaskStatus(index, 'done');
                    } catch (err: any) {
                        console.error(`Executor failed for ${task.filepath}:`, err.message);
                        emit({
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
                        });
                        updateTaskStatus(index, 'done');
                    }
                }));

            } else if (task.type === 'delete_file') {
                // Delete is synchronous — execute inline, no factory needed
                updateTaskStatus(index, 'in_progress');
                try {
                    deleteFile(sessionId, task.filepath);
                    emit({
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
                    });
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

                        const fullPath = path.join(workspaceDir, task.filepath);
                        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                        fs.writeFileSync(fullPath, imageBuffer);

                        emit({
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
                        });
                        updateTaskStatus(index, 'done');
                    } catch (err: any) {
                        console.error(`Image generation failed for ${task.filepath}:`, err.message);
                        emit({
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
                        });
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
                        const env = { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(workspaceDir) };
                        let cmdToRun = command;
                        if (cmdToRun.trim() === 'git push') {
                            cmdToRun = 'git push -u origin HEAD';
                        }
                        const { stdout, stderr } = await execAsync(cmdToRun, { cwd: workspaceDir, env });
                        const out = (stdout || stderr || '').trim() || 'Command completed successfully.';
                        emit({ type: 'git_result', index, output: out });
                    } catch (err: any) {
                        const errorOut = (err.stdout || err.stderr || err.message || '').trim();
                        emit({ type: 'git_result', index, error: `Failed: ${errorOut}` });
                    }
                    updateTaskStatus(index, 'done');
                });
            }
        }

        // ── Step 3: Execute with concurrency limit (max 5 parallel API calls) ──
        await runWithConcurrency(taskFactories, 5);

        emit({ type: 'phase', phase: 'ready' });
        emit({ type: 'done', usage: null, sessionId });

    } catch (err: any) {
        emit({ type: 'error', message: classifyError(err) });
    } finally {
        res.end();
    }
});

export default router;
