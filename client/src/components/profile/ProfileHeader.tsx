import { PhaseBadge } from '../ui/PhaseBadge';
import { GitHeaderButton } from '../settings/GitSettings';
import type { PhaseState } from '../../types';
import { useSessionStore } from '../../store/session';
import { ExternalLink } from 'lucide-react';
import { EditableTitle } from './EditableTitle';
import { SessionSwitcher } from './SessionSwitcher';

interface ProfileHeaderProps {
    phase: PhaseState;
    onNewSession?: () => void;
}

function AgentIcon({ agent, active }: { agent: 'pm' | 'fe'; active: boolean }) {
    const config = agent === 'pm'
        ? { label: 'PM', from: 'from-purple-600', to: 'to-pink-500', shadow: 'shadow-purple-500/20' }
        : { label: 'FE', from: 'from-blue-600', to: 'to-indigo-700', shadow: 'shadow-blue-500/20' };

    return (
        <div
            className={`w-9 h-9 rounded-xl bg-gradient-to-br ${config.from} ${config.to} text-white flex items-center justify-center font-bold text-sm shadow-lg ${config.shadow} transition-all duration-300 ${active ? 'ring-2 ring-offset-1 ring-current scale-105' : 'opacity-60'}`}
            aria-hidden="true"
            title={agent === 'pm' ? 'PM-AGENT-01 (Product Manager)' : 'FE-SENIOR-01 (Frontend Engineer)'}
        >
            {config.label}
        </div>
    );
}
export const ProfileHeader: React.FC<ProfileHeaderProps> = ({ phase, onNewSession }) => {
    const previewUrl = useSessionStore(state => state.previewUrl);
    const phaseDetail = useSessionStore(state => state.phaseDetail);
    const activeAgent = useSessionStore(state => state.activeAgent);

    return (
        <header className="fixed top-0 left-0 right-0 h-16 glass-effect px-6 flex items-center justify-between z-50 shadow-sm border-b border-gray-200/50">
            <div className="flex items-center gap-4 animate-fade-in">
                <div className="flex items-center gap-1.5">
                    <AgentIcon agent="pm" active={activeAgent === 'pm'} />
                    <AgentIcon agent="fe" active={activeAgent === 'fe'} />
                </div>
                <div>
                    <EditableTitle />
                    <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
                        <span>AI Product Team</span>
                        <span className="text-gray-300" aria-hidden="true">•</span>
                        <div className="flex gap-1.5">
                            <span className="px-2 py-0.5 bg-gray-100/80 rounded-full text-[11px] font-semibold tracking-wide text-gray-600 border border-gray-200/50">React 18</span>
                            <span className="px-2 py-0.5 bg-gray-100/80 rounded-full text-[11px] font-semibold tracking-wide text-gray-600 border border-gray-200/50">TypeScript</span>
                            <span className="px-2 py-0.5 bg-gray-100/80 rounded-full text-[11px] font-semibold tracking-wide text-gray-600 border border-gray-200/50">Tailwind</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3">
                {previewUrl && (
                    <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <ExternalLink className="w-4 h-4" />
                        View App
                    </a>
                )}
                <GitHeaderButton />
                <SessionSwitcher />
                <div className={phase === 'thinking' || phase === 'building' || phase === 'summary' ? 'animate-pulse-soft' : ''}>
                    <PhaseBadge phase={phase} detail={phaseDetail ?? undefined} />
                </div>
                <div className="w-px h-6 bg-gray-200 mx-1" aria-hidden="true" />
                <button
                    onClick={onNewSession}
                    className="text-sm font-semibold text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-all active:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-200"
                >
                    New Session
                </button>
            </div>
        </header>
    );
};
