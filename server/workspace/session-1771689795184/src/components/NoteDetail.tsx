import React from 'react';
import { Note } from '../types';

interface NoteDetailProps {
  note: Note;
  onEdit: (note: Note) => void;
  onDelete: (id: string) => void;
}

export const NoteDetail: React.FC<NoteDetailProps> = ({ note, onEdit, onDelete }) => {
  const createdAt = new Date(note.createdAt).toLocaleString();
  const updatedAt = new Date(note.updatedAt).toLocaleString();

  return (
    <div className="flex-grow p-6 bg-white shadow-lg rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-3xl font-bold text-gray-900">{note.title}</h2>
        <div className="space-x-2">
          <button
            onClick={() => onEdit(note)}
            className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(note.id)}
            className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
          >
            Delete
          </button>
        </div>
      </div>
      <div className="text-gray-700 whitespace-pre-wrap leading-relaxed mb-6">
        {note.content}
      </div>
      <div className="text-sm text-gray-500 border-t pt-4">
        <p>Created: {createdAt}</p>
        <p>Last Updated: {updatedAt}</p>
      </div>
    </div>
  );
};
