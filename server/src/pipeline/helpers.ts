// ─── Pipeline Helpers ────────────────────────────────────────────────────────
// Shared utility functions used across multiple pipeline phases.
// Extracted from the monolithic chat.ts route handler.

import fs from 'fs';
import path from 'path';

// ─── Error Classification ───────────────────────────────────────────────────

export function classifyError(err: any): string {
    if (err?.message?.includes('429')) return 'Rate limit exceeded. Please try again later.';
    if (err?.message?.includes('timeout')) return 'Request timed out. Please try again.';
    return err?.message || 'Unknown error occurred while generating response.';
}

// ─── Language Detection ─────────────────────────────────────────────────────

export function detectLanguage(filepath: string): string {
    const ext = filepath.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
        ts: 'typescript', tsx: 'typescriptreact',
        js: 'javascript', jsx: 'javascriptreact',
        css: 'css', scss: 'scss', less: 'less',
        html: 'html', json: 'json', md: 'markdown',
        py: 'python', go: 'go', rs: 'rust',
        java: 'java', rb: 'ruby', sh: 'bash',
        yml: 'yaml', yaml: 'yaml', sql: 'sql',
        xml: 'xml', svg: 'svg',
        jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image',
    };
    return map[ext] || 'text';
}

// ─── Robust JSON Parsing ────────────────────────────────────────────────────

export function robustJsonParse(input: string): any {
    const trimmed = input.trim();

    // Attempt 1: Standard parse
    try {
        return JSON.parse(trimmed);
    } catch {
        // Fall through
    }

    // Attempt 2: Strip markdown code fences
    const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/;
    const fenceMatch = trimmed.match(fenceRegex);
    if (fenceMatch) {
        try {
            return JSON.parse(fenceMatch[1].trim());
        } catch {
            // Fall through
        }
    }

    // Attempt 3: Extract first valid JSON object
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const candidate = trimmed.substring(firstBrace, lastBrace + 1);
        try {
            return JSON.parse(candidate);
        } catch {
            // Fall through
        }
    }

    throw new Error('Could not parse execution plan as JSON');
}

// ─── Prompt Loading ─────────────────────────────────────────────────────────

const PROMPTS_DIR = path.join(__dirname, '../../prompts');

export function loadPrompt(filename: string): string {
    const promptPath = path.join(PROMPTS_DIR, filename);
    return fs.readFileSync(promptPath, 'utf8');
}

// ─── Client Message → Gemini Format Conversion ─────────────────────────────

import type { ClientMessage, GeminiContent } from '../types/pipeline';

export function convertToGeminiContents(messages: ClientMessage[]): GeminiContent[] {
    return messages.map((m) => {
        const parts: any[] = [{ text: m.content }];
        if (m.attachments && Array.isArray(m.attachments)) {
            for (const att of m.attachments) {
                if (att.type === 'image') {
                    parts.push({
                        inlineData: {
                            data: att.data,
                            mimeType: att.mimeType
                        }
                    });
                }
            }
        }
        return {
            role: m.role === 'assistant' ? 'model' as const : m.role as 'user',
            parts
        };
    });
}

// ─── Cross-File Context Builder ─────────────────────────────────────────────
// Reads a file's imports and resolves their contents for repair context.

import { readFile } from '../services/fileService';

export function buildCrossFileContext(sessionId: string, relPath: string): string {
    let crossFileContext = '';
    try {
        const fileContent = readFile(sessionId, relPath);
        if (fileContent) {
            const importRegex = /from\s+['"](\.\/.+?|\.\.\/.+?)['"]/g;
            let importMatch;
            const importedContents: string[] = [];
            while ((importMatch = importRegex.exec(fileContent)) !== null) {
                const importPath = importMatch[1];
                const importDir = path.dirname(relPath);
                const resolvedBase = path.join(importDir, importPath);
                const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];
                for (const ext of extensions) {
                    const candidate = resolvedBase + ext;
                    try {
                        const content = readFile(sessionId, candidate);
                        if (content) {
                            importedContents.push(`--- ${candidate} ---\n${content}`);
                            break;
                        }
                    } catch { /* file doesn't exist */ }
                }
            }
            if (importedContents.length > 0) {
                crossFileContext = `\n\nIMPORTED MODULE CONTENTS (use these to verify your imports match actual exports):\n${importedContents.join('\n\n')}`;
            }
        }
    } catch { /* file doesn't exist */ }
    return crossFileContext;
}
