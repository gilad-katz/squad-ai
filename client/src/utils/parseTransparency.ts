import type { TransparencyData } from '../types';

export function parseTransparency(raw: string, allowPartial: boolean = false): TransparencyData | null {
    const startIdx = raw.indexOf('TRANSPARENCY_START');
    if (startIdx === -1) return null;

    const endIdx = raw.indexOf('TRANSPARENCY_END');
    if (endIdx === -1 && !allowPartial) return null;

    const block = endIdx >= 0
        ? raw.slice(startIdx + 'TRANSPARENCY_START'.length, endIdx)
        : raw.slice(startIdx + 'TRANSPARENCY_START'.length);

    const reasoning = extractSection(block, 'REASONING:');
    const tasksRaw = extractSection(block, 'TASKS:');
    const assumptions = extractSection(block, 'ASSUMPTIONS:');

    let tasks: TransparencyData['tasks'] = [];
    try {
        const jsonMatch = tasksRaw.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            tasks = JSON.parse(jsonMatch[0]);
        } else if (tasksRaw.trim()) {
            tasks = [{ id: 1, description: tasksRaw.trim(), status: 'pending' }];
        }
    } catch {
        if (tasksRaw.trim()) {
            tasks = [{ id: 1, description: tasksRaw.trim(), status: 'pending' }];
        }
    }

    return { reasoning: reasoning.trim(), tasks, assumptions: assumptions.trim() };
}

function extractSection(block: string, label: string): string {
    const idx = block.indexOf(label);
    if (idx === -1) return '';
    const start = idx + label.length;

    // Look for the next section header (e.g., \nTASKS: or \nASSUMPTIONS:)
    // If not found, take the rest of the block
    const nextLabelMatch = block.slice(start).match(/\n[A-Z_]+:/);
    if (!nextLabelMatch) return block.slice(start).trim();

    const nextLabelIndex = nextLabelMatch.index;
    return block.slice(start, start + nextLabelIndex!).trim();
}
