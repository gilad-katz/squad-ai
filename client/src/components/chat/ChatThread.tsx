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
    }, [messages, phase]);

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
                    <div className="flex h-[65vh] flex-col items-center justify-center text-center px-4 animate-fade-in">
                        <div className="w-20 h-20 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center mb-8 text-white text-3xl font-bold shadow-xl shadow-blue-500/20 rotate-3 hover:rotate-0 transition-transform duration-500">
                            FE
                        </div>
                        <h2 className="text-3xl font-extrabold text-gray-900 mb-3 tracking-tight">How can I help you build today?</h2>
                        <p className="max-w-md text-lg text-gray-500 mb-10 leading-relaxed font-medium">
                            I'm <span className="text-blue-600 font-bold">FE-SENIOR-01</span>, your expert frontend collaborator.
                            I'm ready to architect, implement, and refine your React applications.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl stagger-load">
                            <div className="p-4 bg-white border border-gray-200 rounded-2xl text-left hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group">
                                <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2 group-hover:text-blue-600">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                    Build a UI Component
                                </h3>
                                <p className="text-xs text-gray-500 leading-normal">"Create a responsive navigation bar with a glassmorphism effect using Tailwind CSS."</p>
                            </div>
                            <div className="p-4 bg-white border border-gray-200 rounded-2xl text-left hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group">
                                <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2 group-hover:text-blue-600">
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                                    Implement Logic
                                </h3>
                                <p className="text-xs text-gray-500 leading-normal">"Write a TypeScript custom hook for handling paginated API data with caching via Zustand."</p>
                            </div>
                            <div className="p-4 bg-white border border-gray-200 rounded-2xl text-left hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group">
                                <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2 group-hover:text-blue-600">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                    Refactor & Improve
                                </h3>
                                <p className="text-xs text-gray-500 leading-normal">"Analyze this component for performance bottlenecks and refactor it to minimize re-renders."</p>
                            </div>
                            <div className="p-4 bg-white border border-gray-200 rounded-2xl text-left hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group">
                                <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2 group-hover:text-blue-600">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                    Debug Issues
                                </h3>
                                <p className="text-xs text-gray-500 leading-normal">"Help me fix a hydrate error occurring in my Next.js layout when using client-side store."</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div ref={containerRef} className="w-full flex flex-col stagger-load" aria-live="polite" aria-atomic="false">
                        {messages.map((msg) => (
                            <MessageBubble key={msg.id} message={msg} onRetry={onRetry} />
                        ))}
                        {showThinkingIndicator && (
                            <div className="flex justify-start w-full mb-12 animate-fade-in">
                                <div className="flex gap-3 items-center bg-white border border-gray-100 rounded-2xl rounded-tl-sm shadow-md px-6 py-4 ml-2 border-l-4 border-l-blue-500">
                                    <div className="flex gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-[bounce_1s_infinite_0ms]"></div>
                                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-[bounce_1s_infinite_200ms]"></div>
                                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-[bounce_1s_infinite_400ms]"></div>
                                    </div>
                                    <span className="text-sm text-gray-400 font-semibold tracking-wide uppercase">{phaseLabel}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
};
