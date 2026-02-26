import React, { useState, useRef, useEffect } from 'react';
import { SendHorizonal, Image as ImageIcon, X, Square } from 'lucide-react';
import type { Attachment } from '../../types';

interface MessageComposerProps {
    onSend?: (text: string, attachments?: Attachment[]) => void;
    onStop?: () => void;
    disabled?: boolean;
    docked?: boolean;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({ onSend = () => { }, onStop, disabled, docked = false }) => {
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const attachmentsRef = useRef<Attachment[]>([]);

    useEffect(() => {
        if (!disabled) {
            textareaRef.current?.focus();
        }
    }, [disabled]);

    useEffect(() => {
        attachmentsRef.current = attachments;
    }, [attachments]);

    const handleSend = () => {
        if ((input.trim() || attachments.length > 0) && !disabled) {
            onSend(input.trim(), attachments);
            attachments.forEach((a) => {
                if (a.url) URL.revokeObjectURL(a.url);
            });
            setInput('');
            setAttachments([]);
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
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

        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
        }
    };

    useEffect(() => {
        return () => {
            attachmentsRef.current.forEach((a) => {
                if (a.url) URL.revokeObjectURL(a.url);
            });
        };
    }, []);

    return (
        <div className={docked
            ? 'relative glass-effect p-4 border-t border-gray-200/50'
            : 'fixed bottom-0 left-0 right-0 glass-effect p-4 z-50 shadow-[0_-8px_30px_rgb(0,0,0,0.04)] border-t border-gray-200/50'}
        >
            <div className="max-w-4xl mx-auto flex flex-col gap-2">
                {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-3 mb-3 animate-fade-in">
                        {attachments.map(att => (
                            <div key={att.id} className="relative group">
                                <img
                                    src={att.url}
                                    alt={att.name}
                                    className="w-24 h-24 object-cover rounded-2xl border-2 border-white shadow-lg group-hover:scale-[1.05] transition-transform duration-300"
                                />
                                <button
                                    onClick={() => removeAttachment(att.id)}
                                    className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-md hover:bg-red-600 active:scale-90"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <div className="relative flex items-end gap-2 bg-white/50 backdrop-blur-sm rounded-2xl border border-gray-200/80 focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-500 group transition-all pr-2.5 pl-1 shadow-inner">
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
                        className="p-3.5 text-gray-400 hover:text-blue-600 disabled:opacity-30 transition-all hover:scale-110 active:scale-90"
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
                        className="w-full max-h-[200px] py-4 bg-transparent outline-none resize-none leading-relaxed text-gray-900 placeholder:text-gray-400 disabled:opacity-50 text-base"
                        style={{ height: '56px' }}
                    />
                    <div className="py-3 flex items-center gap-1.5">
                        {disabled && onStop ? (
                            <button
                                onClick={onStop}
                                className="p-2.5 rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-white hover:shadow-lg hover:shadow-red-500/20 transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 animate-pulse"
                                aria-label="Stop generation"
                                title="Stop generation"
                            >
                                <Square className="w-4 h-4 fill-current" />
                            </button>
                        ) : (
                            <button
                                onClick={handleSend}
                                disabled={(!input.trim() && attachments.length === 0) || disabled}
                                className="p-2.5 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 hover:shadow-lg hover:shadow-blue-500/20 transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                aria-label="Send message"
                            >
                                <SendHorizonal className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>
                <div className="text-center mt-2 pb-1">
                    <p className="text-[11px] text-gray-400 font-bold tracking-widest uppercase opacity-70">Enter to send • Shift + Enter for new line</p>
                </div>
            </div>
        </div>
    );
};
