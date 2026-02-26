import type { PipelineContext } from '../types/pipeline';
import type { PhaseState } from '../types/events';

export function emitPhase(ctx: PipelineContext, phase: PhaseState, detail?: string, thought?: string): void {
    ctx.events.emit({ type: 'phase', phase, detail, thought });

    if (phase === 'ready') return;
    if (!detail && !thought) return;

    const last = ctx.phaseThoughts[ctx.phaseThoughts.length - 1];
    if (last?.phase === phase) {
        last.detail = detail || last.detail;
        last.text = thought || last.text;
        last.timestamp = Date.now();
        return;
    }

    ctx.phaseThoughts.push({
        phase,
        detail,
        text: thought,
        timestamp: Date.now(),
    });
}
