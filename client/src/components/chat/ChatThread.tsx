import React, { useEffect, useRef } from 'react';
import { useSessionStore } from '../../store/session';
import { MessageBubble } from './MessageBubble';

interface ChatThreadProps {
    onRetry: (id: string) => void;
    onSelectToolingMessage?: (id: string) => void;
    selectedToolingMessageId?: string | null;
    toolingInline?: boolean;
    paneMode?: boolean;
}

export const ChatThread: React.FC<ChatThreadProps> = ({
    onRetry,
    onSelectToolingMessage,
    selectedToolingMessageId,
    toolingInline = true,
    paneMode = false,
}) => {
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

    useEffect(() => {
        if (phase !== 'ready') {
            isLockedToBottom.current = true;
            scrollToBottom('auto');
        }
    }, [phase]);

    const handleScroll = (e: React.UIEvent<HTMLElement>) => {
        const target = e.target as HTMLElement;
        const isActive = phase !== 'ready';
        const threshold = isActive ? 800 : 200;

        const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + threshold;
        isLockedToBottom.current = isAtBottom;
    };

    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver(() => {
            if (isLockedToBottom.current) {
                const isActive = phase === 'thinking' || phase === 'responding';
                requestAnimationFrame(() => {
                    scrollToBottom(isActive ? 'auto' : 'smooth');
                });
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [phase]);

    useEffect(() => {
        const newMsgCount = messages.length - prevMessagesLen.current;
        const lastMsg = messages[messages.length - 1];

        if (newMsgCount > 0 && lastMsg?.role === 'user') {
            isLockedToBottom.current = true;
            scrollToBottom('auto');
        }

        if (phase === 'ready' && isLockedToBottom.current) {
            const timers = [
                setTimeout(() => scrollToBottom('smooth'), 100),
                setTimeout(() => scrollToBottom('smooth'), 300),
                setTimeout(() => scrollToBottom('smooth'), 1000),
            ];
            return () => timers.forEach(clearTimeout);
        }

        prevMessagesLen.current = messages.length;
    }, [messages, phase]);

    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    const isAssistantStarting = lastMsg?.role === 'assistant' && !lastMsg.displayContent && !lastMsg.transparency;
    const showThinkingIndicator = phase === 'thinking' || phase === 'planning' || phase === 'executing' || phase === 'summary' || (phase === 'responding' && isAssistantStarting);

    const mainSpacing = paneMode ? 'pt-6 pb-6' : 'pt-24 pb-32';
    const widthClass = paneMode ? 'max-w-[980px]' : 'max-w-4xl';

    return (
        <main ref={scrollerRef} onScroll={handleScroll} className={`flex-1 w-full overflow-y-auto bg-gray-50 ${mainSpacing}`}>
            <div className={`${widthClass} mx-auto px-6 w-full flex flex-col items-center`}>
                {contextWarning && (
                    <div className="w-full mb-6 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <span>⚠</span>
                            <span>Context limit approaching (80%). The agent might forget earlier instructions soon.</span>
                        </div>
                    </div>
                )}

                {messages.length === 0 ? (
                    <div className="flex h-[60vh] flex-col items-center justify-center text-center px-4 animate-fade-in">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-16 h-16 bg-gradient-to-tr from-purple-600 to-pink-500 rounded-3xl flex items-center justify-center text-white text-2xl font-bold shadow-xl shadow-purple-500/20 -rotate-3 hover:rotate-0 transition-transform duration-500">
                                PM
                            </div>
                            <div className="text-2xl text-gray-300 font-light">+</div>
                            <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center text-white text-2xl font-bold shadow-xl shadow-blue-500/20 rotate-3 hover:rotate-0 transition-transform duration-500">
                                FE
                            </div>
                        </div>
                        <h2 className="text-3xl font-extrabold text-gray-900 mb-3 tracking-tight">Your AI Product Team</h2>
                        <p className="max-w-md text-lg text-gray-500 mb-10 leading-relaxed font-medium">
                            <span className="text-purple-600 font-bold">PM-AGENT-01</span> defines requirements &amp; design.
                            {' '}<span className="text-blue-600 font-bold">FE-SENIOR-01</span> architects &amp; builds.
                            Together, they ship your vision.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl stagger-load">
                            <div className="p-4 bg-white border border-gray-200 rounded-2xl text-left hover:border-purple-400 hover:shadow-md transition-all">
                                <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                                    Build a Web App
                                </h3>
                                <p className="text-xs text-gray-500 leading-normal">"Build me a beautiful calculator app with a dark theme and history panel."</p>
                            </div>
                            <div className="p-4 bg-white border border-gray-200 rounded-2xl text-left hover:border-blue-400 hover:shadow-md transition-all">
                                <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                    Implement a Feature
                                </h3>
                                <p className="text-xs text-gray-500 leading-normal">"Add a responsive sidebar with collapsible sections and dark mode support."</p>
                            </div>
                            <div className="p-4 bg-white border border-gray-200 rounded-2xl text-left hover:border-green-400 hover:shadow-md transition-all">
                                <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                    Refactor &amp; Improve
                                </h3>
                                <p className="text-xs text-gray-500 leading-normal">"Analyze this app for performance issues and refactor it with best practices."</p>
                            </div>
                            <div className="p-4 bg-white border border-gray-200 rounded-2xl text-left hover:border-amber-400 hover:shadow-md transition-all">
                                <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                    Debug Issues
                                </h3>
                                <p className="text-xs text-gray-500 leading-normal">"Help me fix a hydration error in my Next.js app using client-side store."</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div ref={containerRef} className="w-full flex flex-col stagger-load" aria-live="polite" aria-atomic="false">
                        {messages.map((msg, idx) => (
                            <MessageBubble
                                key={msg.id || `msg-${idx}`}
                                message={msg}
                                onRetry={onRetry}
                                onSelectToolingMessage={onSelectToolingMessage}
                                isToolingSelected={msg.id === selectedToolingMessageId}
                                toolingInline={toolingInline}
                            />
                        ))}
                        {showThinkingIndicator && (
                            <div className="flex justify-start w-full mb-12 animate-fade-in">
                                <div className="flex bg-white/80 backdrop-blur-sm border border-gray-100 rounded-full shadow-lg px-5 py-2.5 ml-2 items-center gap-4">
                                    <div className="flex gap-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse delay-75"></div>
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse delay-150"></div>
                                    </div>
                                    <span className="text-[11px] font-black text-gray-800 uppercase tracking-tighter tabular-nums">
                                        Thinking...
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
};
