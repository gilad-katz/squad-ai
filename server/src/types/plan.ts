// ─── Execution Plan Types ────────────────────────────────────────────────────
// Shared types for the orchestrator plan and task dispatch.

export type TaskType = 'chat' | 'create_file' | 'edit_file' | 'delete_file' | 'generate_image' | 'git_action';

export interface TaskChat {
    type: 'chat';
    content: string;
}

export interface TaskCreateFile {
    type: 'create_file';
    filepath: string;
    prompt: string;
    /** Optional batch group id for tightly coupled files */
    batch_id?: string;
    /** REQ-2.2: Human-readable purpose of this file */
    purpose?: string;
    /** REQ-2.2: File paths this task depends on */
    depends_on?: string[];
    /** REQ-2.2: File paths that consume this task's output */
    feeds_into?: string[];
}

export interface TaskEditFile {
    type: 'edit_file';
    filepath: string;
    prompt: string;
    /** Optional batch group id for tightly coupled files */
    batch_id?: string;
    /** REQ-2.2: Human-readable purpose of this edit */
    purpose?: string;
    /** REQ-2.2: File paths this task depends on */
    depends_on?: string[];
    /** REQ-2.2: File paths that consume this task's output */
    feeds_into?: string[];
}

export interface TaskDeleteFile {
    type: 'delete_file';
    filepath: string;
}

export interface TaskGenerateImage {
    type: 'generate_image';
    filepath: string;
    prompt: string;
    /** Optional batch group id for tightly coupled asset sets */
    batch_id?: string;
    /** Optional dependencies for generation ordering */
    depends_on?: string[];
}

export interface TaskGitAction {
    type: 'git_action';
    command: string;
}

export type ExecutionTask = TaskChat | TaskCreateFile | TaskEditFile | TaskDeleteFile | TaskGenerateImage | TaskGitAction;

export interface ExecutionPlan {
    title?: string;
    reasoning: string;
    assumptions?: string;
    /** REQ-2.3: Design decisions with rationale */
    design_decisions?: Array<{
        question: string;
        chosen: string;
        alternatives?: string[];
    }>;
    tasks: ExecutionTask[];
}

// ─── Transparency Types ─────────────────────────────────────────────────────

export type TransparencyTaskStatus = 'pending' | 'in_progress' | 'done';

export interface TransparencyTask {
    id: number;
    description: string;
    status: TransparencyTaskStatus;
    /** Index in the original plan.tasks array (internal only, not sent to client) */
    _planIndex: number;
}

export interface TransparencyData {
    title: string;
    reasoning: string;
    tasks: Array<{ id: number; description: string; status: TransparencyTaskStatus }>;
    assumptions: string;
}
