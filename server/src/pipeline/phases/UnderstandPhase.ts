// ─── Understand Phase ────────────────────────────────────────────────────────
// Classifies user intent, performs extended thinking via LLM, reads project
// memory, and analyses the existing codebase BEFORE planning.
// REQ-0.3: Extended thinking (deep reasoning before plan)
// REQ-1.2: Proactive clarification (ask questions when ambiguous)
// REQ-1.3: Codebase analysis (scan existing files)

import { ai } from '../../services/gemini';
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

        // 6. REQ-0.3: Extended Thinking — deep reasoning before planning
        //    For non-trivial intents, ask the LLM to reason about the request
        let thinkingAnalysis = '';
        const needsDeepThinking = ['create', 'edit', 'fix', 'refactor'].includes(intent);

        if (needsDeepThinking) {
            try {
                thinkingAnalysis = await this.performExtendedThinking(
                    lastUserMsg.content,
                    intent,
                    codebaseSummary,
                    projectContext || ''
                );
            } catch (err) {
                console.warn('Extended thinking failed, proceeding without:', err);
            }
        }

        // 7. REQ-1.2: Proactive Clarification — if request is ambiguous, abort
        //    and emit clarifying questions as a chat response
        if (intent === 'unknown' && lastUserMsg.content.split(/\s+/).length < 6) {
            // Very short, ambiguous request — ask for clarification
            ctx.events.emit({
                type: 'delta',
                text: "I'd love to help! Could you give me a bit more detail about what you'd like? For example:\n\n" +
                    "- **Build**: \"Create a portfolio website with a hero, projects grid, and contact form\"\n" +
                    "- **Edit**: \"Change the header background to dark blue\"\n" +
                    "- **Fix**: \"The button doesn't respond when clicked\"\n\n" +
                    "The more specific you are, the better I can plan! 🚀"
            });
            ctx.events.emit({ type: 'phase', phase: 'ready' });
            ctx.events.emit({ type: 'done', usage: null, sessionId: ctx.sessionId });
            return { status: 'abort', reason: 'Clarification requested from user' };
        }

        // 8. Store analysis results in context for PlanPhase to use
        (ctx as any)._intent = intent;
        (ctx as any)._codebaseSummary = codebaseSummary;
        (ctx as any)._projectContext = projectContext;
        (ctx as any)._thinkingAnalysis = thinkingAnalysis;

        return { status: 'continue' };
    }

    // ─── REQ-0.3: Extended Thinking ──────────────────────────────────────
    private async performExtendedThinking(
        userMessage: string,
        intent: UserIntent,
        codebaseSummary: string,
        projectContext: string
    ): Promise<string> {
        const thinkingPrompt = `You are a senior frontend architect about to plan a coding task. Before generating any plan, think deeply about the following:

USER REQUEST: "${userMessage}"
DETECTED INTENT: ${intent}
${codebaseSummary ? `\nEXISTING CODEBASE:\n${codebaseSummary}` : '\nNEW PROJECT (no existing files)'}
${projectContext ? `\nPROJECT CONTEXT:\n${projectContext}` : ''}

Answer these 4 questions concisely (2-3 sentences each):

1. **TRUE INTENT**: What is the user REALLY asking for? Look beyond the surface request.
2. **BEST ARCHITECTURE**: What's the ideal technical approach? (not just the first one that works)
3. **RISKS**: What could go wrong? (edge cases, responsive issues, missing data, naming conflicts)
4. **PREMIUM TOUCHES**: What will make this feel world-class? (micro-animations, loading states, empty states, accessibility)

Output ONLY the analysis as plain text. Be specific, not generic.`;

        const response = await ai.models.generateContent({
            model: process.env.MODEL_ID || 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: thinkingPrompt }] }]
        });

        return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
}
