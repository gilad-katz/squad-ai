import { Router } from 'express';
import { validateChat } from '../middleware/validateChat';
import { ai, systemPrompt } from '../services/gemini';
import { ensureWorkspace, writeFile, deleteFile, generateDiff } from '../services/fileService';

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

        const stream = await ai.models.generateContentStream({
            model: process.env.MODEL_ID || 'gemini-2.5-flash',
            contents: geminiContents,
            config: {
                systemInstruction: systemPrompt
            }
        });

        let fullText = '';
        let usage = { input_tokens: 0, output_tokens: 0 };
        for await (const chunk of stream) {
            if (chunk.text) {
                fullText += chunk.text;
                emit({ type: 'delta', text: chunk.text });
            }
            if (chunk.usageMetadata) {
                usage.input_tokens = chunk.usageMetadata.promptTokenCount || 0;
                usage.output_tokens = chunk.usageMetadata.candidatesTokenCount || 0;
            }
        }

        // After streaming completes, parse and persist file actions
        const fileActions = extractFileActions(fullText);
        if (fileActions.length > 0) {
            ensureWorkspace(sessionId);
            for (const fa of fileActions) {
                try {
                    if (fa.action === 'deleted') {
                        deleteFile(sessionId, fa.filepath);
                    } else {
                        const oldContent = writeFile(sessionId, fa.filepath, fa.content);
                        // Compute diff for edited files
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

        emit({ type: 'done', usage, sessionId });

    } catch (err: any) {
        emit({ type: 'error', message: classifyError(err) });
    } finally {
        res.end();
    }
});

export default router;
