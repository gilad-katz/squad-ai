// ─── Pipeline Engine ─────────────────────────────────────────────────────────
// Orchestrates phases in sequence, supporting loops (go back to a prior phase)
// and early termination.

import type { Phase, PhaseResult, PipelineContext } from '../types/pipeline';

export class PipelineEngine {
    private phases: Phase[] = [];

    /**
     * Add a phase to the pipeline. Phases execute in the order they are added.
     * Returns `this` for chaining.
     */
    addPhase(phase: Phase): this {
        this.phases.push(phase);
        return this;
    }

    /**
     * Run the full pipeline. Phases execute in order unless a phase returns:
     * - `continue`: proceed to next phase
     * - `skip`: same as continue (semantic difference for readability)
     * - `loop`: jump back to a named phase (enables recursive loops)
     * - `abort`: stop the pipeline immediately
     */
    async run(ctx: PipelineContext): Promise<void> {
        let phaseIndex = 0;

        while (phaseIndex < this.phases.length) {
            const phase = this.phases[phaseIndex];

            let result: PhaseResult;
            try {
                result = await phase.execute(ctx);
            } catch (err: any) {
                console.error(`Phase "${phase.name}" threw an error:`, err);
                result = { status: 'abort', reason: err.message || 'Unknown phase error' };
            }

            switch (result.status) {
                case 'continue':
                case 'skip':
                    phaseIndex++;
                    break;

                case 'loop': {
                    const targetIndex = this.phases.findIndex(p => p.name === result.target);
                    if (targetIndex === -1) {
                        console.error(`Loop target "${result.target}" not found in pipeline. Aborting.`);
                        return;
                    }
                    phaseIndex = targetIndex;
                    break;
                }

                case 'abort':
                    console.log(`Pipeline aborted at phase "${phase.name}": ${result.reason}`);
                    return;
            }

            // Safety: check if the SSE connection is still alive
            if (!ctx.events.isActive) {
                console.log('Client disconnected, stopping pipeline.');
                return;
            }
        }
    }
}
