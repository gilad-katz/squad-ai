import type { Message, FileAction, PhaseState, TransparencyData } from '../types';

export async function consumeStream(
    messages: Pick<Message, 'role' | 'content' | 'attachments'>[],
    sessionId: string | null,
    onDelta: (text: string) => void,
    onDone: (usage?: { input_tokens: number, output_tokens: number }, sessionId?: string) => void,
    onError: (msg: string) => void,
    onGitResult?: (index: number, output?: string, error?: string, action?: 'clone' | 'execute', command?: string) => void,
    onSessionId?: (id: string) => void,
    onFileAction?: (action: FileAction) => void,
    onPhase?: (phase: PhaseState) => void,
    onTransparency?: (data: TransparencyData) => void,
    onPreview?: (url: string) => void,
    onMetadata?: (data: { title?: string }) => void
): Promise<void> {
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, sessionId }),
        });

        if (!response.ok || !response.body) {
            onError(`Request failed: HTTP ${response.status}`);
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
                    if (evt.type === 'delta') onDelta(evt.text);
                    if (evt.type === 'done') onDone(evt.usage, evt.sessionId);
                    if (evt.type === 'error') onError(evt.message);
                    if (evt.type === 'git_result' && onGitResult) onGitResult(evt.index, evt.output, evt.error, evt.action, evt.command);
                    if (evt.type === 'file_action' && onFileAction) onFileAction(evt);
                    if (evt.type === 'session' && onSessionId) onSessionId(evt.sessionId);
                    if (evt.type === 'phase' && onPhase) onPhase(evt.phase);
                    if (evt.type === 'transparency' && onTransparency) onTransparency(evt.data);
                    if (evt.type === 'preview' && onPreview) onPreview(evt.url);
                    if (evt.type === 'metadata' && onMetadata) onMetadata(evt.data);
                } catch (err) {
                    console.warn('Failed to parse SSE line:', line);
                }
            }
        }
    } catch (err: any) {
        onError(err.message || 'Stream connection failed');
    }
}

