import React from 'react';
import { NoteItem } from './NoteItem';
import { Note } from '../types';

interface NoteListProps {
  notes: Note[];
  onSelectNote: (id: string) => void;
  onAddNote: () => void;
  selectedNoteId: string | null;
}

export const NoteList: React.FC<NoteListProps> = ({ notes, onSelectNote, onAddNote, selectedNoteId }) => {
  return (
    <div className="w-1/3 border-r bg-gray-50 flex flex-col">
      <div className="p-4 border-b">
        <button
          onClick={onAddNote}
          className="w-full bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
        >
          + Add New Note
        </button>
      </div>
      <ul className="flex-grow overflow-y-auto">
        {notes.length === 0 ? (
          <p className="text-center text-gray-500 mt-4">No notes yet. Click 'Add New Note' to create one.</p>
        ) : (
          notes.sort((a, b) => b.updatedAt - a.updatedAt).map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              onSelect={onSelectNote}
              isActive={note.id === selectedNoteId}
            />
          ))
        )}
      </ul>
    </div>
  );
};
