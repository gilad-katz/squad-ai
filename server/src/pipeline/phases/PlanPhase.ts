// ─── Plan Phase ──────────────────────────────────────────────────────────────
// Calls the Orchestrator LLM to generate an ExecutionPlan from the user's request.
// Extracted from chat.ts lines 268-350.

import fs from 'fs';
import path from 'path';
import { ai } from '../../services/gemini';
import { listFiles, readFile, ensureViteTypes, installDependencies } from '../../services/fileService';
import { loadPrompt, convertToGeminiContents, robustJsonParse, classifyError, detectLanguage } from '../helpers';
import { emitPhase } from '../phaseEvents';
import { buildPhaseThought } from '../thoughtProcess';
import type { Phase, PhaseResult, PipelineContext } from '../../types/pipeline';
import type { ExecutionPlan } from '../../types/plan';

export class PlanPhase implements Phase {
    name = 'plan';

    async execute(ctx: PipelineContext): Promise<PhaseResult> {
        // ── Workspace Setup ──────────────────────────────────────────────
        // Ensure type definitions for CSS/assets
        ensureViteTypes(ctx.sessionId);

        // Install npm dependencies if missing
        const nodeModulesPath = path.join(ctx.workspaceDir, 'node_modules');
        if (!fs.existsSync(nodeModulesPath)) {
            emitPhase(ctx, 'installing');

            const gitAction = {
                type: 'git_result' as const,
                id: `npm-${Date.now()}`,
                index: ctx.completedGitActions.length,
                action: 'execute',
                command: 'npm install --prefer-offline --no-audit --no-fund',
                output: ''
            };
            ctx.completedGitActions.push(gitAction);
            ctx.events.emit(gitAction);

            await installDependencies(ctx.sessionId, (data) => {
                gitAction.output += data;
                ctx.events.emit(gitAction);
            });
        }

        // Save chat history for persistence
        try {
            const historyPath = path.join(ctx.workspaceDir, 'chat_history.json');
            fs.writeFileSync(historyPath, JSON.stringify(ctx.messages, null, 2));
        } catch (err) {
            console.error('Failed to save chat history:', err);
        }

        // Save user attachments
        for (const m of ctx.messages) {
            if (m.role === 'user' && m.attachments) {
                for (const att of m.attachments) {
                    if (att.type === 'image' && att.name && att.data) {
                        try {
                            const uploadsDir = path.join(ctx.workspaceDir, 'uploads');
                            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
                            const filePath = path.join(uploadsDir, `${Date.now()}-${att.name}`);
                            fs.writeFileSync(filePath, Buffer.from(att.data, 'base64'));
                        } catch (err) {
                            console.error('Failed to save user attachment:', err);
                        }
                    }
                }
            }
        }

        // ── Orchestrator LLM Call ────────────────────────────────────────
        emitPhase(ctx, 'planning', 'Planning execution strategy', buildPhaseThought('planning', ctx));
        ctx.events.emit({ type: 'delta', text: '' }); // Signal stream start

        // Build workspace-aware system instruction
        ctx.existingFiles = listFiles(ctx.sessionId);

        // Emit scaffolded template files for new sessions
        if (ctx.isNewSession) {
            for (const filepath of ctx.existingFiles) {
                try {
                    const content = readFile(ctx.sessionId, filepath);
                    ctx.events.emit({
                        type: 'file_action',
                        id: `scaffold-${Date.now()}-${filepath}`,
                        filename: filepath.split('/').pop() || filepath,
                        filepath,
                        language: detectLanguage(filepath),
                        action: 'created',
                        content,
                        linesAdded: content.split('\n').length,
                        linesRemoved: 0,
                        diff: null,
                        status: 'complete'
                    });
                } catch (err) {
                    console.error(`Failed to emit scaffolding file action for ${filepath}:`, err);
                }
            }
        }

        let systemInstruction = loadPrompt('orchestrator.txt');
        if (ctx.existingFiles.length > 0) {
            systemInstruction += `\n\nEXISTING WORKSPACE FILES (do NOT recreate these unless the user explicitly asks):\n${ctx.existingFiles.map(f => `- ${f}`).join('\n')}`;
        }

        // Inject project memory if available
        const memoryContext = ctx.memory.toPromptContext();
        if (memoryContext) {
            systemInstruction += memoryContext;
        }

        // Inject UnderstandPhase analysis if available
        const codebaseSummary = (ctx as any)._codebaseSummary;
        const intent = (ctx as any)._intent;
        if (intent) {
            systemInstruction += `\n\nDETECTED USER INTENT: ${intent}`;
        }
        if (codebaseSummary) {
            systemInstruction += `\n\nCODEBASE STRUCTURE:\n${codebaseSummary}`;
        }

        // Inject extended thinking analysis if available
        const thinkingAnalysis = (ctx as any)._thinkingAnalysis;
        if (thinkingAnalysis) {
            systemInstruction += `\n\nPRE-PLANNING ANALYSIS (use this to inform your plan):\n${thinkingAnalysis}`;
        }

        // Convert messages for Gemini API format
        ctx.geminiContents = convertToGeminiContents(ctx.messages);

        let planJson: string;
        try {
            const planResponse = await ai.models.generateContent({
                model: process.env.MODEL_ID || 'gemini-2.5-flash',
                contents: ctx.geminiContents,
                config: {
                    systemInstruction,
                    responseMimeType: 'application/json'
                }
            });

            planJson = planResponse.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        } catch (err: any) {
            ctx.events.emit({ type: 'error', message: classifyError(err) });
            return { status: 'abort', reason: 'Orchestrator LLM call failed' };
        }

        // Parse the plan
        let plan: ExecutionPlan;
        try {
            plan = robustJsonParse(planJson);
            if (!plan.tasks || !Array.isArray(plan.tasks)) {
                throw new Error('Invalid plan: missing tasks array');
            }

            // Save session metadata
            if (plan.title) {
                try {
                    const metadataPath = path.join(ctx.workspaceDir, 'metadata.json');
                    const metadata = {
                        id: ctx.sessionId,
                        title: plan.title,
                        timestamp: Date.now()
                    };
                    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
                    ctx.events.emit({ type: 'metadata', data: { title: plan.title } });
                } catch (err) {
                    console.error('Failed to save session metadata:', err);
                }
            }
        } catch (err) {
            console.error('Failed to parse orchestrator plan. Raw response:', planJson);
            // Fallback: treat the entire response as a conversational reply
            ctx.events.emit({ type: 'delta', text: planJson });
            ctx.events.emit({ type: 'done', usage: null, sessionId: ctx.sessionId });
            return { status: 'abort', reason: 'Plan parse fallback to chat' };
        }

        ctx.plan = plan;
        return { status: 'continue' };
    }
}
