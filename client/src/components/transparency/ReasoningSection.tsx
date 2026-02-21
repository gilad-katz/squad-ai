import React from 'react';

interface ReasoningSectionProps {
    reasoning: string;
}

export const ReasoningSection: React.FC<ReasoningSectionProps> = ({ reasoning }) => {
    if (!reasoning) return null;

    return (
        <div className="mb-6">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Reasoning
            </h4>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {reasoning}
            </p>
        </div>
    );
};
