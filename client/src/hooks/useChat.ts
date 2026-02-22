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

        // Only append new user message if this isn't a retry
        if (!retryMsgId) {
            store.appendUserMessage(content);
        }
        store.setPhase('thinking');

        const currentMessages = useSessionStore.getState().messages;
        const apiMessages = currentMessages
            .filter(m => m.status === 'complete' || m.role === 'user')
            .map(m => ({ role: m.role, content: m.content }));

        const agentMsgId = useSessionStore.getState().appendAgentMessageStart();

        // Generate sessionId client-side if this is the first message,
        // and set it immediately so duplicate requests share the same ID.
        let sessionId = useSessionStore.getState().sessionId;
        if (!sessionId) {
            sessionId = `session-${Date.now()}`;
            useSessionStore.getState().setSessionId(sessionId);
        }

        await consumeStream(
            apiMessages,
            sessionId,
            // onDelta — conversational text from the orchestrator chat tasks
            (delta) => {
                useSessionStore.getState().appendAgentDelta(agentMsgId, delta);
            },
            // onDone — finalize
            (usage, returnedSessionId) => {
                useSessionStore.getState().finaliseAgentMessage(agentMsgId);

                if (returnedSessionId) {
                    useSessionStore.getState().setSessionId(returnedSessionId);
                }

                if (usage) {
                    const totalTokens = usage.input_tokens + usage.output_tokens;
                    const contextLimit = 1000000;
                    if (totalTokens > contextLimit * 0.80) {
                        useSessionStore.getState().setContextWarning(true);
                    }
                }
            },
            // onError
            (msg) => {
                useSessionStore.getState().setAgentError(agentMsgId, msg);
            },
            // onGitResult
            (index, output, error) => {
                useSessionStore.getState().updateGitActionResult(agentMsgId, index, output, error);
            },
            // onSessionId
            (sid) => {
                useSessionStore.getState().setSessionId(sid);
            },
            // onFileAction — discrete file events from the orchestrator dispatcher
            (action) => {
                useSessionStore.getState().addServerFileAction(agentMsgId, action);
            },
            // onPhase — phase transitions from the backend orchestrator
            (phase) => {
                useSessionStore.getState().setPhase(phase);
            },
            // onTransparency — reasoning and task breakdown from the orchestrator
            (data) => {
                useSessionStore.getState().setTransparency(agentMsgId, data);
            }
        );
    };

    return { sendMessage };
}
