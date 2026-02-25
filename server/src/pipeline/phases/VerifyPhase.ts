// ─── Verify Phase ────────────────────────────────────────────────────────────
// Runs ESLint, TypeScript type-check, and missing-import validation.
// Extracted from chat.ts lines 692-800.

import { lintWorkspace, typeCheckWorkspace, checkMissingImports } from '../../services/lintService';
import type { Phase, PhaseResult, PipelineContext } from '../../types/pipeline';

export class VerifyPhase implements Phase {
    name = 'verify';

    async execute(ctx: PipelineContext): Promise<PhaseResult> {
        ctx.events.emit({ type: 'phase', phase: 'verifying' });

        // Emit lint/tsc terminal actions for the UI
        const lintIndex = ctx.completedGitActions.length;
        const lintAction = {
            type: 'git_result' as const,
            id: `lint-${Date.now()}`,
            index: lintIndex,
            action: 'execute',
            command: 'npx eslint src',
            output: ''
        };
        ctx.completedGitActions.push(lintAction);
        ctx.events.emit(lintAction);

        const tscIndex = ctx.completedGitActions.length;
        const tscAction = {
            type: 'git_result' as const,
            id: `tsc-${Date.now()}`,
            index: tscIndex,
            action: 'execute',
            command: 'npx tsc',
            output: ''
        };
        ctx.completedGitActions.push(tscAction);
        ctx.events.emit(tscAction);

        // Run all verification checks in parallel
        const [lintResults, tscErrors, missingImportErrors] = await Promise.all([
            lintWorkspace(ctx.sessionId, (data) => {
                lintAction.output += data;
                ctx.events.emit(lintAction);
            }),
            typeCheckWorkspace(ctx.sessionId, (data) => {
                tscAction.output += data;
                ctx.events.emit(tscAction);
            }),
            checkMissingImports(ctx.sessionId)
        ]);

        // Merge missing-import errors into tsc errors
        const allTscErrors = [...tscErrors, ...missingImportErrors];

        const hasLintErrors = lintResults.some(r => r.errorCount > 0);
        const hasTscErrors = allTscErrors.length > 0;

        if (!hasLintErrors && !hasTscErrors) {
            // Clean — proceed to deliver
            ctx.verificationErrors = null;
            return { status: 'continue' };
        }

        // Store errors for RepairPhase to process
        ctx.verificationErrors = {
            lintResults,
            tscErrors: allTscErrors,
            missingImportErrors
        };

        return { status: 'continue' };
    }
}
