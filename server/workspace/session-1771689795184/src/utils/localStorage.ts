import { Note } from '../types';

const STORAGE_KEY = 'personalNotes';

export const getNotesFromLocalStorage = (): Note[] => {
  try {
    const storedNotes = localStorage.getItem(STORAGE_KEY);
    return storedNotes ? JSON.parse(storedNotes) : [];
  } catch (error) {
    console.error('Failed to retrieve notes from localStorage', error);
    return [];
  }
};

export const saveNotesToLocalStorage = (notes: Note[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch (error) {
    console.error('Failed to save notes to localStorage', error);
  }
};