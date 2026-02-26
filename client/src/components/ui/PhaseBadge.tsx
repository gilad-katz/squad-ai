import React from 'react';
import type { PhaseState } from '../../types';
import { Clock, PlayCircle, Code2, MessageSquare, Package, ShieldCheck, Wrench, FileText } from 'lucide-react';

interface PhaseBadgeProps {
    phase: PhaseState;
    detail?: string;
}

export const PhaseBadge: React.FC<PhaseBadgeProps> = ({ phase, detail }) => {
    const config: Record<PhaseState, { label: string; color: string; Icon: typeof PlayCircle }> = {
        ready: { label: 'READY', color: 'bg-gray-100 text-gray-700 border-gray-200', Icon: PlayCircle },
        thinking: { label: 'THINKING', color: 'bg-amber-100 text-amber-700 border-amber-200', Icon: Clock },
        planning: { label: 'PLANNING', color: 'bg-purple-100 text-purple-700 border-purple-200', Icon: Clock },
        installing: { label: 'INSTALLING', color: 'bg-indigo-100 text-indigo-700 border-indigo-200', Icon: Package },
        executing: { label: 'EXECUTING', color: 'bg-blue-100 text-blue-700 border-blue-200', Icon: Code2 },
        verifying: { label: 'VERIFYING', color: 'bg-cyan-100 text-cyan-700 border-cyan-200', Icon: ShieldCheck },
        repairing: { label: 'REPAIRING', color: 'bg-orange-100 text-orange-700 border-orange-200', Icon: Wrench },
        summary: { label: 'SUMMARY', color: 'bg-teal-100 text-teal-700 border-teal-200', Icon: FileText },
        building: { label: 'BUILDING', color: 'bg-blue-100 text-blue-700 border-blue-200', Icon: Code2 },
        responding: { label: 'RESPONDING', color: 'bg-green-100 text-green-700 border-green-200', Icon: MessageSquare },
    };

    const fallback = { label: phase?.toUpperCase() ?? 'UNKNOWN', color: 'bg-gray-100 text-gray-700 border-gray-200', Icon: PlayCircle };
    const { label, color, Icon } = config[phase] ?? fallback;

    return (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold tracking-wide ${color}`} role="status" aria-label={`Current phase: ${label}`}>
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            {detail || label}
        </div>
    );
};
