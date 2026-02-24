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

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({ phase, onNewSession }) => {
    const previewUrl = useSessionStore(state => state.previewUrl);

    return (
        <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between z-10">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg" aria-hidden="true">
                    FE
                </div>
                <div>
                    <EditableTitle />
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>Senior Frontend Developer</span>
                        <span className="text-gray-300" aria-hidden="true">•</span>
                        <div className="flex gap-1">
                            <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">React 18</span>
                            <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">TypeScript</span>
                            <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Tailwind</span>
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
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition-colors border border-blue-200"
                    >
                        <ExternalLink className="w-4 h-4" />
                        View App
                    </a>
                )}
                <GitHeaderButton />
                <SessionSwitcher />
                <PhaseBadge phase={phase} />
                <button
                    onClick={onNewSession}
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200"
                >
                    New Session
                </button>
            </div>
        </header>
    );
};

