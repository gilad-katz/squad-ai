import React, { useState, useRef } from 'react';
import { SendHorizonal } from 'lucide-react';

interface MessageComposerProps {
    onSend?: (text: string) => void;
    disabled?: boolean;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({ onSend = () => { }, disabled }) => {
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSend = () => {
        if (input.trim() && !disabled) {
            onSend(input.trim());
            setInput('');
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto'; // Reset after submit
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);

        // Auto-grow height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
        }
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <div className="max-w-4xl mx-auto relative flex items-end gap-2 bg-gray-50 rounded-xl border border-gray-200 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 overflow-hidden transition-all pr-2">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    placeholder="Ask FE-SENIOR-01 a question..."
                    className="w-full max-h-[160px] py-3 pl-4 bg-transparent outline-none resize-none leading-relaxed text-gray-900 placeholder:text-gray-400 disabled:opacity-50"
                    style={{ height: '52px' }}
                />
                <div className="py-2.5">
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || disabled}
                        className="p-2 rounded-lg bg-blue-600 text-white disabled:bg-gray-200 disabled:text-gray-400 hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        aria-label="Send message"
                    >
                        <SendHorizonal className="w-5 h-5" />
                    </button>
                </div>
            </div>
            <div className="max-w-4xl mx-auto text-center mt-2 pb-1">
                <p className="text-xs text-gray-400 font-medium tracking-wide">Enter to send • Shift + Enter for new line</p>
            </div>
        </div>
    );
};
