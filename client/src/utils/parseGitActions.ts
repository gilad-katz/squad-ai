import type { GitAction } from '../types';

/**
 * Parse GIT_ACTIONS_START…GIT_ACTIONS_END block from raw LLM output.
 * Returns the parsed GitAction array and the content with the block stripped.
 */
export function parseGitActions(
    raw: string,
    allowPartial: boolean = false
): { gitActions: GitAction[]; strippedContent: string } {
    const startMarker = 'GIT_ACTIONS_START';
    const endMarker = 'GIT_ACTIONS_END';

    const startIdx = raw.indexOf(startMarker);
    if (startIdx === -1) return { gitActions: [], strippedContent: raw };

    const endIdx = raw.indexOf(endMarker);
    if (endIdx === -1 && !allowPartial) return { gitActions: [], strippedContent: raw };

    // If we're still streaming and haven't seen the end marker, return empty
    if (endIdx === -1) return { gitActions: [], strippedContent: raw.slice(0, startIdx).trim() };

    const jsonBlock = raw.slice(startIdx + startMarker.length, endIdx).trim();

    let gitActions: GitAction[] = [];
    try {
        const jsonMatch = jsonBlock.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            gitActions = parsed.map((item: any, idx: number) => ({
                id: item.id || `git-action-${idx}`,
                action: item.action || 'clone',
                command: item.command,
            }));
        }
    } catch {
        // JSON parse failed — may be incomplete during streaming
    }

    // Strip the GIT_ACTIONS block from displayContent
    const before = raw.slice(0, startIdx).trim();
    const after = raw.slice(endIdx + endMarker.length).trim();
    const strippedContent = (before + '\n\n' + after).trim();

    return { gitActions, strippedContent };
}
