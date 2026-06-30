import { create } from 'zustand';

export interface AppSettings {
  autoSyncOnLaunch: boolean;
  showSplash: boolean;
  setAutoSyncOnLaunch: (value: boolean) => void;
  setShowSplash: (value: boolean) => void;
  reset: () => void;
}

const STORAGE_KEY = 'cige_app_settings';

const defaultSettings: Omit<AppSettings, 'setAutoSyncOnLaunch' | 'setShowSplash' | 'reset'> = {
  autoSyncOnLaunch: true,
  showSplash: true,
};

const hasMainAPI = typeof window !== 'undefined' && window.cigeAPI && typeof window.cigeAPI.getAppSettings === 'function';

const loadSettings = (): typeof defaultSettings => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...defaultSettings, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load app settings:', e);
  }
  return { ...defaultSettings };
};

const saveSettings = (settings: typeof defaultSettings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save app settings:', e);
  }
};

const syncToMain = (settings: typeof defaultSettings) => {
  if (!hasMainAPI) return;
  window.cigeAPI.setAppSetting('autoSyncOnLaunch', settings.autoSyncOnLaunch);
  window.cigeAPI.setAppSetting('showSplash', settings.showSplash);
};

const initialSettings = loadSettings();

export const useAppSettingsStore = create<AppSettings>((set) => ({
  ...initialSettings,
  setAutoSyncOnLaunch: (value) => {
    set((state) => {
      const newState = { ...state, autoSyncOnLaunch: value };
      saveSettings({ autoSyncOnLaunch: newState.autoSyncOnLaunch, showSplash: newState.showSplash });
      syncToMain({ autoSyncOnLaunch: newState.autoSyncOnLaunch, showSplash: newState.showSplash });
      return newState;
    });
  },
  setShowSplash: (value) => {
    set((state) => {
      const newState = { ...state, showSplash: value };
      saveSettings({ autoSyncOnLaunch: newState.autoSyncOnLaunch, showSplash: newState.showSplash });
      syncToMain({ autoSyncOnLaunch: newState.autoSyncOnLaunch, showSplash: newState.showSplash });
      return newState;
    });
  },
  reset: () => {
    saveSettings(defaultSettings);
    syncToMain(defaultSettings);
    if (hasMainAPI) {
      window.cigeAPI.resetAppSettings();
    }
    set(defaultSettings);
  },
}));

// Sync settings from main process on startup to handle cases where settings were changed externally
if (hasMainAPI) {
  window.cigeAPI.getAppSettings().then((settings) => {
    const s = settings as typeof defaultSettings;
    const merged = { ...defaultSettings, ...s };
    saveSettings(merged);
    useAppSettingsStore.setState(merged);
  });
}
