export type PhaseState = 'ready' | 'thinking' | 'building' | 'responding';

export interface TransparencyData {
    reasoning: string;
    tasks: Array<{ id: number; description: string; status: 'done' | 'in_progress' | 'pending' }>;
    assumptions: string;
}

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;                 // raw (may contain TRANSPARENCY block)
    displayContent: string;          // stripped of TRANSPARENCY block
    transparency: TransparencyData | null;
    status: 'complete' | 'streaming' | 'error';
    timestamp: number;
}
