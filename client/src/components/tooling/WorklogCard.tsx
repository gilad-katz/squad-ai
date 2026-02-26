import React, { useMemo, useState } from 'react';
import type { Message, FileAction } from '../../types';
import { FileContentModal } from '../files/FileContentModal';
import {
    CheckCircle2,
    CircleDashed,
    PlayCircle,
    ChevronDown,
    ChevronUp,
    FileCode,
    FilePlus,
    SquarePen,
    Trash2,
    ListChecks,
    BookOpen,
} from 'lucide-react';

interface WorklogCardProps {
    message: Message;
}

const actionMeta = {
    created: { icon: FilePlus, tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/20', label: 'Created' },
    edited: { icon: SquarePen, tone: 'text-blue-300 bg-blue-500/10 border-blue-400/20', label: 'Edited' },
    deleted: { icon: Trash2, tone: 'text-red-300 bg-red-500/10 border-red-400/20', label: 'Deleted' },
};

function uniqueFiles(message: Message): FileAction[] {
    const map = new Map<string, FileAction>();
    const all = [...(message.fileActions || []), ...(message.serverFileActions || [])];
    for (const file of all) {
        map.set(file.filepath, file);
    }
    return Array.from(map.values());
}

function fileMatchesTask(task: string, file: FileAction): boolean {
    const taskText = task.toLowerCase();
    const stem = file.filename.toLowerCase().replace(/\.[^/.]+$/, '');

    if (taskText.includes(file.filename.toLowerCase()) || taskText.includes(stem) || taskText.includes(file.filepath.toLowerCase())) {
        return true;
    }

    const stemTokens = stem.split(/[-_]/).filter((t) => t.length >= 4);
    return stemTokens.some((token) => taskText.includes(token));
}

function statusIcon(status: 'done' | 'in_progress' | 'pending') {
    if (status === 'done') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    if (status === 'in_progress') return <PlayCircle className="w-4 h-4 text-blue-400 animate-pulse" />;
    return <CircleDashed className="w-4 h-4 text-slate-500" />;
}

export const WorklogCard: React.FC<WorklogCardProps> = ({ message }) => {
    const [cardOpen, setCardOpen] = useState(true);
    const [progressOpen, setProgressOpen] = useState(true);
    const [expandedTasks, setExpandedTasks] = useState<Record<number, boolean>>({});
    const [showAllFiles, setShowAllFiles] = useState(false);
    const [activeFile, setActiveFile] = useState<FileAction | null>(null);

    const files = useMemo(() => uniqueFiles(message), [message]);
    const tasks = message.transparency?.tasks || [];
    const visibleFiles = showAllFiles ? files : files.slice(0, 8);
    const primaryAction = files[0]?.action ? actionMeta[files[0].action] : null;

    const toggleTask = (index: number) => {
        setExpandedTasks((prev) => ({
            ...prev,
            [index]: !(prev[index] ?? index === 0),
        }));
    };

    return (
        <>
            <div className="rounded-xl overflow-hidden border border-slate-800 bg-[#0a1220] text-slate-200 shadow-[0_8px_28px_rgba(0,0,0,0.35)]">
                <div className="px-4 py-3 border-b border-slate-800 bg-[#0a1220]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-slate-300">
                            <BookOpen className="w-4 h-4 text-slate-400" />
                            <span>{primaryAction?.label || 'Updated'} Task</span>
                        </div>
                        <button
                            onClick={() => setCardOpen((v) => !v)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white"
                        >
                            {cardOpen ? 'Collapse all' : 'Expand all'}
                            {cardOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {cardOpen && (
                    <>
                        <div className="px-4 py-3 border-b border-slate-800 bg-[#0a1220]">
                            <h3 className="text-xl font-semibold text-slate-100 leading-tight mb-1">
                                {message.transparency?.title || 'Executing Task'}
                            </h3>
                            {message.summary && (
                                <p className="text-sm text-slate-400 leading-relaxed">
                                    {message.summary.slice(0, 220)}{message.summary.length > 220 ? '…' : ''}
                                </p>
                            )}
                        </div>

                        {files.length > 0 && (
                            <div className="px-4 py-3 border-b border-slate-800 bg-[#0a1220]">
                                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Files Edited</h4>
                                <div className="flex flex-wrap gap-2">
                                    {visibleFiles.map((file) => {
                                        const meta = actionMeta[file.action] || actionMeta.edited;
                                        const Icon = meta.icon;
                                        return (
                                            <button
                                                key={file.id}
                                                onClick={() => setActiveFile(file)}
                                                className={`inline-flex items-center gap-1.5 border rounded-md px-2 py-1 text-xs font-semibold transition-colors hover:bg-slate-800 ${meta.tone}`}
                                            >
                                                <Icon className="w-3.5 h-3.5" />
                                                <span className="text-slate-100">{file.filename}</span>
                                            </button>
                                        );
                                    })}
                                    {!showAllFiles && files.length > visibleFiles.length && (
                                        <button
                                            onClick={() => setShowAllFiles(true)}
                                            className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                                        >
                                            +{files.length - visibleFiles.length} more
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="px-4 py-3 bg-[#0a1220]">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <ListChecks className="w-4 h-4 text-slate-400" />
                                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Progress Updates</h4>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{tasks.length}</span>
                                </div>
                                <button
                                    onClick={() => setProgressOpen((v) => !v)}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white"
                                >
                                    {progressOpen ? 'Collapse all' : 'Expand all'}
                                    {progressOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                            </div>

                            {progressOpen && (
                                <div className="mt-3 space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                                    {tasks.length === 0 && (
                                        <div className="text-sm text-slate-500">No task updates yet.</div>
                                    )}
                                    {tasks.map((task, idx) => {
                                        const expanded = expandedTasks[idx] ?? idx === 0;
                                        const relatedFiles = files.filter((file) => fileMatchesTask(task.description, file)).slice(0, 5);
                                        return (
                                            <div key={task.id || idx} className="rounded-lg border border-slate-800 bg-slate-900/45">
                                                <button
                                                    onClick={() => toggleTask(idx)}
                                                    className="w-full px-3 py-2.5 flex items-start gap-2.5 text-left"
                                                >
                                                    <span className="text-xs text-slate-500 font-semibold mt-0.5">{idx + 1}</span>
                                                    <div className="mt-0.5">{statusIcon(task.status)}</div>
                                                    <div className="min-w-0 flex-1 text-sm text-slate-100 leading-snug">
                                                        {task.description}
                                                    </div>
                                                    {expanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                                                </button>

                                                {expanded && (
                                                    <div className="px-3 pb-3 ml-9 space-y-2">
                                                        {task.purpose && (
                                                            <p className="text-sm text-slate-400 leading-relaxed">{task.purpose}</p>
                                                        )}

                                                        {relatedFiles.length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {relatedFiles.map((file) => (
                                                                    <button
                                                                        key={`${task.id}-${file.id}`}
                                                                        onClick={() => setActiveFile(file)}
                                                                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                                                                    >
                                                                        <FileCode className="w-3 h-3 text-slate-400" />
                                                                        {file.filename}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {activeFile && (
                <FileContentModal
                    fileAction={activeFile}
                    onClose={() => setActiveFile(null)}
                />
            )}
        </>
    );
};
