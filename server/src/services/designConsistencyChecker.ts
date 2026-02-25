// ─── Design Consistency Checker ──────────────────────────────────────────────
// REQ-5.1: Scans workspace for hardcoded colors/values that should reference
// design tokens from src/constants/theme.ts.

import fs from 'fs';
import path from 'path';
import { readFile, listFiles } from './fileService';

// Common hex color pattern — matches #RGB, #RRGGBB, #RRGGBBAA
const HEX_COLOR_REGEX = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/g;

// CSS properties that commonly hold color values
const COLOR_PROPERTIES = /(?:color|background|border|shadow|outline|fill|stroke)\s*:/gi;

export interface DesignConsistencyError {
    filepath: string;
    line: number;
    message: string;
    severity: 'warning' | 'error';
}

/**
 * Scans all .tsx, .ts, and .css files for hardcoded color values
 * that aren't in the project's theme.ts file.
 */
export function checkDesignConsistency(sessionId: string): DesignConsistencyError[] {
    const errors: DesignConsistencyError[] = [];

    // 1. Try to read theme.ts to get the allowed color palette
    let themeContent: string | null = null;
    try {
        themeContent = readFile(sessionId, 'src/constants/theme.ts');
    } catch { /* no theme.ts — can't check consistency */ }

    if (!themeContent) {
        // No theme file exists — nothing to check against
        return [];
    }

    // Extract all hex colors defined in theme.ts as the "allowed" palette
    const allowedColors = new Set<string>();
    const themeMatches = themeContent.matchAll(HEX_COLOR_REGEX);
    for (const match of themeMatches) {
        allowedColors.add(match[0].toLowerCase());
    }

    // Common CSS utility colors that are always allowed
    const exemptColors = new Set([
        '#fff', '#ffffff', '#000', '#000000', '#0000', '#ffff',
        'transparent', 'inherit', 'currentcolor'
    ]);

    // 2. Scan all source files for hardcoded hex colors
    const files = listFiles(sessionId);
    const sourceFiles = files.filter(f =>
        f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.css') || f.endsWith('.scss')
    );

    for (const filePath of sourceFiles) {
        // Skip the theme file itself
        if (filePath === 'src/constants/theme.ts') continue;

        let content: string;
        try {
            content = readFile(sessionId, filePath) || '';
        } catch { continue; }

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const hexMatches = line.matchAll(HEX_COLOR_REGEX);

            for (const match of hexMatches) {
                const color = match[0].toLowerCase();

                // Skip exempt colors and colors defined in theme
                if (exemptColors.has(color)) continue;
                if (allowedColors.has(color)) continue;

                // Check if this line is in a CSS context (color property)
                const isCSS = filePath.endsWith('.css') || filePath.endsWith('.scss');
                const hasColorProperty = COLOR_PROPERTIES.test(line);
                COLOR_PROPERTIES.lastIndex = 0; // reset regex

                if (isCSS || hasColorProperty || line.includes('style')) {
                    errors.push({
                        filepath: filePath,
                        line: i + 1,
                        message: `Hardcoded color ${color} — should use theme token from 'src/constants/theme.ts'`,
                        severity: 'warning'
                    });
                }
            }
        }
    }

    return errors;
}
