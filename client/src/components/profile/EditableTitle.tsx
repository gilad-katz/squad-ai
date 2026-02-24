import React, { useState, useEffect, useRef } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { useSessionStore } from '../../store/session';

export const EditableTitle: React.FC = () => {
    const sessionTitle = useSessionStore(state => state.sessionTitle);
    const sessionId = useSessionStore(state => state.sessionId);
    const updateSessionTitle = useSessionStore(state => state.updateSessionTitle);

    const [isEditing, setIsEditing] = useState(false);
    const [tempTitle, setTempTitle] = useState(sessionTitle || '');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setTempTitle(sessionTitle || '');
    }, [sessionTitle]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleSave = async () => {
        if (tempTitle.trim() && tempTitle !== sessionTitle) {
            await updateSessionTitle(tempTitle.trim());
        }
        setIsEditing(false);
    };

    const handleCancel = () => {
        setTempTitle(sessionTitle || '');
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') handleCancel();
    };

    if (!sessionId) {
        return <h1 className="font-bold text-gray-900 leading-tight">New Workspace</h1>;
    }

    if (isEditing) {
        return (
            <div className="flex items-center gap-2">
                <input
                    ref={inputRef}
                    type="text"
                    value={tempTitle}
                    onChange={(e) => setTempTitle(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleSave}
                    className="font-bold text-gray-900 leading-tight bg-gray-50 border border-blue-300 rounded px-1 outline-none focus:ring-2 focus:ring-blue-100"
                />
                <button onClick={handleSave} className="text-green-600 hover:text-green-700">
                    <Check className="w-4 h-4" />
                </button>
                <button onClick={handleCancel} className="text-gray-400 hover:text-gray-500">
                    <X className="w-4 h-4" />
                </button>
            </div>
        );
    }

    return (
        <div
            className="flex items-center gap-2 group cursor-pointer"
            onClick={() => setIsEditing(true)}
        >
            <h1 className="font-bold text-gray-900 leading-tight truncate max-w-[300px]">
                {sessionTitle || 'Untitled Workspace'}
            </h1>
            <Pencil className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
    );
};
