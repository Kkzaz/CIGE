import { create } from 'zustand';

interface StatusBarStore {
  charCount: number;
  lineCount: number;
  rhymeFinals: string[];
  verseCount: number;
  chorusCount: number;
  bridgeCount: number;
  outroCount: number;
  saveStatus: 'saved' | 'saving' | 'unsaved';
  updateStats: (stats: Partial<Omit<StatusBarStore, 'updateStats'>>) => void;
  reset: () => void;
}

const useStatusBarStore = create<StatusBarStore>((set) => ({
  charCount: 0,
  lineCount: 0,
  rhymeFinals: [],
  verseCount: 0,
  chorusCount: 0,
  bridgeCount: 0,
  outroCount: 0,
  saveStatus: 'saved',
  updateStats: (stats) => set((state) => ({ ...state, ...stats })),
  reset: () => set({
    charCount: 0,
    lineCount: 0,
    rhymeFinals: [],
    verseCount: 0,
    chorusCount: 0,
    bridgeCount: 0,
    outroCount: 0,
    saveStatus: 'saved',
  }),
}));

export default useStatusBarStore;
