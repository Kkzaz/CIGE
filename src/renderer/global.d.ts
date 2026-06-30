import { CigeAPI } from '../preload/index';

declare global {
  interface Window {
    cigeAPI: CigeAPI;
    cigeEditorAPI?: {
      replaceCharBeforeCursor: (char: string) => void;
      getCharBeforeCursor: () => string;
      toggleBold: () => void;
      toggleItalic: () => void;
      toggleUnderline: () => void;
      toggleStrike: () => void;
      setTextAlign: (align: string) => void;
    };
  }
}

export {};
