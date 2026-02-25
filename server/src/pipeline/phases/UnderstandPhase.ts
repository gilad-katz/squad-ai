// ─── Understand Phase ────────────────────────────────────────────────────────
// Classifies user intent, reads project memory, and analyses the existing
// codebase BEFORE planning. This prevents the planner from making uninformed
// decisions and enables proactive clarification.

import { listFiles, readFile } from '../../services/fileService';
import type { Phase, PhaseResult, PipelineContext } from '../../types/pipeline';

// ─── Intent Types ────────────────────────────────────────────────────────────

export type UserIntent =
    | 'create'        // Build something new (new project, new page, new component)
    | 'edit'          // Modify existing code
    | 'fix'           // Fix a bug or error
    | 'explain'       // Explain something (conversational, no code changes)
    | 'feedback'      // Give feedback on the last work (looks good / change this)
    | 'refactor'      // Restructure existing code
    | 'delete'        // Remove files or features
    | 'git'           // Git operation (commit, push, etc.)
    | 'unknown';      // Can't determine — requires clarification

// ─── Intent Classification ──────────────────────────────────────────────────

const INTENT_PATTERNS: Array<{ intent: UserIntent; patterns: RegExp[] }> = [
    {
        intent: 'fix',
        patterns: [
            /\bfix\b/i, /\bbug\b/i, /\bbroken\b/i, /\berror\b/i, /\bcrash/i,
            /\bdoesn'?t\s+work/i, /\bnot\s+working/i, /\bissue\b/i
        ]
    },
    {
        intent: 'edit',
        patterns: [
            /\bchange\b/i, /\bupdate\b/i, /\bmodify\b/i, /\breplace\b/i,
            /\badd\b.*\bto\b/i, /\bremove\b.*\bfrom\b/i, /\bmove\b/i,
            /\bmake\s+it\b/i, /\bshould\s+be\b/i
        ]
    },
    {
        intent: 'create',
        patterns: [
            /\bbuild\b/i, /\bcreate\b/i, /\bgenerate\b/i, /\bmake\s+(me\s+)?a\b/i,
            /\bsetup\b/i, /\bbootstrap\b/i, /\bscaffold\b/i, /\bnew\s+project\b/i,
            /\bwebsite\b/i, /\bapp\b/i, /\blanding\s+page\b/i
        ]
    },
    {
        intent: 'explain',
        patterns: [
            /\bexplain\b/i, /\bwhat\s+is\b/i, /\bhow\s+does\b/i, /\bwhy\b/i,
            /\btell\s+me\b/i, /\bwhat\s+do\s+you\s+think\b/i, /\bdescribe\b/i
        ]
    },
    {
        intent: 'feedback',
        patterns: [
            /\blooks?\s+good\b/i, /\blooks?\s+great\b/i, /\bperfect\b/i,
            /\bnice\b/i, /\bawesome\b/i, /\bthank/i, /\bwell\s+done\b/i,
            /\bgood\s+job\b/i
        ]
    },
    {
        intent: 'refactor',
        patterns: [
            /\brefactor\b/i, /\brestructure\b/i, /\bclean\s+up\b/i,
            /\bsimplify\b/i, /\breorganize\b/i, /\boptimize\b/i
        ]
    },
    {
        intent: 'delete',
        patterns: [
            /\bdelete\b/i, /\bremove\b(?!.*\bfrom\b)/i, /\bget\s+rid\b/i, /\bdrop\b/i
        ]
    },
    {
        intent: 'git',
        patterns: [
            /\bgit\b/i, /\bcommit\b/i, /\bpush\b/i, /\bpull\b/i, /\bmerge\b/i,
            /\bbranch\b/i, /\brepository\b/i, /\brepo\b/i
        ]
    }
];

export function classifyIntent(lastUserMessage: string): UserIntent {
    // Count matches per intent
    const scores = new Map<UserIntent, number>();

    for (const { intent, patterns } of INTENT_PATTERNS) {
        const matchCount = patterns.filter(p => p.test(lastUserMessage)).length;
        if (matchCount > 0) {
            scores.set(intent, (scores.get(intent) || 0) + matchCount);
        }
    }

    if (scores.size === 0) return 'unknown';

    // Return the highest-scoring intent
    let bestIntent: UserIntent = 'unknown';
    let bestScore = 0;
    for (const [intent, score] of scores) {
        if (score > bestScore) {
            bestScore = score;
            bestIntent = intent;
        }
    }

    return bestIntent;
}

// ─── Phase Implementation ───────────────────────────────────────────────────

export class UnderstandPhase implements Phase {
    name = 'understand';

    async execute(ctx: PipelineContext): Promise<PhaseResult> {
        ctx.events.emit({ type: 'phase', phase: 'thinking' });

        // 1. Extract the last user message for intent classification
        const lastUserMsg = [...ctx.messages].reverse().find(m => m.role === 'user');
        if (!lastUserMsg) {
            return { status: 'abort', reason: 'No user message found' };
        }

        // 2. Classify intent
        const intent = classifyIntent(lastUserMsg.content);

        // 3. Read project memory for cross-turn context
        const projectContext = ctx.memory.read();

        // 4. Analyze existing codebase
        ctx.existingFiles = listFiles(ctx.sessionId);

        // 5. Build codebase summary for complex projects
        let codebaseSummary = '';
        if (ctx.existingFiles.length > 0) {
            // Group files by directory for a structural overview
            const dirs = new Map<string, string[]>();
            for (const file of ctx.existingFiles) {
                const dir = file.includes('/') ? file.substring(0, file.lastIndexOf('/')) : '.';
                if (!dirs.has(dir)) dirs.set(dir, []);
                dirs.get(dir)!.push(file.split('/').pop() || file);
            }

            codebaseSummary = Array.from(dirs.entries())
                .map(([dir, files]) => `  ${dir}/: ${files.join(', ')}`)
                .join('\n');
        }

        // 6. Store analysis results in context for PlanPhase to use
        // We attach these as extra properties on the context
        (ctx as any)._intent = intent;
        (ctx as any)._codebaseSummary = codebaseSummary;
        (ctx as any)._projectContext = projectContext;

        // 7. For purely conversational intents, we still proceed to PlanPhase
        //    The orchestrator LLM will handle them as chat-only responses.
        //    In a future iteration, we could handle 'explain' and 'feedback'
        //    directly here to avoid the LLM call.

        return { status: 'continue' };
    }
}
