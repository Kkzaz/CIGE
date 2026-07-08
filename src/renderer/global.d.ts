import { CigeAPI } from '../preload/index';

interface AppInitialSettings {
  autoSyncOnLaunch: boolean;
  showSplash: boolean;
  readerFontSize: number;
  readerLineHeight: number;
  readerParaSpacing: number;
  readerTheme: 'light' | 'sepia' | 'dark';
  readerFontFamily: 'serif' | 'sans' | 'system';
}

declare global {
  interface MusicLyricSearchResult {
    success: boolean;
    platform?: string;
    query?: string;
    error?: string;
    results?: Array<{
      songId: number;
      name: string;
      artist: string;
      album?: string;
      similarity: number;
      matchedLyric: string;
      fullLyric?: string;
    }>;
  }

  interface GeminiChatEvent {
    type: 'chunk' | 'done' | 'error';
    data?: string;
  }

  interface Window {
    cigeAPI: CigeAPI;
    __CIGE_INITIAL_SETTINGS__?: AppInitialSettings;
    cigeEditorAPI?: {
      insertTextAtCursor: (text: string) => void;
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
