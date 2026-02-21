import { useSessionStore } from '../store/session';
import { consumeStream } from '../services/streamConsumer';

export function useChat() {
    const store = useSessionStore();

    const sendMessage = async (contentInput: string | null, retryMsgId?: string) => {
        if (store.streamActive) return;

        let content = contentInput;
        // If it's a retry and we didn't pass explicit content, find the last user message
        if (retryMsgId) {
            const messages = useSessionStore.getState().messages;
            const index = messages.findIndex(m => m.id === retryMsgId);
            if (index > 0 && messages[index - 1].role === 'user') {
                content = messages[index - 1].content;
            }
        }

        if (!content || !content.trim()) return;

        // Only append new user message if this isn't a retry, or if it's the first time
        if (!retryMsgId) {
            store.appendUserMessage(content);
        }
        store.setPhase('thinking');

        const currentMessages = useSessionStore.getState().messages;
        const apiMessages = currentMessages
            .filter(m => m.status === 'complete' || m.role === 'user') // drop failed partial msg from history targeting
            .map(m => ({ role: m.role, content: m.content }));

        const agentMsgId = useSessionStore.getState().appendAgentMessageStart();
        let firstTokenReceived = false;

        const sessionId = useSessionStore.getState().sessionId;

        await consumeStream(
            apiMessages,
            sessionId,
            (delta) => {
                if (!firstTokenReceived) {
                    useSessionStore.getState().setPhase('responding');
                    firstTokenReceived = true;
                }
                useSessionStore.getState().appendAgentDelta(agentMsgId, delta);
            },
            (usage, returnedSessionId) => {
                useSessionStore.getState().finaliseAgentMessage(agentMsgId);

                // Store sessionId from server
                if (returnedSessionId) {
                    useSessionStore.getState().setSessionId(returnedSessionId);
                }

                if (usage) {
                    const totalTokens = usage.input_tokens + usage.output_tokens;
                    // Gemini 2.5 flash is about 1M tokens, but we use Sonnet 4.6 MVP numbers as spec baseline (180k * 0.8)
                    const contextLimit = 180000;
                    if (totalTokens > contextLimit * 0.80) {
                        useSessionStore.getState().setContextWarning(true);
                    }
                }
            },
            (msg) => {
                useSessionStore.getState().setAgentError(agentMsgId, msg);
            },
            (index, output, error) => {
                useSessionStore.getState().updateGitActionResult(agentMsgId, index, output, error);
            },
            (sid) => {
                // Handle session event
                useSessionStore.getState().setSessionId(sid);
            }
        );
    };

    return { sendMessage };
}
