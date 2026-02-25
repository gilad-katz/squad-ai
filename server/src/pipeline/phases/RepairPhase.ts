// ─── Repair Phase ────────────────────────────────────────────────────────────
// Self-healing repair loop: fixes verification errors with two-phase repair
// (dependencies first, then consumers). Supports regression detection.
// Extracted from chat.ts lines 800-887.

import fs from 'fs';
import path from 'path';
import { readFile, writeFile, listFiles, generateDiff } from '../../services/fileService';
import { executeFileAction, runWithConcurrency } from '../../services/executor';
import { formatVerificationErrorsForPrompt, extractFilePathFromTscError, extractModulePathFromTscError } from '../../services/lintService';
import { buildCrossFileContext, detectLanguage } from '../helpers';
import type { Phase, PhaseResult, PipelineContext } from '../../types/pipeline';
import type { FileActionEvent } from '../../types/events';

const MAX_REPAIR_RETRIES = 3;

export class RepairPhase implements Phase {
    name = 'repair';

    async execute(ctx: PipelineContext): Promise<PhaseResult> {
        // If no verification errors, skip repair entirely
        if (!ctx.verificationErrors) {
            return { status: 'continue' };
        }

        let retries = 0;

        while (retries < MAX_REPAIR_RETRIES) {
            ctx.events.emit({ type: 'phase', phase: 'repairing' });

            const { lintResults, tscErrors, missingImportErrors } = ctx.verificationErrors!;

            // ── Auto-create missing asset files ──────────────────────────
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
                                    console.log(`Auto-created missing asset: ${resolvedPath}`);
                                }
                            } catch (e) {
                                console.warn(`Failed to auto-create ${resolvedPath}:`, e);
                            }
                        }
                    }
                }
            }

            // ── Identify files to fix ────────────────────────────────────
            const filesToFix = new Set<string>();
            const sourceModules = new Set<string>();

            lintResults.filter(r => r.errorCount > 0).forEach(r =>
                filesToFix.add(path.relative(ctx.workspaceDir, r.filepath))
            );

            const allTscErrors = [...tscErrors, ...missingImportErrors];
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

            const verificationReport = formatVerificationErrorsForPrompt(lintResults, allTscErrors, ctx.workspaceDir);

            // Helper to repair a single file
            const repairFile = async (relPath: string): Promise<void> => {
                const crossFileContext = buildCrossFileContext(ctx.sessionId, relPath);

                let existingContent: string | null = null;
                try {
                    existingContent = readFile(ctx.sessionId, relPath);
                } catch { /* file doesn't exist */ }

                const code = await executeFileAction(
                    ctx.geminiContents,
                    ctx.sessionId,
                    relPath,
                    `VERIFICATION FAILED for the following reasons:\n\n${verificationReport}${crossFileContext}\n\nREPAIR INSTRUCTIONS for ${relPath}:\n1. Analyze the errors specifically for this file.\n2. Fix any broken imports, missing exports, or type mismatches.\n3. **CRITICAL: NEVER use 'as any' on an import statement.** (e.g. \`import x from 'y' as any\` is INVALID). Remove it if you see it.\n4. You MUST use the EXACT export names from the imported modules shown above.\n5. If you imported a file that doesn't exist, either create it (in a previous task) or remove the import.\n6. Output ONLY the fixed RAW SOURCE CODE for ${relPath}.`,
                    listFiles(ctx.sessionId),
                    existingContent
                );

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
            };

            // ── Two-Phase Repair ─────────────────────────────────────────
            // Phase 1: Fix source/dependency modules first
            const sourceFiles = Array.from(filesToFix).filter(f => sourceModules.has(f));
            const consumerFiles = Array.from(filesToFix).filter(f => !sourceModules.has(f));

            if (sourceFiles.length > 0) {
                const sourceRepairTasks = sourceFiles.map(relPath => () => repairFile(relPath));
                await runWithConcurrency(sourceRepairTasks, 5);
            }

            // Phase 2: Fix consumer files
            if (consumerFiles.length > 0) {
                const consumerRepairTasks = consumerFiles.map(relPath => () => repairFile(relPath));
                await runWithConcurrency(consumerRepairTasks, 5);
            }

            retries++;

            // Re-verify: loop back to VerifyPhase by returning loop result
            // But we need to check inline first to avoid infinite loops
            if (retries >= MAX_REPAIR_RETRIES) {
                // Max retries reached — proceed to deliver with remaining errors
                ctx.verificationErrors = null;
                return { status: 'continue' };
            }

            // Loop back to verify to check if repair worked
            return { status: 'loop', target: 'verify' };
        }

        return { status: 'continue' };
    }
}
