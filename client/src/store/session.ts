import { create } from 'zustand';
import type { Message, PhaseState } from '../types';
import { parseTransparency } from '../utils/parseTransparency';

interface SessionStore {
    messages: Message[];
    streamActive: boolean;
    phase: PhaseState;
    appendUserMessage: (content: string) => void;
    appendAgentMessageStart: () => string;   // returns new message id
    appendAgentDelta: (id: string, delta: string) => void;
    finaliseAgentMessage: (id: string) => void;
    setAgentError: (id: string, msg: string) => void;
    setPhase: (phase: PhaseState) => void;
    startNewSession: () => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
    messages: [],
    streamActive: false,
    phase: 'ready',

    appendUserMessage: (content) => set(s => ({
        messages: [...s.messages, {
            id: crypto.randomUUID(), role: 'user', content,
            displayContent: content, transparency: null,
            status: 'complete', timestamp: Date.now()
        }]
    })),

    appendAgentMessageStart: () => {
        const id = crypto.randomUUID();
        set(s => ({
            streamActive: true,
            messages: [...s.messages, {
                id, role: 'assistant', content: '', displayContent: '',
                transparency: null, status: 'streaming', timestamp: Date.now()
            }]
        }));
        return id;
    },

    appendAgentDelta: (id, delta) => set(s => ({
        messages: s.messages.map(m =>
            m.id === id ? { ...m, content: m.content + delta, displayContent: m.content + delta }
                : m
        )
    })),

    finaliseAgentMessage: (id) => set(s => ({
        streamActive: false,
        phase: 'ready',
        messages: s.messages.map(m => {
            if (m.id !== id) return m;

            // Extract Transparency string out
            const transparency = parseTransparency(m.content);
            const splitPoint = m.content.indexOf('TRANSPARENCY_START');
            let displayContent = m.content.trim();

            if (splitPoint >= 0) {
                // Find the END block to slice out everything before
                const endPoint = m.content.indexOf('TRANSPARENCY_END');
                if (endPoint >= 0) {
                    const before = m.content.slice(0, splitPoint).trim();
                    const after = m.content.slice(endPoint + 'TRANSPARENCY_END'.length).trim();
                    displayContent = (before + '\n\n' + after).trim();
                } else {
                    displayContent = m.content.slice(0, splitPoint).trim();
                }
            }

            return { ...m, status: 'complete', displayContent, transparency };
        })
    })),

    setAgentError: (id, msg) => set(s => ({
        streamActive: false,
        phase: 'ready',
        messages: s.messages.map(m =>
            m.id === id ? { ...m, status: 'error', content: m.content + '\\n\\n' + msg, displayContent: m.displayContent + '\\n\\n' + msg } : m
        )
    })),

    setPhase: (phase) => set({ phase }),

    startNewSession: () => set({
        messages: [],
        streamActive: false,
        phase: 'ready'
    })
}));
