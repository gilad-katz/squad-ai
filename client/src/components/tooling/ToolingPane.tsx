import React from 'react';
import type { Message, PhaseState } from '../../types';
import { GitTerminalView } from '../chat/GitTerminalView';
import { WorklogCard } from './WorklogCard';

interface ToolingPaneProps {
    messages: Message[];
    selectedMessageId: string | null;
    onSelectMessage: (id: string) => void;
    phase: PhaseState;
}

function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const ToolingPane: React.FC<ToolingPaneProps> = ({ messages, selectedMessageId, onSelectMessage, phase }) => {
    const toolingMessages = React.useMemo(
        () =>
            messages.filter(
                (m) =>
                    m.role === 'assistant' &&
                    (m.fileActions.length > 0 ||
                        m.serverFileActions.length > 0 ||
                        m.gitActions.length > 0 ||
                        !!m.transparency)
            ),
        [messages]
    );

    const selectedMessage =
        toolingMessages.find((m) => m.id === selectedMessageId) ?? toolingMessages[toolingMessages.length - 1] ?? null;

    const hasWorklog = !!selectedMessage && (!!selectedMessage.transparency || selectedMessage.fileActions.length > 0 || selectedMessage.serverFileActions.length > 0);

    return (
        <aside className="h-full flex flex-col bg-[#070c14] text-slate-200">
            <div className="px-4 py-3 border-b border-slate-800 bg-[#0a111d]">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-bold text-slate-100 tracking-wide uppercase">Tooling</h2>
                    <span className="text-xs text-slate-400 font-medium">{phase.toUpperCase()}</span>
                </div>
                {toolingMessages.length === 0 ? (
                    <p className="text-sm text-slate-400">Run a build task to populate tooling output.</p>
                ) : (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {toolingMessages.map((m, idx) => {
                            const selected = m.id === selectedMessage?.id;
                            const count = (m.fileActions?.length || 0) + (m.serverFileActions?.length || 0);
                            return (
                                <button
                                    key={m.id}
                                    onClick={() => onSelectMessage(m.id)}
                                    className={`shrink-0 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${selected
                                        ? 'bg-blue-500/15 text-blue-200 border-blue-400/30'
                                        : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800 hover:text-slate-200'
                                        }`}
                                >
                                    Run {idx + 1} - {formatTime(m.timestamp)} - {count} files
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#070c14]">
                {!selectedMessage ? (
                    <div className="h-full min-h-[220px] border border-dashed border-slate-700 rounded-xl bg-slate-900/40 flex items-center justify-center text-sm text-slate-400 px-6 text-center">
                        Tool output appears here. Select a run above to inspect progress and terminal logs.
                    </div>
                ) : (
                    <>
                        {hasWorklog && <WorklogCard message={selectedMessage} />}

                        {selectedMessage.gitActions.length > 0 && (
                            <section className="rounded-xl border border-slate-800 bg-[#0a1220] p-3">
                                <h3 className="text-[11px] font-bold text-slate-400 tracking-widest uppercase mb-2">Terminal</h3>
                                <GitTerminalView
                                    actions={selectedMessage.gitActions}
                                    isStreaming={selectedMessage.status === 'streaming'}
                                />
                            </section>
                        )}
                    </>
                )}
            </div>
        </aside>
    );
};
