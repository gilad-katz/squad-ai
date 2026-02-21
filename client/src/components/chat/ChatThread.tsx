import React from 'react';
import type { Message } from '../../types';
import { MessageBubble } from './MessageBubble';

interface ChatThreadProps {
    messages: Message[];
}

export const ChatThread: React.FC<ChatThreadProps> = ({ messages }) => {
    return (
        <main className="flex-1 w-full overflow-y-auto bg-gray-50 pt-24 pb-32">
            <div className="max-w-4xl mx-auto px-6 w-full flex flex-col items-center">
                {messages.length === 0 ? (
                    <div className="flex h-[50vh] flex-col items-center justify-center text-center text-gray-500">
                        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 text-blue-600 text-2xl font-bold shadow-sm">
                            FE
                        </div>
                        <h2 className="text-xl font-semibold text-gray-800 mb-2">FE-SENIOR-01 is ready</h2>
                        <p className="max-w-sm">
                            I am a Senior Frontend Developer specializing in React, TypeScript, and Tailwind CSS. How can I help you today?
                        </p>
                    </div>
                ) : (
                    <div className="w-full flex flex-col">
                        {messages.map((msg) => (
                            <MessageBubble key={msg.id} message={msg} />
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
};
