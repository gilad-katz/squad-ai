import React, { useEffect, useRef, useState } from 'react';
import type { GitAction } from '../../types';
import { Terminal, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';

interface GitTerminalViewProps {
    actions: GitAction[];
    isStreaming?: boolean;
}

export const GitTerminalView = React.memo(function GitTerminalView({ actions, isStreaming }: GitTerminalViewProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [copied, setCopied] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom as logs arrive
    useEffect(() => {
        if (scrollRef.current && !isCollapsed) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [actions, isCollapsed]);

    const handleCopy = async () => {
        const fullLogs = actions
            .filter(Boolean)
            .map(a => {
                const cmd = a?.action === 'clone' ? 'git clone ...' : (a?.command || 'git');
                const output = a?.output || a?.error || '';
                return `$ ${cmd}\n${output}`;
            }).join('\n\n');

        await navigator.clipboard.writeText(fullLogs);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!actions || actions.length === 0) return null;
    const hasError = actions.some(a => a && a.error);

    return (
        <div className="flex flex-col w-full bg-[#1a1b1e] rounded-xl border border-gray-700/50 shadow-lg overflow-hidden my-2">
            {/* Terminal Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#141517] border-b border-gray-700/50">
                <div className="flex items-center gap-2.5">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                        <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                        <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
                    </div>
                    <div className="flex items-center gap-2 ml-2 text-gray-400">
                        <Terminal className="w-4 h-4" />
                        <span className="text-xs font-medium font-mono">git-terminal — {actions.length} action{actions.length > 1 ? 's' : ''}</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {hasError && (
                        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-bold uppercase tracking-wider border border-red-500/20">
                            Failed
                        </span>
                    )}
                    {isStreaming && (
                        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-bold uppercase tracking-wider border border-blue-500/20">
                            <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse"></span>
                            Executing
                        </span>
                    )}

                    <button
                        onClick={handleCopy}
                        className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
                        title="Copy all logs"
                    >
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>

                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
                    >
                        {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Terminal Body */}
            {!isCollapsed && (
                <div
                    ref={scrollRef}
                    className="p-4 max-h-[400px] overflow-y-auto font-mono text-[13px] leading-relaxed bg-[#1a1b1e]"
                >
                    {actions.filter(Boolean).map((action, idx) => (
                        <div key={action?.id || idx} className="mb-4 last:mb-0">
                            <div className="flex items-start gap-2 text-gray-300">
                                <span className="text-emerald-500 flex-shrink-0 select-none">squad-ai:~/workspace$</span>
                                <span className="text-blue-300 break-all">
                                    {action?.action === 'clone' ? 'git clone ...' : (action?.command || 'git')}
                                </span>
                            </div>

                            {action?.output && (
                                <div className="mt-1.5 text-gray-400 whitespace-pre-wrap pl-2 border-l border-gray-700/30">
                                    {action.output}
                                </div>
                            )}

                            {action?.error && (
                                <div className="mt-1.5 text-red-400 whitespace-pre-wrap pl-2 border-l border-red-500/30">
                                    {action.error}
                                </div>
                            )}

                            {!action?.output && !action?.error && isStreaming && idx === actions.length - 1 && (
                                <div className="mt-1.5 text-gray-500 italic pl-2 border-l border-gray-700/30 animate-pulse">
                                    Executing...
                                </div>
                            )}
                        </div>
                    ))}
                    {isStreaming && (
                        <div className="flex items-center gap-2 mt-2 opacity-50">
                            <span className="text-emerald-500 select-none">squad-ai:~/workspace$</span>
                            <span className="w-2 h-4 bg-gray-400 animate-pulse"></span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});
