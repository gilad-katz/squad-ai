import React, { useState } from 'react';
import type { TransparencyData, FileAction } from '../../types';
import { ChevronRight, ChevronDown, FileCode, Layers } from 'lucide-react';
import { TaskList } from './TaskList';

interface TransparencyPanelProps {
    data: TransparencyData;
    isStreaming?: boolean;
    fileActions?: FileAction[];
}

export const TransparencyPanel: React.FC<TransparencyPanelProps> = ({ data, isStreaming, fileActions = [] }) => {
    const [isOpen, setIsOpen] = useState(isStreaming || false);

    React.useEffect(() => {
        if (isStreaming) setIsOpen(true);
    }, [isStreaming]);

    if (!data) return null;

    const mergedFileActions = fileActions || [];
    const hasFiles = mergedFileActions.length > 0;

    return (
        <div className="bg-gray-900 text-gray-300 rounded-xl overflow-hidden shadow-2xl border border-gray-800 my-4 animate-slide-up">
            {/* Header / Title Section */}
            <div className="p-5 border-b border-gray-800 bg-gray-900/50 backdrop-blur-md">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                        {data.title || 'Executing Task'}
                    </h3>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed font-medium">
                    {data.reasoning || 'Analyzing requirements and planning implementation steps.'}
                </p>
            </div>

            {/* Files Edited Section */}
            {hasFiles && (
                <div className="px-5 py-4 border-b border-gray-800/60 bg-gray-900/20">
                    <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        Files Edited
                    </h4>
                    <div className="flex flex-wrap gap-3">
                        {mergedFileActions.map((fa, i) => (
                            <div key={fa.id || i} className="flex items-center gap-2 bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-1.5 hover:bg-gray-800 transition-colors group cursor-default">
                                <FileCode className={`w-3.5 h-3.5 ${fa.action === 'created' ? 'text-blue-400' : 'text-amber-400'}`} />
                                <span className="text-xs font-semibold text-gray-300 group-hover:text-white transition-colors">{fa.filename}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Expandable Progress List */}
            <div className="bg-gray-900/40">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full flex items-center justify-between px-5 py-3 text-xs font-bold text-gray-500 hover:text-gray-300 transition-colors outline-none group"
                >
                    <div className="flex items-center gap-2">
                        <Layers className="w-3.5 h-3.5" />
                        <span className="uppercase tracking-widest">Progress Updates</span>
                        <span className="bg-gray-800 text-gray-400 rounded-full px-2 py-0.5 text-[10px] ml-1 group-hover:bg-gray-700 group-hover:text-white transition-colors">{data.tasks?.length || 0}</span>
                    </div>
                    {isOpen ? (
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
                            Collapse all <ChevronDown className="w-3.5 h-3.5" />
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
                            Expand all <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                    )}
                </button>

                <div
                    className={`transition-all duration-300 ease-in-out ${isOpen ? 'opacity-100 max-h-[800px]' : 'opacity-0 max-h-0'} overflow-hidden`}
                >
                    <div className="px-5 pb-6 pt-2">
                        <TaskList tasks={data.tasks} />
                    </div>
                </div>
            </div>
        </div>
    );
};
