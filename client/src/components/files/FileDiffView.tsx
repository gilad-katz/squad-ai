import React from 'react';

interface FileDiffViewProps {
    diff: string;
}

export const FileDiffView: React.FC<FileDiffViewProps> = ({ diff }) => {
    const lines = diff.split('\n');

    return (
        <div className="font-mono text-sm leading-6 overflow-x-auto">
            {lines.map((line, i) => {
                let bgClass = '';
                let textClass = 'text-gray-300';

                if (line.startsWith('+') && !line.startsWith('+++')) {
                    bgClass = 'bg-emerald-900/30';
                    textClass = 'text-emerald-300';
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                    bgClass = 'bg-red-900/30';
                    textClass = 'text-red-300';
                } else if (line.startsWith('@@')) {
                    bgClass = 'bg-blue-900/20';
                    textClass = 'text-blue-400';
                } else if (line.startsWith('---') || line.startsWith('+++')) {
                    textClass = 'text-gray-500';
                }

                return (
                    <div key={i} className={`flex ${bgClass} hover:bg-white/5 transition-colors`}>
                        <span className="w-12 flex-shrink-0 text-right pr-3 text-gray-600 select-none border-r border-gray-700/50">
                            {i + 1}
                        </span>
                        <span className={`pl-3 pr-4 whitespace-pre ${textClass}`}>
                            {line}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};
