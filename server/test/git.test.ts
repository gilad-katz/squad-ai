import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';

// We need to mock fetch before importing the router
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import gitRouter from '../src/routes/git';

const app = express();
app.use(express.json());
app.use('/api/git', gitRouter);

const DATA_DIR = path.join(__dirname, '../data');
const STORE_PATH = path.join(DATA_DIR, 'workspaces.json');

describe('Git Routes', () => {
    beforeEach(() => {
        // Clean up workspace store before each test
        if (fs.existsSync(STORE_PATH)) {
            fs.unlinkSync(STORE_PATH);
        }
        mockFetch.mockReset();
    });

    afterEach(() => {
        // Clean up after tests
        if (fs.existsSync(STORE_PATH)) {
            fs.unlinkSync(STORE_PATH);
        }
    });

    describe('GET /api/git/:workspaceId', () => {
        it('returns 404 for unconfigured workspace', async () => {
            const res = await request(app).get('/api/git/test-workspace');
            expect(res.status).toBe(404);
            expect(res.body).toHaveProperty('error');
        });

        it('returns config after connecting', async () => {
            // First connect a repo
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ default_branch: 'main' }),
            });

            await request(app)
                .post('/api/git/test-workspace/connect')
                .send({ repoUrl: 'https://github.com/test-owner/test-repo' });

            // Now fetch the config
            const res = await request(app).get('/api/git/test-workspace');
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('owner', 'test-owner');
            expect(res.body).toHaveProperty('repo', 'test-repo');
            expect(res.body).toHaveProperty('defaultBranch', 'main');
            expect(res.body).toHaveProperty('connectedAt');
        });
    });

    describe('POST /api/git/:workspaceId/connect', () => {
        it('validates repoUrl is provided', async () => {
            const res = await request(app)
                .post('/api/git/test-workspace/connect')
                .send({});
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('repoUrl');
        });

        it('returns 400 for invalid GitHub URL', async () => {
            const res = await request(app)
                .post('/api/git/test-workspace/connect')
                .send({ repoUrl: 'https://not-github.com/foo/bar' });
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Invalid GitHub URL');
        });

        it('connects and persists a valid repo', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ default_branch: 'develop' }),
            });

            const res = await request(app)
                .post('/api/git/my-workspace/connect')
                .send({ repoUrl: 'https://github.com/octocat/hello-world' });

            expect(res.status).toBe(200);
            expect(res.body.owner).toBe('octocat');
            expect(res.body.repo).toBe('hello-world');
            expect(res.body.defaultBranch).toBe('develop');

            // Verify persistence
            const stored = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
            expect(stored['my-workspace']).toBeDefined();
            expect(stored['my-workspace'].owner).toBe('octocat');
        });

        it('handles GitHub 404 for missing repo', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                text: async () => 'Not Found',
            });

            const res = await request(app)
                .post('/api/git/test-workspace/connect')
                .send({ repoUrl: 'https://github.com/fake/nonexistent' });

            expect(res.status).toBe(404);
            expect(res.body.error).toContain('not found');
        });
    });

    describe('DELETE /api/git/:workspaceId/disconnect', () => {
        it('disconnects a connected repo', async () => {
            // Connect first
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ default_branch: 'main' }),
            });
            await request(app)
                .post('/api/git/test-workspace/connect')
                .send({ repoUrl: 'https://github.com/owner/repo' });

            // Disconnect
            const res = await request(app).delete('/api/git/test-workspace/disconnect');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            // Verify it's gone
            const getRes = await request(app).get('/api/git/test-workspace');
            expect(getRes.status).toBe(404);
        });

        it('succeeds even when nothing is connected', async () => {
            const res = await request(app).delete('/api/git/nonexistent/disconnect');
            expect(res.status).toBe(200);
        });
    });
});
