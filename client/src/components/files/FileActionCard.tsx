import React, { useState } from 'react';
import type { FileAction } from '../../types';
import { FilePlus, FileEdit, Trash2, ExternalLink } from 'lucide-react';
import { FileContentModal } from './FileContentModal';

interface FileActionCardProps {
    action: FileAction;
}

const actionConfig = {
    created: { icon: FilePlus, label: 'Created', borderColor: 'border-emerald-500/30', bgAccent: 'bg-emerald-500/10' },
    edited: { icon: FileEdit, label: 'Edited', borderColor: 'border-blue-500/30', bgAccent: 'bg-blue-500/10' },
    deleted: { icon: Trash2, label: 'Deleted', borderColor: 'border-red-500/30', bgAccent: 'bg-red-500/10' },
};

const langIcons: Record<string, string> = {
    typescript: 'TS', typescriptreact: 'TSX', javascript: 'JS', javascriptreact: 'JSX',
    css: 'CSS', html: 'HTML', json: 'JSON', python: 'PY', markdown: 'MD',
};

export const FileActionCard: React.FC<FileActionCardProps> = ({ action }) => {
    const [showModal, setShowModal] = useState(false);
    const config = actionConfig[action.action];
    const ActionIcon = config.icon;
    const langBadge = langIcons[action.language] || action.language?.toUpperCase()?.slice(0, 3) || 'TXT';

    return (
        <>
            <button
                onClick={() => setShowModal(true)}
                className={`
                    w-full flex items-center gap-3 px-4 py-3
                    bg-gray-900 hover:bg-gray-800 
                    border ${config.borderColor} rounded-xl
                    transition-all duration-150 cursor-pointer
                    group text-left
                `}
            >
                {/* File icon */}
                <div className={`flex items-center justify-center w-9 h-9 rounded-lg ${config.bgAccent} flex-shrink-0`}>
                    <ActionIcon className="w-4.5 h-4.5 text-gray-300" />
                </div>

                {/* Filename + action label */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-100 truncate">
                            {action.filename}
                        </span>
                        <span className="text-[10px] font-mono font-semibold text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                            {langBadge}
                        </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                        {config.label}
                        {action.filepath !== action.filename && (
                            <span className="ml-1.5 text-gray-600">{action.filepath}</span>
                        )}
                    </div>
                </div>

                {/* Line counts */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    {action.linesAdded > 0 && (
                        <span className="text-xs font-mono font-semibold text-emerald-400">
                            +{action.linesAdded}
                        </span>
                    )}
                    {action.linesRemoved > 0 && (
                        <span className="text-xs font-mono font-semibold text-red-400">
                            -{action.linesRemoved}
                        </span>
                    )}
                    {action.warnings != null && action.warnings > 0 && (
                        <span className="text-xs font-mono font-semibold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                            ⚠ {action.warnings}
                        </span>
                    )}
                </div>

                {/* Open icon */}
                <ExternalLink className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0" />
            </button>

            {showModal && (
                <FileContentModal
                    fileAction={action}
                    onClose={() => setShowModal(false)}
                />
            )}
        </>
    );
};
