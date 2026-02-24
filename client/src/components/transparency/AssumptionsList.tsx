import React from 'react';

interface AssumptionsListProps {
    assumptions: string;
}

export const AssumptionsList: React.FC<AssumptionsListProps> = ({ assumptions }) => {
    if (assumptions === undefined || assumptions === null) return null;

    // Ensure we have a string to work with
    const rawAssumptions = typeof assumptions === 'string'
        ? assumptions
        : Array.isArray(assumptions)
            ? (assumptions as any[]).join('\n')
            : JSON.stringify(assumptions);

    const isNone = rawAssumptions.trim().toLowerCase() === 'none' ||
        rawAssumptions.trim().toLowerCase() === 'none.' ||
        rawAssumptions.trim() === '';

    return (
        <div className="mb-2 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <h4 className="text-[10px] font-bold text-amber-600 uppercase tracking-[0.2em] mb-2.5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]"></span>
                Assumptions
            </h4>
            {isNone ? (
                <p className="text-[11px] text-gray-400 font-medium italic pl-3.5 tracking-tight">No explicit assumptions defined for this task.</p>
            ) : (
                <div className="text-sm text-gray-600 pl-3.5 border-l-2 border-amber-100 whitespace-pre-wrap leading-relaxed font-semibold">
                    {rawAssumptions}
                </div>
            )}
        </div>
    );
};
