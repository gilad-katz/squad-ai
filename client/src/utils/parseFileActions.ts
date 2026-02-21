import type { FileAction } from '../types';

/**
 * Parse FILE_ACTIONS_START…FILE_ACTIONS_END block from raw LLM output.
 * Returns the parsed FileAction array and the content with the block stripped.
 */
export function parseFileActions(
    raw: string,
    allowPartial: boolean = false
): { fileActions: FileAction[]; strippedContent: string } {
    const startMarker = 'FILE_ACTIONS_START';
    const endMarker = 'FILE_ACTIONS_END';

    const startIdx = raw.indexOf(startMarker);
    if (startIdx === -1) return { fileActions: [], strippedContent: raw };

    const endIdx = raw.indexOf(endMarker);
    if (endIdx === -1 && !allowPartial) return { fileActions: [], strippedContent: raw };

    // If we're still streaming and haven't seen the end marker, return empty
    if (endIdx === -1) return { fileActions: [], strippedContent: raw.slice(0, startIdx).trim() };

    const jsonBlock = raw.slice(startIdx + startMarker.length, endIdx).trim();

    let fileActions: FileAction[] = [];
    try {
        const jsonMatch = jsonBlock.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            fileActions = parsed.map((item: any, idx: number) => ({
                id: item.id || `file-${idx}-${Date.now()}`,
                filename: item.filename || 'unknown',
                filepath: item.filepath || item.filename || 'unknown',
                language: item.language || detectLanguage(item.filename || ''),
                action: item.action || 'created',
                content: item.content || '',
                diff: item.diff || undefined,
                linesAdded: item.linesAdded ?? 0,
                linesRemoved: item.linesRemoved ?? 0,
                warnings: item.warnings,
            }));
        }
    } catch {
        // JSON parse failed — may be incomplete during streaming
    }

    // Strip the FILE_ACTIONS block from displayContent
    const before = raw.slice(0, startIdx).trim();
    const after = raw.slice(endIdx + endMarker.length).trim();
    const strippedContent = (before + '\n\n' + after).trim();

    return { fileActions, strippedContent };
}

/**
 * Simple language detection from filename extension.
 */
function detectLanguage(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
        ts: 'typescript', tsx: 'typescriptreact',
        js: 'javascript', jsx: 'javascriptreact',
        css: 'css', scss: 'scss', less: 'less',
        html: 'html', json: 'json', md: 'markdown',
        py: 'python', go: 'go', rs: 'rust',
        java: 'java', rb: 'ruby', sh: 'bash',
        yml: 'yaml', yaml: 'yaml', sql: 'sql',
        xml: 'xml', svg: 'svg',
    };
    return map[ext] || 'text';
}
