import { Router } from 'express';
import { validateChat } from '../middleware/validateChat';
import { ai, systemPrompt } from '../services/gemini';

const router = Router();

// Simplify classification for MVP
function classifyError(err: any): string {
    if (err?.message?.includes('429')) return 'Rate limit exceeded. Please try again later.';
    if (err?.message?.includes('timeout')) return 'Request timed out. Please try again.';
    return err?.message || 'Unknown error occurred while generating response.';
}

router.post('/', validateChat, async (req, res) => {
    const { messages } = req.body;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const emit = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);

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

        let usage = { input_tokens: 0, output_tokens: 0 };
        for await (const chunk of stream) {
            if (chunk.text) {
                emit({ type: 'delta', text: chunk.text });
            }
            if (chunk.usageMetadata) {
                usage.input_tokens = chunk.usageMetadata.promptTokenCount || 0;
                usage.output_tokens = chunk.usageMetadata.candidatesTokenCount || 0;
            }
        }

        emit({ type: 'done', usage });

    } catch (err: any) {
        emit({ type: 'error', message: classifyError(err) });
    } finally {
        res.end();
    }
});

export default router;
