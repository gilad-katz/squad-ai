import { Router, Request, Response } from 'express';
import {
    getWorkspaceConfig,
    connectRepo,
    disconnectRepo,
    listBranches,
    getRepoInfo,
    parseRepoUrl,
} from '../services/gitService';

const router = Router();

/** Safely extract a single route param (Express 5 types allow string | string[]). */
function param(req: Request, name: string): string {
    const val = req.params[name];
    return Array.isArray(val) ? val[0] : val;
}

/**
 * GET /api/git/:workspaceId — get the workspace git config
 */
router.get('/:workspaceId', (req: Request, res: Response) => {
    try {
        const config = getWorkspaceConfig(param(req, 'workspaceId'));
        if (!config) {
            res.status(404).json({ error: 'No repo connected to this workspace' });
            return;
        }
        const { githubToken: _, ...safeConfig } = config;
        res.json(safeConfig);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/git/:workspaceId/connect — connect a GitHub repo
 * Body: { repoUrl: string, githubToken?: string }
 */
router.post('/:workspaceId/connect', async (req: Request, res: Response) => {
    try {
        const { repoUrl, githubToken } = req.body;
        if (!repoUrl || typeof repoUrl !== 'string') {
            res.status(400).json({ error: 'Missing or invalid "repoUrl" in request body' });
            return;
        }
        // Validate URL format before hitting GitHub API
        try {
            parseRepoUrl(repoUrl);
        } catch (_e) {
            res.status(400).json({ error: `Invalid GitHub URL: ${repoUrl}` });
            return;
        }
        const config = await connectRepo(param(req, 'workspaceId'), repoUrl, githubToken);

        // Don't send the token back to the client
        const { githubToken: _, ...safeConfig } = config;
        res.json(safeConfig);
    } catch (err: any) {
        const status = err.message.includes('not found') ? 404 : 500;
        res.status(status).json({ error: err.message });
    }
});

/**
 * DELETE /api/git/:workspaceId/disconnect — disconnect a repo
 */
router.delete('/:workspaceId/disconnect', (req: Request, res: Response) => {
    try {
        disconnectRepo(param(req, 'workspaceId'));
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/git/:workspaceId/branches — list branches
 */
router.get('/:workspaceId/branches', async (req: Request, res: Response) => {
    try {
        const branches = await listBranches(param(req, 'workspaceId'));
        res.json({ branches });
    } catch (err: any) {
        const status = err.message.includes('No repo connected') ? 404 : 500;
        res.status(status).json({ error: err.message });
    }
});

/**
 * GET /api/git/:workspaceId/info — get repo info
 */
router.get('/:workspaceId/info', async (req: Request, res: Response) => {
    try {
        const info = await getRepoInfo(param(req, 'workspaceId'));
        res.json(info);
    } catch (err: any) {
        const status = err.message.includes('No repo connected') ? 404 : 500;
        res.status(status).json({ error: err.message });
    }
});

export default router;
