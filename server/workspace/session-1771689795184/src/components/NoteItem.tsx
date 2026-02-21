import React from 'react';
import { Note } from '../types';

interface NoteItemProps {
  note: Note;
  onSelect: (id: string) => void;
  isActive: boolean;
}

export const NoteItem: React.FC<NoteItemProps> = ({ note, onSelect, isActive }) => {
  const date = new Date(note.updatedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <li
      className={`p-3 border-b cursor-pointer hover:bg-gray-100 ${isActive ? 'bg-blue-100' : ''}`}
      onClick={() => onSelect(note.id)}
    >
      <h3 className="text-lg font-semibold truncate">{note.title}</h3>
      <p className="text-sm text-gray-600 truncate mb-1">{note.content}</p>
      <p className="text-xs text-gray-500">Last updated: {date}</p>
    </li>
  );
};
