import React from 'react';
import type { Message } from '../../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { TransparencyPanel } from '../transparency/TransparencyPanel';
import { FileActionCard } from '../files/FileActionCard';
import { GitTerminalView } from './GitTerminalView';

function phaseLabel(phase: string): string {
    switch (phase) {
        case 'thinking':
            return 'Understanding Request';
        case 'planning':
            return 'Planning';
        case 'installing':
            return 'Installing Dependencies';
        case 'executing':
            return 'Executing';
        case 'verifying':
            return 'Verifying';
        case 'repairing':
            return 'Repairing';
        case 'summary':
            return 'Summary';
        case 'building':
            return 'Building';
        case 'responding':
            return 'Responding';
        default:
            return phase;
    }
}

function phaseDefaultThought(phase: string): string {
    switch (phase) {
        case 'thinking':
            return 'Reviewing your request and constraints.';
        case 'planning':
            return 'Breaking the work into concrete implementation steps.';
        case 'installing':
            return 'Setting up required dependencies.';
        case 'executing':
            return 'Applying code changes in the workspace.';
        case 'verifying':
            return 'Checking build, lint, and runtime behavior.';
        case 'repairing':
            return 'Addressing issues found during verification.';
        case 'summary':
            return 'Preparing a concise summary with next technical steps.';
        case 'building':
            return 'Producing the requested output and artifacts.';
        case 'responding':
            return 'Preparing final results and next actions.';
        default:
            return 'Processing this step.';
    }
}

interface MessageBubbleProps {
    message: Message;
    onRetry?: (id: string) => void;
    onSelectToolingMessage?: (id: string) => void;
    isToolingSelected?: boolean;
    toolingInline?: boolean;
}

export const MessageBubble = React.memo(function MessageBubble({
    message,
    onRetry,
    onSelectToolingMessage,
    isToolingSelected,
    toolingInline = true,
}: MessageBubbleProps) {
    const isUser = message.role === 'user';

    if (isUser) {
        return (
            <div className="flex justify-end w-full mb-6">
                <div
                    className="bg-blue-600 text-white px-5 py-3 rounded-2xl rounded-tr-sm max-w-[75%] shadow-sm"
                    title={new Date(message.timestamp).toLocaleString()}
                >
                    {message.attachments && message.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                            {message.attachments.map(att => (
                                <img
                                    key={att.id}
                                    src={att.url || `data:${att.mimeType};base64,${att.data}`}
                                    alt={att.name}
                                    className="max-w-[200px] max-h-[200px] object-contain rounded-lg border border-blue-400 bg-white"
                                />
                            ))}
                        </div>
                    )}
                    <p className="whitespace-pre-wrap text-base">{message.displayContent}</p>
                </div>
            </div>
        );
    }

    const mergedFileActions = [...(message.fileActions || []), ...(message.serverFileActions || [])];
    const hasFileActions = mergedFileActions.length > 0;
    const hasGitActions = message.gitActions && message.gitActions.length > 0;
    const hasToolingData = hasFileActions || hasGitActions || !!message.transparency;
    const hasReasoning = !!message.transparency?.reasoning;
    const phaseThoughts = message.phaseThoughts || [];
    const phaseThoughtCards = phaseThoughts.filter((step) => !!(step.detail || step.text?.trim()));
    const hasStepText = phaseThoughtCards.some((step) => !!step.text?.trim());

    if (message.status === 'streaming' && !message.displayContent && !hasToolingData) {
        return null;
    }

    const canSelectTooling = hasToolingData && !!onSelectToolingMessage;

    return (
        <div className="flex justify-start w-full mb-6 animate-slide-up">
            <div
                onClick={canSelectTooling ? () => onSelectToolingMessage(message.id) : undefined}
                className={`flex flex-col max-w-[85%] min-w-[220px] bg-white border rounded-2xl rounded-tl-sm shadow-sm overflow-hidden text-left transition-all duration-200 ${canSelectTooling ? 'cursor-pointer hover:shadow-md' : ''} ${isToolingSelected ? 'border-blue-300 ring-2 ring-blue-100' : 'border-gray-200'
                    }`}
            >
                {!toolingInline && (phaseThoughtCards.length > 0 || hasReasoning) && (
                    <div className={`px-5 py-4 bg-blue-50/40 ${message.displayContent ? 'border-b border-gray-100' : 'border-t border-blue-100'}`}>
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-blue-700 mb-2">
                            Thought Process
                        </h4>
                        {phaseThoughtCards.length > 0 && (
                            <div className="space-y-2 mb-2.5">
                                {phaseThoughtCards.map((step, idx) => {
                                    const thoughtText = step.text?.trim();
                                    const detailText = step.detail?.trim();
                                    const fallback = phaseDefaultThought(step.phase);
                                    const primary = thoughtText || detailText || fallback;
                                    return (
                                        <div key={`${step.phase}-${idx}`} className="rounded-md border border-blue-100 bg-white/70 px-3 py-2">
                                            <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">
                                                {idx + 1}. {phaseLabel(step.phase)}
                                            </div>
                                            <div className="mt-1 text-sm text-gray-700 leading-relaxed">
                                                {message.status === 'streaming' ? (
                                                    <div className="whitespace-pre-wrap">{primary}</div>
                                                ) : (
                                                    <MarkdownRenderer content={primary} />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {!hasStepText && hasReasoning && (
                            <div className="text-sm text-gray-700 leading-relaxed">
                                {message.status === 'streaming' ? (
                                    <p className="whitespace-pre-wrap">{message.transparency?.reasoning}</p>
                                ) : (
                                    <MarkdownRenderer content={message.transparency?.reasoning || ''} />
                                )}
                            </div>
                        )}
                    </div>
                )}

                {message.displayContent && !(!toolingInline && hasStepText) && (
                    <div className="p-5">
                        <div className="prose prose-blue max-w-none">
                            {message.status === 'streaming' ? (
                                <div className="font-sans text-base text-gray-800 m-0 min-h-[1.5rem] whitespace-pre-wrap">
                                    {message.displayContent}
                                </div>
                            ) : (
                                <MarkdownRenderer content={message.displayContent} />
                            )}
                        </div>
                    </div>
                )}

                {!toolingInline && hasToolingData && !hasReasoning && !message.displayContent && !message.summary && (
                    <div className="px-5 py-4 text-sm text-gray-600 bg-blue-50/50 border-t border-blue-100">
                        Tool activity is available in the right pane.
                    </div>
                )}

                {toolingInline && hasFileActions && (
                    <div className="px-4 py-3 space-y-2 border-t border-gray-50 bg-gray-50/30">
                        {mergedFileActions.map((fa) => (
                            <FileActionCard key={fa.id} action={fa} sessionId={message.sessionId} />
                        ))}
                    </div>
                )}

                {toolingInline && hasGitActions && (
                    <div className="px-4 py-3 space-y-2 border-t border-gray-50 bg-gray-50/30">
                        <GitTerminalView actions={message.gitActions} isStreaming={message.status === 'streaming'} />
                    </div>
                )}

                {toolingInline && message.transparency && (
                    <TransparencyPanel
                        data={message.transparency}
                        isStreaming={message.status === 'streaming'}
                        fileActions={mergedFileActions}
                    />
                )}

                {message.summary && (
                    <div className="px-6 py-5 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 border-t border-blue-100/50 animate-fade-in">
                        <MarkdownRenderer content={message.summary} />
                    </div>
                )}

                {message.status === 'error' && onRetry && (
                    <div className="bg-red-50 border-t border-red-100 px-5 py-3 flex items-center justify-between" role="alert">
                        <span className="text-sm font-medium text-red-700 flex items-center gap-1.5">
                            <span className="text-red-500 font-bold px-1 rounded bg-red-100/50">⚠</span>
                            Response interrupted.
                        </span>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onRetry(message.id);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});
