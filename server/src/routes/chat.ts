import { Router } from 'express';
import { validateChat } from '../middleware/validateChat';
import { ai, systemPrompt } from '../services/gemini';
import { ensureWorkspace, writeFile, deleteFile, generateDiff } from '../services/fileService';
import { getWorkspaceConfig } from '../services/gitService';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = util.promisify(exec);

const router = Router();

interface FileActionRaw {
    filename: string;
    filepath: string;
    language: string;
    action: 'created' | 'edited' | 'deleted';
    content: string;
    linesAdded: number;
    linesRemoved: number;
}

/**
 * Parse FILE_ACTIONS block from the completed LLM response.
 */
function extractFileActions(fullText: string): FileActionRaw[] {
    const startIdx = fullText.indexOf('FILE_ACTIONS_START');
    const endIdx = fullText.indexOf('FILE_ACTIONS_END');
    if (startIdx === -1 || endIdx === -1) return [];

    const jsonBlock = fullText.slice(startIdx + 'FILE_ACTIONS_START'.length, endIdx).trim();
    try {
        const match = jsonBlock.match(/\[[\s\S]*\]/);
        if (match) return JSON.parse(match[0]);
    } catch (err) {
        console.warn('Failed to parse FILE_ACTIONS JSON:', err);
    }
    return [];
}

interface GitActionRaw {
    action: 'clone' | 'execute';
    command?: string;
}

/**
 * Parse GIT_ACTIONS block from the completed LLM response.
 */
function extractGitActions(fullText: string): GitActionRaw[] {
    const startIdx = fullText.indexOf('GIT_ACTIONS_START');
    const endIdx = fullText.indexOf('GIT_ACTIONS_END');
    if (startIdx === -1 || endIdx === -1) return [];

    const jsonBlock = fullText.slice(startIdx + 'GIT_ACTIONS_START'.length, endIdx).trim();
    try {
        const match = jsonBlock.match(/\[[\s\S]*\]/);
        if (match) return JSON.parse(match[0]);
    } catch (err) {
        console.warn('Failed to parse GIT_ACTIONS JSON:', err);
    }
    return [];
}

interface ImageActionRaw {
    prompt: string;
    filename: string;
    filepath: string;
}

/**
 * Parse IMAGE_ACTIONS block from the completed LLM response.
 */
function extractImageActions(fullText: string): ImageActionRaw[] {
    const startIdx = fullText.indexOf('IMAGE_ACTIONS_START');
    const endIdx = fullText.indexOf('IMAGE_ACTIONS_END');
    if (startIdx === -1 || endIdx === -1) return [];

    const jsonBlock = fullText.slice(startIdx + 'IMAGE_ACTIONS_START'.length, endIdx).trim();
    try {
        const match = jsonBlock.match(/\[[\s\S]*\]/);
        if (match) return JSON.parse(match[0]);
    } catch (err) {
        console.warn('Failed to parse IMAGE_ACTIONS JSON:', err);
    }
    return [];
}

interface ConfirmActionRaw {
    question: string;
}

/**
 * Parse CONFIRM_ACTIONS block from the completed LLM response.
 */
function extractConfirmActions(fullText: string): ConfirmActionRaw[] {
    const startIdx = fullText.indexOf('CONFIRM_ACTIONS_START');
    const endIdx = fullText.indexOf('CONFIRM_ACTIONS_END');
    if (startIdx === -1 || endIdx === -1) return [];

    const jsonBlock = fullText.slice(startIdx + 'CONFIRM_ACTIONS_START'.length, endIdx).trim();
    try {
        const match = jsonBlock.match(/\[[\s\S]*\]/);
        if (match) return JSON.parse(match[0]);
    } catch (err) {
        console.warn('Failed to parse CONFIRM_ACTIONS JSON:', err);
    }
    return [];
}

// Simplify classification for MVP
function classifyError(err: any): string {
    if (err?.message?.includes('429')) return 'Rate limit exceeded. Please try again later.';
    if (err?.message?.includes('timeout')) return 'Request timed out. Please try again.';
    return err?.message || 'Unknown error occurred while generating response.';
}

router.post('/', validateChat, async (req, res) => {
    const { messages, sessionId: rawSessionId } = req.body;
    const sessionId = rawSessionId || `session-${Date.now()}`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const emit = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);

    // Send sessionId back to the client
    emit({ type: 'session', sessionId });

    try {
        const geminiContents = messages.map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : m.role,
            parts: [{ text: m.content }]
        }));

        let usageTotal = { input_tokens: 0, output_tokens: 0 };
        let iteration = 0;
        const maxIterations = 2; // For MVP, only support 1 follow-up turn (execute -> Read output -> Summarize)

        while (iteration < maxIterations) {
            iteration++;
            let fullText = '';

            const stream = await ai.models.generateContentStream({
                model: process.env.MODEL_ID || 'gemini-2.5-flash',
                contents: geminiContents,
                config: {
                    systemInstruction: systemPrompt + `\n\nYour current workspace Session ID is: ${sessionId}\n\nCRITICAL: If you output a GIT_ACTIONS, FILE_ACTIONS, IMAGE_ACTIONS, or CONFIRM_ACTIONS block, DO NOT provide any conversational response detailing what you are about to do or predicting the output. Just output the action block. The system will execute it and return the actual terminal output to you so you can provide an accurate summary in the next turn.`
                }
            });

            for await (const chunk of stream) {
                if (chunk.text) {
                    fullText += chunk.text;
                    // Only emit text to the user if we aren't in a silent processing loop, 
                    // or just emit normally since the frontend will append it anyway
                    emit({ type: 'delta', text: chunk.text });
                }
                if (chunk.usageMetadata) {
                    // Just take the latest token counts for simplicity
                    usageTotal.input_tokens = chunk.usageMetadata.promptTokenCount || usageTotal.input_tokens;
                    usageTotal.output_tokens = chunk.usageMetadata.candidatesTokenCount || usageTotal.output_tokens;
                }
            }

            // Append the assistant's own response to the context window so it remembers what it just did
            geminiContents.push({ role: 'model', parts: [{ text: fullText }] });

            // Process Confirm Actions (Highest Priority Interruption)
            const confirmActions = extractConfirmActions(fullText);
            if (confirmActions.length > 0) {
                // We just echo the question and break the loop so the user has to respond.
                const question = confirmActions[0].question;
                emit({ type: 'delta', text: `\n\n**Confirmation Required:** ${question}` });
                break;
            }

            // Process File Actions
            const fileActions = extractFileActions(fullText);
            if (fileActions.length > 0) {
                ensureWorkspace(sessionId);
                for (const fa of fileActions) {
                    try {
                        if (fa.action === 'deleted') {
                            deleteFile(sessionId, fa.filepath);
                        } else {
                            const oldContent = writeFile(sessionId, fa.filepath, fa.content);
                            if (fa.action === 'edited' && oldContent !== null) {
                                const diff = generateDiff(oldContent, fa.content, fa.filepath);
                                emit({ type: 'file_action', ...fa, diff });
                            } else {
                                emit({ type: 'file_action', ...fa, diff: null });
                            }
                        }
                    } catch (fileErr: any) {
                        console.warn(`Failed to process file action for ${fa.filepath}:`, fileErr.message);
                    }
                }
            }

            // Process Git Actions
            const gitActions = extractGitActions(fullText);
            if (gitActions.length > 0) {
                const workspaceId = req.body.workspaceId || 'default';
                const config = getWorkspaceConfig(workspaceId);
                const workspaceDir = ensureWorkspace(sessionId);

                let systemFeedback = '';

                for (const [index, ga] of gitActions.entries()) {
                    if (ga.action === 'clone') {
                        if (!config) {
                            const errorMsg = 'No GitHub repository is connected to this workspace. Please connect a repository in Git Settings first.';
                            emit({ type: 'git_result', index, error: errorMsg });
                            emit({ type: 'delta', text: `\n\n**System Error:** ${errorMsg}` });
                            systemFeedback += `\n[Git Clone Failed]: ${errorMsg}`;
                            continue;
                        }
                        try {
                            let cloneUrl = config.repoUrl;
                            if (config.githubToken) {
                                const token = config.githubToken;
                                const defaultDomain = 'github.com';
                                cloneUrl = `https://oauth2:${token}@${defaultDomain}/${config.owner}/${config.repo}.git`;
                            }

                            await execAsync(`git init`, { cwd: workspaceDir });
                            await execAsync(`git branch -M main`, { cwd: workspaceDir });

                            try {
                                await execAsync(`git remote add origin ${cloneUrl}`, { cwd: workspaceDir });
                            } catch (e) {
                                await execAsync(`git remote set-url origin ${cloneUrl}`, { cwd: workspaceDir });
                            }

                            await execAsync(`git fetch --all`, { cwd: workspaceDir });
                            await execAsync(`git reset --hard origin/${config.defaultBranch || 'main'}`, { cwd: workspaceDir });

                            const successMsg = `Successfully cloned repository ${config.owner}/${config.repo}.`;
                            emit({ type: 'git_result', index, output: successMsg });
                            emit({ type: 'delta', text: `\n\n*${successMsg}*` });
                            systemFeedback += `\n[Git Clone Success]: ${successMsg}`;
                        } catch (err: any) {
                            console.error('Git clone failed:', err);
                            emit({ type: 'git_result', index, error: `Failed to clone repository. ${err.message}` });
                            systemFeedback += `\n[Git Clone Failed]: ${err.message}`;
                        }
                    } else if (ga.action === 'execute' && ga.command) {
                        if (!ga.command.trim().startsWith('git ')) {
                            emit({ type: 'git_result', index, error: 'Security Error: Only `git` commands are allowed.' });
                            systemFeedback += `\n[Git Execute Failed: ${ga.command}]: Security Error: Only \`git\` commands are allowed.`;
                            continue;
                        }
                        if (/[;&|$<>]/.test(ga.command)) {
                            emit({ type: 'git_result', index, error: 'Security Error: Command contains forbidden shell characters.' });
                            systemFeedback += `\n[Git Execute Failed: ${ga.command}]: Security Error: Command contains forbidden shell characters.`;
                            continue;
                        }

                        const isGitRepo = fs.existsSync(path.join(workspaceDir, '.git'));
                        if (!isGitRepo && ga.command.includes('status')) {
                            const errorMsg = 'No repository is cloned in this active session. Please ask me to clone it first.';
                            emit({ type: 'git_result', index, error: `Git Error: ${errorMsg}` });
                            emit({ type: 'delta', text: `\n\n**Git Error:** ${errorMsg}` });
                            systemFeedback += `\n[Git Execute Failed: ${ga.command}]: ${errorMsg}`;
                            continue;
                        }

                        try {
                            const env = { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(workspaceDir) };
                            let cmdToRun = ga.command;
                            if (cmdToRun.trim() === 'git push') {
                                cmdToRun = 'git push -u origin HEAD';
                            }
                            const { stdout, stderr } = await execAsync(cmdToRun, { cwd: workspaceDir, env });
                            const out = (stdout || stderr || '').trim() || 'Command completed successfully.';

                            emit({ type: 'git_result', index, output: out });

                            // Let the user know it succeeded and to check the modal for the blob
                            emit({ type: 'delta', text: `\n\n*Successfully ran \`${cmdToRun}\`. Check the terminal view for logs.*` });
                            systemFeedback += `\n[Git Execute Success: ${ga.command}]:\n${out}`;
                        } catch (err: any) {
                            console.error('Git command failed:', err);
                            const errorOut = (err.stdout || err.stderr || err.message || '').trim();
                            emit({ type: 'git_result', index, error: `Failed to run \`${ga.command}\`: \n${errorOut}` });
                            systemFeedback += `\n[Git Execute Error: ${ga.command}]:\n${errorOut}`;
                        }
                    }
                }

                // We have system feedback from Git execution, we should loop again to let the LLM analyze it!
                if (systemFeedback.trim()) {
                    geminiContents.push({
                        role: 'user',
                        parts: [{ text: `SYSTEM_FEEDBACK:\nThe following Git operations were executed by the system on your behalf:\n${systemFeedback}\n\nCRITICAL INSTRUCTION: Analyze the exact terminal logs above and provide a 1-2 sentence conversational summary of what actually happened. Pay close attention to git CLI messages (e.g., if there is nothing to commit, or if the push was up-to-date, state that). DO NOT assume success if the logs show no changes were made. DO NOT echo, quote, or paste the raw terminal logs. DO NOT use markdown headers to describe the output. Just speak naturally.` }]
                    });
                    // Force a newline delimiter so the UI renders the follow-up text cleanly
                    emit({ type: 'delta', text: `\n\n` });
                    continue; // Loop again!
                }
            }

            // Process Image Actions
            const imageActions = extractImageActions(fullText);
            if (imageActions.length > 0) {
                const workspaceDir = ensureWorkspace(sessionId);
                let systemFeedback = '';

                for (const [index, ia] of imageActions.entries()) {
                    try {
                        emit({ type: 'delta', text: `\n\n*Generating image: ${ia.filename}...*` });

                        const response = await ai.models.generateContent({
                            model: "gemini-2.5-flash-image",
                            contents: ia.prompt,
                        });

                        const candidate = response.candidates?.[0];
                        if (!candidate || !candidate.content || !candidate.content.parts) {
                            throw new Error('No candidates or parts returned from Gemini API.');
                        }

                        let imageBuffer: Buffer | null = null;

                        for (const part of candidate.content.parts) {
                            if (part.inlineData && part.inlineData.data) {
                                imageBuffer = Buffer.from(part.inlineData.data, "base64");
                                break;
                            }
                        }

                        if (!imageBuffer) {
                            throw new Error('No image data found in Gemini API response.');
                        }

                        const fullPath = path.join(workspaceDir, ia.filepath);
                        // Ensure directory exists
                        const dir = path.dirname(fullPath);
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true });
                        }

                        fs.writeFileSync(fullPath, imageBuffer);

                        // Tell the frontend a file was created
                        emit({
                            type: 'file_action',
                            filename: ia.filename,
                            filepath: ia.filepath,
                            language: 'image',
                            action: 'created',
                            content: `[Image generated: ${ia.filepath}]`,
                            linesAdded: 0,
                            linesRemoved: 0,
                            diff: null
                        });

                        systemFeedback += `\n[Image Generation Success for ${ia.filename}]: Image successfully saved to ${ia.filepath}`;

                    } catch (err: any) {
                        console.error('Image generation failed:', err);
                        const errorOut = err.message || 'Unknown error';
                        emit({ type: 'delta', text: `\n\n**Image Generation Error:** Failed to generate ${ia.filename}: ${errorOut}` });
                        systemFeedback += `\n[Image Generation Failed for ${ia.filename}]: ${errorOut}`;
                    }
                }

                if (systemFeedback.trim()) {
                    geminiContents.push({
                        role: 'user',
                        parts: [{ text: `SYSTEM_FEEDBACK:\nThe following Image Generation operations were executed by the system on your behalf:\n${systemFeedback}\n\nCRITICAL INSTRUCTION: Provide a 1-2 sentence conversational summary of this outcome to the user. DO NOT echo, quote, or paste the raw system logs. Just speak naturally to let the user know if the image generation succeeded or failed.` }]
                    });
                    emit({ type: 'delta', text: `\n\n` });
                    continue;
                }
            }

            // No Git or Image Operations triggered a feedback loop, so we break normally.
            break;
        }

        emit({ type: 'done', usage: usageTotal, sessionId });

    } catch (err: any) {
        emit({ type: 'error', message: classifyError(err) });
    } finally {
        res.end();
    }
});

export default router;
