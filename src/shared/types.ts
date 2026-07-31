// Shared type definitions for CiGe

export interface Writing {
  id: number;
  title: string;
  content: string;
  word_count: number;
  folder_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface WritingSnapshot {
  id: number;
  writing_id: number;
  content: string;
  snapshot_at: string;
}

export interface Excerpt {
  id: number;
  content: string;
  source: string;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface ExcerptAudio {
  id: number;
  excerpt_id: number;
  audio_path: string;
  duration: number;
  sort_order: number;
  deleted: number;
  created_at: string;
}

export interface Inspiration {
  id: number;
  content: string;
  tags: string;
  deleted: number;
  created_at: string;
}

export interface DeletedItem {
  id: number;
  type: 'writing' | 'excerpt' | 'inspiration' | 'excerpt_audio';
  title: string;
  preview: string;
  deleted_at: string;
  audio_path?: string;
  audio_duration?: number;
}

export interface Folder {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string;
}

// ====================== App Settings ======================

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

/**
 * 应用设置（主进程 / 渲染进程共享单一来源）
 * 字段变化时请同步更新 defaultSettings（settings.ts 与 appSettings.ts 各自保留默认值副本，
 * 因为主进程 JSON 文件需独立可读写，渲染端 zustand 也需独立初始化）
 */
export interface AppSettings {
  autoSyncOnLaunch: boolean;
  showSplash: boolean;
  readerFontSize: number;
  readerLineHeight: number;
  readerParaSpacing: number;
  readerTheme: ReaderTheme;
  readerFontFamily: ReaderFontFamily;
  readerReadingSpeed: number;
  readerAutoEnterImmersive: boolean;
  geminiChatHistory: GeminiChatMessage[];
  geminiChats: GeminiChatSession[];
}

// IPC channel names
export const IPC_CHANNELS = {
  // Writings
  WRITING_GET_ALL: 'writing:get-all',
  WRITING_GET_BY_ID: 'writing:get-by-id',
  WRITING_CREATE: 'writing:create',
  WRITING_UPDATE: 'writing:update',
  WRITING_DELETE: 'writing:delete',
  WRITING_SAVE_SNAPSHOT: 'writing:save-snapshot',

  // Excerpts
  EXCERPT_GET_ALL: 'excerpt:get-all',
  EXCERPT_SEARCH: 'excerpt:search',
  EXCERPT_CREATE: 'excerpt:create',
  EXCERPT_UPDATE: 'excerpt:update',
  EXCERPT_DELETE: 'excerpt:delete',
  EXCERPT_SAVE_AUDIO: 'excerpt:save-audio',
  EXCERPT_GET_AUDIOS: 'excerpt:get-audios',
  EXCERPT_DELETE_AUDIO: 'excerpt:delete-audio',

  // Inspirations
  INSPIRATION_GET_ALL: 'inspiration:get-all',
  INSPIRATION_CREATE: 'inspiration:create',
  INSPIRATION_DELETE: 'inspiration:delete',

  // Recycle bin
  RECYCLE_GET_ALL: 'recycle:get-all',
  RECYCLE_RESTORE: 'recycle:restore',
  RECYCLE_PERMANENT_DELETE: 'recycle:permanent-delete',

  // Floating input
  FLOATING_INPUT_OPEN: 'floating-input:open',
  FLOATING_INPUT_SUBMIT: 'floating-input:submit',

  // Folders
  FOLDER_GET_ALL: 'folder:get-all',
  FOLDER_CREATE: 'folder:create',
  FOLDER_RENAME: 'folder:rename',
  FOLDER_DELETE: 'folder:delete',
} as const;
