import React from 'react';
import type { Message } from '../../types';
import { ChevronRight } from 'lucide-react';

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
                        {/* Step 2 uses simple pre-wrap text. Step 5 will replace this with MarkdownRenderer */}
                        <pre className="whitespace-pre-wrap font-sans text-base text-gray-800 m-0">{message.displayContent}</pre>
                    </div>
                </div>

                {/* Placeholder for transparency toggle */}
                <div className="bg-gray-50 border-t border-gray-100 px-5 py-3">
                    <button
                        disabled
                        className="flex items-center gap-1.5 text-sm font-medium text-gray-500 cursor-not-allowed"
                    >
                        <ChevronRight className="w-4 h-4" />
                        Show reasoning
                    </button>
                </div>
            </div>
        </div>
    );
};
