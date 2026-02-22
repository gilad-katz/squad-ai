import { create } from 'zustand';
import type { Message, PhaseState, FileAction } from '../types';
import { parseTransparency } from '../utils/parseTransparency';
import { parseFileActions } from '../utils/parseFileActions';
import { parseGitActions } from '../utils/parseGitActions';

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
    updateGitActionResult: (msgId: string, index: number, output?: string, error?: string) => void;
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

    // Strip GIT_ACTIONS block
    const gStart = result.indexOf('GIT_ACTIONS_START');
    const gEnd = result.indexOf('GIT_ACTIONS_END');
    if (gStart >= 0 && gEnd >= 0) {
        const before = result.slice(0, gStart).trim();
        const after = result.slice(gEnd + 'GIT_ACTIONS_END'.length).trim();
        result = (before + '\n\n' + after).trim();
    } else if (gStart >= 0) {
        result = result.slice(0, gStart).trim();
    }

    // Strip out ugly raw Git Terminal Output logs
    // We want the agent to summarize these naturally, but they often just parrot the raw strings.
    const gitLogRegex = /(\[[a-zA-Z0-9_-]+ [a-f0-9]{7}\].*?|Enumerating objects:.*?\d+.*?(done\.|pack-reused \d+)(?:\s*To https?:\/\/.*?\.git\s+[a-f0-9]+\.\.[a-f0-9]+\s+[a-zA-Z0-9_-]+\s*->\s*[a-zA-Z0-9_-]+)?)/gs;
    result = result.replace(gitLogRegex, '').replace(/\n{3,}/g, '\n\n').trim();

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
            displayContent: content, transparency: null, fileActions: [], gitActions: [],
            status: 'complete', timestamp: Date.now()
        }]
    })),

    appendAgentMessageStart: () => {
        const id = crypto.randomUUID();
        set(s => ({
            streamActive: true,
            messages: [...s.messages, {
                id, role: 'assistant', content: '', displayContent: '',
                transparency: null, fileActions: [], gitActions: [], status: 'streaming', timestamp: Date.now()
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

            // Live parse git actions but preserve any async execution output/error
            // If the LLM generates multiple actions across streams (e.g. multi-turn loop), we merge them.
            const parsedGit = parseGitActions(newContent, true).gitActions;

            // Start with the existing actions, and we'll update or append from `parsedGit`
            const resolvedGitMap = new Map<string, any>();
            for (const act of m.gitActions) {
                // Deduplicate by ID if present, otherwise fallback to the exact command (or action name for clone)
                const key = act.id || act.command || act.action;
                resolvedGitMap.set(key, act);
            }

            for (const newAct of parsedGit) {
                const key = newAct.id || newAct.command || newAct.action;
                const oldAct = resolvedGitMap.get(key);
                if (oldAct) {
                    // Update existing action, preserving output/error
                    resolvedGitMap.set(key, { ...newAct, output: oldAct.output, error: oldAct.error });
                } else {
                    // It's a brand new action 
                    resolvedGitMap.set(key, newAct);
                }
            }
            const resolvedGitActions = Array.from(resolvedGitMap.values());

            // Strip structured blocks + redundant code from displayContent
            const displayContent = stripStructuredBlocks(newContent, resolvedActions);

            return { ...m, content: newContent, displayContent, transparency, fileActions: resolvedActions, gitActions: resolvedGitActions };
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

            const parsedGit = parseGitActions(m.content).gitActions;
            const resolvedGitMapFinal = new Map<string, any>();
            for (const act of m.gitActions) {
                const key = act.id || act.command || act.action;
                resolvedGitMapFinal.set(key, act);
            }

            for (const newAct of parsedGit) {
                const key = newAct.id || newAct.command || newAct.action;
                const oldAct = resolvedGitMapFinal.get(key);
                if (oldAct) {
                    resolvedGitMapFinal.set(key, { ...newAct, output: oldAct.output, error: oldAct.error });
                } else {
                    resolvedGitMapFinal.set(key, newAct);
                }
            }
            const resolvedGitActionsFinal = Array.from(resolvedGitMapFinal.values());

            const displayContent = stripStructuredBlocks(m.content, resolvedActions);

            return {
                ...m, status: 'complete', displayContent, transparency,
                fileActions: resolvedActions,
                gitActions: resolvedGitActionsFinal
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
