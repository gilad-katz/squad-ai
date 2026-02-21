import React, { useState } from 'react';
import { ProfileHeader } from '../profile/ProfileHeader';
import { ChatThread } from '../chat/ChatThread';
import { MessageComposer } from '../chat/MessageComposer';
import type { Message, PhaseState } from '../../types';

interface AppShellProps {
    initialMessages?: Message[];
}

export const AppShell: React.FC<AppShellProps> = ({ initialMessages = [] }) => {
    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [phase, setPhase] = useState<PhaseState>('ready');

    const handleSend = (text: string) => {
        // Temporary no-op behavior for step 2 UI shell validation
        const newMsg: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            content: text,
            displayContent: text,
            transparency: null,
            status: 'complete',
            timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, newMsg]);
    };

    const handleNewSession = () => {
        if (window.confirm('Start a new session? This will clear the current conversation.')) {
            setMessages([]);
            setPhase('ready');
        }
    };

    return (
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden font-sans text-gray-900">
            <ProfileHeader phase={phase} onNewSession={handleNewSession} />
            <ChatThread messages={messages} />
            <MessageComposer onSend={handleSend} />
        </div>
    );
};
