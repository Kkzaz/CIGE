import { contextBridge, ipcRenderer, clipboard } from 'electron';

const initialSettings = ipcRenderer.sendSync('app:get-settings-sync');

const api = {
  // Writings
  getWritings: () => ipcRenderer.invoke('writing:get-all'),
  getWritingById: (id: number) => ipcRenderer.invoke('writing:get-by-id', id),
  createWriting: (title: string) => ipcRenderer.invoke('writing:create', title),
  updateWriting: (id: number, data: { title?: string; content?: string; folder_id?: number | null }) =>
    ipcRenderer.invoke('writing:update', id, data),
  deleteWriting: (id: number) => ipcRenderer.invoke('writing:delete', id),
  saveSnapshot: (writingId: number, content: string) =>
    ipcRenderer.invoke('writing:save-snapshot', writingId, content),

  // Excerpts
  getExcerpts: () => ipcRenderer.invoke('excerpt:get-all'),
  getExcerptsWithAudios: () => ipcRenderer.invoke('excerpt:get-all-with-audios'),
  searchExcerpts: (query: string, tag?: string) =>
    ipcRenderer.invoke('excerpt:search', query, tag),
  createExcerpt: (data: { content: string; source: string; tags: string }) =>
    ipcRenderer.invoke('excerpt:create', data),
  updateExcerpt: (id: number, data: { content?: string; source?: string; tags?: string }) =>
    ipcRenderer.invoke('excerpt:update', id, data),
  deleteExcerpt: (id: number) => ipcRenderer.invoke('excerpt:delete', id),
  saveExcerptAudio: (excerptId: number, buffer: ArrayBuffer, duration: number) =>
    ipcRenderer.invoke('excerpt:save-audio', excerptId, buffer, duration),
  getExcerptAudios: (excerptId: number) => ipcRenderer.invoke('excerpt:get-audios', excerptId),
  getExcerptAudio: (rel: string) => ipcRenderer.invoke('excerpt:get-audio', rel),
  deleteExcerptAudio: (audioId: number) => ipcRenderer.invoke('excerpt:delete-audio', audioId),

  // Inspirations
  getInspirations: () => ipcRenderer.invoke('inspiration:get-all'),
  getInspirationsByTag: (tagPrefix: string, limit: number, offset: number) =>
    ipcRenderer.invoke('inspiration:get-by-tag', tagPrefix, limit, offset),
  createInspiration: (data: { content: string; tags: string }) =>
    ipcRenderer.invoke('inspiration:create', data),
  deleteInspiration: (id: number) => ipcRenderer.invoke('inspiration:delete', id),
  fetchMoreHotTrends: () => ipcRenderer.invoke('hot-trends:fetch-more'),
  fetchMoreQuotes: () => ipcRenderer.invoke('quotes:fetch-more'),
  searchMusicLyrics: (query: string, platform?: string) =>
    ipcRenderer.invoke('inspiration:search-music-lyrics', query, platform),

  // Gemini chat
  sendGeminiChat: (message: string, history?: Array<{ role: string; content: string }>) =>
    ipcRenderer.send('gemini:chat-stream', message, history),
  onGeminiChatEvent: (
    callback: (event: { type: 'chunk' | 'done' | 'error'; data?: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      event: { type: 'chunk' | 'done' | 'error'; data?: string }
    ) => callback(event);
    ipcRenderer.on('gemini:chat-event', handler);
    return () => {
      ipcRenderer.removeListener('gemini:chat-event', handler);
    };
  },

  // Books (Library)
  getBooks: (options?: { category?: string; favorite?: boolean; query?: string; sourceTag?: string }) =>
    ipcRenderer.invoke('book:get-all', options),
  getBookById: (id: number) => ipcRenderer.invoke('book:get-by-id', id),
  getBookChapters: (bookId: number) => ipcRenderer.invoke('book:get-chapters', bookId),
  getBookReadingProgress: (bookId: number) => ipcRenderer.invoke('book:get-reading-progress', bookId),
  saveBookReadingProgress: (bookId: number, data: { chapter_id: number; scroll_top: number }) =>
    ipcRenderer.invoke('book:save-reading-progress', bookId, data),
  toggleBookFavorite: (id: number) => ipcRenderer.invoke('book:toggle-favorite', id),
  createBook: (data: { title: string; author: string; content: string; category?: string; tags?: string; cover?: string; description?: string }) =>
    ipcRenderer.invoke('book:create', data),
  deleteBook: (id: number) => ipcRenderer.invoke('book:delete', id),
  batchDeleteBooks: (ids: number[]) => ipcRenderer.invoke('book:batch-delete', ids),
  updateBook: (id: number, data: { title?: string; author?: string; content?: string; category?: string; tags?: string; cover?: string; description?: string }) =>
    ipcRenderer.invoke('book:update', id, data),
  importBookFile: () => ipcRenderer.invoke('book:import-file'),
  importBookFolder: () => ipcRenderer.invoke('book:import-folder'),
  importBookUrl: (url: string) => ipcRenderer.invoke('book:import-url', url),
  importBookManual: (data: { title: string; author: string; content: string; category?: string; tags?: string }) =>
    ipcRenderer.invoke('book:import-manual', data),

  // Book Sources
  getBookSources: () => ipcRenderer.invoke('book-source:get-all'),
  importBookSource: () => ipcRenderer.invoke('book-source:import'),
  toggleBookSource: (id: number) => ipcRenderer.invoke('book-source:toggle', id),
  enableAllBookSources: () => ipcRenderer.invoke('book-source:enable-all'),
  swapBookSourceEnabledStates: () => ipcRenderer.invoke('book-source:swap-enabled'),
  deleteBookSource: (id: number) => ipcRenderer.invoke('book-source:delete', id),
  searchBookBySource: (sourceId: number, keyword: string) => ipcRenderer.invoke('book-source:search', sourceId, keyword),
  searchBookAllSources: (keyword: string) => ipcRenderer.invoke('book-source:search-all', keyword),
  exploreBookSource: (sourceId: number) => ipcRenderer.invoke('book-source:explore', sourceId),
  exploreBookSourceCategories: (sourceId: number) => ipcRenderer.invoke('book-source:explore-categories', sourceId),
  exploreBookSourceCategoryBooks: (sourceId: number, categoryUrl: string, page?: number, pageSize?: number) =>
    ipcRenderer.invoke('book-source:explore-category-books', sourceId, categoryUrl, page, pageSize),
  getBookDetail: (sourceId: number, bookUrl: string) =>
    ipcRenderer.invoke('book-source:detail', sourceId, bookUrl),
  getBookSourceChapters: (sourceId: number, tocUrl: string) =>
    ipcRenderer.invoke('book-source:chapters', sourceId, tocUrl),
  getBookSourceChapterContent: (sourceId: number, chapterUrl: string) =>
    ipcRenderer.invoke('book-source:content', sourceId, chapterUrl),
  importBookFromSource: (sourceId: number, bookUrl: string, chapterLimit?: number) =>
    ipcRenderer.invoke('book-source:import-book', sourceId, bookUrl, chapterLimit),
  pauseBookImport: (bookId: number) => ipcRenderer.invoke('book-source:pause-import', bookId),
  resumeBookImport: (bookId: number) => ipcRenderer.invoke('book-source:resume-import', bookId),
  cancelBookImport: (bookId: number) => ipcRenderer.invoke('book-source:cancel-import', bookId),
  getBookImportProgress: (bookId: number) => ipcRenderer.invoke('book-source:get-import-progress', bookId),
  getAllBookImportProgress: () => ipcRenderer.invoke('book-source:get-all-import-progress'),
  onBookImportProgress: (callback: (progress: { bookId: number; status: string; completed: number; total: number; message?: string }) => void): () => void => {
    const handler = (_event: Electron.IpcRendererEvent, progress: { bookId: number; status: string; completed: number; total: number; message?: string }) => callback(progress);
    ipcRenderer.on('book-import:progress', handler);
    return () => {
      ipcRenderer.removeListener('book-import:progress', handler);
    };
  },

  // Window chrome
  setReaderActive: (active: boolean) => ipcRenderer.invoke('window:set-reader-active', active),

  // App info
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  getAppSettings: () => ipcRenderer.invoke('app:get-settings'),
  setAppSetting: (key: string, value: unknown) => ipcRenderer.invoke('app:set-setting', key, value),
  resetAppSettings: () => ipcRenderer.invoke('app:reset-settings'),

  // Auto update
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback: (status: string, payload?: unknown) => void): () => void => {
    const handler = (_event: Electron.IpcRendererEvent, status: string, payload?: unknown) => callback(status, payload);
    ipcRenderer.on('update-status', handler);
    return () => {
      ipcRenderer.removeListener('update-status', handler);
    };
  },

  // Recycle bin
  getDeletedItems: () => ipcRenderer.invoke('recycle:get-all'),
  restoreItem: (type: string, id: number) => ipcRenderer.invoke('recycle:restore', type, id),
  permanentDeleteItem: (type: string, id: number) =>
    ipcRenderer.invoke('recycle:permanent-delete', type, id),

  // Folders
  getFolders: () => ipcRenderer.invoke('folder:get-all'),
  createFolder: (name: string, parentId?: number | null) => ipcRenderer.invoke('folder:create', name, parentId),
  renameFolder: (id: number, name: string) => ipcRenderer.invoke('folder:rename', id, name),
  moveFolder: (id: number, parentId: number | null) => ipcRenderer.invoke('folder:move', id, parentId),
  deleteFolder: (id: number) => ipcRenderer.invoke('folder:delete', id),
};

contextBridge.exposeInMainWorld('cigeAPI', api);
contextBridge.exposeInMainWorld('__CIGE_INITIAL_SETTINGS__', initialSettings);
contextBridge.exposeInMainWorld('electronClipboard', {
  readText: () => clipboard.readText(),
});

export type CigeAPI = typeof api;
