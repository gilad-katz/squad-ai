import React from 'react';
import type { Message } from '../../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { TransparencyPanel } from '../transparency/TransparencyPanel';

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

    // Agent message
    return (
        <div className="flex justify-start w-full mb-6">
            <div className="flex flex-col max-w-[85%] w-full bg-white border border-gray-200 rounded-2xl rounded-tl-sm shadow-sm overflow-hidden">
                <div className="p-5">
                    <div className="prose prose-blue max-w-none">
                        {message.status === 'streaming' ? (
                            <pre className="whitespace-pre-wrap font-sans text-base text-gray-800 m-0">{message.displayContent}</pre>
                        ) : (
                            <MarkdownRenderer content={message.displayContent} />
                        )}
                    </div>
                </div>

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

                {message.status !== 'error' && message.transparency && (
                    <TransparencyPanel data={message.transparency} />
                )}
            </div>
        </div>
    );
};
