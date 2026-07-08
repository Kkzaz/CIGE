import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export type ReaderTheme = 'light' | 'sepia' | 'dark';
export type ReaderFontFamily = 'serif' | 'sans' | 'system';

export interface GeminiChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
}

export interface GeminiChatSession {
  id: string;
  title: string;
  messages: GeminiChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  autoSyncOnLaunch: boolean;
  showSplash: boolean;
  readerFontSize: number;
  readerLineHeight: number;
  readerParaSpacing: number;
  readerTheme: ReaderTheme;
  readerFontFamily: ReaderFontFamily;
  geminiChatHistory: GeminiChatMessage[];
  geminiChats: GeminiChatSession[];
}

const defaultSettings: AppSettings = {
  autoSyncOnLaunch: true,
  showSplash: true,
  readerFontSize: 17,
  readerLineHeight: 1.8,
  readerParaSpacing: 0.8,
  readerTheme: 'light',
  readerFontFamily: 'serif',
  geminiChatHistory: [],
  geminiChats: [],
};

const settingsPath = path.join(app.getPath('userData'), 'app_settings.json');

function ensureSettingsDir(): void {
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getAppSettings(): AppSettings {
  try {
    ensureSettingsDir();
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return { ...defaultSettings, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load app settings:', e);
  }
  return { ...defaultSettings };
}

export function setAppSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  try {
    ensureSettingsDir();
    const current = getAppSettings();
    const next = { ...current, [key]: value };
    fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save app setting:', e);
  }
}

export function resetAppSettings(): void {
  try {
    ensureSettingsDir();
    fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to reset app settings:', e);
  }
}
