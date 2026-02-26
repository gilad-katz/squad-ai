import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ProfileHeader } from '../profile/ProfileHeader';
import { ChatThread } from '../chat/ChatThread';
import { MessageComposer } from '../chat/MessageComposer';
import { GitSettingsPanel } from '../settings/GitSettings';
import { ToolingPane } from '../tooling/ToolingPane';
import { useSessionStore } from '../../store/session';
import { useWorkspaceStore } from '../../store/workspace';
import { useChat } from '../../hooks/useChat';

const DIVIDER_WIDTH = 8;
const MIN_LEFT_PX = 360;
const MIN_RIGHT_PX = 520;

export const AppShell: React.FC = () => {
    const phase = useSessionStore(state => state.phase);
    const streamActive = useSessionStore(state => state.streamActive);
    const messages = useSessionStore(state => state.messages);
    const startNewSession = useSessionStore(state => state.startNewSession);
    const restoreSession = useSessionStore(state => state.restoreSession);
    const { sendMessage, stopGeneration } = useChat();
    const fetchConfig = useWorkspaceStore(state => state.fetchConfig);

    const [leftPanePercent, setLeftPanePercent] = useState(36);
    const [selectedToolingMessageId, setSelectedToolingMessageId] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const layoutRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchConfig();
        restoreSession();
    }, [fetchConfig, restoreSession]);

    const handleNewSession = () => {
        startNewSession();
    };

    const toolingMessages = useMemo(
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

    useEffect(() => {
        if (toolingMessages.length === 0) {
            setSelectedToolingMessageId(null);
            return;
        }

        const hasSelected = selectedToolingMessageId && toolingMessages.some((m) => m.id === selectedToolingMessageId);
        const latest = toolingMessages[toolingMessages.length - 1];

        if (!hasSelected || streamActive) {
            setSelectedToolingMessageId(latest.id);
        }
    }, [toolingMessages, selectedToolingMessageId, streamActive]);

    useEffect(() => {
        if (!dragging) return;

        const onMouseMove = (e: MouseEvent) => {
            if (!layoutRef.current) return;
            const rect = layoutRef.current.getBoundingClientRect();
            const maxLeft = rect.width - MIN_RIGHT_PX - DIVIDER_WIDTH;
            let leftPx = e.clientX - rect.left;
            leftPx = Math.max(MIN_LEFT_PX, Math.min(leftPx, maxLeft));
            setLeftPanePercent((leftPx / rect.width) * 100);
        };

        const onMouseUp = () => {
            setDragging(false);
            document.body.classList.remove('pane-resize-active');
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            document.body.classList.remove('pane-resize-active');
        };
    }, [dragging]);

    const startDragging = () => {
        setDragging(true);
        document.body.classList.add('pane-resize-active');
    };

    return (
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden font-sans text-gray-900">
            <ProfileHeader phase={phase} onNewSession={handleNewSession} />

            <div ref={layoutRef} className="pt-16 flex-1 min-h-0 flex">
                <section style={{ width: `${leftPanePercent}%` }} className="h-full min-w-[360px]">
                    <ToolingPane
                        messages={messages}
                        selectedMessageId={selectedToolingMessageId}
                        onSelectMessage={setSelectedToolingMessageId}
                        phase={phase}
                    />
                </section>

                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize panes"
                    onMouseDown={startDragging}
                    className="w-2 shrink-0 cursor-col-resize bg-gray-100 hover:bg-blue-100 active:bg-blue-200 transition-colors"
                />

                <section className="flex-1 min-w-[520px] flex flex-col bg-gray-50 border-l border-gray-200">
                    <ChatThread
                        onRetry={(id) => sendMessage('', undefined, id)}
                        onSelectToolingMessage={setSelectedToolingMessageId}
                        selectedToolingMessageId={selectedToolingMessageId}
                        toolingInline={false}
                        paneMode
                    />
                    <MessageComposer
                        onSend={(text, attachments) => sendMessage(text, attachments)}
                        onStop={stopGeneration}
                        disabled={streamActive}
                        docked
                    />
                </section>
            </div>

            <GitSettingsPanel />
        </div>
    );
};
