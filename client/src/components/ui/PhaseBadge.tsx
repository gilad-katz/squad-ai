import React from 'react';
import type { PhaseState } from '../../types';
import { Clock, PlayCircle, Code2, MessageSquare } from 'lucide-react';

interface PhaseBadgeProps {
    phase: PhaseState;
}

export const PhaseBadge: React.FC<PhaseBadgeProps> = ({ phase }) => {
    const config = {
        ready: { label: 'READY', color: 'bg-gray-100 text-gray-700 border-gray-200', Icon: PlayCircle },
        thinking: { label: 'THINKING', color: 'bg-amber-100 text-amber-700 border-amber-200', Icon: Clock },
        building: { label: 'BUILDING', color: 'bg-blue-100 text-blue-700 border-blue-200', Icon: Code2 },
        responding: { label: 'RESPONDING', color: 'bg-green-100 text-green-700 border-green-200', Icon: MessageSquare },
    };

    const { label, color, Icon } = config[phase];

    return (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold tracking-wide ${color}`} role="status" aria-label={`Current phase: ${label}`}>
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            {label}
        </div>
    );
};
