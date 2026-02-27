import type { PipelineContext } from '../types/pipeline';
import type { PhaseState } from '../types/events';

/**
 * Build a concise thought for a pipeline phase.
 * Follows the Antigravity pattern: brief, data-rich, no verbose templates.
 * Maximum 3 lines per thought — show actual plan data, not generic filler.
 */
export function buildPhaseThought(
    phase: Extract<PhaseState, 'planning' | 'executing' | 'verifying' | 'repairing' | 'summary'>,
    ctx: PipelineContext
): string {
    const plan = ctx.plan;

    if (phase === 'planning') {
        const intent = ((ctx as any)._intent || 'unknown') as string;
        const lastMsg = [...ctx.messages].reverse().find(m => m.role === 'user')?.content || '';
        const preview = lastMsg.length > 80 ? lastMsg.slice(0, 77) + '...' : lastMsg;
        const lines: string[] = [`Intent: ${intent}. Request: "${preview}"`];

        // Show PM spec summary if available
        if (ctx.pmSpec && ctx.pmSpec.requirements.length > 0) {
            lines.push(`PM requirements: ${ctx.pmSpec.requirements.map(r => r.id).join(', ')}`);
        }

        return lines.join('\n');
    }

    if (phase === 'executing') {
        const tasks = plan?.tasks?.filter(t => t.type !== 'chat') || [];
        const fileNames = tasks
            .filter(t => t.type === 'create_file' || t.type === 'edit_file')
            .map(t => (t as any).filepath?.split('/').pop() || '')
            .filter(Boolean);

        const lines: string[] = [];
        lines.push(`${tasks.length} task(s) for "${plan?.title || 'Untitled'}"`);
        if (fileNames.length > 0) {
            lines.push(`Files: ${fileNames.join(' → ')}`);
        }
        return lines.join('\n');
    }

    if (phase === 'verifying') {
        return 'Running ESLint + TypeScript checks';
    }

    if (phase === 'repairing') {
        const lintCount = ctx.verificationErrors?.lintResults?.reduce(
            (sum, r) => sum + (r.errorCount || 0), 0
        ) || 0;
        const tscCount = ctx.verificationErrors?.tscErrors?.length || 0;
        return `Repairing ${lintCount} lint + ${tscCount} type error(s)`;
    }

    // summary
    const fileCount = ctx.completedFileActions.length;
    const termCount = ctx.completedGitActions.length;
    return `${fileCount} file(s), ${termCount} command(s) completed`;
}

