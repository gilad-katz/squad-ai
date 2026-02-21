import React, { useEffect, useState } from 'react';
import type { GitAction } from '../../types';
import { X, Copy, Check, TerminalSquare } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface GitActionModalProps {
    action: GitAction;
    onClose: () => void;
}

export const GitActionModal: React.FC<GitActionModalProps> = ({ action, onClose }) => {
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState<'details' | 'logs'>('details');

    // Auto-switch to logs when they arrive
    useEffect(() => {
        if (action.output || action.error) {
            setActiveTab('logs');
        }
    }, [!!action.output, !!action.error]);

    // Close on Escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    // Prevent body scroll while modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    const content = JSON.stringify({ id: action.id, action: action.action, command: action.command }, null, 2);

    const handleCopy = async () => {
        const textToCopy = activeTab === 'details' ? content : (action.error || action.output || '');
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="relative w-[90vw] max-w-4xl h-[70vh] bg-[#1a1b1e] rounded-2xl shadow-2xl border border-gray-700/50 flex flex-col overflow-hidden animate-scale-in">
                {/* Header */}
                <div className="flex flex-col border-b border-gray-700/50 bg-[#141517] flex-shrink-0">
                    <div className="flex items-center justify-between px-6 py-4">
                        <div className="flex items-center gap-3">
                            <TerminalSquare className="w-5 h-5 text-purple-400" />
                            <div>
                                <h3 className="text-base font-semibold text-gray-100">Git Execution Details</h3>
                                <p className="text-xs text-gray-500 mt-0.5">{action.action === 'clone' ? 'Repository Clone' : action.command}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-750 transition-colors"
                            >
                                {copied ? (
                                    <><Check className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400">Copied!</span></>
                                ) : (
                                    <><Copy className="w-3.5 h-3.5" /><span>Copy</span></>
                                )}
                            </button>
                            <button
                                onClick={onClose}
                                className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
                                aria-label="Close"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center px-6 gap-6">
                        <button
                            onClick={() => setActiveTab('details')}
                            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'details'
                                    ? 'text-blue-400 border-blue-400'
                                    : 'text-gray-400 border-transparent hover:text-gray-300'
                                }`}
                        >
                            Configuration
                        </button>
                        <button
                            onClick={() => setActiveTab('logs')}
                            className={`pb-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'logs'
                                    ? 'text-blue-400 border-blue-400'
                                    : 'text-gray-400 border-transparent hover:text-gray-300'
                                }`}
                        >
                            Console Logs
                            {action.error && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
                            {action.output && !action.error && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto bg-[#1a1b1e]">
                    {activeTab === 'details' ? (
                        <SyntaxHighlighter
                            language="json"
                            style={oneDark}
                            showLineNumbers
                            customStyle={{
                                margin: 0,
                                padding: '1.5rem',
                                background: 'transparent',
                                fontSize: '0.8125rem',
                                lineHeight: '1.6',
                                minHeight: '100%',
                            }}
                            lineNumberStyle={{
                                color: '#4B5563',
                                minWidth: '3em',
                                paddingRight: '1em',
                            }}
                        >
                            {content}
                        </SyntaxHighlighter>
                    ) : (
                        <div className="p-6 h-full font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
                            {action.error ? (
                                <div className="text-red-400">{action.error}</div>
                            ) : action.output ? (
                                <div className="text-gray-300">{action.output}</div>
                            ) : (
                                <div className="text-gray-500 italic flex items-center justify-center h-full">Waiting for execution to complete...</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
