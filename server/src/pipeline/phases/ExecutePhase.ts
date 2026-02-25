// ─── Execute Phase ───────────────────────────────────────────────────────────
// Dispatches tasks from the execution plan: file creation/editing, image
// generation, git actions, and chat messages.
// Extracted from chat.ts lines 354-690.

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { ai } from '../../services/gemini';
import { writeFile, deleteFile, readFile, listFiles, generateDiff } from '../../services/fileService';
import { executeFileAction, runWithConcurrency } from '../../services/executor';
import { globalFileQueue } from '../../services/fileQueue';
import { detectLanguage } from '../helpers';
import type { Phase, PhaseResult, PipelineContext } from '../../types/pipeline';
import type { TransparencyTask } from '../../types/plan';
import type { FileActionEvent, GitResultEvent } from '../../types/events';

const execAsync = util.promisify(exec);

export class ExecutePhase implements Phase {
    name = 'execute';

    async execute(ctx: PipelineContext): Promise<PhaseResult> {
        const plan = ctx.plan;
        if (!plan) return { status: 'abort', reason: 'No plan available for execution' };

        ctx.events.emit({ type: 'phase', phase: 'executing' });

        // ── REQ-4.1: Read design tokens if available ─────────────────────
        let themeContent: string | null = null;
        try {
            themeContent = readFile(ctx.sessionId, 'src/constants/theme.ts');
        } catch { /* theme.ts doesn't exist yet — that's fine */ }

        // Count total file tasks for contextual phase updates (REQ-4.4)
        const totalFileTasks = plan.tasks.filter(t =>
            t.type === 'create_file' || t.type === 'edit_file' || t.type === 'generate_image'
        ).length;
        let completedFileTasks = 0;

        // ── Build Transparency Data ──────────────────────────────────────
        const actionableTasks = plan.tasks
            .map((t, i) => ({ task: t, originalIndex: i }))
            .filter(({ task }) => task.type !== 'chat');

        ctx.transparencyTasks = actionableTasks.map(({ task, originalIndex }, i) => {
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

        // Emit initial transparency
        const emitTransparency = () => {
            ctx.events.emit({
                type: 'transparency',
                data: {
                    title: plan.title || '',
                    reasoning: plan.reasoning || '',
                    tasks: ctx.transparencyTasks.map(t => ({ id: t.id, description: t.description, status: t.status })),
                    assumptions: plan.assumptions || 'None'
                }
            });
        };
        emitTransparency();

        // Helper to update task status
        const updateTaskStatus = (planIndex: number, status: 'in_progress' | 'done') => {
            const tTask = ctx.transparencyTasks.find(t => t._planIndex === planIndex);
            if (tTask) {
                (tTask as any).status = status;
                emitTransparency();
            }
        };

        // Send chat messages first
        for (const task of plan.tasks) {
            if (task.type === 'chat') {
                ctx.events.emit({ type: 'delta', text: task.content });
            }
        }

        // Build executor context
        const executorHistory = ctx.geminiContents.slice(-6);

        // Build file manifest from the plan
        const fileManifest = plan.tasks
            .filter((t: any) => t.filepath)
            .map((t: any) => t.filepath as string);

        // Pre-generate stable task IDs and emit placeholders
        const taskMeta = plan.tasks.map((task, index) => ({
            task,
            index,
            taskId: `task-${Date.now()}-${index}`
        }));

        for (const { task, taskId } of taskMeta) {
            if (task.type === 'create_file' || task.type === 'edit_file') {
                ctx.events.emit({
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
                ctx.events.emit({
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

        // ── Build Task Factories ─────────────────────────────────────────
        const taskFactories: (() => Promise<void>)[] = [];

        for (const { task, index, taskId } of taskMeta) {
            if (task.type === 'create_file' || task.type === 'edit_file') {
                taskFactories.push(() => globalFileQueue.enqueue(task.filepath, async () => {
                    updateTaskStatus(index, 'in_progress');

                    // REQ-4.4: Contextual phase update
                    completedFileTasks++;
                    const fileName = task.filepath.split('/').pop() || task.filepath;
                    ctx.events.emit({
                        type: 'phase',
                        phase: 'executing',
                        detail: `Building ${fileName} (${completedFileTasks} of ${totalFileTasks})`
                    });

                    try {
                        let existingContent: string | null = null;
                        const relatedFiles: Record<string, string> = {};

                        // REQ-4.1: Inject design tokens as related file context
                        if (themeContent && task.filepath !== 'src/constants/theme.ts') {
                            relatedFiles['src/constants/theme.ts'] = themeContent;
                        }

                        if (task.type === 'edit_file') {
                            try {
                                existingContent = readFile(ctx.sessionId, task.filepath);
                                if (existingContent) {
                                    const importRegex = /import\s+(?:.*?\s+from\s+)?['"](\.\/.+?|\.\.\/.+?)['"]/g;
                                    let importMatch;
                                    while ((importMatch = importRegex.exec(existingContent)) !== null) {
                                        const importPath = importMatch[1];
                                        const importDir = path.dirname(task.filepath);
                                        const resolvedBase = path.join(importDir, importPath);
                                        if (path.extname(importPath)) {
                                            try {
                                                const content = readFile(ctx.sessionId, resolvedBase);
                                                if (content) relatedFiles[resolvedBase] = content;
                                            } catch { /* file doesn't exist */ }
                                        } else {
                                            const exts = ['.ts', '.tsx', '.js', '.jsx'];
                                            for (const ext of exts) {
                                                try {
                                                    const content = readFile(ctx.sessionId, resolvedBase + ext);
                                                    if (content) {
                                                        relatedFiles[resolvedBase + ext] = content;
                                                        break;
                                                    }
                                                } catch { /* file doesn't exist */ }
                                            }
                                        }
                                    }
                                }
                            } catch {
                                existingContent = null;
                            }
                        }

                        const code = await executeFileAction(
                            executorHistory,
                            ctx.sessionId,
                            task.filepath,
                            task.prompt,
                            fileManifest,
                            existingContent,
                            Object.keys(relatedFiles).length > 0 ? relatedFiles : undefined
                        );

                        const oldContent = writeFile(ctx.sessionId, task.filepath, code);
                        const diff = oldContent !== null ? generateDiff(oldContent, code, task.filepath) : null;
                        const lines = code.split('\n').length;

                        const actionResult: FileActionEvent = {
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
                        ctx.completedFileActions.push(actionResult);
                        ctx.events.emit(actionResult);
                        updateTaskStatus(index, 'done');
                    } catch (err: any) {
                        console.error(`Executor failed for ${task.filepath}:`, err.message);
                        const failureResult: FileActionEvent = {
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
                        ctx.completedFileActions.push(failureResult);
                        ctx.events.emit(failureResult);
                        updateTaskStatus(index, 'done');
                    }
                }));

            } else if (task.type === 'delete_file') {
                updateTaskStatus(index, 'in_progress');
                try {
                    deleteFile(ctx.sessionId, task.filepath);
                    const deleteResult: FileActionEvent = {
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
                    ctx.completedFileActions.push(deleteResult);
                    ctx.events.emit(deleteResult);
                } catch (err: any) {
                    console.warn(`Failed to delete ${task.filepath}:`, err.message);
                }
                updateTaskStatus(index, 'done');

            } else if (task.type === 'generate_image') {
                taskFactories.push(async () => {
                    updateTaskStatus(index, 'in_progress');
                    try {
                        // REQ-4.3: Image prompt quality gate — enhance short/vague prompts
                        let finalPrompt = task.prompt;
                        if (finalPrompt.split(/\s+/).length < 10) {
                            finalPrompt += '. High quality, professional, well-lit, detailed, modern aesthetic.';
                        }
                        if (!/style|aesthetic|quality|resolution|detailed/i.test(finalPrompt)) {
                            finalPrompt += ' Ultra high quality, photorealistic, sharp focus.';
                        }

                        const response = await ai.models.generateContent({
                            model: 'gemini-2.5-flash-image',
                            contents: finalPrompt
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

                        const fullPath = path.join(ctx.workspaceDir, task.filepath);
                        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                        fs.writeFileSync(fullPath, imageBuffer);

                        const imgResult: FileActionEvent = {
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
                        ctx.completedFileActions.push(imgResult);
                        ctx.events.emit(imgResult);
                        updateTaskStatus(index, 'done');
                    } catch (err: any) {
                        console.error(`Image generation failed for ${task.filepath}:`, err.message);
                        const imgFailureResult: FileActionEvent = {
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
                        ctx.completedFileActions.push(imgFailureResult);
                        ctx.events.emit(imgFailureResult);
                        updateTaskStatus(index, 'done');
                    }
                });

            } else if (task.type === 'git_action') {
                taskFactories.push(async () => {
                    updateTaskStatus(index, 'in_progress');
                    const command = task.command;
                    if (!command.trim().startsWith('git ')) {
                        const errorResult: GitResultEvent = {
                            type: 'git_result',
                            id: `git-${Date.now()}-${index}`,
                            index,
                            error: 'Security Error: Only `git` commands are allowed.'
                        };
                        ctx.completedGitActions.push(errorResult);
                        ctx.events.emit(errorResult);
                        updateTaskStatus(index, 'done');
                        return;
                    }
                    if (/[;|$<>]/.test(command)) {
                        const errorResult: GitResultEvent = {
                            type: 'git_result',
                            id: `git-${Date.now()}-${index}`,
                            index,
                            error: 'Security Error: Command contains forbidden shell characters.'
                        };
                        ctx.completedGitActions.push(errorResult);
                        ctx.events.emit(errorResult);
                        updateTaskStatus(index, 'done');
                        return;
                    }

                    try {
                        const env = { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(ctx.workspaceDir) };
                        let cmdToRun = command;
                        if (cmdToRun.trim() === 'git push') {
                            cmdToRun = 'git push -u origin HEAD';
                        }
                        const { stdout, stderr } = await execAsync(cmdToRun, { cwd: ctx.workspaceDir, env });
                        const out = (stdout || stderr || '').trim() || 'Command completed successfully.';
                        const gitResult: GitResultEvent = {
                            type: 'git_result',
                            id: `git-${Date.now()}-${index}`,
                            index,
                            output: out,
                            command: cmdToRun,
                            action: 'execute'
                        };
                        ctx.completedGitActions.push(gitResult);
                        ctx.events.emit(gitResult);
                    } catch (err: any) {
                        const errorOut = (err.stdout || err.stderr || err.message || '').trim();
                        const gitErrorResult: GitResultEvent = {
                            type: 'git_result',
                            id: `git-${Date.now()}-${index}`,
                            index,
                            error: `Failed: ${errorOut}`,
                            command,
                            action: 'execute'
                        };
                        ctx.completedGitActions.push(gitErrorResult);
                        ctx.events.emit(gitErrorResult);
                    }
                    updateTaskStatus(index, 'done');
                });
            }
        }

        // Execute with concurrency limit
        await runWithConcurrency(taskFactories, 5);

        return { status: 'continue' };
    }
}
