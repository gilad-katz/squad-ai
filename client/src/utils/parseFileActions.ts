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

    // If we're still streaming and haven't seen the end marker, extract what we can if allowPartial
    if (endIdx === -1) {
        if (!allowPartial) return { fileActions: [], strippedContent: raw.slice(0, startIdx).trim() };
    }

    const jsonBlock = raw.slice(startIdx + startMarker.length, endIdx !== -1 ? endIdx : undefined).trim();

    let fileActions: FileAction[] = [];
    try {
        const jsonMatch = jsonBlock.match(/\[[\s\S]*\]/);
        // If there's an end marker, it must parse. If no end marker, it might throw, which is caught.
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
                status: 'complete' as const,
            }));
        } else if (allowPartial) {
            throw new Error('Fallback to partial stream parsing');
        }
    } catch {
        // JSON parse failed — may be incomplete during streaming
        if (allowPartial) {
            // First try to match filepath which contains the important directory info
            // Fallback to filename if filepath is missing (though our prompt forbids it)
            const pathRegex = /"(?:filepath|filename)"\s*:\s*"([^"]+)"/g;
            let match;
            let idx = 0;
            // Also try to find action if possible, fallback to 'created'
            while ((match = pathRegex.exec(jsonBlock)) !== null) {
                const extractedPath = match[1];
                fileActions.push({
                    id: `file-partial-${idx++}-${Date.now()}`,
                    filename: extractedPath.split('/').pop() || extractedPath,
                    filepath: extractedPath,
                    language: detectLanguage(extractedPath),
                    action: 'created',      // placeholder
                    content: '',            // Not fully streamed yet
                    linesAdded: 0,
                    linesRemoved: 0,
                    status: 'executing' as const,
                });
            }
        }
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
