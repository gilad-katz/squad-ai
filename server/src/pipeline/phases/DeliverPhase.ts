// ─── Deliver Phase ───────────────────────────────────────────────────────────
// Starts the dev server, generates a summary, persists chat history,
// and updates project memory.
// Extracted from chat.ts lines 889-966.

import fs from 'fs';
import path from 'path';
import { ai } from '../../services/gemini';
import { startDevServer, listFiles } from '../../services/fileService';
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

            // ── Generate Summary ─────────────────────────────────────────
            ctx.events.emit({
                type: 'phase',
                phase: 'summary',
                detail: 'Preparing final summary',
                thought: buildPhaseThought('summary', ctx)
            });
            summaryText = await this.generateSummary(
                ctx.completedFileActions,
                ctx.completedGitActions,
                ctx
            );

            if (summaryText) {
                ctx.events.emit({ type: 'summary', text: summaryText });
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
            gitActions: ctx.completedGitActions
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

        // ── Finalize ─────────────────────────────────────────────────────
        ctx.events.emit({ type: 'phase', phase: 'ready' });
        ctx.events.emit({ type: 'done', usage: null, sessionId: ctx.sessionId });

        return { status: 'continue' };
    }

    private async generateSummary(fileActions: any[], gitActions: any[], ctx?: PipelineContext): Promise<string> {
        try {
            // REQ-7.2: Build quality-aware context
            let verificationContext = '';
            if (ctx) {
                const repairRetries = ((ctx as any)._repairRetryCount || 0) as number;
                if (repairRetries > 0) {
                    verificationContext += `\nVERIFICATION & REPAIR:\n- Repair cycles completed: ${repairRetries}\n- All errors resolved: ${!ctx.verificationErrors ? 'Yes' : 'No'}\n`;
                }
                if (ctx.verificationErrors) {
                    const { lintResults, tscErrors } = ctx.verificationErrors;
                    const remainingLint = lintResults.filter(r => r.errorCount > 0).length;
                    const remainingTsc = tscErrors.length;
                    verificationContext += `- Remaining issues: ${remainingLint} lint errors, ${remainingTsc} type errors\n`;
                } else {
                    verificationContext += `- Final status: Clean build (0 errors)\n`;
                }
            }

            const summaryPrompt = `
You have just completed a series of tasks in a coding workspace.
Based on the following activities, generate a concise summary of what was accomplished and suggest 2-3 **highly specific, technical** next steps for the user.

COMPLETED FILE ACTIONS:
${fileActions.map(a => `- ${a.action} ${a.filepath}${a.prompt ? ` (purpose: ${a.prompt.substring(0, 100)})` : ''}`).join('\n') || 'None'}

TERMINAL/GIT ACTIONS:
${gitActions.map(a => `- ${a.command}: ${a.output?.substring(0, 150)}...`).join('\n') || 'None'}
${verificationContext}
FORMATTING RULES:
1. Start with a header "### Summary of Work".
2. Follow with a header "### Suggested Next Steps" and a bulleted list.
3. **CRITICAL**: Next steps must be technical and actionable (e.g., "Implement the 'Search' component in 'src/components/Search.tsx'" or "Add 'lucide-react' icons to the navigation menu"). Avoid generic advice like "Improve UI" or "Add more features".
4. Refer to the existing codebase and context when suggesting steps.
5. If verification found and repaired errors, briefly mention what was fixed.
6. Use a professional and collaborative tone.
7. Output ONLY the Markdown text.
`;

            const response = await ai.models.generateContent({
                model: process.env.MODEL_ID || 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: summaryPrompt }] }]
            });

            return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } catch (err) {
            console.error('Failed to generate summary:', err);
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
