// ─── EventBus ────────────────────────────────────────────────────────────────
// Typed SSE event emitter. Wraps the Express response object and provides
// compile-time safety for all emitted events.

import type { Response } from 'express';
import type { SSEEvent } from '../types/events';

export class EventBus {
    private res: Response;
    private closed = false;

    constructor(res: Response) {
        this.res = res;
    }

    /**
     * Emit a typed SSE event to the client.
     * Silently ignores writes if the connection is already closed.
     */
    emit(event: SSEEvent): void {
        if (this.closed || this.res.destroyed) return;
        try {
            this.res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
            // Connection may have been terminated by client
            this.closed = true;
        }
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

    /** Check if the connection is still active */
    get isActive(): boolean {
        return !this.closed && !this.res.destroyed;
    }
}
