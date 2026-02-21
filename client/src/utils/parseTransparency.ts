import type { TransparencyData } from '../types';

export function parseTransparency(raw: string): TransparencyData | null {
    const match = raw.match(/TRANSPARENCY_START([\s\S]*?)TRANSPARENCY_END/);
    if (!match) return null;

    const block = match[1];

    const reasoning = extractSection(block, 'REASONING:');
    const tasksRaw = extractSection(block, 'TASKS:');
    const assumptions = extractSection(block, 'ASSUMPTIONS:');

    let tasks: TransparencyData['tasks'] = [];
    try {
        tasks = JSON.parse(tasksRaw);
    } catch {
        tasks = [{ id: 1, description: tasksRaw, status: 'done' }];
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
