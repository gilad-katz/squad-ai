// ─── Confirm Phase ───────────────────────────────────────────────────────────
// Confirmation gate for non-trivial plans. Emits a confirmation event to the
// client and pauses the pipeline until the user approves.
//
// For now this is a lightweight implementation: it skips confirmation for
// small plans (≤2 file tasks) and always auto-continues for larger plans
// because the full UI confirmation flow (client-side approve/reject buttons)
// is not yet implemented.
//
// The architecture is ready — once the client adds confirmation UI, this phase
// can be updated to actually pause and wait for user response.

import type { Phase, PhaseResult, PipelineContext } from '../../types/pipeline';

/** Threshold: plans with more than this many file tasks trigger confirmation */
const CONFIRMATION_THRESHOLD = 2;

export class ConfirmPhase implements Phase {
    name = 'confirm';

    async execute(ctx: PipelineContext): Promise<PhaseResult> {
        const plan = ctx.plan;
        if (!plan) return { status: 'skip' };

        // Count actionable file tasks
        const fileTaskCount = plan.tasks.filter(t =>
            t.type === 'create_file' || t.type === 'edit_file' || t.type === 'delete_file'
        ).length;

        // Skip confirmation for trivial plans
        if (fileTaskCount <= CONFIRMATION_THRESHOLD) {
            return { status: 'skip' };
        }

        // Emit confirmation data for the client transparency panel
        // This gives the user visibility into what's about to happen
        const confirmationSummary = {
            goal: plan.title || 'Execute plan',
            taskCount: plan.tasks.length,
            fileCount: fileTaskCount,
            reasoning: plan.reasoning,
            assumptions: plan.assumptions || 'None',
            files: plan.tasks
                .filter(t => 'filepath' in t && t.filepath)
                .map(t => ({
                    action: t.type,
                    path: (t as any).filepath
                }))
        };

        // Emit transparency with the plan details so the user sees the breakdown
        // before execution begins. This is the "soft" confirmation — the user
        // can see what's planned in the transparency panel.
        ctx.events.emit({
            type: 'transparency',
            data: {
                title: plan.title || '',
                reasoning: plan.reasoning || '',
                tasks: plan.tasks
                    .filter(t => t.type !== 'chat')
                    .map((t, i) => {
                        let description = '';
                        if (t.type === 'create_file' || t.type === 'edit_file') {
                            description = `${t.type === 'create_file' ? 'Create' : 'Edit'} ${t.filepath}`;
                        } else if (t.type === 'delete_file') {
                            description = `Delete ${t.filepath}`;
                        } else if (t.type === 'generate_image') {
                            description = `Generate image: ${t.filepath}`;
                        } else if (t.type === 'git_action') {
                            description = `Git: ${t.command}`;
                        }
                        return { id: i + 1, description, status: 'pending' as const };
                    }),
                assumptions: plan.assumptions || 'None'
            }
        });

        // TODO: Full confirmation flow
        // When the client-side confirmation UI is implemented:
        // 1. Emit a { type: 'confirmation', data: confirmationSummary } event
        // 2. Wait for the client to send back an approve/reject via a new endpoint
        // 3. On reject, return { status: 'loop', target: 'plan' } to re-plan
        // 4. On approve, continue to execute

        // For now, auto-continue with the plan
        return { status: 'continue' };
    }
}
