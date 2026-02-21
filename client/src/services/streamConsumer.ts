import type { Message } from '../types';

export async function consumeStream(
    messages: Pick<Message, 'role' | 'content'>[],
    onDelta: (text: string) => void,
    onDone: (usage?: { input_tokens: number, output_tokens: number }) => void,
    onError: (msg: string) => void
): Promise<void> {
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages }),
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
                    if (evt.type === 'done') onDone(evt.usage);
                    if (evt.type === 'error') onError(evt.message);
                } catch (err) {
                    console.warn('Failed to parse SSE line:', line);
                }
            }
        }
    } catch (err: any) {
        onError(err.message || 'Stream connection failed');
    }
}
