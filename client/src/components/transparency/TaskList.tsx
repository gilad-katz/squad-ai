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
        <div className="mb-6">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 items-center flex gap-1.5">
                Tasks <span className="bg-gray-200 text-gray-600 rounded-full px-2 py-0.5 text-[10px]">{tasks.length}</span>
            </h4>
            <ul className="space-y-2.5">
                {tasks.map((task, idx) => (
                    <li key={task.id || idx} className="flex gap-3 text-sm text-gray-700">
                        <div className="mt-0.5" aria-hidden="true" title={`Status: ${task.status}`}>
                            {getStatusIcon(task.status)}
                        </div>
                        <span className={`leading-snug ${task.status === 'done' ? 'text-gray-500 line-through decoration-gray-300' : ''}`}>
                            {task.description}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
};
