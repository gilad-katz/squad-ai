import React, { useState } from 'react';
import type { GitAction } from '../../types';
import { ExternalLink } from 'lucide-react';
import { GitActionModal } from './GitActionModal';

interface GitActionCardProps {
    action: GitAction;
    isStreaming?: boolean;
}

export const GitActionCard: React.FC<GitActionCardProps> = ({ action, isStreaming }) => {
    const [showModal, setShowModal] = useState(false);

    return (
        <>
            <button
                onClick={() => setShowModal(true)}
                className={`
                    w-full flex items-center gap-3 px-4 py-3
                    bg-gray-50 hover:bg-gray-100 
                    border border-gray-200 rounded-xl
                    transition-all duration-150 cursor-pointer
                    group text-left
                `}
            >
                <div className="flex items-center justify-center w-9 h-9 bg-gray-200 text-gray-700 rounded-lg shadow-sm flex-shrink-0">
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate font-mono">
                        {action.action === 'clone' ? 'Clone Repository' : (action.command || 'Git Operation')}
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md ring-1 ring-inset ${isStreaming ? 'bg-blue-50 text-blue-700 ring-blue-300' :
                            action.error ? 'bg-red-50 text-red-700 ring-red-300' :
                                'bg-white text-gray-700 ring-gray-300'
                        }`}>
                        {isStreaming && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>}
                        {!isStreaming && <div className={`w-1.5 h-1.5 rounded-full ${action.error ? 'bg-red-500' : 'bg-gray-400'}`}></div>}
                        {isStreaming ? 'Executing...' : action.error ? 'Failed' : 'Completed'}
                    </span>
                    <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                </div>
            </button>

            {showModal && (
                <GitActionModal
                    action={action}
                    onClose={() => setShowModal(false)}
                />
            )}
        </>
    );
};
