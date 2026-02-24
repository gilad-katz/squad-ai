import React from 'react';

interface ReasoningSectionProps {
    reasoning: string;
}

export const ReasoningSection: React.FC<ReasoningSectionProps> = ({ reasoning }) => {
    if (!reasoning) return null;

    return (
        <div className="mb-6 animate-fade-in">
            <h4 className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em] mb-2.5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]"></span>
                Reasoning
            </h4>
            <p className="text-sm text-gray-600 italic leading-relaxed whitespace-pre-wrap pl-3.5 border-l-2 border-blue-100 font-medium">
                "{reasoning}"
            </p>
        </div>
    );
};
