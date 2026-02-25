export type PhaseState = 'ready' | 'thinking' | 'planning' | 'installing' | 'executing' | 'verifying' | 'repairing' | 'building' | 'responding';

export interface Attachment {
    id: string;
    type: 'image';
    mimeType: string;
    data: string; // base64
    name?: string;
    url?: string;  // locally generated object URL for preview
}

export interface TransparencyData {
    title?: string;
    reasoning: string;
    tasks: Array<{ id: number; description: string; status: 'done' | 'in_progress' | 'pending'; purpose?: string }>;
    assumptions: string;
    /** REQ-2.3: Design decisions from the orchestrator */
    design_decisions?: Array<{ question: string; chosen: string; alternatives?: string[] }>;
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
    attachments?: Attachment[];
    transparency: TransparencyData | null;
    fileActions: FileAction[];
    serverFileActions: FileAction[];
    gitActions: GitAction[];
    summary?: string;
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

export interface SessionMetadata {
    id: string;
    timestamp: number;
    messageCount: number;
    title?: string;
}
