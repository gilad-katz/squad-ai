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
    const restoreSession = useSessionStore(state => state.restoreSession);
    const { sendMessage, stopGeneration } = useChat();
    const fetchConfig = useWorkspaceStore(state => state.fetchConfig);

    // Fetch persisted workspace git config and restore session on mount
    useEffect(() => {
        fetchConfig();
        restoreSession();
    }, [fetchConfig, restoreSession]);

    const handleNewSession = () => {
        startNewSession();
    };

    return (
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden font-sans text-gray-900">
            <ProfileHeader phase={phase} onNewSession={handleNewSession} />
            <ChatThread onRetry={(id) => sendMessage('', undefined, id)} />
            <MessageComposer onSend={(text, attachments) => sendMessage(text, attachments)} onStop={stopGeneration} disabled={streamActive} />
            <GitSettingsPanel />
        </div>
    );
};
