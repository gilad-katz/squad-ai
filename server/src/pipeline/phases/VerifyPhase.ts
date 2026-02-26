// ─── Verify Phase ────────────────────────────────────────────────────────────
// Runs ESLint, TypeScript type-check, missing-import validation,
// and design consistency checks.
// REQ-5.1: Design consistency checker
// REQ-5.3: Plain language error translation

import { lintWorkspace, typeCheckWorkspace, checkMissingImports, translateErrorToPlainLanguage } from '../../services/lintService';
import { checkDesignConsistency } from '../../services/designConsistencyChecker';
import { emitPhase } from '../phaseEvents';
import { buildPhaseThought } from '../thoughtProcess';
import type { Phase, PhaseResult, PipelineContext } from '../../types/pipeline';

export class VerifyPhase implements Phase {
    name = 'verify';

    async execute(ctx: PipelineContext): Promise<PhaseResult> {
        const plan = ctx.plan;
        const hasCodeMutations = !!plan?.tasks?.some(t =>
            t.type === 'create_file' ||
            t.type === 'edit_file' ||
            t.type === 'delete_file' ||
            t.type === 'generate_image'
        );

        // Skip verification for conversational-only turns (e.g. suggestions).
        if (!hasCodeMutations) {
            ctx.verificationErrors = null;
            return { status: 'skip' };
        }

        emitPhase(ctx, 'verifying', 'Running validation checks', buildPhaseThought('verifying', ctx));

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

        // ── REQ-5.1: Design Consistency Check ───────────────────────────
        const designErrors = checkDesignConsistency(ctx.sessionId);
        if (designErrors.length > 0) {
            const designWarnings = designErrors.slice(0, 5); // cap at 5 for readability
            const warningText = designWarnings
                .map(e => `  ⚠️ ${e.filepath}:${e.line} — ${e.message}`)
                .join('\n');
            ctx.events.emit({
                type: 'delta',
                text: `\n**Design Consistency Warnings** (${designErrors.length} total):\n${warningText}\n${designErrors.length > 5 ? `  ...and ${designErrors.length - 5} more\n` : ''}`
            });
            // Store on context for summary
            (ctx as any)._designWarnings = designErrors.length;
        }

        // Merge missing-import errors into tsc errors
        const allTscErrors = [...tscErrors, ...missingImportErrors];

        // ── REQ-5.3: Emit plain language error translations ─────────────
        if (allTscErrors.length > 0) {
            const translations = allTscErrors
                .map(err => {
                    const plain = translateErrorToPlainLanguage(err);
                    return plain ? `  💡 ${plain}` : null;
                })
                .filter((t, i, arr) => t && arr.indexOf(t) === i) // unique only
                .slice(0, 5);

            if (translations.length > 0) {
                ctx.events.emit({
                    type: 'delta',
                    text: `\n**What went wrong** (plain language):\n${translations.join('\n')}\n`
                });
            }
        }

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
