import { create } from 'zustand';
import type { Message, PhaseState, FileAction, TransparencyData } from '../types';

interface SessionStore {
    messages: Message[];
    streamActive: boolean;
    phase: PhaseState;
    contextWarning: boolean;
    sessionId: string | null;
    appendUserMessage: (content: string) => void;
    appendAgentMessageStart: () => string;   // returns new message id
    appendAgentDelta: (id: string, delta: string) => void;
    finaliseAgentMessage: (id: string) => void;
    setAgentError: (id: string, msg: string) => void;
    setPhase: (phase: PhaseState) => void;
    setContextWarning: (warning: boolean) => void;
    setSessionId: (id: string) => void;
    addFileActions: (msgId: string, actions: FileAction[]) => void;
    addServerFileAction: (msgId: string, action: FileAction) => void;
    setTransparency: (msgId: string, data: TransparencyData) => void;
    updateGitActionResult: (msgId: string, index: number, output?: string, error?: string) => void;
    startNewSession: () => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
    messages: [],
    streamActive: false,
    phase: 'ready',
    contextWarning: false,
    sessionId: null,

    appendUserMessage: (content) => set(s => ({
        messages: [...s.messages, {
            id: crypto.randomUUID(), role: 'user', content,
            displayContent: content, transparency: null, fileActions: [], serverFileActions: [], gitActions: [],
            status: 'complete', timestamp: Date.now()
        }]
    })),

    appendAgentMessageStart: () => {
        const id = crypto.randomUUID();
        set(s => ({
            streamActive: true,
            messages: [...s.messages, {
                id, role: 'assistant', content: '', displayContent: '',
                transparency: null, fileActions: [], serverFileActions: [], gitActions: [], status: 'streaming', timestamp: Date.now()
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
        messages: s.messages.map(m =>
            m.id === id ? { ...m, status: 'error', content: m.content + '\n\n' + msg, displayContent: m.displayContent + '\n\n' + msg } : m
        )
    })),

    setPhase: (phase) => set({ phase }),

    setContextWarning: (warning) => set({ contextWarning: warning }),

    setSessionId: (id) => set({ sessionId: id }),

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

    updateGitActionResult: (msgId, index, output, error) => set(s => ({
        messages: s.messages.map(m => {
            if (m.id !== msgId) return m;
            const newGitActions = [...m.gitActions];
            if (newGitActions[index]) {
                newGitActions[index] = { ...newGitActions[index], output, error };
            }
            return { ...m, gitActions: newGitActions };
        })
    })),

    startNewSession: () => set({
        messages: [],
        streamActive: false,
        phase: 'ready',
        contextWarning: false,
        sessionId: null,
    })
}));
