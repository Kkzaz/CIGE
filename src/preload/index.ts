import { contextBridge, ipcRenderer } from 'electron';

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
  searchExcerpts: (query: string, tag?: string) =>
    ipcRenderer.invoke('excerpt:search', query, tag),
  createExcerpt: (data: { content: string; source: string; tags: string }) =>
    ipcRenderer.invoke('excerpt:create', data),
  updateExcerpt: (id: number, data: { content?: string; source?: string; tags?: string }) =>
    ipcRenderer.invoke('excerpt:update', id, data),
  deleteExcerpt: (id: number) => ipcRenderer.invoke('excerpt:delete', id),

  // Inspirations
  getInspirations: () => ipcRenderer.invoke('inspiration:get-all'),
  createInspiration: (data: { content: string; tags: string }) =>
    ipcRenderer.invoke('inspiration:create', data),
  deleteInspiration: (id: number) => ipcRenderer.invoke('inspiration:delete', id),
  fetchMoreHotTrends: () => ipcRenderer.invoke('hot-trends:fetch-more'),
  fetchMoreQuotes: () => ipcRenderer.invoke('quotes:fetch-more'),

  // Books (Library)
  getBooks: (options?: { category?: string; favorite?: boolean; query?: string; sourceTag?: string }) =>
    ipcRenderer.invoke('book:get-all', options),
  getBookById: (id: number) => ipcRenderer.invoke('book:get-by-id', id),
  getBookChapters: (bookId: number) => ipcRenderer.invoke('book:get-chapters', bookId),
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

  // App info
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getAppSettings: () => ipcRenderer.invoke('app:get-settings'),
  setAppSetting: (key: 'autoSyncOnLaunch' | 'showSplash', value: boolean) => ipcRenderer.invoke('app:set-setting', key, value),
  resetAppSettings: () => ipcRenderer.invoke('app:reset-settings'),

  // Auto update
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback: (status: string, payload?: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: string, payload?: unknown) => callback(status, payload);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
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

export type CigeAPI = typeof api;
