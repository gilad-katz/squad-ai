import React, { useEffect } from 'react';
import { ProfileHeader } from '../profile/ProfileHeader';
import { ChatThread } from '../chat/ChatThread';
import { MessageComposer } from '../chat/MessageComposer';
import { GitSettingsPanel } from '../settings/GitSettings';
import { useSessionStore } from '../../store/session';
import { useWorkspaceStore } from '../../store/workspace';
import { useChat } from '../../hooks/useChat';

export const AppShell: React.FC = () => {
    const phase = useSessionStore(state => state.phase);
    const streamActive = useSessionStore(state => state.streamActive);
    const startNewSession = useSessionStore(state => state.startNewSession);
    const messages = useSessionStore(state => state.messages);
    const { sendMessage } = useChat();
    const fetchConfig = useWorkspaceStore(state => state.fetchConfig);

    // Fetch persisted workspace git config on mount
    useEffect(() => { fetchConfig(); }, [fetchConfig]);

    const handleNewSession = () => {
        if (messages.length > 0) {
            if (window.confirm('Start a new session? This will clear the current conversation.')) {
                startNewSession();
            }
        } else {
            startNewSession();
        }
    };

    return (
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden font-sans text-gray-900">
            <ProfileHeader phase={phase} onNewSession={handleNewSession} />
            <ChatThread onRetry={(id) => sendMessage(null, undefined, id)} />
            <MessageComposer onSend={(text, attachments) => sendMessage(text, attachments)} disabled={streamActive} />
            <GitSettingsPanel />
        </div>
    );
};
