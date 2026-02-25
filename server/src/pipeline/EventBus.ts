// ─── EventBus ────────────────────────────────────────────────────────────────
// Typed SSE event emitter. Wraps the Express response object and provides
// compile-time safety for all emitted events.
// REQ-3.3: Supports interrupt mechanism to cancel running pipelines.

import type { Response } from 'express';
import type { SSEEvent } from '../types/events';

export class EventBus {
    private res: Response;
    private closed = false;
    private _interrupted = false;

    constructor(res: Response) {
        this.res = res;
    }

    /**
     * Emit a typed SSE event to the client.
     * Silently ignores writes if the connection is already closed or interrupted.
     */
    emit(event: SSEEvent): void {
        if (this.closed || this._interrupted || this.res.destroyed) return;
        try {
            this.res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
            // Connection may have been terminated by client
            this.closed = true;
        }
    }

    /**
     * REQ-3.3: Interrupt the pipeline. Emits a done event and closes the connection.
     * The PipelineEngine checks `isActive` each loop and will stop.
     */
    interrupt(sessionId: string): void {
        if (this.closed || this._interrupted) return;
        this._interrupted = true;
        try {
            this.res.write(`data: ${JSON.stringify({ type: 'delta', text: '\n\n⛔ **Pipeline interrupted by user.**\n' })}\n\n`);
            this.res.write(`data: ${JSON.stringify({ type: 'phase', phase: 'ready' })}\n\n`);
            this.res.write(`data: ${JSON.stringify({ type: 'done', usage: null, sessionId })}\n\n`);
        } catch { /* already closed */ }
        this.close();
    }

    /**
     * Close the SSE connection.
     * Safe to call multiple times.
     */
    close(): void {
        if (this.closed) return;
        this.closed = true;
        try {
            this.res.end();
        } catch {
            // Already closed
        }
    }

    /** Check if the connection is still active (not closed and not interrupted) */
    get isActive(): boolean {
        return !this.closed && !this._interrupted && !this.res.destroyed;
    }

    /** Check if this bus was interrupted */
    get isInterrupted(): boolean {
        return this._interrupted;
    }
}
