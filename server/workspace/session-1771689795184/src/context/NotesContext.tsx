import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Note, NotesContextType } from '../types';
import { getNotesFromLocalStorage, saveNotesToLocalStorage } from '../utils/localStorage';

const NotesContext = createContext<NotesContextType | undefined>(undefined);

interface NotesProviderProps {
  children: ReactNode;
}

export const NotesProvider: React.FC<NotesProviderProps> = ({ children }) => {
  const [notes, setNotes] = useState<Note[]>(() => getNotesFromLocalStorage());

  useEffect(() => {
    saveNotesToLocalStorage(notes);
  }, [notes]);

  const addNote = (title: string, content: string) => {
    const newNote: Note = {
      id: Date.now().toString(),
      title,
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setNotes((prevNotes) => [...prevNotes, newNote]);
  };

  const updateNote = (id: string, title: string, content: string) => {
    setNotes((prevNotes) =>
      prevNotes.map((note) =>
        note.id === id ? { ...note, title, content, updatedAt: Date.now() } : note
      )
    );
  };

  const deleteNote = (id: string) => {
    setNotes((prevNotes) => prevNotes.filter((note) => note.id !== id));
  };

  const value = {
    notes,
    addNote,
    updateNote,
    deleteNote,
  };

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
};

export const useNotes = () => {
  const context = useContext(NotesContext);
  if (context === undefined) {
    throw new Error('useNotes must be used within a NotesProvider');
  }
  return context;
};