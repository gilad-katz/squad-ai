import React, { useMemo, useState } from 'react';
import type { Message, FileAction } from '../../types';
import { FileContentModal } from '../files/FileContentModal';
import {
    CheckCircle2,
    CircleDashed,
    PlayCircle,
    ChevronDown,
    ChevronUp,
    FilePlus,
    SquarePen,
    Trash2,
    BookOpen,
    AlertTriangle,
    OctagonAlert,
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

function resolveFileTaskStatus(file: FileAction, tasks: Array<{ description: string; status: 'done' | 'in_progress' | 'pending' }>): 'done' | 'in_progress' | 'pending' {
    if (file.status === 'executing') return 'in_progress';

    const related = tasks.filter(task => fileMatchesTask(task.description, file));
    if (related.some(task => task.status === 'in_progress')) return 'in_progress';
    if (related.length > 0 && related.every(task => task.status === 'done')) return 'done';
    if (related.some(task => task.status === 'pending')) return 'pending';

    return file.status === 'complete' ? 'done' : 'pending';
}

function fileErrorCount(file: FileAction): number {
    const text = (file.content || '').toLowerCase();
    return text.includes('[execution failed:') ? 1 : 0;
}

export const WorklogCard: React.FC<WorklogCardProps> = ({ message }) => {
    const [cardOpen, setCardOpen] = useState(true);
    const [showAllFiles, setShowAllFiles] = useState(false);
    const [activeFile, setActiveFile] = useState<FileAction | null>(null);

    const files = useMemo(() => uniqueFiles(message), [message]);
    const tasks = message.transparency?.tasks || [];
    const visibleFiles = showAllFiles ? files : files.slice(0, 8);
    const primaryAction = files[0]?.action ? actionMeta[files[0].action] : null;

    return (
        <>
            <div className="rounded-xl overflow-hidden border border-slate-800 bg-[#0a1220] text-slate-200 shadow-[0_8px_28px_rgba(0,0,0,0.35)]">
                <div className="px-3 py-2.5 border-b border-slate-800 bg-[#0a1220]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-slate-300">
                            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                            <span>{primaryAction?.label || 'Updated'} Task</span>
                        </div>
                        <button
                            onClick={() => setCardOpen((v) => !v)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-white"
                        >
                            {cardOpen ? 'Collapse all' : 'Expand all'}
                            {cardOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                </div>

                {cardOpen && (
                    <>
                        <div className="px-3 py-2.5 border-b border-slate-800 bg-[#0a1220]">
                            <h3 className="text-base font-semibold text-slate-100 leading-tight mb-0.5">
                                {message.transparency?.title || 'Executing Task'}
                            </h3>
                            {message.summary && (
                                <p className="text-xs text-slate-400 leading-relaxed">
                                    {message.summary.slice(0, 140)}{message.summary.length > 140 ? '…' : ''}
                                </p>
                            )}
                        </div>

                        {files.length > 0 && (
                            <div className="px-3 py-2.5 border-b border-slate-800 bg-[#0a1220]">
                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Files Edited</h4>
                                <div className="flex flex-wrap gap-1.5">
                                    {visibleFiles.map((file) => {
                                        const meta = actionMeta[file.action] || actionMeta.edited;
                                        const Icon = meta.icon;
                                        const status = resolveFileTaskStatus(file, tasks);
                                        const warningCount = file.warnings || 0;
                                        const errorCount = fileErrorCount(file);
                                        return (
                                            <button
                                                key={file.id}
                                                onClick={() => setActiveFile(file)}
                                                className={`inline-flex items-center gap-1.5 border rounded-md px-2 py-1 text-[11px] leading-none transition-colors hover:bg-slate-800/90 ${meta.tone}`}
                                            >
                                                <div className="shrink-0">{statusIcon(status)}</div>
                                                <Icon className="w-3 h-3 shrink-0" />
                                                <span className="max-w-[120px] truncate text-slate-100 font-semibold">{file.filename}</span>
                                                <span className="text-emerald-300 font-semibold">+{Math.max(0, file.linesAdded || 0)}</span>
                                                <span className="text-rose-300 font-semibold">-{Math.max(0, file.linesRemoved || 0)}</span>
                                                {warningCount > 0 && (
                                                    <span className="inline-flex items-center gap-0.5 text-amber-300 font-semibold">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        {warningCount}
                                                    </span>
                                                )}
                                                {errorCount > 0 && (
                                                    <span className="inline-flex items-center gap-0.5 text-red-300 font-semibold">
                                                        <OctagonAlert className="w-3 h-3" />
                                                        {errorCount}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                    {!showAllFiles && files.length > visibleFiles.length && (
                                        <button
                                            onClick={() => setShowAllFiles(true)}
                                            className="inline-flex items-center justify-center rounded-md px-2 py-1 text-[11px] font-semibold border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                                        >
                                            +{files.length - visibleFiles.length} more
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

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
