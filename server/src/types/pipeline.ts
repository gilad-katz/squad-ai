// ─── Pipeline Types ──────────────────────────────────────────────────────────
// Shared context and interfaces for the phase-based pipeline engine.

import type { EventBus } from '../pipeline/EventBus';
import type { ProjectMemory } from '../services/projectMemory';
import type { ExecutionPlan, TransparencyTask } from './plan';
import type { FileActionEvent, GitResultEvent, PhaseState } from './events';

// ─── Client Message (from request body) ─────────────────────────────────────

export interface ClientAttachment {
    id: string;
    type: 'image' | 'file';
    mimeType: string;
    data: string;  // base64
    name?: string;
}

export interface ClientMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    status?: string;
    timestamp?: number;
    attachments?: ClientAttachment[];
    summary?: string;
    transparency?: any;
    fileActions?: any[];
    serverFileActions?: any[];
    gitActions?: any[];
    phaseThoughts?: Array<{
        phase: PhaseState;
        detail?: string;
        text?: string;
        timestamp: number;
    }>;
}

// ─── Gemini API Format ──────────────────────────────────────────────────────

export interface GeminiPart {
    text?: string;
    inlineData?: { data: string; mimeType: string };
}

export interface GeminiContent {
    role: 'user' | 'model';
    parts: GeminiPart[];
}

// ─── Pipeline Context ───────────────────────────────────────────────────────
// Shared mutable state passed through all phases.

export interface PipelineContext {
    /** Workspace session ID */
    sessionId: string;

    /** Raw messages from the client */
    messages: ClientMessage[];

    /** Messages converted to Gemini API format */
    geminiContents: GeminiContent[];

    /** Absolute path to the workspace directory */
    workspaceDir: string;

    /** Whether this is a newly created workspace */
    isNewSession: boolean;

    /** Orchestrator execution plan (set by PlanPhase) */
    plan: ExecutionPlan | null;

    /** Transparency task list (set by ExecutePhase) */
    transparencyTasks: TransparencyTask[];

    /** Typed SSE event emitter */
    events: EventBus;

    /** Persistent project memory */
    memory: ProjectMemory;

    /** Existing files in workspace (set by PlanPhase) */
    existingFiles: string[];

    /** Completed file action results (accumulated during execution) */
    completedFileActions: FileActionEvent[];

    /** Completed git/shell action results (accumulated during execution) */
    completedGitActions: GitResultEvent[];

    /** Persisted phase thought entries for post-run history restoration */
    phaseThoughts: Array<{
        phase: PhaseState;
        detail?: string;
        text?: string;
        timestamp: number;
    }>;

    /** Verification errors from the last verify cycle (set by VerifyPhase) */
    verificationErrors: {
        lintResults: any[];
        tscErrors: string[];
        missingImportErrors: string[];
    } | null;

    /** REQ-4.5: Timestamp when the current phase started */
    phaseStartTime: number;

    /** REQ-4.5: Timestamp when the entire pipeline started */
    pipelineStartTime: number;
}

// ─── Phase Interface ────────────────────────────────────────────────────────

export type PhaseResult =
    | { status: 'continue' }
    | { status: 'skip' }
    | { status: 'loop'; target: string }
    | { status: 'abort'; reason: string };

export interface Phase {
    /** Unique name for this phase (used for loop targets) */
    name: string;

    /** Execute the phase logic. Returns a result indicating what to do next. */
    execute(ctx: PipelineContext): Promise<PhaseResult>;
}
