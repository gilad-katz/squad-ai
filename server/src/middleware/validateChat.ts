import { RequestHandler } from 'express';
import { z } from 'zod';

const MessageSchema = z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(32000),
});

const ChatBodySchema = z.object({
    messages: z.array(MessageSchema).min(1).max(200),
    sessionId: z.string().nullish(),
});

export const validateChat: RequestHandler = (req, res, next) => {
    const result = ChatBodySchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: result.error.flatten() });
        return;
    }
    req.body = result.data;
    next();
};
