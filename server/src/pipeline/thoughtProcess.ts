import type { PipelineContext } from '../types/pipeline';
import type { PhaseState } from '../types/events';

function firstLine(input: string, max = 160): string {
    const line = input.replace(/\s+/g, ' ').trim();
    if (!line) return '';
    if (line.length <= max) return line;
    return `${line.slice(0, max - 3).trim()}...`;
}

function parseAssumptions(raw?: unknown, limit = 2): string[] {
    if (!raw) return [];

    const normalized = Array.isArray(raw)
        ? raw.map(item => String(item ?? '')).join('\n')
        : String(raw);

    return normalized
        .split('\n')
        .map(line => line.replace(/^[\s\-*•]+/, '').trim())
        .filter(Boolean)
        .slice(0, limit);
}

function formatThought(understanding: string, considerations: string[], assumptions: string[]): string {
    const assumptionLines = assumptions.length > 0
        ? assumptions
        : ['Workspace state remains stable while this stage is running.'];

    return [
        'Understanding:',
        `- ${understanding}`,
        '',
        'Considerations:',
        ...considerations.map(line => `- ${line}`),
        '',
        'Assumptions:',
        ...assumptionLines.map(line => `- ${line}`),
    ].join('\n');
}

export function buildPhaseThought(phase: Extract<PhaseState, 'planning' | 'executing' | 'verifying' | 'repairing' | 'summary'>, ctx: PipelineContext): string {
    const plan = ctx.plan;
    const explicitAssumptions = parseAssumptions(plan?.assumptions);
    const lastUserMessage = [...ctx.messages].reverse().find(msg => msg.role === 'user')?.content || '';
    const requestSummary = firstLine(lastUserMessage) || 'Use the latest user request as the source of truth.';

    if (phase === 'planning') {
        const intent = ((ctx as any)._intent || 'unknown') as string;
        return formatThought(
            `I am translating the request into an execution plan. Request: "${requestSummary}"`,
            [
                `Detected intent is "${intent}", so task ordering and scope must match that intent.`,
                'Plan tasks should stay concrete, minimal, and directly executable.',
            ],
            [
                'The request has enough detail to produce an actionable first pass.',
                'Existing files should only be touched when explicitly needed.',
            ]
        );
    }

    if (phase === 'executing') {
        const actionableCount = plan?.tasks?.filter(t => t.type !== 'chat').length || 0;
        return formatThought(
            `I am executing ${actionableCount} actionable task(s) from the plan "${plan?.title || 'Untitled Task'}".`,
            [
                'Keep file operations ordered by dependencies and preserve existing behavior.',
                'Emit progress updates for each task so status stays visible in real time.',
            ],
            explicitAssumptions.length > 0 ? explicitAssumptions : [
                'Plan prompts are detailed enough to generate valid code/artifacts.',
                'Current workspace dependencies are sufficient for execution.',
            ]
        );
    }

    if (phase === 'verifying') {
        const checks = ['ESLint', 'TypeScript', 'missing import checks'];
        return formatThought(
            `I am validating generated changes with ${checks.join(', ')}.`,
            [
                'Run all checks before deciding whether repair is required.',
                'Translate failures into clear, actionable diagnostics for repair.',
            ],
            [
                'Verification commands run against the same workspace state produced by execution.',
                'Reported errors are deterministic enough to repair iteratively.',
            ]
        );
    }

    if (phase === 'repairing') {
        const lintCount = ctx.verificationErrors?.lintResults?.reduce((sum, result) => sum + (result.errorCount || 0), 0) || 0;
        const tscCount = ctx.verificationErrors?.tscErrors?.length || 0;
        return formatThought(
            `I am repairing verification failures (${lintCount} lint + ${tscCount} type/import issue(s)).`,
            [
                'Prioritize dependency/source fixes before consumer files to avoid cascading errors.',
                'Use checkpointed edits so regressions can be rolled back safely.',
            ],
            [
                'Most failures can be resolved without changing user-requested functionality.',
                'Repair loop retries remain within configured safety limits.',
            ]
        );
    }

    return formatThought(
        `I am summarizing the completed work for user handoff (${ctx.completedFileActions.length} file action(s), ${ctx.completedGitActions.length} terminal action(s)).`,
        [
            'Highlight what changed and why, then provide concrete next steps.',
            'Ensure summary reflects the final verified workspace state.',
        ],
        [
            'All streamed events captured the latest execution state.',
            'Next steps should be scoped so each can be completed in a single follow-up turn.',
        ]
    );
}
