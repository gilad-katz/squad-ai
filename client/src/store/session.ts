import { create } from 'zustand';
import type { Message, PhaseState, FileAction } from '../types';
import { parseTransparency } from '../utils/parseTransparency';
import { parseFileActions } from '../utils/parseFileActions';

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
    startNewSession: () => void;
}

/**
 * Strip both TRANSPARENCY and FILE_ACTIONS blocks from content.
 * If file actions are present, also strip code blocks whose content
 * is redundant with the file action contents.
 */
function stripStructuredBlocks(content: string, fileActions?: FileAction[]): string {
    let result = content;

    // Strip TRANSPARENCY block
    const tStart = result.indexOf('TRANSPARENCY_START');
    const tEnd = result.indexOf('TRANSPARENCY_END');
    if (tStart >= 0 && tEnd >= 0) {
        const before = result.slice(0, tStart).trim();
        const after = result.slice(tEnd + 'TRANSPARENCY_END'.length).trim();
        result = (before + '\n\n' + after).trim();
    } else if (tStart >= 0) {
        result = result.slice(0, tStart).trim();
    }

    // Strip FILE_ACTIONS block
    const fStart = result.indexOf('FILE_ACTIONS_START');
    const fEnd = result.indexOf('FILE_ACTIONS_END');
    if (fStart >= 0 && fEnd >= 0) {
        const before = result.slice(0, fStart).trim();
        const after = result.slice(fEnd + 'FILE_ACTIONS_END'.length).trim();
        result = (before + '\n\n' + after).trim();
    } else if (fStart >= 0) {
        result = result.slice(0, fStart).trim();
    }

    // If we have file actions, strip redundant code blocks from the markdown
    if (fileActions && fileActions.length > 0) {
        result = stripRedundantCodeBlocks(result, fileActions);
    }

    return result;
}

/**
 * Remove fenced code blocks from markdown when their content overlaps
 * significantly with any file action content already shown in cards.
 */
function stripRedundantCodeBlocks(markdown: string, fileActions: FileAction[]): string {
    if (!fileActions.length) return markdown;

    // Match fenced code blocks: ```lang\n...\n```
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;

    return markdown.replace(codeBlockRegex, (match, codeContent: string) => {
        const trimmedCode = codeContent.trim();
        if (!trimmedCode) return match;

        // Check if any file action contains this code (or vice versa)
        for (const fa of fileActions) {
            const faContent = fa.content.trim();
            if (!faContent) continue;

            // Check overlap: if the code block is a substantial substring of
            // the file content, or vice versa, it's redundant
            if (faContent.includes(trimmedCode) || trimmedCode.includes(faContent)) {
                return ''; // Strip the redundant code block
            }

            // Also check if they share significant lines (>60% overlap)
            const codeLines = new Set(trimmedCode.split('\n').map(l => l.trim()).filter(Boolean));
            const faLines = new Set(faContent.split('\n').map(l => l.trim()).filter(Boolean));
            let overlap = 0;
            for (const line of codeLines) {
                if (faLines.has(line)) overlap++;
            }
            if (codeLines.size > 0 && overlap / codeLines.size > 0.6) {
                return ''; // Strip the redundant code block
            }
        }

        return match; // Keep non-redundant code blocks
    }).replace(/\n{3,}/g, '\n\n').trim(); // Clean up extra newlines
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
            displayContent: content, transparency: null, fileActions: [],
            status: 'complete', timestamp: Date.now()
        }]
    })),

    appendAgentMessageStart: () => {
        const id = crypto.randomUUID();
        set(s => ({
            streamActive: true,
            messages: [...s.messages, {
                id, role: 'assistant', content: '', displayContent: '',
                transparency: null, fileActions: [], status: 'streaming', timestamp: Date.now()
            }]
        }));
        return id;
    },

    appendAgentDelta: (id, delta) => set(s => ({
        messages: s.messages.map(m => {
            if (m.id !== id) return m;
            const newContent = m.content + delta;

            // Live parse transparency
            const transparency = parseTransparency(newContent, true);

            // Live parse file actions (will only return results after END marker)
            const { fileActions } = parseFileActions(newContent, true);
            const resolvedActions = fileActions.length > 0 ? fileActions : m.fileActions;

            // Strip structured blocks + redundant code from displayContent
            const displayContent = stripStructuredBlocks(newContent, resolvedActions);

            return { ...m, content: newContent, displayContent, transparency, fileActions: resolvedActions };
        })
    })),

    finaliseAgentMessage: (id) => set(s => ({
        streamActive: false,
        phase: 'ready',
        messages: s.messages.map(m => {
            if (m.id !== id) return m;

            const transparency = parseTransparency(m.content);
            const { fileActions } = parseFileActions(m.content);
            const resolvedActions = fileActions.length > 0 ? fileActions : m.fileActions;
            const displayContent = stripStructuredBlocks(m.content, resolvedActions);

            return {
                ...m, status: 'complete', displayContent, transparency,
                fileActions: fileActions.length > 0 ? fileActions : m.fileActions
            };
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

    setContextWarning: (warning) => set({ contextWarning: warning }),

    setSessionId: (id) => set({ sessionId: id }),

    addFileActions: (msgId, actions) => set(s => ({
        messages: s.messages.map(m =>
            m.id === msgId ? { ...m, fileActions: [...m.fileActions, ...actions] } : m
        )
    })),

    startNewSession: () => set({
        messages: [],
        streamActive: false,
        phase: 'ready',
        contextWarning: false,
        sessionId: null,
    })
}));
