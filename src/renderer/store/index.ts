import { create } from 'zustand';
import type { Writing, Excerpt, Inspiration } from '../../shared/types';

interface CigeStore {
  // Writings
  writings: Writing[];
  currentWriting: Writing | null;
  setWritings: (writings: Writing[]) => void;
  setCurrentWriting: (writing: Writing | null) => void;

  // Excerpts
  excerpts: Excerpt[];
  setExcerpts: (excerpts: Excerpt[]) => void;

  // Inspirations
  inspirations: Inspiration[];
  setInspirations: (inspirations: Inspiration[]) => void;
}

export const useStore = create<CigeStore>((set) => ({
  writings: [],
  currentWriting: null,
  setWritings: (writings) => set({ writings }),
  setCurrentWriting: (writing) => set({ currentWriting: writing }),

  excerpts: [],
  setExcerpts: (excerpts) => set({ excerpts }),

  inspirations: [],
  setInspirations: (inspirations) => set({ inspirations }),
}));
