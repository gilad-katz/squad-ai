import React from 'react';
import type { Message } from '../../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { TransparencyPanel } from '../transparency/TransparencyPanel';

interface MessageBubbleProps {
    message: Message;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
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

                {message.transparency && (
                    <TransparencyPanel data={message.transparency} />
                )}
            </div>
        </div>
    );
};
