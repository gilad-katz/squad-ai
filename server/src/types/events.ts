// ─── SSE Event Types ─────────────────────────────────────────────────────────
// Typed union for all server-sent events. Provides compile-time safety for emit().

import type { TransparencyData } from './plan';

// ─── Phase States ────────────────────────────────────────────────────────────

export type PhaseState =
    | 'thinking'
    | 'planning'
    | 'installing'
    | 'executing'
    | 'verifying'
    | 'repairing'
    | 'responding'
    | 'ready';

// ─── File Action Event ───────────────────────────────────────────────────────

export type FileActionStatus = 'executing' | 'complete';

export interface FileActionEvent {
    type: 'file_action';
    id: string;
    filename: string;
    filepath: string;
    language: string;
    action: 'created' | 'edited' | 'deleted';
    content: string;
    linesAdded: number;
    linesRemoved: number;
    diff: string | null;
    status: FileActionStatus;
    prompt?: string;  // For image generation tasks
}

// ─── Git Result Event ────────────────────────────────────────────────────────

export interface GitResultEvent {
    type: 'git_result';
    id: string;
    index: number;
    output?: string;
    error?: string;
    command?: string;
    action?: string;
}

// ─── SSE Event Union ─────────────────────────────────────────────────────────

export type SSEEvent =
    | { type: 'session'; sessionId: string }
    | { type: 'phase'; phase: PhaseState; detail?: string; elapsed_ms?: number }
    | { type: 'delta'; text: string }
    | { type: 'transparency'; data: TransparencyData }
    | FileActionEvent
    | GitResultEvent
    | { type: 'preview'; url: string }
    | { type: 'metadata'; data: { title?: string } }
    | { type: 'summary'; text: string }
    | { type: 'error'; message: string }
    | { type: 'done'; usage: any; sessionId: string };
