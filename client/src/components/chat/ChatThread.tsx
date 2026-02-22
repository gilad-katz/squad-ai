import React, { useEffect, useRef } from 'react';
import { useSessionStore } from '../../store/session';
import { MessageBubble } from './MessageBubble';

interface ChatThreadProps {
    onRetry: (id: string) => void;
}

export const ChatThread: React.FC<ChatThreadProps> = ({ onRetry }) => {
    const messages = useSessionStore(state => state.messages);
    const phase = useSessionStore(state => state.phase);
    const contextWarning = useSessionStore(state => state.contextWarning);
    const scrollerRef = useRef<HTMLElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isLockedToBottom = useRef(true);
    const prevMessagesLen = useRef(messages.length);

    const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
        if (scrollerRef.current) {
            const { scrollHeight, clientHeight } = scrollerRef.current;
            scrollerRef.current.scrollTo({
                top: scrollHeight - clientHeight,
                behavior
            });
        }
    };

    // Aggressive re-locking: reset to bottom whenever a phase transition happens
    // (Thinking -> Responding -> Thinking -> Responding)
    useEffect(() => {
        if (phase !== 'ready') {
            isLockedToBottom.current = true;
            // Immediate jump to keep up with the handoff
            scrollToBottom('auto');
        }
    }, [phase]);

    // Tracking if we should auto-scroll
    const handleScroll = (e: React.UIEvent<HTMLElement>) => {
        const target = e.target as HTMLElement;
        // In active phases, we use a MASSIVE threshold (800px) because long code blocks
        // can shift the height significantly before the next ResizeObserver tick.
        // In ready phase, we use 200px.
        const isActive = phase !== 'ready';
        const threshold = isActive ? 800 : 200;

        const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + threshold;
        isLockedToBottom.current = isAtBottom;
    };

    // Use ResizeObserver to detect content growth (e.g. streaming text, markdown rendering)
    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver(() => {
            if (isLockedToBottom.current) {
                const isActive = phase === 'thinking' || phase === 'responding';
                // Always sync with animation frame to ensure DOM is drawn
                requestAnimationFrame(() => {
                    scrollToBottom(isActive ? 'auto' : 'smooth');
                });
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [phase]);

    // Force scroll on new user message and handle cleanup
    useEffect(() => {
        const newMsgCount = messages.length - prevMessagesLen.current;
        const lastMsg = messages[messages.length - 1];

        // Always lock and scroll when the user sends a message
        if (newMsgCount > 0 && lastMsg?.role === 'user') {
            isLockedToBottom.current = true;
            scrollToBottom('auto');
        }

        // Final cleanup scrolls when the agent finishes to catch all late reflows
        if (phase === 'ready' && isLockedToBottom.current) {
            const timers = [
                setTimeout(() => scrollToBottom('smooth'), 100),
                setTimeout(() => scrollToBottom('smooth'), 300),
                setTimeout(() => scrollToBottom('smooth'), 1000), // Longer tail for complex layout
            ];
            return () => timers.forEach(clearTimeout);
        }

        prevMessagesLen.current = messages.length;
    }, [messages.length, phase]);

    // Indicator logic: show activity dots during active phases
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    const isAssistantStarting = lastMsg?.role === 'assistant' && !lastMsg.displayContent && !lastMsg.transparency;
    const showThinkingIndicator = phase === 'thinking' || phase === 'planning' || phase === 'executing' || (phase === 'responding' && isAssistantStarting);

    const phaseLabel = phase === 'planning' ? 'Planning...' : phase === 'executing' ? 'Generating files...' : 'Thinking...';

    return (
        <main ref={scrollerRef} onScroll={handleScroll} className="flex-1 w-full overflow-y-auto bg-gray-50 pt-24 pb-32">
            <div className="max-w-4xl mx-auto px-6 w-full flex flex-col items-center">
                {contextWarning && (
                    <div className="w-full mb-6 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <span>⚠</span>
                            <span>Context limit approaching (80%). The agent might forget earlier instructions soon.</span>
                        </div>
                    </div>
                )}

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
                    <div ref={containerRef} className="w-full flex flex-col" aria-live="polite" aria-atomic="false">
                        {messages.map((msg) => (
                            <MessageBubble key={msg.id} message={msg} onRetry={onRetry} />
                        ))}
                        {showThinkingIndicator && (
                            <div className="flex justify-start w-full mb-12">
                                <div className="flex gap-2 items-center bg-white border border-gray-200 rounded-2xl rounded-tl-sm shadow-sm px-5 py-4 ml-2">
                                    <div className="flex gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-[bounce_1s_infinite_0ms]"></div>
                                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-[bounce_1s_infinite_200ms]"></div>
                                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-[bounce_1s_infinite_400ms]"></div>
                                    </div>
                                    <span className="text-xs text-gray-400 font-medium ml-1">{phaseLabel}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
};
