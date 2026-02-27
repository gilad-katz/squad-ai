// ─── PM Analyze Phase ────────────────────────────────────────────────────────
// Calls the PM Agent LLM to generate a structured PMSpec from the user's request.
// The PM Agent is the "first responder" — it understands requirements, makes
// design decisions, and defines scope before the FE Agent plans code.

import { ai } from '../../services/gemini';
import { loadPrompt, convertToGeminiContents, robustJsonParse, classifyError } from '../helpers';
import { emitPhase } from '../phaseEvents';
import type { Phase, PhaseResult, PipelineContext } from '../../types/pipeline';
import type { PMSpec } from '../../types/plan';

export class PMAnalyzePhase implements Phase {
    name = 'pm-analyze';

    async execute(ctx: PipelineContext): Promise<PhaseResult> {
        const intent = (ctx as any)._intent as string | undefined;

        // ── Skip PM for non-generative intents ──────────────────────────
        // Conversational intents (explain, feedback) don't need PM analysis
        // UNLESS the user attached an image — then PM should always analyze it.
        const lastUserMsg = [...ctx.messages].reverse().find(m => m.role === 'user');
        const hasAttachments = lastUserMsg?.attachments && lastUserMsg.attachments.length > 0;

        if (!hasAttachments && (intent === 'explain' || intent === 'feedback')) {
            ctx.pmSpec = null;
            return { status: 'continue' };
        }

        // ── Emit PM Agent identity ──────────────────────────────────────
        ctx.activeAgent = 'pm';
        ctx.events.emit({ type: 'agent_start', agent: 'pm', name: 'PM-AGENT-01' });
        emitPhase(ctx, 'thinking', 'Defining requirements and design');

        // ── Build PM system instruction ─────────────────────────────────
        let systemInstruction = loadPrompt('pm-agent.txt');

        // Inject existing workspace context
        if (ctx.existingFiles.length > 0) {
            systemInstruction += `\n\nEXISTING WORKSPACE FILES (the project already has these files):\n${ctx.existingFiles.map(f => `- ${f}`).join('\n')}`;
        }

        // Inject project memory
        const projectContext = (ctx as any)._projectContext;
        if (projectContext) {
            systemInstruction += `\n\nPROJECT HISTORY:\n${projectContext}`;
        }

        // Inject extended thinking analysis
        const thinkingAnalysis = (ctx as any)._thinkingAnalysis;
        if (thinkingAnalysis) {
            systemInstruction += `\n\nPRE-ANALYSIS (from extended thinking):\n${thinkingAnalysis}`;
        }

        // ── Call PM Agent LLM ───────────────────────────────────────────
        const geminiContents = convertToGeminiContents(ctx.messages);

        let pmResponseText: string;
        try {
            const pmResponse = await ai.models.generateContent({
                model: process.env.MODEL_ID || 'gemini-2.5-flash',
                contents: geminiContents,
                config: {
                    systemInstruction,
                    responseMimeType: 'application/json'
                }
            });

            pmResponseText = pmResponse.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        } catch (err: any) {
            console.error('PM Agent LLM call failed:', err);
            ctx.events.emit({ type: 'agent_end', agent: 'pm' });
            ctx.activeAgent = null;
            // Non-fatal: proceed without PM spec, Orchestrator will handle it
            ctx.pmSpec = null;
            return { status: 'continue' };
        }

        // ── Parse PM spec ───────────────────────────────────────────────
        let pmSpec: PMSpec;
        try {
            pmSpec = robustJsonParse(pmResponseText);

            // Validate minimum structure
            if (!pmSpec.chat_message && !pmSpec.requirements) {
                throw new Error('PM spec missing chat_message and requirements');
            }
        } catch (err) {
            console.error('Failed to parse PM spec. Raw response:', pmResponseText);
            // Fallback: treat entire response as a chat message
            pmSpec = {
                title: '',
                chat_message: pmResponseText,
                requirements: [],
                design: { theme: '', layout: '', typography: '', key_interactions: [] },
                scope: { this_turn: [], next_turn: [] },
                suggestions: []
            };
        }

        // ── Build the full chat message with design spec ────────────────
        // The chat_message should already contain the design brief from the
        // improved prompt. But we also append a structured summary of the
        // design spec so it's ALWAYS visible and explicit.
        let fullMessage = pmSpec.chat_message || '';

        const designSummary = this.buildDesignSummary(pmSpec);
        if (designSummary) {
            fullMessage += '\n\n' + designSummary;
        }

        // ── Emit PM chat message to the user ────────────────────────────
        if (fullMessage) {
            ctx.events.emit({ type: 'delta', text: fullMessage, agent: 'pm' });
        }

        // ── Emit the actual PM analysis as thought process ──────────────
        const pmThought = this.buildActualThought(pmSpec);
        emitPhase(ctx, 'thinking', 'Requirements and design defined', pmThought);

        // ── Store spec for downstream phases ────────────────────────────
        ctx.pmSpec = pmSpec;

        // ── Emit PM metadata (title) ────────────────────────────────────
        if (pmSpec.title) {
            ctx.events.emit({ type: 'metadata', data: { title: pmSpec.title } });
        }

        // ── Close PM agent turn ─────────────────────────────────────────
        ctx.events.emit({ type: 'agent_end', agent: 'pm' });
        ctx.activeAgent = null;

        // ── Check if this is conversational-only (empty spec) ───────────
        const isConversational = pmSpec.requirements.length === 0
            && pmSpec.scope.this_turn.length === 0;

        if (isConversational) {
            // PM handled it as conversation, no need for FE Agent
            ctx.events.emit({ type: 'done', usage: null, sessionId: ctx.sessionId });
            return { status: 'abort', reason: 'PM handled as conversational response' };
        }

        return { status: 'continue' };
    }

    // ── Build a structured design summary to append to chat message ──────
    private buildDesignSummary(spec: PMSpec): string {
        const { design, requirements, scope, suggestions } = spec;
        if (!design.theme && !design.layout && requirements.length === 0) return '';

        const sections: string[] = [];

        // Design spec card
        if (design.theme || design.layout || design.typography) {
            sections.push('---');
            sections.push('### 🎨 Design Spec');
            if (design.theme) sections.push(`**Theme:** ${design.theme}`);
            if (design.layout) sections.push(`**Layout:** ${design.layout}`);
            if (design.typography) sections.push(`**Typography:** ${design.typography}`);
            if (design.key_interactions?.length > 0) {
                sections.push('**Interactions:**');
                design.key_interactions.forEach(i => sections.push(`- ${i}`));
            }
        }

        // Scope
        if (scope.this_turn?.length > 0) {
            sections.push('');
            sections.push('### 📋 Scope');
            sections.push('**This turn:** ' + scope.this_turn.join(' → '));
            if (scope.next_turn?.length > 0) {
                sections.push('**Deferred:** ' + scope.next_turn.join(', '));
            }
        }

        // Suggestions
        if (suggestions?.length > 0) {
            sections.push('');
            sections.push('### 💡 Bonus Suggestions');
            suggestions.forEach(s => sections.push(`- ${s}`));
        }

        return sections.join('\n');
    }

    // ── Build actual thought from PM analysis (replaces static template) ─
    private buildActualThought(spec: PMSpec): string {
        const lines: string[] = [];

        if (spec.title) {
            lines.push(`Project: ${spec.title}`);
            lines.push('');
        }

        if (spec.requirements.length > 0) {
            lines.push('Requirements defined:');
            spec.requirements.forEach(r =>
                lines.push(`- [${r.priority}] ${r.id}: ${r.description}`)
            );
            lines.push('');
        }

        if (spec.design.theme) {
            lines.push('Design decisions:');
            lines.push(`- Theme: ${spec.design.theme}`);
            if (spec.design.typography) lines.push(`- Typography: ${spec.design.typography}`);
            if (spec.design.layout) lines.push(`- Layout: ${spec.design.layout}`);
            lines.push('');
        }

        if (spec.scope.this_turn?.length > 0) {
            lines.push('Scope (this turn):');
            spec.scope.this_turn.forEach(s => lines.push(`- ${s}`));
        }

        return lines.join('\n') || 'PM analysis complete.';
    }
}

