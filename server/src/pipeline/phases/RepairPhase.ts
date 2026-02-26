// ─── Repair Phase ────────────────────────────────────────────────────────────
// Self-healing repair loop with:
// - REQ-6.1: Regression-aware repair (error count tracking)
// - REQ-6.2: Checkpoint & revert (file snapshots before repair)
// - REQ-6.3: Smart repair strategies (error classification)
// - REQ-6.4: Repair progress communication (transparency events)
// - Two-phase repair (dependencies first, then consumers)

import fs from 'fs';
import path from 'path';
import { readFile, writeFile, listFiles, generateDiff } from '../../services/fileService';
import { executeFileAction, runWithConcurrency } from '../../services/executor';
import {
    buildImportPreflightFeedback,
    loadInstalledPackages,
    validateGeneratedImports,
    type ImportPreflightResult
} from '../../services/importPreflight';
import { formatVerificationErrorsForPrompt, extractFilePathFromTscError, extractModulePathFromTscError, translateErrorToPlainLanguage } from '../../services/lintService';
import { buildCrossFileContext, detectLanguage } from '../helpers';
import { buildPhaseThought } from '../thoughtProcess';
import type { Phase, PhaseResult, PipelineContext } from '../../types/pipeline';
import type { FileActionEvent } from '../../types/events';

const MAX_REPAIR_RETRIES = 6;
const MAX_IMPORT_REPAIR_REGEN_ATTEMPTS = 2;
const REPAIR_PHASE_CONCURRENCY = 3;

function normalizeRelPath(relPath: string): string {
    return path.normalize(relPath).replace(/\\/g, '/');
}

export class RepairPhase implements Phase {
    name = 'repair';

    async execute(ctx: PipelineContext): Promise<PhaseResult> {
        // If no verification errors, skip repair entirely
        if (!ctx.verificationErrors) {
            return { status: 'continue' };
        }

        // Track retry count across loop iterations via context
        const retryCount = ((ctx as any)._repairRetryCount || 0) as number;
        (ctx as any)._repairRetryCount = retryCount + 1;

        if (retryCount >= MAX_REPAIR_RETRIES) {
            // Max retries reached — proceed to deliver with remaining errors
            this.emitRepairProgress(ctx, '⚠️ Max repair attempts reached — delivering with remaining issues.');
            ctx.verificationErrors = null;
            (ctx as any)._repairRetryCount = 0;
            return { status: 'continue' };
        }

        ctx.events.emit({
            type: 'phase',
            phase: 'repairing',
            detail: 'Repairing verification issues',
            thought: buildPhaseThought('repairing', ctx)
        });

        const { lintResults, tscErrors, missingImportErrors } = ctx.verificationErrors!;
        const allTscErrors = [...tscErrors, ...missingImportErrors];

        // ── REQ-6.1: Track error count for regression detection ──────────
        const previousErrorCount = ((ctx as any)._previousErrorCount || Infinity) as number;
        const currentErrorCount = lintResults.reduce((sum, r) => sum + r.errorCount, 0) + allTscErrors.length;
        (ctx as any)._previousErrorCount = currentErrorCount;

        if (retryCount > 0 && currentErrorCount > previousErrorCount) {
            // REQ-6.1: Regression detected — error count increased
            this.emitRepairProgress(ctx,
                `🚨 Regression detected! Errors went from ${previousErrorCount} → ${currentErrorCount}. Reverting and trying a different approach.`
            );

            // REQ-6.2: Revert to checkpoint
            const checkpoint = (ctx as any)._fileCheckpoint as Map<string, string> | undefined;
            if (checkpoint) {
                for (const [relPath, content] of checkpoint) {
                    try {
                        writeFile(ctx.sessionId, relPath, content);
                    } catch { /* file may have been deleted */ }
                }
                this.emitRepairProgress(ctx, '↩️ Reverted to checkpoint. Attempting alternative repair strategy.');
            }
        }

        this.emitRepairProgress(ctx, `🔧 Repair attempt ${retryCount + 1}/${MAX_REPAIR_RETRIES} — ${currentErrorCount} error(s) found.`);

        // ── Auto-create missing asset files ──────────────────────────────
        for (const err of missingImportErrors) {
            const match = err.match(/Missing import '(.+?)'/);
            if (match) {
                const missingImport = match[1];
                const ext = path.extname(missingImport).toLowerCase();
                if (['.css', '.scss', '.less', '.svg'].includes(ext)) {
                    const sourceFile = extractFilePathFromTscError(err);
                    if (sourceFile) {
                        const sourceDir = path.dirname(sourceFile);
                        const resolvedPath = path.join(sourceDir, missingImport);
                        try {
                            const fullPath = path.join(ctx.workspaceDir, resolvedPath);
                            if (!fs.existsSync(fullPath)) {
                                fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                                fs.writeFileSync(fullPath, ext === '.svg' ? '<svg></svg>' : `/* Auto-generated placeholder for ${missingImport} */\n`, 'utf8');
                                this.emitRepairProgress(ctx, `📁 Auto-created missing asset: ${resolvedPath}`);
                            }
                        } catch (e) {
                            console.warn(`Failed to auto-create ${resolvedPath}:`, e);
                        }
                    }
                }
            }
        }

        // ── Identify files to fix ────────────────────────────────────────
        const filesToFix = new Set<string>();
        const sourceModules = new Set<string>();

        lintResults.filter(r => r.errorCount > 0).forEach(r =>
            filesToFix.add(path.relative(ctx.workspaceDir, r.filepath))
        );

        allTscErrors.forEach(err => {
            const filePath = extractFilePathFromTscError(err);
            if (filePath) {
                filesToFix.add(filePath);
            }
            const modulePath = extractModulePathFromTscError(err);
            if (modulePath && filePath) {
                const errorFileDir = path.dirname(filePath);
                const resolvedBase = path.join(errorFileDir, modulePath);
                const extensions = ['.ts', '.tsx', '.js', '.jsx'];
                for (const ext of extensions) {
                    const candidate = resolvedBase + ext;
                    if (fs.existsSync(path.join(ctx.workspaceDir, candidate))) {
                        filesToFix.add(candidate);
                        sourceModules.add(candidate);
                        break;
                    }
                }
            }
        });

        if (filesToFix.size === 0 && allTscErrors.length > 0) {
            if (fs.existsSync(path.join(ctx.workspaceDir, 'src/App.tsx'))) {
                filesToFix.add('src/App.tsx');
            }
        }

        // ── REQ-6.2: Save checkpoint before repair ──────────────────────
        const checkpoint = new Map<string, string>();
        for (const relPath of filesToFix) {
            try {
                const content = readFile(ctx.sessionId, relPath);
                if (content) checkpoint.set(relPath, content);
            } catch { /* file may not exist yet */ }
        }
        (ctx as any)._fileCheckpoint = checkpoint;

        const verificationReport = formatVerificationErrorsForPrompt(lintResults, allTscErrors, ctx.workspaceDir);
        const filesToFixNormalized = Array.from(filesToFix).map(normalizeRelPath);
        const existingWorkspaceFiles = listFiles(ctx.sessionId).map(normalizeRelPath);
        const fileManifest = Array.from(new Set([...existingWorkspaceFiles, ...filesToFixNormalized]));
        const plannedPathSet = new Set(filesToFixNormalized);
        const installedPackages = loadInstalledPackages(ctx.workspaceDir);

        // Helper to repair a single file
        const repairFile = async (relPath: string): Promise<void> => {
            this.emitRepairProgress(ctx, `🔧 Fixing ${relPath}...`);

            const crossFileContext = buildCrossFileContext(ctx.sessionId, relPath);

            let existingContent: string | null = null;
            try {
                existingContent = readFile(ctx.sessionId, relPath);
            } catch { /* file doesn't exist */ }

            const code = await this.generateRepairWithImportPreflight({
                ctx,
                relPath,
                prompt: `VERIFICATION FAILED for the following reasons:\n\n${verificationReport}${crossFileContext}\n\n${this.buildRepairStrategy(verificationReport, relPath)}\n6. Output ONLY the fixed RAW SOURCE CODE for ${relPath}.`,
                existingContent,
                fileManifest,
                installedPackages,
                plannedPathSet,
            });

            const oldContent = writeFile(ctx.sessionId, relPath, code);
            const diff = generateDiff(oldContent || '', code, relPath);
            const lines = code.split('\n').length;

            const serverAction: FileActionEvent = {
                type: 'file_action',
                id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
            ctx.completedFileActions.push(serverAction);
            ctx.events.emit(serverAction);

            this.emitRepairProgress(ctx, `✅ Repaired ${relPath}`);
        };

        // ── Two-Phase Repair ─────────────────────────────────────────────
        // Phase 1: Fix source/dependency modules first
        const sourceFiles = Array.from(filesToFix).filter(f => sourceModules.has(f));
        const consumerFiles = Array.from(filesToFix).filter(f => !sourceModules.has(f));

        if (sourceFiles.length > 0) {
            this.emitRepairProgress(ctx, `📦 Phase 1: Fixing ${sourceFiles.length} dependency module(s) first...`);
            const sourceRepairTasks = sourceFiles.map(relPath => () => repairFile(relPath));
            await runWithConcurrency(sourceRepairTasks, REPAIR_PHASE_CONCURRENCY);
        }

        if (consumerFiles.length > 0) {
            this.emitRepairProgress(ctx, `🔗 Phase 2: Fixing ${consumerFiles.length} consumer file(s)...`);
            const consumerRepairTasks = consumerFiles.map(relPath => () => repairFile(relPath));
            await runWithConcurrency(consumerRepairTasks, REPAIR_PHASE_CONCURRENCY);
        }

        // Loop back to verify to check if repair worked
        return { status: 'loop', target: 'verify' };
    }

    // ── REQ-6.4: Repair Progress Communication ──────────────────────────
    private emitRepairProgress(ctx: PipelineContext, message: string): void {
        ctx.events.emit({ type: 'delta', text: `\n${message}\n` });
    }

    private async generateRepairWithImportPreflight(params: {
        ctx: PipelineContext;
        relPath: string;
        prompt: string;
        existingContent: string | null;
        fileManifest: string[];
        installedPackages: Set<string>;
        plannedPathSet: Set<string>;
    }): Promise<string> {
        const {
            ctx,
            relPath,
            prompt,
            existingContent,
            fileManifest,
            installedPackages,
            plannedPathSet,
        } = params;

        let runPrompt = prompt;
        let code = '';
        let validation: ImportPreflightResult = { ok: true, missingPackages: [], missingRelativeImports: [] };

        for (let attempt = 0; attempt <= MAX_IMPORT_REPAIR_REGEN_ATTEMPTS; attempt++) {
            code = await executeFileAction(
                ctx.geminiContents,
                ctx.sessionId,
                relPath,
                runPrompt,
                fileManifest,
                existingContent
            );

            validation = validateGeneratedImports({
                workspaceDir: ctx.workspaceDir,
                sourceFilepath: normalizeRelPath(relPath),
                code,
                installedPackages,
                plannedPaths: plannedPathSet,
            });

            if (validation.ok) {
                return code;
            }

            if (attempt < MAX_IMPORT_REPAIR_REGEN_ATTEMPTS) {
                const feedback = buildImportPreflightFeedback(validation);
                this.emitRepairProgress(
                    ctx,
                    `⚠️ Import preflight failed for ${relPath}. Regenerating (${attempt + 1}/${MAX_IMPORT_REPAIR_REGEN_ATTEMPTS})...`
                );
                runPrompt = `${prompt}\n\n${feedback}`;
            }
        }

        throw new Error(buildImportPreflightFeedback(validation));
    }

    // ── REQ-6.3: Smart Repair Strategy Builder ──────────────────────────
    private buildRepairStrategy(verificationReport: string, relPath: string): string {
        const lines = verificationReport.split('\n');
        const hasImportErrors = lines.some(l => /TS2307|TS2305|TS2614|cannot find module/i.test(l));
        const hasTypeErrors = lines.some(l => /TS2322|TS2345|TS2339|type.*mismatch/i.test(l));
        const hasSyntaxErrors = lines.some(l => /TS1005|TS1128|syntax/i.test(l));
        const hasUnusedVars = lines.some(l => /TS6133|no-unused-vars/i.test(l));

        let strategy = `REPAIR INSTRUCTIONS for ${relPath}:\n`;
        strategy += `1. Analyze the errors specifically for this file.\n`;

        if (hasSyntaxErrors) {
            strategy += `2. SYNTAX STRATEGY: Check for missing brackets, semicolons, or malformed JSX. Count opening/closing braces to ensure they match.\n`;
        } else if (hasImportErrors) {
            strategy += `2. IMPORT STRATEGY: Check module paths carefully. Use EXACT export names from the modules shown in cross-file context above. If a module doesn't exist, remove the import entirely.\n`;
        } else if (hasTypeErrors) {
            strategy += `2. TYPE STRATEGY: Check function signatures and interface definitions. Ensure props match component expectations. Use proper TypeScript types instead of 'any'.\n`;
        } else {
            strategy += `2. Fix any broken imports, missing exports, or type mismatches.\n`;
        }

        strategy += `3. **CRITICAL: NEVER use 'as any' on an import statement.** (e.g. \`import x from 'y' as any\` is INVALID).\n`;
        strategy += `4. You MUST use the EXACT export names from the imported modules shown above.\n`;

        if (hasUnusedVars) {
            strategy += `5. Remove unused imports and variables — don't just silence them.\n`;
        } else {
            strategy += `5. If you imported a file that doesn't exist, remove the import.\n`;
        }

        return strategy;
    }
}
