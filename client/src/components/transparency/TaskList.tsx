import React from 'react';
import { CheckCircle2, CircleDashed, PlayCircle } from 'lucide-react';

interface TaskListProps {
    tasks: Array<{ id: number; description: string; status: 'done' | 'in_progress' | 'pending' }>;
}

export const TaskList: React.FC<TaskListProps> = ({ tasks }) => {
    if (!tasks || tasks.length === 0) return null;

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'done':
                return <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />;
            case 'in_progress':
                return <PlayCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />;
            case 'pending':
            default:
                return <CircleDashed className="w-4 h-4 text-gray-400 flex-shrink-0" />;
        }
    };

    return (
        <div className="mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <h4 className="text-[10px] font-bold text-indigo-600 uppercase tracking-[0.2em] mb-4 items-center flex gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(79,70,229,0.4)]"></span>
                Task Breakdown <span className="bg-indigo-50 text-indigo-600 rounded-lg px-2 py-0.5 text-[9px] font-black leading-none">{tasks.length}</span>
            </h4>
            <ul className="space-y-3 pl-1">
                {tasks.map((task, idx) => (
                    <li key={task.id || idx} className="flex gap-3 text-sm text-gray-700 items-start group">
                        <div className="mt-0.5 transition-transform group-hover:scale-110 duration-200" aria-hidden="true" title={`Status: ${task.status}`}>
                            {getStatusIcon(task.status)}
                        </div>
                        <span className={`leading-relaxed transition-colors ${task.status === 'done' ? 'text-gray-400 line-through decoration-gray-200 font-medium' : 'text-gray-700 font-semibold'}`}>
                            {task.description}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
};
