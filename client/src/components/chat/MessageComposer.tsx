import React, { useState, useRef, useEffect } from 'react';
import { SendHorizonal, Image as ImageIcon, X } from 'lucide-react';
import type { Attachment } from '../../types';

interface MessageComposerProps {
    onSend?: (text: string, attachments?: Attachment[]) => void;
    disabled?: boolean;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({ onSend = () => { }, disabled }) => {
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-focus logic: Refocus the textarea when the assistant finishes (disabled -> false)
    useEffect(() => {
        if (!disabled) {
            textareaRef.current?.focus();
        }
    }, [disabled]);

    const handleSend = () => {
        if ((input.trim() || attachments.length > 0) && !disabled) {
            onSend(input.trim(), attachments);
            setInput('');
            setAttachments([]);
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

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const newAttachments: Attachment[] = [];
        for (const file of Array.from(files)) {
            if (!file.type.startsWith('image/')) continue;

            const reader = new FileReader();
            const promise = new Promise<Attachment>((resolve) => {
                reader.onload = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    resolve({
                        id: crypto.randomUUID(),
                        type: 'image',
                        mimeType: file.type,
                        data: base64,
                        name: file.name,
                        url: URL.createObjectURL(file)
                    });
                };
            });
            reader.readAsDataURL(file);
            newAttachments.push(await promise);
        }

        setAttachments(prev => [...prev, ...newAttachments]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeAttachment = (id: string) => {
        setAttachments(prev => {
            const attachment = prev.find(a => a.id === id);
            if (attachment?.url) URL.revokeObjectURL(attachment.url);
            return prev.filter(a => a.id !== id);
        });
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
            <div className="max-w-4xl mx-auto flex flex-col gap-2">
                {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                        {attachments.map(att => (
                            <div key={att.id} className="relative group">
                                <img
                                    src={att.url}
                                    alt={att.name}
                                    className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                                />
                                <button
                                    onClick={() => removeAttachment(att.id)}
                                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="relative flex items-end gap-2 bg-gray-50 rounded-xl border border-gray-200 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 overflow-hidden transition-all pr-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept="image/*"
                        multiple
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={disabled}
                        className="p-3 text-gray-400 hover:text-blue-600 disabled:opacity-50 transition-colors"
                        title="Upload screenshots"
                    >
                        <ImageIcon className="w-5 h-5" />
                    </button>
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                        autoFocus
                        placeholder="Ask FE-SENIOR-01 a question..."
                        className="w-full max-h-[160px] py-3 bg-transparent outline-none resize-none leading-relaxed text-gray-900 placeholder:text-gray-400 disabled:opacity-50"
                        style={{ height: '52px' }}
                    />
                    <div className="py-2.5">
                        <button
                            onClick={handleSend}
                            disabled={(!input.trim() && attachments.length === 0) || disabled}
                            className="p-2 rounded-lg bg-blue-600 text-white disabled:bg-gray-200 disabled:text-gray-400 hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            aria-label="Send message"
                        >
                            <SendHorizonal className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <div className="text-center mt-2 pb-1">
                    <p className="text-xs text-gray-400 font-medium tracking-wide">Enter to send • Shift + Enter for new line</p>
                </div>
            </div>
        </div>
    );
};
