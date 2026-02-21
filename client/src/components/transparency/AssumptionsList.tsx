import React from 'react';

interface AssumptionsListProps {
    assumptions: string;
}

export const AssumptionsList: React.FC<AssumptionsListProps> = ({ assumptions }) => {
    if (!assumptions) return null;

    const isNone = assumptions.trim().toLowerCase() === 'none' || assumptions.trim().toLowerCase() === 'none.';

    return (
        <div className="mb-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Assumptions
            </h4>
            {isNone ? (
                <p className="text-sm text-gray-500 italic">No assumptions made</p>
            ) : (
                <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {assumptions}
                </div>
            )}
        </div>
    );
};
