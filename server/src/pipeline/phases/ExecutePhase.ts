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
import {
    buildImportPreflightFeedback,
    loadInstalledPackages,
    validateGeneratedImports,
    type ImportPreflightResult
} from '../../services/importPreflight';
import { detectLanguage } from '../helpers';
import { buildPhaseThought } from '../thoughtProcess';
import type { Phase, PhaseResult, PipelineContext } from '../../types/pipeline';
import type { ExecutionTask, TaskCreateFile, TaskEditFile, TaskGenerateImage } from '../../types/plan';
import type { FileActionEvent, GitResultEvent } from '../../types/events';

const execAsync = util.promisify(exec);
const MAX_FILES_PER_BATCH = 4;
const FILE_BATCH_CONCURRENCY = 3;
const MAX_IMPORT_REGEN_ATTEMPTS = 2;

type TaskMeta = {
    task: ExecutionTask;
    index: number;
    taskId: string;
};

type BatchCapableTask = TaskCreateFile | TaskEditFile | TaskGenerateImage;

function isCodeTask(task: ExecutionTask): task is TaskCreateFile | TaskEditFile {
    return task.type === 'create_file' || task.type === 'edit_file';
}

function isFileTask(task: ExecutionTask): boolean {
    return task.type === 'create_file'
        || task.type === 'edit_file'
        || task.type === 'generate_image'
        || task.type === 'delete_file';
}

function isBatchCapableTask(task: ExecutionTask): task is BatchCapableTask {
    return task.type === 'create_file' || task.type === 'edit_file' || task.type === 'generate_image';
}

function chunk<T>(input: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < input.length; i += size) {
        out.push(input.slice(i, i + size));
    }
    return out;
}

function normalizeRelPath(relPath: string): string {
    return path.normalize(relPath).replace(/\\/g, '/');
}

export class ExecutePhase implements Phase {
    name = 'execute';

    async execute(ctx: PipelineContext): Promise<PhaseResult> {
        const plan = ctx.plan;
        if (!plan) return { status: 'abort', reason: 'No plan available for execution' };

        ctx.events.emit({
            type: 'phase',
            phase: 'executing',
            detail: 'Executing planned tasks',
            thought: buildPhaseThought('executing', ctx)
        });

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

        // Use both current workspace files and planned files for stronger context.
        const plannedPaths = plan.tasks
            .filter((t): t is TaskCreateFile | TaskEditFile | TaskGenerateImage =>
                t.type === 'create_file' || t.type === 'edit_file' || t.type === 'generate_image'
            )
            .map(t => normalizeRelPath(t.filepath));

        const existingWorkspaceFiles = listFiles(ctx.sessionId).map(normalizeRelPath);
        const fileManifest = Array.from(new Set([...existingWorkspaceFiles, ...plannedPaths]));

        // Pre-generate stable task IDs and emit placeholders
        const taskMeta: TaskMeta[] = plan.tasks.map((task, index) => ({
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

        const installedPackages = loadInstalledPackages(ctx.workspaceDir);
        const plannedPathSet = new Set(plannedPaths);

        // ── Execute file tasks in dependency-aware batches ───────────────
        const fileTaskMeta = taskMeta.filter(meta => isFileTask(meta.task));
        const fileBatches = this.buildFileExecutionBatches(fileTaskMeta);

        for (let batchIndex = 0; batchIndex < fileBatches.length; batchIndex++) {
            const batch = fileBatches[batchIndex];
            ctx.events.emit({
                type: 'phase',
                phase: 'executing',
                detail: `Executing batch ${batchIndex + 1}/${fileBatches.length} (${batch.length} task${batch.length === 1 ? '' : 's'})`
            });

            const batchFactories = batch.map(meta => async () => {
                const { task, index, taskId } = meta;

                if (isCodeTask(task)) {
                    await globalFileQueue.enqueue(task.filepath, async () => {
                        updateTaskStatus(index, 'in_progress');
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

                            // Use freshest theme content each task to avoid stale context.
                            if (task.filepath !== 'src/constants/theme.ts') {
                                try {
                                    const currentTheme = readFile(ctx.sessionId, 'src/constants/theme.ts');
                                    if (currentTheme) relatedFiles['src/constants/theme.ts'] = currentTheme;
                                } catch {
                                    // theme.ts may not exist yet in early tasks
                                }
                            }

                            if (task.type === 'edit_file') {
                                existingContent = this.readExistingFileWithRelatedImports(
                                    ctx,
                                    task.filepath,
                                    relatedFiles
                                );
                            }

                            const { code } = await this.generateWithImportPreflight({
                                ctx,
                                task,
                                executorHistory,
                                fileManifest,
                                existingContent,
                                relatedFiles,
                                installedPackages,
                                plannedPathSet,
                            });

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
                        }

                        updateTaskStatus(index, 'done');
                    });
                    return;
                }

                if (task.type === 'generate_image') {
                    updateTaskStatus(index, 'in_progress');
                    completedFileTasks++;
                    const fileName = task.filepath.split('/').pop() || task.filepath;
                    ctx.events.emit({
                        type: 'phase',
                        phase: 'executing',
                        detail: `Building ${fileName} (${completedFileTasks} of ${totalFileTasks})`
                    });

                    try {
                        let finalPrompt = task.prompt;
                        if (finalPrompt.split(/\s+/).length < 10) {
                            finalPrompt += '. High quality, professional, well-lit, detailed, modern aesthetic.';
                        }
                        if (!/style|aesthetic|quality|resolution|detailed/i.test(finalPrompt)) {
                            finalPrompt += ' Ultra high quality, photorealistic, sharp focus.';
                        }

                        const response = await ai.models.generateContent({
                            model: process.env.IMAGE_MODEL_ID || 'gemini-3-pro-image-preview',
                            contents: finalPrompt
                        });

                        const candidate = (response as any).candidates?.[0];
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
                        const parentDir = path.dirname(fullPath);
                        if (!fs.existsSync(parentDir)) {
                            fs.mkdirSync(parentDir, { recursive: true });
                        }

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
                    }

                    updateTaskStatus(index, 'done');
                    return;
                }

                if (task.type === 'delete_file') {
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
                }
            });

            await runWithConcurrency(batchFactories, Math.min(FILE_BATCH_CONCURRENCY, batch.length));
        }

        // ── Execute git tasks sequentially after file batches ────────────
        const gitTasks = taskMeta
            .filter(meta => meta.task.type === 'git_action')
            .sort((a, b) => a.index - b.index);

        for (const { task, index } of gitTasks) {
            if (task.type !== 'git_action') continue;

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
                continue;
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
                continue;
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
        }

        return { status: 'continue' };
    }

    private readExistingFileWithRelatedImports(
        ctx: PipelineContext,
        filepath: string,
        relatedFiles: Record<string, string>
    ): string | null {
        try {
            const existingContent = readFile(ctx.sessionId, filepath);
            if (!existingContent) return null;

            const importRegex = /import\s+(?:.*?\s+from\s+)?['"](\.\/.+?|\.\.\/.+?)['"]/g;
            let importMatch: RegExpExecArray | null;
            while ((importMatch = importRegex.exec(existingContent)) !== null) {
                const importPath = importMatch[1];
                const importDir = path.dirname(filepath);
                const resolvedBase = normalizeRelPath(path.join(importDir, importPath));

                if (path.extname(importPath)) {
                    try {
                        const content = readFile(ctx.sessionId, resolvedBase);
                        if (content) relatedFiles[resolvedBase] = content;
                    } catch {
                        // ignore missing related file context
                    }
                } else {
                    const exts = ['.ts', '.tsx', '.js', '.jsx'];
                    for (const ext of exts) {
                        try {
                            const resolvedPath = `${resolvedBase}${ext}`;
                            const content = readFile(ctx.sessionId, resolvedPath);
                            if (content) {
                                relatedFiles[resolvedPath] = content;
                                break;
                            }
                        } catch {
                            // keep checking candidates
                        }
                    }
                }
            }
            return existingContent;
        } catch {
            return null;
        }
    }

    private async generateWithImportPreflight(params: {
        ctx: PipelineContext;
        task: TaskCreateFile | TaskEditFile;
        executorHistory: any[];
        fileManifest: string[];
        existingContent: string | null;
        relatedFiles: Record<string, string>;
        installedPackages: Set<string>;
        plannedPathSet: Set<string>;
    }): Promise<{ code: string; validation: ImportPreflightResult }> {
        const {
            ctx,
            task,
            executorHistory,
            fileManifest,
            existingContent,
            relatedFiles,
            installedPackages,
            plannedPathSet,
        } = params;

        let prompt = task.prompt;
        let code = '';
        let validation: ImportPreflightResult = { ok: true, missingPackages: [], missingRelativeImports: [] };

        for (let attempt = 0; attempt <= MAX_IMPORT_REGEN_ATTEMPTS; attempt++) {
            code = await executeFileAction(
                executorHistory,
                ctx.sessionId,
                task.filepath,
                prompt,
                fileManifest,
                existingContent,
                Object.keys(relatedFiles).length > 0 ? relatedFiles : undefined
            );

            validation = validateGeneratedImports({
                workspaceDir: ctx.workspaceDir,
                sourceFilepath: normalizeRelPath(task.filepath),
                code,
                installedPackages,
                plannedPaths: plannedPathSet,
            });

            if (validation.ok) {
                return { code, validation };
            }

            if (attempt < MAX_IMPORT_REGEN_ATTEMPTS) {
                const feedback = buildImportPreflightFeedback(validation);
                prompt = `${task.prompt}\n\n${feedback}`;
            }
        }

        throw new Error(buildImportPreflightFeedback(validation));
    }

    private getTaskDependencies(task: ExecutionTask): string[] {
        if (task.type === 'create_file' || task.type === 'edit_file' || task.type === 'generate_image') {
            if (Array.isArray(task.depends_on)) {
                return task.depends_on.map(normalizeRelPath);
            }
        }
        return [];
    }

    private getTaskBatchId(task: ExecutionTask): string | null {
        if (isBatchCapableTask(task) && typeof task.batch_id === 'string' && task.batch_id.trim()) {
            return task.batch_id.trim();
        }
        return null;
    }

    private buildFileExecutionBatches(fileTaskMeta: TaskMeta[]): TaskMeta[][] {
        if (fileTaskMeta.length === 0) return [];

        const orderedMeta = [...fileTaskMeta].sort((a, b) => a.index - b.index);

        const pathToMeta = new Map<string, TaskMeta>();
        for (const meta of orderedMeta) {
            const task = meta.task;
            if (task.type === 'create_file' || task.type === 'edit_file' || task.type === 'generate_image') {
                pathToMeta.set(normalizeRelPath(task.filepath), meta);
            }
        }

        const memoLayer = new Map<string, number>();
        const visiting = new Set<string>();

        const layerForPath = (relPath: string): number => {
            const normalized = normalizeRelPath(relPath);
            if (memoLayer.has(normalized)) return memoLayer.get(normalized)!;
            if (visiting.has(normalized)) return 0;

            visiting.add(normalized);
            const meta = pathToMeta.get(normalized);
            if (!meta) {
                visiting.delete(normalized);
                memoLayer.set(normalized, 0);
                return 0;
            }

            let layer = normalized === 'src/constants/theme.ts' ? 0 : 0;
            const deps = this.getTaskDependencies(meta.task);
            for (const dep of deps) {
                if (pathToMeta.has(dep)) {
                    layer = Math.max(layer, layerForPath(dep) + 1);
                }
            }

            visiting.delete(normalized);
            memoLayer.set(normalized, layer);
            return layer;
        };

        const byLayer = new Map<number, TaskMeta[]>();
        for (const meta of orderedMeta) {
            const task = meta.task;
            let layer = 0;
            if (task.type === 'create_file' || task.type === 'edit_file' || task.type === 'generate_image') {
                layer = layerForPath(task.filepath);
            }
            if (!byLayer.has(layer)) byLayer.set(layer, []);
            byLayer.get(layer)!.push(meta);
        }

        const layers = Array.from(byLayer.keys()).sort((a, b) => a - b);
        const batches: TaskMeta[][] = [];

        for (const layer of layers) {
            const layerTasks = (byLayer.get(layer) || []).sort((a, b) => a.index - b.index);

            const explicitGroups = new Map<string, TaskMeta[]>();
            const ungrouped: TaskMeta[] = [];

            for (const meta of layerTasks) {
                const batchId = this.getTaskBatchId(meta.task);
                if (batchId) {
                    if (!explicitGroups.has(batchId)) explicitGroups.set(batchId, []);
                    explicitGroups.get(batchId)!.push(meta);
                } else {
                    ungrouped.push(meta);
                }
            }

            const layerGroups: Array<{ minIndex: number; tasks: TaskMeta[] }> = [];

            for (const tasks of explicitGroups.values()) {
                const sortedGroup = [...tasks].sort((a, b) => a.index - b.index);
                for (const part of chunk(sortedGroup, MAX_FILES_PER_BATCH)) {
                    layerGroups.push({ minIndex: part[0].index, tasks: part });
                }
            }

            for (const part of chunk(ungrouped, MAX_FILES_PER_BATCH)) {
                layerGroups.push({ minIndex: part[0].index, tasks: part });
            }

            layerGroups.sort((a, b) => a.minIndex - b.minIndex);
            for (const group of layerGroups) {
                batches.push(group.tasks);
            }
        }

        return batches;
    }
}
