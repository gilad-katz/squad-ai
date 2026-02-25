import React from 'react';
import { CheckCircle2, CircleDashed, PlayCircle, Timer } from 'lucide-react';

interface TaskListProps {
    tasks: Array<{ id: number; description: string; status: 'done' | 'in_progress' | 'pending' }>;
}

export const TaskList: React.FC<TaskListProps> = ({ tasks }) => {
    if (!tasks || tasks.length === 0) return null;

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'done':
                return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />;
            case 'in_progress':
                return <PlayCircle className="w-3.5 h-3.5 text-blue-400 animate-pulse flex-shrink-0" />;
            case 'pending':
            default:
                return <CircleDashed className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />;
        }
    };

    return (
        <div className="space-y-4 animate-fade-in">
            {tasks.map((task, idx) => (
                <div key={task.id || idx} className="flex gap-4 group">
                    <div className="flex flex-col items-center">
                        <span className="text-[11px] font-bold text-gray-500 mb-1.5">{idx + 1}</span>
                        <div className="w-px h-full bg-gray-800 group-last:hidden"></div>
                    </div>
                    <div className="flex-1 pb-4 group-last:pb-0">
                        <div className="flex items-start gap-3">
                            <div className="mt-1 transition-transform group-hover:scale-110 duration-200">
                                {getStatusIcon(task.status)}
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className={`text-sm leading-snug transition-colors ${task.status === 'done' ? 'text-gray-500' : 'text-gray-200 font-semibold'}`}>
                                    {task.description}
                                </span>
                                {task.status === 'in_progress' && (
                                    <div className="flex items-center gap-2 mt-1 px-2 py-1 bg-gray-800/80 rounded border border-gray-700/50 w-fit">
                                        <Timer className="w-3 h-3 text-blue-400" />
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Thought for 28s</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};
