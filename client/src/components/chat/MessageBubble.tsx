import React from 'react';
import type { Message } from '../../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { TransparencyPanel } from '../transparency/TransparencyPanel';
import { FileActionCard } from '../files/FileActionCard';
import { GitTerminalView } from './GitTerminalView';

interface MessageBubbleProps {
    message: Message;
    onRetry?: (id: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onRetry }) => {
    const isUser = message.role === 'user';

    if (isUser) {
        return (
            <div className="flex justify-end w-full mb-6">
                <div
                    className="bg-blue-600 text-white px-5 py-3 rounded-2xl rounded-tr-sm max-w-[75%] shadow-sm"
                    title={new Date(message.timestamp).toLocaleString()}
                >
                    <p className="whitespace-pre-wrap text-base">{message.displayContent}</p>
                </div>
            </div>
        );
    }

    // Hide agent message bubble completely only if it has NO content AND NO transparency data yet
    if (message.status === 'streaming' && !message.displayContent && !message.transparency) {
        return null;
    }

    const mergedFileActions = [...(message.fileActions || []), ...(message.serverFileActions || [])];
    const hasFileActions = mergedFileActions.length > 0;
    const hasGitActions = message.gitActions && message.gitActions.length > 0;

    // Agent message
    return (
        <div className="flex justify-start w-full mb-6">
            <div className="flex flex-col max-w-[85%] min-w-[200px] bg-white border border-gray-200 rounded-2xl rounded-tl-sm shadow-sm overflow-hidden text-left">
                {message.transparency && (
                    <TransparencyPanel
                        data={message.transparency}
                        isStreaming={message.status === 'streaming'}
                    />
                )}

                {message.displayContent && (
                    <div className={`p-5 ${message.transparency ? 'border-t border-gray-100' : ''}`}>
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

                {hasFileActions && (
                    <div className={`px-4 py-3 space-y-2 ${(message.transparency || message.displayContent) ? 'border-t border-gray-100' : ''}`}>
                        {mergedFileActions.map((fa) => (
                            <FileActionCard key={fa.id} action={fa} />
                        ))}
                    </div>
                )}

                {hasGitActions && (
                    <div className={`px-4 py-3 space-y-2 ${(message.transparency || message.displayContent || hasFileActions) ? 'border-t border-gray-100' : ''}`}>
                        <GitTerminalView actions={message.gitActions} isStreaming={message.status === 'streaming'} />
                    </div>
                )}

                {message.status === 'error' && onRetry && (
                    <div className="bg-red-50 border-t border-red-100 px-5 py-3 flex items-center justify-between" role="alert">
                        <span className="text-sm font-medium text-red-700 flex items-center gap-1.5">
                            <span className="text-red-500 font-bold px-1 rounded bg-red-100/50">⚠</span>
                            Response interrupted. Partial content shown above.
                        </span>
                        <button
                            onClick={() => onRetry(message.id)}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

