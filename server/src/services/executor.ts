import { ai } from './gemini';

const EXECUTOR_PROMPT = `You are a Best-in-Class Senior Frontend Developer execution agent.
Your sole purpose is to output RAW SOURCE CODE based on the user's prompt and the codebase context.
You MUST NOT output any markdown blocks (e.g., \`\`\`typescript ... \`\`\`).
You MUST NOT output any conversational text, explanations, or warnings.
Your entire return string must be the valid, raw code to be saved directly to the file.

PROFESSIONAL STANDARDS:
- **Engineering Excellence**: Write clean, DRY, and SOLID code. Use modern React patterns (Hooks, functional components).
- **Design Fidelity**: If a design or screenshot is provided, match it with high precision. Aim for premium "Apple-like" aesthetics: logical grouping, generous whitespace, curated color palettes, and smooth transitions.
- **Robustness**: Implement proper error boundaries, loading states, and edge-case handling.
- **Accessibility**: Use semantic HTML and appropriate ARIA roles.
- **Type Safety**: All TypeScript must be strictly typed. Avoid \`any\`.

STACK DEFAULTS:
- Use React, TypeScript, and Vanilla CSS (no Tailwind unless explicitly requested).

VISUAL CONTEXT (CRITICAL):
- If the chat history contains user-provided images (screenshots), pay close attention to them.
- If the user says "fix this" or "it should look like this", use the visual cues from the image (colors, layout, spacing, components) as your primary design reference.
- Aim for high fidelity to the visual evidence provided in the history.

EXPORT CONVENTION:
- ALL React components MUST use NAMED exports: \`export function ComponentName() { ... }\`
- The ONLY exception is App.tsx which uses: \`export default function App() { ... }\`
- NEVER use \`export default\` for any other component.

STYLING CONVENTION:
- Use vanilla CSS with inline styles or CSS imported from separate .css files.
- The project already has \`src/index.css\` with CSS reset and base styles.
- **Strict Styling**: If you import a CSS file (e.g., \`import "./Button.css"\`), you MUST verify that \`src/components/Button.css\` exists in the MANIFEST below. If it doesn't, do NOT import it.

PRE-FLIGHT CHECKLIST (MANDATORY):
Before outputting code, mentally verify:
1. **Import Honesty**: Are you importing any file that is NOT in the MANIFEST below? If so, remove the import or fix it to a file that does exist.
2. **Export Accuracy**: Are your exports named correctly and consistently?
3. **Logic Completeness**: Are all functions fully implemented? No placeholders.
4. **Visual Excellence**: Does this code represent a premium, world-class UI?

IMAGE RULE (STRICT):
- NEVER use external image URLs. Use inline SVGs, CSS gradients, or local path references (e.g., \`/images/hero.jpg\`).

CRITICAL: When importing from other project files, you MUST use the EXACT file paths provided in the PROJECT FILE MANIFEST below. Match the exact filenames and directory structure listed.
- If you are generating \`src/App.tsx\`, sibling directories like \`src/components\` must be imported as \`./components/FileName\` — NEVER \`../components/FileName\`.
- Always use the \`.tsx\` convention for React components as listed in the manifest.
`;

// Timeout in milliseconds for a single executor call
const EXECUTOR_TIMEOUT_MS = 60_000; // 60 seconds

/**
 * Wrap a promise with a timeout. Rejects if the promise doesn't resolve in time.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms generating ${label}`)), ms);
        promise.then(
            (val) => { clearTimeout(timer); resolve(val); },
            (err) => { clearTimeout(timer); reject(err); }
        );
    });
}

/**
 * Execute a specific file generation task using a highly constrained prompt.
 */
export async function executeFileAction(
    chatHistory: any[],
    sessionId: string,
    filepath: string,
    prompt: string,
    fileManifest?: string[]
): Promise<string> {
    // Build file manifest context so the executor knows all sibling file paths
    const manifestSection = fileManifest && fileManifest.length > 0
        ? `\n\nPROJECT FILE MANIFEST (use these EXACT paths for imports):\n${fileManifest.map(f => `- ${f}`).join('\n')}`
        : '';

    // Append the specific task to the end of the history
    const contents = [
        ...chatHistory,
        {
            role: 'user',
            parts: [{ text: `TASK: Generate complete code for ${filepath}.\nREQUIREMENTS: ${prompt}` }]
        }
    ];

    const apiCall = ai.models.generateContent({
        model: process.env.MODEL_ID || 'gemini-2.5-flash',
        contents,
        config: {
            systemInstruction: EXECUTOR_PROMPT + manifestSection + `\n\nActive Session ID: ${sessionId}`
        }
    });

    const response = await withTimeout(apiCall, EXECUTOR_TIMEOUT_MS, filepath);

    const candidate = response.candidates?.[0];
    let code = candidate?.content?.parts?.[0]?.text || '';

    // Strip aggressive markdown fences if the LLM accidentally leaked them (common issue)
    code = code.trim();
    if (code.startsWith('```')) {
        const firstNewline = code.indexOf('\n');
        if (firstNewline !== -1) {
            code = code.slice(firstNewline + 1);
        }
    }
    if (code.endsWith('```')) {
        const lastNewline = code.lastIndexOf('\n```');
        if (lastNewline !== -1) {
            code = code.slice(0, lastNewline);
        } else if (code.endsWith('\n```')) {
            code = code.slice(0, -4);
        } else {
            code = code.slice(0, -3);
        }
    }

    return code.trim();
}

/**
 * Run promises with a concurrency limit.
 * Instead of firing all N tasks at once, limits to `limit` concurrent executions.
 */
export async function runWithConcurrency<T>(
    tasks: (() => Promise<T>)[],
    limit: number
): Promise<PromiseSettledResult<T>[]> {
    const results: PromiseSettledResult<T>[] = new Array(tasks.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < tasks.length) {
            const i = nextIndex++;
            try {
                const val = await tasks[i]();
                results[i] = { status: 'fulfilled', value: val };
            } catch (err: any) {
                results[i] = { status: 'rejected', reason: err };
            }
        }
    }

    // Spin up `limit` concurrent workers
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
    await Promise.all(workers);
    return results;
}
