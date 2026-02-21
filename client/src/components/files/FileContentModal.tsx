import React, { useEffect, useState } from 'react';
import type { FileAction } from '../../types';
import { X, Copy, Check, FileCode } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FileDiffView } from './FileDiffView';

interface FileContentModalProps {
    fileAction: FileAction;
    onClose: () => void;
}

export const FileContentModal: React.FC<FileContentModalProps> = ({ fileAction, onClose }) => {
    const [activeTab, setActiveTab] = useState<'content' | 'diff'>('content');
    const [copied, setCopied] = useState(false);

    const hasDiff = !!fileAction.diff;

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

    const handleCopy = async () => {
        await navigator.clipboard.writeText(fileAction.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Map language to Prism language
    const prismLang = fileAction.language
        ?.replace('typescriptreact', 'tsx')
        ?.replace('javascriptreact', 'jsx') || 'text';

    const lineCount = fileAction.content.split('\n').length;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="relative w-[90vw] max-w-4xl h-[85vh] bg-gray-900 rounded-2xl shadow-2xl border border-gray-700/50 flex flex-col overflow-hidden animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50 bg-gray-900/80 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <FileCode className="w-5 h-5 text-blue-400" />
                        <div>
                            <h3 className="text-base font-semibold text-gray-100">{fileAction.filename}</h3>
                            <p className="text-xs text-gray-500 mt-0.5">{fileAction.filepath}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Tab toggle */}
                        {hasDiff && (
                            <div className="flex bg-gray-800 rounded-lg p-0.5 mr-3">
                                <button
                                    onClick={() => setActiveTab('content')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'content'
                                            ? 'bg-gray-700 text-gray-100'
                                            : 'text-gray-400 hover:text-gray-200'
                                        }`}
                                >
                                    Content
                                </button>
                                <button
                                    onClick={() => setActiveTab('diff')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'diff'
                                            ? 'bg-gray-700 text-gray-100'
                                            : 'text-gray-400 hover:text-gray-200'
                                        }`}
                                >
                                    Diff
                                </button>
                            </div>
                        )}
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

                {/* Body */}
                <div className="flex-1 overflow-auto">
                    {activeTab === 'content' ? (
                        <SyntaxHighlighter
                            language={prismLang}
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
                            {fileAction.content}
                        </SyntaxHighlighter>
                    ) : (
                        <div className="p-4">
                            <FileDiffView diff={fileAction.diff || ''} />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-3 border-t border-gray-700/50 bg-gray-900/80 text-xs text-gray-500 flex-shrink-0">
                    <span>{lineCount} lines</span>
                    <div className="flex items-center gap-3">
                        {fileAction.linesAdded > 0 && (
                            <span className="text-emerald-400 font-mono">+{fileAction.linesAdded}</span>
                        )}
                        {fileAction.linesRemoved > 0 && (
                            <span className="text-red-400 font-mono">-{fileAction.linesRemoved}</span>
                        )}
                        <span className="uppercase font-mono">{fileAction.language}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
