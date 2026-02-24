import { useSessionStore } from '../store/session';
import { consumeStream } from '../services/streamConsumer';

import type { Attachment } from '../types';

export function useChat() {
    const store = useSessionStore();

    const sendMessage = async (content: string, attachments?: Attachment[], retryMsgId?: string) => {
        if (store.streamActive) return;

        // Safety: Limit total attachment size to avoid 400 errors
        const TOTAL_SIZE_LIMIT = 15 * 1024 * 1024; // 15MB
        const currentSize = attachments?.reduce((acc, a) => acc + (a.data?.length || 0), 0) || 0;
        if (currentSize > TOTAL_SIZE_LIMIT) {
            alert(`Total attachment size is too large (${(currentSize / 1024 / 1024).toFixed(1)}MB). Please send fewer or smaller images (max 15MB total).`);
            return;
        }

        // If it's a retry and we didn't pass explicit content, find the last user message
        if (retryMsgId) {
            const messages = useSessionStore.getState().messages;
            const index = messages.findIndex(m => m.id === retryMsgId);
            if (index > 0 && messages[index - 1].role === 'user') {
                content = messages[index - 1].content;
                // Retry should probably include original attachments if they exist
                // but for now we prioritize explicit attachments passed to sendMessage
            }
        }

        if (!content || !content.trim()) return;

        // Only append new user message if this isn't a retry
        if (!retryMsgId) {
            store.appendUserMessage(content, attachments);
        }
        store.setPhase('thinking');

        const currentMessages = useSessionStore.getState().messages;
        const apiMessages = currentMessages
            .filter(m => m.status === 'complete' || m.role === 'user')
            .map((m, idx, arr) => {
                // To avoid 400 errors (payload too large), we only send attachments
                // for the MOST RECENT user message in the history.
                const isLastUserMsg = m.role === 'user' && (idx === arr.length - 1 || (idx === arr.length - 2 && arr[arr.length - 1].role === 'assistant' && arr[arr.length - 1].status === 'streaming'));

                let content = m.content;

                // Summarize/Truncate large text payloads (e.g. over 3000 chars) in history
                // but always keep the full content for the most recent message.
                const TEXT_LIMIT = 3000;
                if (!isLastUserMsg && content.length > TEXT_LIMIT) {
                    content = `${content.substring(0, TEXT_LIMIT)}... [Content truncated for length. Original size: ${content.length} characters]`;
                }

                // If we are omitting attachments, add a summary to the content so the LLM knows they existed
                if (!isLastUserMsg && m.attachments && m.attachments.length > 0) {
                    const summary = m.attachments.map(a => `[Attachment: ${a.type}${a.name ? ` (${a.name})` : ''}]`).join(' ');
                    content = `${content}\n\n${summary}`;
                }

                return {
                    id: m.id,
                    role: m.role,
                    content: content,
                    status: m.status,
                    timestamp: m.timestamp,
                    attachments: isLastUserMsg ? m.attachments?.map(a => ({
                        id: a.id,
                        type: a.type,
                        mimeType: a.mimeType,
                        data: a.data,
                        name: a.name
                    })) : undefined
                };
            })
            .filter(m => m.content && m.content.trim().length > 0);

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
            (index, output, error, action, command) => {
                useSessionStore.getState().updateGitActionResult(agentMsgId, index, output, error, action, command);
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
            },
            // onPreview — dev server URL
            (url) => {
                useSessionStore.getState().setPreviewUrl(url);
            },
            // onMetadata
            (data) => {
                if (data.title) {
                    useSessionStore.getState().setSessionTitle(data.title);
                }
            },
            // onSummary
            (text) => {
                useSessionStore.getState().setSummary(agentMsgId, text);
            }
        );
    };

    return { sendMessage };
}
