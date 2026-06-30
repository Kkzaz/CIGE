import { create } from 'zustand';

export interface EditorSettings {
  fontSize: number;
  lineHeight: number;
  textAlign: 'left' | 'center' | 'right';
  showLineNumbers: boolean;
  fontFamily: 'serif' | 'sans';
  setFontSize: (size: number) => void;
  setLineHeight: (height: number) => void;
  setTextAlign: (align: 'left' | 'center' | 'right') => void;
  setShowLineNumbers: (show: boolean) => void;
  setFontFamily: (font: 'serif' | 'sans') => void;
  reset: () => void;
}

export interface FontOption {
  value: 'serif' | 'sans';
  label: string;
  preview: string;
}

export const fontOptions: FontOption[] = [
  { value: 'serif', label: '宋体', preview: '宋体' },
  { value: 'sans', label: '黑体', preview: '黑体' },
];

const STORAGE_KEY = 'cige_editor_settings';

const defaultSettings: Omit<EditorSettings, 'setFontSize' | 'setLineHeight' | 'setTextAlign' | 'setShowLineNumbers' | 'setFontFamily' | 'reset'> = {
  fontSize: 16,
  lineHeight: 1.8,
  textAlign: 'left',
  showLineNumbers: true,
  fontFamily: 'serif',
};

// Load settings from localStorage
const loadSettings = (): typeof defaultSettings => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...defaultSettings, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load editor settings:', e);
  }
  return { ...defaultSettings };
};

// Save settings to localStorage
const saveSettings = (settings: typeof defaultSettings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save editor settings:', e);
  }
};

const initialSettings = loadSettings();

export const useEditorSettingsStore = create<EditorSettings>((set) => ({
  ...initialSettings,
  setFontSize: (size) => {
    set((state) => {
      const newState = { ...state, fontSize: size };
      saveSettings({ fontSize: newState.fontSize, lineHeight: newState.lineHeight, textAlign: newState.textAlign, showLineNumbers: newState.showLineNumbers, fontFamily: newState.fontFamily });
      return newState;
    });
  },
  setLineHeight: (height) => {
    set((state) => {
      const newState = { ...state, lineHeight: height };
      saveSettings({ fontSize: newState.fontSize, lineHeight: newState.lineHeight, textAlign: newState.textAlign, showLineNumbers: newState.showLineNumbers, fontFamily: newState.fontFamily });
      return newState;
    });
  },
  setTextAlign: (align) => {
    set((state) => {
      const newState = { ...state, textAlign: align };
      saveSettings({ fontSize: newState.fontSize, lineHeight: newState.lineHeight, textAlign: newState.textAlign, showLineNumbers: newState.showLineNumbers, fontFamily: newState.fontFamily });
      return newState;
    });
  },
  setShowLineNumbers: (show) => {
    set((state) => {
      const newState = { ...state, showLineNumbers: show };
      saveSettings({ fontSize: newState.fontSize, lineHeight: newState.lineHeight, textAlign: newState.textAlign, showLineNumbers: newState.showLineNumbers, fontFamily: newState.fontFamily });
      return newState;
    });
  },
  setFontFamily: (font) => {
    set((state) => {
      const newState = { ...state, fontFamily: font };
      saveSettings({ fontSize: newState.fontSize, lineHeight: newState.lineHeight, textAlign: newState.textAlign, showLineNumbers: newState.showLineNumbers, fontFamily: newState.fontFamily });
      return newState;
    });
  },
  reset: () => {
    saveSettings(defaultSettings);
    set(defaultSettings);
  },
}));