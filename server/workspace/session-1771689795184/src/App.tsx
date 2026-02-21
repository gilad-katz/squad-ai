import React, { useState } from 'react';
import { NotesProvider, useNotes } from './context/NotesContext';
import { NoteList } from './components/NoteList';
import { NoteDetail } from './components/NoteDetail';
import { NoteForm } from './components/NoteForm';
import { Note } from './types';

const AppContent: React.FC = () => {
  const { notes, addNote, updateNote, deleteNote } = useNotes();
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isFormActive, setIsFormActive] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  const handleSelectNote = (id: string) => {
    setSelectedNoteId(id);
    setIsFormActive(false);
    setEditingNote(null);
  };

  const handleAddNoteClick = () => {
    setSelectedNoteId(null);
    setIsFormActive(true);
    setEditingNote(null);
  };

  const handleEditNoteClick = (note: Note) => {
    setSelectedNoteId(note.id);
    setIsFormActive(true);
    setEditingNote(note);
  };

  const handleSaveNote = (title: string, content: string) => {
    if (editingNote) {
      updateNote(editingNote.id, title, content);
    } else {
      addNote(title, content);
    }
    setIsFormActive(false);
    setEditingNote(null);
    // After saving a new note, select it to view details
    if (!editingNote) {
        const newNoteId = notes[notes.length - 1]?.id; // This is a weak way to get id, better if addNote returned it
        // As addNote doesn't return id, we will need to re-think this or just show list.
        // For now, let's just go back to list view.
        setSelectedNoteId(null);
    }
  };

  const handleCancelForm = () => {
    setIsFormActive(false);
    setEditingNote(null);
  };

  const handleDeleteNote = (id: string) => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      deleteNote(id);
      if (selectedNoteId === id) {
        setSelectedNoteId(null);
      }
      setIsFormActive(false);
      setEditingNote(null);
    }
  };

  const displayedNote = notes.find((note) => note.id === selectedNoteId);

  return (
    <div className="flex h-screen bg-gray-100">
      <NoteList
        notes={notes}
        onSelectNote={handleSelectNote}
        onAddNote={handleAddNoteClick}
        selectedNoteId={selectedNoteId}
      />

      <div className="flex-grow p-4">
        {isFormActive ? (
          <NoteForm initialNote={editingNote || undefined} onSave={handleSaveNote} onCancel={handleCancelForm} />
        ) : displayedNote ? (
          <NoteDetail note={displayedNote} onEdit={handleEditNoteClick} onDelete={handleDeleteNote} />
        ) : (notes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-lg">
            Start by adding your first note!
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-lg">
            Select a note from the left to view its details.
          </div>
        )
        )}
      </div>
    </div>
  );
};

const App: React.FC = () => (
  <NotesProvider>
    <AppContent />
  </NotesProvider>
);

export default App;
