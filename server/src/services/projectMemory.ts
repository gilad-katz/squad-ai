// ─── Project Memory Service ──────────────────────────────────────────────────
// Reads/writes a persistent `project_context.md` file in each workspace.
// Injected into orchestrator and executor prompts for cross-turn continuity.

import fs from 'fs';
import path from 'path';

const WORKSPACE_ROOT = path.join(__dirname, '../../workspace');

export class ProjectMemory {
    private filePath: string;

    constructor(sessionId: string) {
        const workspaceDir = path.join(WORKSPACE_ROOT, sessionId);
        this.filePath = path.join(workspaceDir, 'project_context.md');
    }

    /**
     * Read the full project context file. Returns null if it doesn't exist.
     */
    read(): string | null {
        try {
            if (fs.existsSync(this.filePath)) {
                return fs.readFileSync(this.filePath, 'utf8');
            }
        } catch (err) {
            console.error('Failed to read project context:', err);
        }
        return null;
    }

    /**
     * Write the full project context file (overwrite).
     */
    write(content: string): void {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, content, 'utf8');
        } catch (err) {
            console.error('Failed to write project context:', err);
        }
    }

    /**
     * Append a section or update an existing section in the project context.
     * Sections are identified by their `## Heading` markdown headers.
     */
    updateSection(heading: string, content: string): void {
        const current = this.read() || '# Project Context\n';
        const sectionRegex = new RegExp(`(## ${heading}\\n)([\\s\\S]*?)(?=\\n## |$)`, 'm');

        if (sectionRegex.test(current)) {
            // Replace existing section
            const updated = current.replace(sectionRegex, `## ${heading}\n${content}\n`);
            this.write(updated);
        } else {
            // Append new section
            this.write(`${current.trimEnd()}\n\n## ${heading}\n${content}\n`);
        }
    }

    /**
     * Add a decision to the "Decisions Made" section.
     */
    addDecision(decision: string): void {
        const current = this.read() || '# Project Context\n';
        const section = this.getSection('Decisions Made');
        const decisions = section ? `${section}\n- ${decision}` : `- ${decision}`;
        this.updateSection('Decisions Made', decisions);
    }

    /**
     * Add a component to the "Components Built" section.
     */
    addComponent(name: string, purpose: string): void {
        const section = this.getSection('Components Built');
        const entry = `- **${name}**: ${purpose}`;
        const components = section ? `${section}\n${entry}` : entry;
        this.updateSection('Components Built', components);
    }

    /**
     * Get a specific section's content by heading.
     */
    getSection(heading: string): string | null {
        const current = this.read();
        if (!current) return null;

        const sectionRegex = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`, 'm');
        const match = current.match(sectionRegex);
        return match ? match[1].trim() : null;
    }

    /**
     * Format the project context as a prompt injection string.
     * Returns empty string if no context exists.
     */
    toPromptContext(): string {
        const content = this.read();
        if (!content) return '';
        return `\n\nPROJECT CONTEXT (persistent knowledge from previous turns):\n${content}`;
    }

    /** Check if a project context file exists */
    exists(): boolean {
        return fs.existsSync(this.filePath);
    }
}
