import { create } from 'zustand';
import type { Message, PhaseState, FileAction, TransparencyData } from '../types';

const SESSION_STORAGE_KEY = 'squad-ai-session-id';

interface SessionStore {
    messages: Message[];
    streamActive: boolean;
    phase: PhaseState;
    phaseDetail: string | null;
    contextWarning: boolean;
    sessionId: string | null;
    sessionTitle: string | null;
    previewUrl: string | null;
    restoringSession: boolean;
    setPreviewUrl: (url: string | null) => void;
    setSessionTitle: (title: string | null) => void;
    updateSessionTitle: (title: string) => Promise<void>;
    appendUserMessage: (content: string, attachments?: Message['attachments']) => void;
    appendAgentMessageStart: () => string;   // returns new message id
    appendAgentDelta: (id: string, delta: string) => void;
    finaliseAgentMessage: (id: string) => void;
    setAgentError: (id: string, msg: string) => void;
    setPhase: (phase: PhaseState, detail?: string) => void;
    setContextWarning: (warning: boolean) => void;
    setSessionId: (id: string) => void;
    addFileActions: (msgId: string, actions: FileAction[]) => void;
    addServerFileAction: (msgId: string, action: FileAction) => void;
    setTransparency: (msgId: string, data: TransparencyData) => void;
    setSummary: (msgId: string, summary: string) => void;
    updateGitActionResult: (msgId: string, index: number, output?: string, error?: string, action?: 'clone' | 'execute', command?: string) => void;
    setMessages: (messages: Message[]) => void;
    startNewSession: () => void;
    restoreSession: () => Promise<void>;
    switchSession: (id: string) => Promise<void>;
    deleteSession: (id: string) => Promise<void>;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
    messages: [],
    streamActive: false,
    phase: 'ready',
    phaseDetail: null,
    contextWarning: false,
    sessionId: localStorage.getItem(SESSION_STORAGE_KEY),
    sessionTitle: null,
    previewUrl: null,
    restoringSession: false,

    setPreviewUrl: (url) => set({ previewUrl: url }),
    setSessionTitle: (title) => set({ sessionTitle: title }),

    updateSessionTitle: async (title) => {
        const { sessionId } = get();
        if (!sessionId) return;

        set({ sessionTitle: title });
        try {
            await fetch(`/api/chat/${sessionId}/metadata`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title })
            });
        } catch (err) {
            console.error('Failed to update session title:', err);
        }
    },

    appendUserMessage: (content, attachments) => set(s => ({
        messages: [...s.messages, {
            id: crypto.randomUUID(), role: 'user', content,
            displayContent: content, attachments,
            transparency: null, fileActions: [], serverFileActions: [], gitActions: [],
            status: 'complete', timestamp: Date.now(), sessionId: s.sessionId || undefined
        }]
    })),

    appendAgentMessageStart: () => {
        const id = crypto.randomUUID();
        set(s => ({
            streamActive: true,
            messages: [...s.messages, {
                id, role: 'assistant', content: '', displayContent: '',
                transparency: null, fileActions: [], serverFileActions: [], gitActions: [], status: 'streaming', timestamp: Date.now(), sessionId: s.sessionId || undefined
            }]
        }));
        return id;
    },

    appendAgentDelta: (id, delta) => set(s => ({
        messages: s.messages.map(m => {
            if (m.id !== id) return m;
            const newContent = m.content + delta;

            // In the new orchestrator architecture, transparency comes via discrete SSE events
            // via setTransparency — do NOT overwrite it here.
            const displayContent = newContent;

            return { ...m, content: newContent, displayContent };
        })
    })),

    finaliseAgentMessage: (id) => set(s => ({
        streamActive: false,
        phase: 'ready',
        phaseDetail: null,
        messages: s.messages.map(m => {
            if (m.id !== id) return m;

            // Force any remaining executing server file actions to complete
            const resolvedServerActions = (m.serverFileActions || []).map(act =>
                act.status === 'executing'
                    ? { ...act, status: 'complete' as const, content: act.content || '[Generation incomplete or timed out]' }
                    : act
            );

            return {
                ...m, status: 'complete',
                displayContent: m.content,
                // Preserve existing transparency (set via SSE), don't overwrite
                serverFileActions: resolvedServerActions,
            };
        })
    })),

    setAgentError: (id, msg) => set(s => ({
        streamActive: false,
        phase: 'ready',
        phaseDetail: null,
        messages: s.messages.map(m =>
            m.id === id ? { ...m, status: 'error', content: m.content + '\n\n' + msg, displayContent: m.displayContent + '\n\n' + msg } : m
        )
    })),

    setPhase: (phase, detail) => set({ phase, phaseDetail: detail || null }),

    setContextWarning: (warning) => set({ contextWarning: warning }),

    setSessionId: (id) => {
        localStorage.setItem(SESSION_STORAGE_KEY, id);
        set({ sessionId: id });
    },

    addFileActions: (msgId, actions) => set(s => ({
        messages: s.messages.map(m =>
            m.id === msgId ? { ...m, fileActions: [...m.fileActions, ...actions] } : m
        )
    })),

    addServerFileAction: (msgId, action) => set(s => ({
        messages: s.messages.map(m => {
            if (m.id !== msgId) return m;
            const existingIdx = m.serverFileActions.findIndex(fa => fa.id === action.id);
            if (existingIdx !== -1) {
                const newActions = [...m.serverFileActions];
                newActions[existingIdx] = action;
                return { ...m, serverFileActions: newActions };
            }
            return { ...m, serverFileActions: [...m.serverFileActions, action] };
        })
    })),

    setTransparency: (msgId, data) => set(s => ({
        messages: s.messages.map(m =>
            m.id === msgId ? { ...m, transparency: data } : m
        )
    })),

    setSummary: (msgId, summary) => set(s => ({
        messages: s.messages.map(m =>
            m.id === msgId ? { ...m, summary } : m
        )
    })),

    updateGitActionResult: (msgId, index, output, error, action, command) => set(s => ({
        messages: s.messages.map(m => {
            if (m.id !== msgId) return m;
            const newGitActions = [...m.gitActions];
            if (newGitActions[index]) {
                const currentAction = newGitActions[index];
                newGitActions[index] = {
                    ...currentAction,
                    output,
                    error,
                    ...(action ? { action } : {}),
                    ...(command ? { command } : {})
                };
            } else {
                // If it doesn't exist yet, but we're starting to stream it, initialize it
                newGitActions[index] = { id: `git-tmp-${Date.now()}-${index}`, action: action || 'execute', command: command || '', output, error };
            }
            return { ...m, gitActions: newGitActions };
        })
    })),

    setMessages: (messages) => set({ messages }),

    startNewSession: () => {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        set({
            messages: [],
            streamActive: false,
            phase: 'ready',
            phaseDetail: null,
            contextWarning: false,
            sessionId: null,
            sessionTitle: null,
            previewUrl: null,
        });
    },

    restoreSession: async () => {
        const { sessionId, messages, restoringSession } = get();
        // Only restore if we have a persisted sessionId, haven't loaded messages,
        // and aren't already restoring
        if (!sessionId || messages.length > 0 || restoringSession) return;

        set({ restoringSession: true });
        try {
            const res = await fetch(`/api/chat/${sessionId}/history`);

            // Re-check: if session was cleared while we were fetching, bail out
            if (get().sessionId !== sessionId) {
                set({ restoringSession: false });
                return;
            }

            if (!res.ok) {
                // Session no longer exists on server — clear stale reference
                localStorage.removeItem(SESSION_STORAGE_KEY);
                set({ sessionId: null, restoringSession: false });
                return;
            }

            const history: Message[] = await res.json();

            // Re-check again after parsing: session might have been cleared
            if (get().sessionId !== sessionId) {
                set({ restoringSession: false });
                return;
            }

            // Also fetch metadata for title
            try {
                const metaRes = await fetch(`/api/chat/${sessionId}/metadata`);
                if (metaRes.ok) {
                    const metadata = await metaRes.json();
                    if (metadata.title) {
                        set({ sessionTitle: metadata.title });
                    }
                }
            } catch (err) {
                console.error('Failed to fetch metadata during restore:', err);
            }

            if (Array.isArray(history) && history.length > 0) {
                // Ensure all restored messages have required fields with defaults
                const normalised = history.map(m => ({
                    ...m,
                    displayContent: m.displayContent || m.content || '',
                    transparency: m.transparency || null,
                    fileActions: m.fileActions || [],
                    serverFileActions: m.serverFileActions || [],
                    gitActions: m.gitActions || [],
                    status: (m.status || 'complete') as Message['status'],
                    sessionId: m.sessionId || sessionId
                }));
                set({ messages: normalised, restoringSession: false });
            } else {
                // Empty history — clear stale reference
                localStorage.removeItem(SESSION_STORAGE_KEY);
                set({ sessionId: null, restoringSession: false });
            }

            // Start the dev server for the restored session to enable the View App button
            try {
                const devRes = await fetch(`/api/chat/${sessionId}/dev-server`, { method: 'POST' });
                if (devRes.ok) {
                    const devData = await devRes.json();
                    if (devData.url) {
                        get().setPreviewUrl(devData.url);

                        // If logs exist, push a local ephemeral message to the chat
                        if (devData.logs && devData.command) {
                            set(s => ({
                                messages: [...s.messages, {
                                    id: `dev-${Date.now()}`,
                                    role: 'assistant',
                                    content: 'Dev server started successfully.',
                                    displayContent: 'Dev server started successfully.',
                                    transparency: null,
                                    fileActions: [],
                                    serverFileActions: [],
                                    gitActions: [{
                                        id: `dev-git-${Date.now()}`,
                                        action: 'execute',
                                        command: devData.command,
                                        output: devData.logs
                                    }],
                                    status: 'complete',
                                    timestamp: Date.now()
                                }]
                            }));
                        }
                    }
                } else {
                    get().setPreviewUrl(null);
                }
            } catch (err) {
                console.error('Failed to start dev server on restore:', err);
                get().setPreviewUrl(null);
            }

        } catch (err) {
            console.error('Failed to restore session:', err);
            set({ restoringSession: false });
        }
    },

    switchSession: async (id: string) => {
        // Clear current state first
        set({
            messages: [],
            streamActive: false,
            phase: 'ready',
            phaseDetail: null,
            contextWarning: false,
            sessionId: id,
            sessionTitle: null,
            previewUrl: null,
        });
        localStorage.setItem(SESSION_STORAGE_KEY, id);

        // Use the restore logic to pull historical data
        const { restoreSession } = get();
        await restoreSession();
    },

    deleteSession: async (id: string) => {
        const { sessionId, startNewSession } = get();

        try {
            const res = await fetch(`/api/chat/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');

            // If we deleted the active session, reset everything
            if (id === sessionId) {
                startNewSession();
            }
        } catch (err) {
            console.error('Failed to delete session:', err);
            throw err;
        }
    },
}));
