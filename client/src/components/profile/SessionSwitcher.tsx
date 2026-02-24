import React, { useState, useEffect, useRef } from 'react';
import { History, ChevronDown, MessageSquare, Clock, Check, Trash2 } from 'lucide-react';
import { useSessionStore } from '../../store/session';
import type { SessionMetadata } from '../../types';

export const SessionSwitcher: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [sessions, setSessions] = useState<SessionMetadata[]>([]);
    const [loading, setLoading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const currentSessionId = useSessionStore(state => state.sessionId);
    const switchSession = useSessionStore(state => state.switchSession);
    const deleteSession = useSessionStore(state => state.deleteSession);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const fetchSessions = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/chat/sessions/list');
            if (res.ok) {
                const data = await res.json();
                setSessions(data);
            }
        } catch (err) {
            console.error('Failed to fetch sessions:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchSessions();
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSwitch = async (id: string) => {
        if (deletingId) return; // Don't switch if we are clicking delete
        if (id === currentSessionId) {
            setIsOpen(false);
            return;
        }
        await switchSession(id);
        setIsOpen(false);
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation(); // Don't trigger switch
        if (deletingId === id) {
            try {
                await deleteSession(id);
                // Refresh list
                await fetchSessions();
                setDeletingId(null);
            } catch (err) {
                console.error('Failed to delete:', err);
            }
        } else {
            setDeletingId(id);
        }
    };

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors text-gray-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-200"
                title="History"
            >
                <History className="w-4 h-4 text-gray-500" />
                <span className="hidden sm:inline">History</span>
                <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50 overflow-hidden">
                    <div className="px-4 py-2 border-b border-gray-100 mb-1">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Previous Sessions</h3>
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                        {loading && sessions.length === 0 ? (
                            <div className="px-4 py-8 text-center text-gray-400 text-sm">
                                Loading history...
                            </div>
                        ) : sessions.length === 0 ? (
                            <div className="px-4 py-8 text-center text-gray-400 text-sm">
                                No session history found.
                            </div>
                        ) : (
                            sessions.map((session) => (
                                <button
                                    key={session.id}
                                    onClick={() => handleSwitch(session.id)}
                                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex flex-col gap-1 transition-colors ${session.id === currentSessionId ? 'bg-blue-50/50' : ''
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                                            <span className="truncate max-w-[180px]">
                                                {session.title || formatDate(session.timestamp)}
                                            </span>
                                            {session.id === currentSessionId && (
                                                <Check className="w-3 h-3 text-blue-600" />
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-1 text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                                <MessageSquare className="w-2.5 h-2.5" />
                                                {session.messageCount}
                                            </div>
                                            <button
                                                onClick={(e) => handleDelete(e, session.id)}
                                                className={`p-1 rounded hover:bg-red-50 group/del transition-colors ${deletingId === session.id ? 'text-red-600 bg-red-50' : 'text-gray-300 hover:text-red-500'
                                                    }`}
                                                title={deletingId === session.id ? "Confirm delete" : "Delete session"}
                                            >
                                                {deletingId === session.id ? (
                                                    <span className="text-[10px] font-bold px-1">Confirm</span>
                                                ) : (
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 text-[11px] text-gray-500">
                                        <Clock className="w-3 h-3" />
                                        <span className="truncate">{session.id}</span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
