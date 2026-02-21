import React, { useState } from 'react';
import type { TransparencyData } from '../../types';
import { ChevronRight, ChevronDown, Eye } from 'lucide-react';
import { ReasoningSection } from './ReasoningSection';
import { TaskList } from './TaskList';
import { AssumptionsList } from './AssumptionsList';

interface TransparencyPanelProps {
    data: TransparencyData;
    isStreaming?: boolean;
}

export const TransparencyPanel: React.FC<TransparencyPanelProps> = ({ data, isStreaming }) => {
    // Auto-expand if we are currently streaming the reasoning
    const [isOpen, setIsOpen] = useState(isStreaming || false);

    // Also auto-expand if streaming starts after mount (unlikely but safe)
    React.useEffect(() => {
        if (isStreaming) setIsOpen(true);
    }, [isStreaming]);

    if (!data) return null;

    return (
        <div className="bg-gray-50 overflow-hidden text-left">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors focus:ring-2 focus:ring-inset focus:ring-blue-500 outline-none"
                aria-expanded={isOpen}
            >
                <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-blue-500" />
                    <span>{isOpen ? 'Hide reasoning' : 'Show reasoning'} <span className="text-gray-400 font-normal ml-1">({data.tasks?.length || 0} tasks)</span></span>
                </div>
                {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
            </button>

            <div
                className={`transition-all duration-300 ease-in-out ${isOpen ? 'opacity-100' : 'opacity-0 max-h-0'}`}
                style={{
                    maxHeight: isOpen ? '2000px' : '0' // using inline style over class for smoother generic height
                }}
            >
                <div className="px-5 py-4 border-t border-gray-100 bg-[#F4F4F5] rounded-b-sm">
                    <ReasoningSection reasoning={data.reasoning} />
                    <TaskList tasks={data.tasks} />
                    <AssumptionsList assumptions={data.assumptions} />
                </div>
            </div>
        </div>
    );
};
