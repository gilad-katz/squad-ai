import { Router, Request, Response } from 'express';
import { listFiles, readFile, ensureWorkspace, safePath } from '../services/fileService';

const router = Router();

/**
 * GET /api/files/:sessionId — list all files in the workspace
 */
router.get('/:sessionId', (req: Request, res: Response) => {
    try {
        const sessionId = req.params.sessionId as string;
        const files = listFiles(sessionId);
        res.json({ sessionId, files });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/files/:sessionId/read?path=... — read a file from the workspace
 */
router.get('/:sessionId/read', (req: Request, res: Response) => {
    try {
        const sessionId = req.params.sessionId as string;
        const filepath = req.query.path as string;
        if (!filepath) {
            res.status(400).json({ error: 'Missing "path" query parameter' });
            return;
        }
        const content = readFile(sessionId, filepath);
        res.json({ filepath, content });
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            res.status(404).json({ error: 'File not found' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

/**
 * GET /api/files/:sessionId/raw?path=... — read a raw file from the workspace (for images)
 */
router.get('/:sessionId/raw', (req: Request, res: Response) => {
    try {
        const sessionId = req.params.sessionId as string;
        const filepath = req.query.path as string;
        if (!filepath) {
            res.status(400).json({ error: 'Missing "path" query parameter' });
            return;
        }
        const absolutePath = safePath(sessionId, filepath);
        res.sendFile(absolutePath, (err) => {
            if (err) {
                if (!res.headersSent) {
                    res.status(404).json({ error: 'File not found or cannot be sent' });
                }
            }
        });
    } catch (err: any) {
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

export default router;
