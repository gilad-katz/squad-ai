// ─── Deliver Phase ───────────────────────────────────────────────────────────
// Starts the dev server, generates FE technical handoff + PM review summary,
// persists chat history, and updates project memory.

import fs from 'fs';
import path from 'path';
import { ai } from '../../services/gemini';
import { startDevServer, listFiles } from '../../services/fileService';
import { emitPhase } from '../phaseEvents';
import { buildPhaseThought } from '../thoughtProcess';
import type { Phase, PhaseResult, PipelineContext } from '../../types/pipeline';

export class DeliverPhase implements Phase {
    name = 'deliver';

    async execute(ctx: PipelineContext): Promise<PhaseResult> {
        const plan = ctx.plan;
        if (!plan) return { status: 'abort', reason: 'No plan available for delivery' };

        const hasCodeMutations = plan.tasks.some(t =>
            t.type === 'create_file' ||
            t.type === 'edit_file' ||
            t.type === 'delete_file' ||
            t.type === 'generate_image'
        );

        // Conversational-only turns should not run preview/summary boilerplate.
        let summaryText = '';
        if (hasCodeMutations) {
            // ── Start Dev Server ─────────────────────────────────────────
            const devResult = await startDevServer(ctx.sessionId);
            if (devResult) {
                ctx.events.emit({ type: 'preview', url: `http://localhost:${devResult.port}` });

                const gitResult = {
                    type: 'git_result' as const,
                    id: `dev-${Date.now()}`,
                    index: ctx.completedGitActions.length,
                    output: devResult.logs,
                    command: devResult.command,
                    action: 'execute'
                };
                ctx.completedGitActions.push(gitResult);
                ctx.events.emit(gitResult);
            }

            // ── FE Agent Technical Handoff ────────────────────────────────
            emitPhase(ctx, 'summary', 'FE Agent summarizing work', buildPhaseThought('summary', ctx));
            const feHandoff = await this.generateFEHandoff(ctx);

            if (feHandoff) {
                ctx.events.emit({ type: 'delta', text: feHandoff, agent: 'fe' });
            }

            // ── Close FE Agent turn ──────────────────────────────────────
            if (ctx.activeAgent === 'fe') {
                ctx.events.emit({ type: 'agent_end', agent: 'fe' });
                ctx.activeAgent = null;
            }

            // ── PM Agent Review Summary ──────────────────────────────────
            if (ctx.pmSpec) {
                ctx.activeAgent = 'pm';
                ctx.events.emit({ type: 'agent_start', agent: 'pm', name: 'PM-AGENT-01' });
                emitPhase(ctx, 'summary', 'PM Agent reviewing output');

                summaryText = await this.generatePMReview(ctx, feHandoff);

                if (summaryText) {
                    ctx.events.emit({ type: 'delta', text: summaryText, agent: 'pm' });
                }

                ctx.events.emit({ type: 'agent_end', agent: 'pm' });
                ctx.activeAgent = null;
            } else {
                // No PM spec — use FE handoff as the summary
                summaryText = feHandoff;
                if (summaryText) {
                    ctx.events.emit({ type: 'summary', text: summaryText });
                }
            }
        } else {
            // Close FE Agent turn for conversational turns
            if (ctx.activeAgent === 'fe') {
                ctx.events.emit({ type: 'agent_end', agent: 'fe' });
                ctx.activeAgent = null;
            }
        }

        // ── Persist Final History ────────────────────────────────────────
        const assistantContent = plan.tasks
            .filter(t => t.type === 'chat')
            .map(t => t.content)
            .join('\n\n') || 'Done — files have been created and verified.';

        const finalAssistantMessage = {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: assistantContent,
            displayContent: assistantContent,
            summary: summaryText || undefined,
            status: 'complete',
            timestamp: Date.now(),
            transparency: {
                reasoning: plan.reasoning || '',
                tasks: ctx.transparencyTasks.map(t => ({ id: t.id, description: t.description, status: 'done' })),
                assumptions: plan.assumptions || 'None'
            },
            fileActions: [],
            serverFileActions: ctx.completedFileActions,
            gitActions: ctx.completedGitActions,
            phaseThoughts: ctx.phaseThoughts
        };

        try {
            const finalHistory = [...ctx.messages, finalAssistantMessage];
            const historyPath = path.join(ctx.workspaceDir, 'chat_history.json');
            fs.writeFileSync(historyPath, JSON.stringify(finalHistory, null, 2));
        } catch (err) {
            console.error('Failed to finalize chat history:', err);
        }

        // ── Update Project Memory ────────────────────────────────────────
        this.updateProjectMemory(ctx);

        // ── Done Event ──────────────────────────────────────────────────
        emitPhase(ctx, 'ready');
        ctx.events.emit({ type: 'done', usage: null, sessionId: ctx.sessionId });

        return { status: 'continue' };
    }

    // ── FE Technical Handoff ─────────────────────────────────────────────
    // The FE Agent summarizes what it actually did: files changed, technical
    // decisions made, and any issues encountered.
    private async generateFEHandoff(ctx: PipelineContext): Promise<string> {
        try {
            let verificationContext = '';
            const repairRetries = ((ctx as any)._repairRetryCount || 0) as number;
            if (repairRetries > 0) {
                verificationContext += `\nVERIFICATION & REPAIR:\n- Repair cycles: ${repairRetries}\n- All errors resolved: ${!ctx.verificationErrors ? 'Yes' : 'No'}\n`;
            }
            if (ctx.verificationErrors) {
                const { lintResults, tscErrors } = ctx.verificationErrors;
                verificationContext += `- Remaining: ${lintResults.filter(r => r.errorCount > 0).length} lint, ${tscErrors.length} type errors\n`;
            } else {
                verificationContext += `- Build status: Clean (0 errors)\n`;
            }

            const prompt = `
You are FE-SENIOR-01, a senior frontend engineer. You just completed a set of tasks.
Write a very CONCISE TECHNICAL HANDOFF to the PM agent and the user.

WHAT YOU CHANGED:
${ctx.completedFileActions.map(a => `- ${a.action}: ${a.filepath}`).join('\n') || 'No file changes'}

TERMINAL OUTPUT:
${ctx.completedGitActions.map(a => `- ${a.command}: ${(a.output || '').substring(0, 100)}`).join('\n') || 'None'}
${verificationContext}
${ctx.pmSpec ? `PM REQUIREMENTS TO ADDRESS:\n${ctx.pmSpec.requirements.map(r => `- ${r.id}: ${r.description}`).join('\n')}` : ''}

FORMAT (output ONLY markdown, no JSON):
1. Use a clear header: "Building [Workspace Title]" or "Updating [Workspace Title]".
2. List file changes with brief sentences (e.g., "Refined Display.tsx to fix centering").
3. Note addressed requirements inline or in a tiny list.
4. "Technical Notes": 1-2 punchy bullets on key decisions.
5. NO FLUFF. NO "I hope you like it". NO "I am ready for the next task".
6. Aim for 8-10 lines total. Think "slack message", not "formal report".
`;

            const response = await ai.models.generateContent({
                model: process.env.MODEL_ID || 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });

            return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } catch (err) {
            console.error('Failed to generate FE handoff:', err);
            return '';
        }
    }

    // ── PM Review Summary ────────────────────────────────────────────────
    // The PM Agent reviews what the FE built against the original PM spec,
    // checks whether requirements were met, and suggests product-level next steps.
    private async generatePMReview(ctx: PipelineContext, feHandoff: string): Promise<string> {
        try {
            const prompt = `
You are PM-AGENT-01, an Agentic Product Manager. The FE engineer has completed their work.
Review their output against your original spec and produce a punchy, direct summary.

YOUR ORIGINAL SPECIFICATION:
${JSON.stringify(ctx.pmSpec, null, 2)}

FE ENGINEER'S HANDOFF:
${feHandoff || 'No handoff provided'}

FILES IN WORKSPACE:
${listFiles(ctx.sessionId).map(f => `- ${f}`).join('\n')}

FORMAT (output ONLY markdown, no JSON):
1. Header: "### PM Review".
2. Simple requirement checklist (e.g., "✅ VIS-01: Removed overlay").
3. "Technical Compliance": 1-2 brief bullets on design adherence.
4. "Suggested Next Steps": 2-3 concrete, prioritized bullets. Use \`code\` for files.
5. Be direct. Avoid transition phrases like "In summary" or "Overall".
6. Aim for 10-15 lines total.
`;

            const response = await ai.models.generateContent({
                model: process.env.MODEL_ID || 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });

            return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } catch (err) {
            console.error('Failed to generate PM review:', err);
            return '';
        }
    }

    private updateProjectMemory(ctx: PipelineContext): void {
        try {
            const plan = ctx.plan;
            if (!plan) return;

            // Record architecture decisions
            if (plan.reasoning) {
                ctx.memory.updateSection('Architecture', plan.reasoning);
            }

            // Record components built
            const fileActions = ctx.completedFileActions.filter(f => f.action === 'created' || f.action === 'edited');
            if (fileActions.length > 0) {
                const components = fileActions
                    .map(f => `- ${f.filepath}`)
                    .join('\n');
                ctx.memory.updateSection('Files Modified This Turn', components);
            }

            // Record the current file list
            const allFiles = listFiles(ctx.sessionId);
            if (allFiles.length > 0) {
                ctx.memory.updateSection('Current File Tree', allFiles.map(f => `- ${f}`).join('\n'));
            }
        } catch (err) {
            console.error('Failed to update project memory:', err);
        }
    }
}

