import { describe, it, expect } from 'vitest';
import { parseTransparency } from './parseTransparency';

describe('parseTransparency', () => {
    it('returns null if no transparency block is present', () => {
        const text = 'Here is some text with no block.';
        expect(parseTransparency(text)).toBeNull();
    });

    it('parses a valid transparency block', () => {
        const text = `
Here is a message.
TRANSPARENCY_START
REASONING:
I am thinking about this.
TASKS:
[{"id": 1, "description": "task 1", "status": "done"}]
ASSUMPTIONS:
No assumptions made
TRANSPARENCY_END
Some trailing text.
`;
        const result = parseTransparency(text);
        expect(result).not.toBeNull();
        expect(result?.reasoning).toBe('I am thinking about this.');
        expect(result?.tasks).toHaveLength(1);
        expect(result?.tasks[0].description).toBe('task 1');
        expect(result?.assumptions).toBe('No assumptions made');
    });

    it('handles malformed JSON in tasks gracefully', () => {
        const text = `
TRANSPARENCY_START
REASONING:
Test.
TASKS:
This is not JSON
ASSUMPTIONS:
None
TRANSPARENCY_END
`;
        const result = parseTransparency(text);
        expect(result?.tasks).toHaveLength(1);
        expect(result?.tasks[0].description).toBe('This is not JSON');
        expect(result?.tasks[0].status).toBe('done');
    });
});
