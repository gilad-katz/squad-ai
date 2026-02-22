export type PhaseState = 'ready' | 'thinking' | 'planning' | 'executing' | 'building' | 'responding';

export interface TransparencyData {
    reasoning: string;
    tasks: Array<{ id: number; description: string; status: 'done' | 'in_progress' | 'pending' }>;
    assumptions: string;
}

export type FileActionType = 'created' | 'edited' | 'deleted';

export interface FileAction {
    id: string;
    filename: string;       // e.g. "Button.tsx"
    filepath: string;       // e.g. "src/components/Button.tsx"
    language: string;       // e.g. "typescriptreact"
    action: FileActionType;
    content: string;        // full file content (created/edited)
    diff?: string;          // unified diff (edited only)
    linesAdded: number;
    linesRemoved: number;
    warnings?: number;      // lint warning count (placeholder)
    status?: 'executing' | 'complete';
    prompt?: string;        // original prompt used for image generation
}

export interface GitAction {
    id: string;
    action: 'clone' | 'execute';
    command?: string;
    output?: string;
    error?: string;
}

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;                 // raw (may contain TRANSPARENCY / FILE_ACTIONS blocks)
    displayContent: string;          // stripped of structured blocks
    transparency: TransparencyData | null;
    fileActions: FileAction[];
    serverFileActions: FileAction[];
    gitActions: GitAction[];
    status: 'complete' | 'streaming' | 'error';
    timestamp: number;
}

export interface WorkspaceConfig {
    repoUrl: string;
    owner: string;
    repo: string;
    defaultBranch: string;
    connectedAt: string;
    githubToken?: string;
}
