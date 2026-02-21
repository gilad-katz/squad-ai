import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import healthRouter from '../src/routes/health';

const app = express();
app.use('/api/health', healthRouter);

describe('Sanity Tests', () => {
    it('GET /api/health returns 200 and status ok', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status', 'ok');
        expect(res.body).toHaveProperty('timestamp');
    });
});
