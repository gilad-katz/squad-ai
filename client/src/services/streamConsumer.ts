import type { Message, FileAction, PhaseState, TransparencyData } from '../types';

// ─── Stream Handler Map ──────────────────────────────────────────────────────
// Replaces the previous 12 positional callback parameters with a single
// typed object. This makes adding new event handlers safe and readable.

export interface StreamHandlers {
    onDelta: (text: string) => void;
    onDone: (usage?: { input_tokens: number; output_tokens: number }, sessionId?: string) => void;
    onError: (msg: string) => void;
    onGitResult?: (index: number, output?: string, error?: string, action?: 'clone' | 'execute', command?: string) => void;
    onSessionId?: (id: string) => void;
    onFileAction?: (action: FileAction) => void;
    onPhase?: (phase: PhaseState, detail?: string, thought?: string) => void;
    onTransparency?: (data: TransparencyData) => void;
    onPreview?: (url: string) => void;
    onMetadata?: (data: { title?: string }) => void;
    onSummary?: (text: string) => void;
}

// ─── Stream Consumer ─────────────────────────────────────────────────────────

export async function consumeStream(
    messages: Pick<Message, 'role' | 'content' | 'attachments'>[],
    sessionId: string | null,
    handlers: StreamHandlers
): Promise<void> {
    let sawDone = false;
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, sessionId }),
        });

        if (!response.ok || !response.body) {
            handlers.onError(`Request failed: HTTP ${response.status}`);
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? ''; // keep incomplete last line

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const payload = line.slice(6).trim();
                    if (!payload) continue;

                    const evt = JSON.parse(payload);

                    switch (evt.type) {
                        case 'delta':
                            handlers.onDelta(evt.text);
                            break;
                        case 'done':
                            sawDone = true;
                            handlers.onDone(evt.usage, evt.sessionId);
                            break;
                        case 'error':
                            handlers.onError(evt.message);
                            break;
                        case 'git_result':
                            handlers.onGitResult?.(evt.index, evt.output, evt.error, evt.action, evt.command);
                            break;
                        case 'file_action':
                            handlers.onFileAction?.(evt);
                            break;
                        case 'session':
                            handlers.onSessionId?.(evt.sessionId);
                            break;
                        case 'phase':
                            handlers.onPhase?.(evt.phase, evt.detail, evt.thought);
                            break;
                        case 'transparency':
                            handlers.onTransparency?.(evt.data);
                            break;
                        case 'preview':
                            handlers.onPreview?.(evt.url);
                            break;
                        case 'metadata':
                            handlers.onMetadata?.(evt.data);
                            break;
                        case 'summary':
                            handlers.onSummary?.(evt.text);
                            break;
                        default:
                            // Unknown event type — ignore gracefully
                            break;
                    }
                } catch (err) {
                    console.warn('Failed to parse SSE line:', line);
                }
            }
        }

        // Defensive fallback: if the stream closes unexpectedly without a done
        // event, reset client state through the error path instead of leaving
        // the UI in a perpetual streaming phase.
        if (!sawDone) {
            handlers.onError('Stream ended before completion. Please retry.');
        }
    } catch (err: any) {
        handlers.onError(err.message || 'Stream connection failed');
    }
}
