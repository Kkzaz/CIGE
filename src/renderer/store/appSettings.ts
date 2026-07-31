import { create } from 'zustand';
import type { AppSettings as AppSettingsData, ReaderTheme, ReaderFontFamily } from '../../shared/types';

export type { ReaderTheme, ReaderFontFamily };

interface AppSettingsStore extends AppSettingsData {
  setAutoSyncOnLaunch: (value: boolean) => void;
  setShowSplash: (value: boolean) => void;
  setReaderFontSize: (value: number) => void;
  setReaderLineHeight: (value: number) => void;
  setReaderParaSpacing: (value: number) => void;
  setReaderTheme: (value: ReaderTheme) => void;
  setReaderFontFamily: (value: ReaderFontFamily) => void;
  setReaderReadingSpeed: (value: number) => void;
  setReaderAutoEnterImmersive: (value: boolean) => void;
  reset: () => void;
}

const defaultSettings: AppSettingsData = {
  autoSyncOnLaunch: true,
  showSplash: true,
  readerFontSize: 17,
  readerLineHeight: 1.8,
  readerParaSpacing: 0.8,
  readerTheme: 'light',
  readerFontFamily: 'serif',
  readerReadingSpeed: 500,
  readerAutoEnterImmersive: false,
  geminiChatHistory: [],
  geminiChats: [],
};

const hasMainAPI = typeof window !== 'undefined' && window.cigeAPI && typeof window.cigeAPI.getAppSettings === 'function';

const loadInitialSettings = () => {
  if (typeof window !== 'undefined' && window.__CIGE_INITIAL_SETTINGS__) {
    return { ...defaultSettings, ...window.__CIGE_INITIAL_SETTINGS__ };
  }
  return { ...defaultSettings };
};

const initialSettings = loadInitialSettings();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const useAppSettingsStore = create<AppSettingsStore>((set) => ({
  ...initialSettings,
  setAutoSyncOnLaunch: (value) => {
    set((state) => {
      const newState = { ...state, autoSyncOnLaunch: value };
      if (hasMainAPI) {
        window.cigeAPI.setAppSetting('autoSyncOnLaunch', newState.autoSyncOnLaunch);
      }
      return newState;
    });
  },
  setShowSplash: (value) => {
    set((state) => {
      const newState = { ...state, showSplash: value };
      if (hasMainAPI) {
        window.cigeAPI.setAppSetting('showSplash', newState.showSplash);
      }
      return newState;
    });
  },
  setReaderFontSize: (value) => {
    set((state) => {
      const next = clamp(value, 12, 28);
      const newState = { ...state, readerFontSize: next };
      if (hasMainAPI) {
        window.cigeAPI.setAppSetting('readerFontSize', next);
      }
      return newState;
    });
  },
  setReaderLineHeight: (value) => {
    set((state) => {
      const next = clamp(value, 1.2, 2.5);
      const newState = { ...state, readerLineHeight: next };
      if (hasMainAPI) {
        window.cigeAPI.setAppSetting('readerLineHeight', next);
      }
      return newState;
    });
  },
  setReaderParaSpacing: (value) => {
    set((state) => {
      const next = clamp(value, 0, 2);
      const newState = { ...state, readerParaSpacing: next };
      if (hasMainAPI) {
        window.cigeAPI.setAppSetting('readerParaSpacing', next);
      }
      return newState;
    });
  },
  setReaderTheme: (value) => {
    set((state) => {
      const newState = { ...state, readerTheme: value };
      if (hasMainAPI) {
        window.cigeAPI.setAppSetting('readerTheme', value);
      }
      return newState;
    });
  },
  setReaderFontFamily: (value) => {
    set((state) => {
      const newState = { ...state, readerFontFamily: value };
      if (hasMainAPI) {
        window.cigeAPI.setAppSetting('readerFontFamily', value);
      }
      return newState;
    });
  },
  setReaderReadingSpeed: (value) => {
    set((state) => {
      const next = clamp(value, 100, 2000);
      const newState = { ...state, readerReadingSpeed: next };
      if (hasMainAPI) {
        window.cigeAPI.setAppSetting('readerReadingSpeed', next);
      }
      return newState;
    });
  },
  setReaderAutoEnterImmersive: (value) => {
    set((state) => {
      const newState = { ...state, readerAutoEnterImmersive: value };
      if (hasMainAPI) {
        window.cigeAPI.setAppSetting('readerAutoEnterImmersive', value);
      }
      return newState;
    });
  },
  reset: () => {
    if (hasMainAPI) {
      window.cigeAPI.resetAppSettings();
    }
    set(defaultSettings);
  },
}));
