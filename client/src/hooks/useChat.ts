import { useSessionStore } from '../store/session';
import { consumeStream } from '../services/streamConsumer';

export function useChat() {
    const store = useSessionStore();

    const sendMessage = async (content: string) => {
        if (store.streamActive || !content.trim()) return;

        store.appendUserMessage(content);
        store.setPhase('thinking');

        // we need to get the latest messages up to this new one for the API
        // `store.messages` right here doesn't have the newly appended user message 
        // because Zustand state updates asynchronously in React unless we use getState()
        const currentMessages = useSessionStore.getState().messages;
        const apiMessages = currentMessages.map(m => ({
            role: m.role,
            content: m.content
        }));

        const agentMsgId = useSessionStore.getState().appendAgentMessageStart();
        let firstTokenReceived = false;

        await consumeStream(
            apiMessages,
            (delta) => {
                if (!firstTokenReceived) {
                    useSessionStore.getState().setPhase('responding');
                    firstTokenReceived = true;
                }
                useSessionStore.getState().appendAgentDelta(agentMsgId, delta);
            },
            () => {
                useSessionStore.getState().finaliseAgentMessage(agentMsgId);
            },
            (msg) => {
                useSessionStore.getState().setAgentError(agentMsgId, msg);
            }
        );
    };

    return { sendMessage };
}
