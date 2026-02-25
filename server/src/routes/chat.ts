import { Router } from 'express';
import { validateChat } from '../middleware/validateChat';
import { ensureWorkspace, startDevServer } from '../services/fileService';
import { ProjectMemory } from '../services/projectMemory';
import { PipelineEngine } from '../pipeline/PipelineEngine';
import { EventBus } from '../pipeline/EventBus';
import { convertToGeminiContents, classifyError } from '../pipeline/helpers';
import { UnderstandPhase } from '../pipeline/phases/UnderstandPhase';
import { PlanPhase } from '../pipeline/phases/PlanPhase';
import { ConfirmPhase } from '../pipeline/phases/ConfirmPhase';
import { ExecutePhase } from '../pipeline/phases/ExecutePhase';
import { VerifyPhase } from '../pipeline/phases/VerifyPhase';
import { RepairPhase } from '../pipeline/phases/RepairPhase';
import { DeliverPhase } from '../pipeline/phases/DeliverPhase';
import type { PipelineContext } from '../types/pipeline';

import fs from 'fs';
import path from 'path';

const router = Router();

// REQ-3.3: Track active pipeline EventBus instances by session ID for interrupt
const activeSessions = new Map<string, EventBus>();

// ─── Main Chat Route (Pipeline) ─────────────────────────────────────────────

router.post('/', validateChat, async (req, res) => {
    const { messages, sessionId: rawSessionId } = req.body;
    const sessionId = rawSessionId || `session-${Date.now()}`;

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const events = new EventBus(res);
    events.emit({ type: 'session', sessionId });

    try {
        // Initialize workspace
        const { dir: workspaceDir, isNew } = ensureWorkspace(sessionId);

        // Build pipeline context
        const ctx: PipelineContext = {
            sessionId,
            messages,
            geminiContents: convertToGeminiContents(messages),
            workspaceDir,
            isNewSession: isNew,
            plan: null,
            transparencyTasks: [],
            events,
            memory: new ProjectMemory(sessionId),
            existingFiles: [],
            completedFileActions: [],
            completedGitActions: [],
            verificationErrors: null,
            phaseStartTime: Date.now(),
            pipelineStartTime: Date.now(),
        };

        // Build and run the pipeline
        const pipeline = new PipelineEngine()
            .addPhase(new UnderstandPhase())
            .addPhase(new PlanPhase())
            .addPhase(new ConfirmPhase())
            .addPhase(new ExecutePhase())
            .addPhase(new VerifyPhase())
            .addPhase(new RepairPhase())
            .addPhase(new DeliverPhase());

        // REQ-3.3: Register this session's EventBus for interrupt support
        activeSessions.set(sessionId, events);

        await pipeline.run(ctx);
    } catch (err: any) {
        events.emit({ type: 'error', message: classifyError(err) });
    } finally {
        activeSessions.delete(sessionId);
        events.close();
    }
});

// ─── REQ-3.3: Interrupt Route ────────────────────────────────────────────────

router.post('/interrupt/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const bus = activeSessions.get(sessionId);
    if (bus) {
        bus.interrupt(sessionId);
        activeSessions.delete(sessionId);
        res.json({ status: 'interrupted', sessionId });
    } else {
        res.status(404).json({ error: 'No active pipeline for this session' });
    }
});

// ─── Session Listing ─────────────────────────────────────────────────────────

router.get('/sessions/list', async (_req, res) => {
    try {
        const WORKSPACE_ROOT = path.join(__dirname, '../../workspace');
        if (!fs.existsSync(WORKSPACE_ROOT)) {
            return res.json([]);
        }

        const entries = fs.readdirSync(WORKSPACE_ROOT, { withFileTypes: true });
        const sessions = entries
            .filter(e => e.isDirectory() && e.name.startsWith('session-'))
            .map(e => {
                const id = e.name;
                const timestamp = parseInt(id.replace('session-', ''), 10) || 0;
                const workspaceDir = path.join(WORKSPACE_ROOT, id);
                const historyPath = path.join(workspaceDir, 'chat_history.json');
                const metadataPath = path.join(workspaceDir, 'metadata.json');

                let messageCount = 0;
                try {
                    if (fs.existsSync(historyPath)) {
                        const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
                        messageCount = Array.isArray(history) ? history.length : 0;
                    }
                } catch { /* ignore parse errors */ }

                let title = '';
                try {
                    if (fs.existsSync(metadataPath)) {
                        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                        title = metadata.title || '';
                    }
                } catch { /* ignore parse errors */ }

                return { id, timestamp, messageCount, title };
            })
            .filter(s => s.messageCount > 0)
            .sort((a, b) => b.timestamp - a.timestamp);

        res.json(sessions);
    } catch (err: any) {
        console.error('Failed to list sessions:', err);
        res.status(500).json({ error: 'Failed to list sessions' });
    }
});

// ─── History Retrieval ───────────────────────────────────────────────────────

router.get('/:sessionId/history', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const { dir: workspaceDir } = ensureWorkspace(sessionId);
        const historyPath = path.join(workspaceDir, 'chat_history.json');

        if (!fs.existsSync(historyPath)) {
            return res.json([]);
        }

        const history = fs.readFileSync(historyPath, 'utf8');
        res.json(JSON.parse(history));
    } catch (err: any) {
        console.error('Failed to retrieve history:', err);
        res.status(500).json({ error: 'Failed to retrieve chat history' });
    }
});

// ─── Metadata Management ───────────────────────────────────────────────────

router.get('/:sessionId/metadata', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const { dir: workspaceDir } = ensureWorkspace(sessionId);
        const metadataPath = path.join(workspaceDir, 'metadata.json');

        if (!fs.existsSync(metadataPath)) {
            return res.json({ id: sessionId, title: '', timestamp: Date.now() });
        }

        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        res.json(metadata);
    } catch (err: any) {
        console.error('Failed to retrieve metadata:', err);
        res.status(500).json({ error: 'Failed to retrieve metadata' });
    }
});

router.patch('/:sessionId/metadata', async (req, res) => {
    const { sessionId } = req.params;
    const { title } = req.body;

    try {
        const { dir: workspaceDir } = ensureWorkspace(sessionId);
        const metadataPath = path.join(workspaceDir, 'metadata.json');

        let metadata: any = { id: sessionId, timestamp: Date.now() };
        if (fs.existsSync(metadataPath)) {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        }

        if (title !== undefined) metadata.title = title;

        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        res.json(metadata);
    } catch (err: any) {
        console.error('Failed to update metadata:', err);
        res.status(500).json({ error: 'Failed to update metadata' });
    }
});

router.delete('/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const { dir: workspaceDir } = ensureWorkspace(sessionId);

        if (fs.existsSync(workspaceDir)) {
            fs.rmSync(workspaceDir, { recursive: true, force: true });
        }

        res.json({ success: true });
    } catch (err: any) {
        console.error('Failed to delete workspace:', err);
        res.status(500).json({ error: 'Failed to delete workspace' });
    }
});

// ─── Dev Server Management ───────────────────────────────────────────────────

router.post('/:sessionId/dev-server', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const devResult = await startDevServer(sessionId);
        if (devResult) {
            res.json({
                url: `http://localhost:${devResult.port}`,
                logs: devResult.logs,
                command: devResult.command
            });
        } else {
            res.status(400).json({ error: 'Failed to start dev server or node_modules missing' });
        }
    } catch (err: any) {
        console.error('Failed to start dev server:', err);
        res.status(500).json({ error: 'Server error while starting dev server' });
    }
});

export default router;
