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

        // Generate sessionId client-side if this is the first message,
        // so that new messages get tagged with it.
        let sessionId = useSessionStore.getState().sessionId;
        if (!sessionId) {
            sessionId = `session-${Date.now()}`;
            useSessionStore.getState().setSessionId(sessionId);
        }

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

        // sessionID is already generated above

        let activeAgentMsgId = agentMsgId;

        await consumeStream(
            apiMessages,
            sessionId,
            {
                // onDelta — conversational text from the orchestrator chat tasks
                onDelta: (delta) => {
                    useSessionStore.getState().appendAgentDelta(activeAgentMsgId, delta);
                    useSessionStore.getState().appendPhaseThoughtDelta(activeAgentMsgId, delta, useSessionStore.getState().phase);
                },
                // onDone — finalize
                onDone: (usage, returnedSessionId) => {
                    useSessionStore.getState().finaliseAgentMessage(activeAgentMsgId);

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
                onError: (msg) => {
                    useSessionStore.getState().setAgentError(activeAgentMsgId, msg);
                },
                // onGitResult
                onGitResult: (index, output, error, action, command) => {
                    useSessionStore.getState().updateGitActionResult(activeAgentMsgId, index, output, error, action, command);
                },
                // onSessionId
                onSessionId: (sid) => {
                    useSessionStore.getState().setSessionId(sid);
                },
                // onFileAction — discrete file events from the orchestrator dispatcher
                onFileAction: (action) => {
                    useSessionStore.getState().addServerFileAction(activeAgentMsgId, action);
                },
                // onPhase — phase transitions from the backend orchestrator
                onPhase: (phase, detail, thought) => {
                    useSessionStore.getState().setPhase(phase, detail);
                    useSessionStore.getState().addPhaseThought(activeAgentMsgId, phase, detail, thought);
                },
                // onTransparency — reasoning and task breakdown from the orchestrator
                onTransparency: (data) => {
                    useSessionStore.getState().setTransparency(activeAgentMsgId, data);
                },
                // onPreview — dev server URL
                onPreview: (url) => {
                    useSessionStore.getState().setPreviewUrl(url);
                },
                // onMetadata
                onMetadata: (data) => {
                    if (data.title) {
                        useSessionStore.getState().setSessionTitle(data.title);
                    }
                },
                // onSummary
                onSummary: (text) => {
                    useSessionStore.getState().setSummary(activeAgentMsgId, text);
                },
                // onAgentStart — new agent turn, create a new message bubble
                onAgentStart: (agent, _name) => {
                    useSessionStore.getState().setActiveAgent(agent);

                    // If the initial message already has content for a different agent,
                    // finalize it and start a fresh one
                    const current = useSessionStore.getState().messages.find(m => m.id === activeAgentMsgId);
                    if (current && (current.content || current.serverFileActions?.length)) {
                        useSessionStore.getState().finaliseAgentMessage(activeAgentMsgId);
                        activeAgentMsgId = useSessionStore.getState().appendAgentMessageStart();
                    } else if (current) {
                        // First agent — just stamp the existing empty message
                        useSessionStore.setState(s => ({
                            messages: s.messages.map(m =>
                                m.id === activeAgentMsgId ? { ...m, agent } : m
                            )
                        }));
                    }
                },
                // onAgentEnd — close the current agent's message
                onAgentEnd: (_agent) => {
                    useSessionStore.getState().setActiveAgent(null);
                }
            }
        );
    };

    // REQ-3.3: Stop/interrupt the running pipeline
    const stopGeneration = async () => {
        const sessionId = useSessionStore.getState().sessionId;
        if (!sessionId || !store.streamActive) return;

        try {
            await fetch(`/api/chat/interrupt/${sessionId}`, { method: 'POST' });
        } catch (err) {
            console.warn('Failed to send interrupt:', err);
        }

        // Reset client-side state immediately
        useSessionStore.getState().setPhase('ready');
    };

    return { sendMessage, stopGeneration };
}
