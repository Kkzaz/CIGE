import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '../components/ConfirmDialog';
import ImportDialog from '../components/ImportDialog';
import BookManager from '../components/BookManager';
import BookSourceManager from '../components/BookSourceManager';
import ImportManager from '../components/ImportManager';
import OnlineSearch from '../components/OnlineSearch';
import Discovery from '../components/Discovery';
import BookDetailCard from '../components/BookDetailCard';
import { generateBookCover } from '../utils/cover';

interface Book {
  id: number;
  title: string;
  author: string;
  description: string;
  content: string;
  cover: string;
  category: string;
  tags: string;
  is_favorite: number;
  created_at: string;
  updated_at: string;
}

type LibraryView = 'card' | 'list';
type FilterTab = 'all' | 'favorite' | string;

const CATEGORIES = ['全部', '诗歌', '散文', '笔记'];

const Library: React.FC = () => {
  const navigate = useNavigate();

  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [view, setView] = useState<LibraryView>('card');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [query, setQuery] = useState('');

  const [toast, setToast] = useState<{ message: string; link?: string; linkText?: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Book | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [importManagerOpen, setImportManagerOpen] = useState(false);
  const [sourceManagerOpen, setSourceManagerOpen] = useState(false);
  const [onlineSearchOpen, setOnlineSearchOpen] = useState(false);
  const [onlineSearchInitialSourceId, setOnlineSearchInitialSourceId] = useState<number | undefined>(undefined);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [addBookDropdownOpen, setAddBookDropdownOpen] = useState(false);

  const [importProgress, setImportProgress] = useState<Map<number, { bookId: number; status: string; completed: number; total: number; message?: string }>>(new Map());

  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const addBookDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadBooks();
  }, [filter, query]);

  useEffect(() => {
    const unsubscribe = window.cigeAPI.onBookImportProgress((progress) => {
      setImportProgress((prev) => {
        const next = new Map(prev);
        next.set(progress.bookId, progress);
        return next;
      });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    window.cigeAPI.getAllBookImportProgress().then((list) => {
      if (!list || list.length === 0) return;
      setImportProgress((prev) => {
        const next = new Map(prev);
        for (const p of list) {
          next.set(p.bookId, p);
        }
        return next;
      });
    });
  }, []);

  useEffect(() => {
    if (!importManagerOpen) return;
    window.cigeAPI.getAllBookImportProgress().then((list) => {
      setImportProgress((prev) => {
        const next = new Map(prev);
        for (const p of list) {
          next.set(p.bookId, p);
        }
        return next;
      });
    });
  }, [importManagerOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        setCategoryDropdownOpen(false);
      }
      if (addBookDropdownRef.current && !addBookDropdownRef.current.contains(e.target as Node)) {
        setAddBookDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadBooks = async () => {
    const options: { category?: string; favorite?: boolean; query?: string } = {};
    if (filter && filter !== 'all' && filter !== 'favorite') {
      options.category = filter;
    }
    if (filter === 'favorite') {
      options.favorite = true;
    }
    if (query.trim()) {
      options.query = query.trim();
    }
    const data = (await window.cigeAPI.getBooks(options)) as Book[];
    setBooks(data);
    setLoaded(true);
  };

  const activeImportCount = useMemo(() => {
    return Array.from(importProgress.values()).filter((p) => p.status === 'running' || p.status === 'paused').length;
  }, [importProgress]);

  const clearImportProgress = (bookId: number) => {
    setImportProgress((prev) => {
      const next = new Map(prev);
      next.delete(bookId);
      return next;
    });
  };

  const handleToggleFavorite = async (e: React.MouseEvent, book: Book) => {
    e.stopPropagation();
    await window.cigeAPI.toggleBookFavorite(book.id);
    loadBooks();
    if (selectedBook?.id === book.id) {
      const fresh = (await window.cigeAPI.getBookById(book.id)) as Book | null;
      if (fresh) setSelectedBook(fresh);
    }
  };

  const handleDelete = async (id: number) => {
    await window.cigeAPI.deleteBook(id);
    setDeleteTarget(null);
    if (selectedBook?.id === id) {
      setSelectedBook(null);
    }
    loadBooks();
  };

  const handleImportSuccess = (count: number) => {
    setImportOpen(false);
    loadBooks();
    setToast({ message: count > 0 ? `成功导入 ${count} 本书` : '未导入任何书籍' });
    setTimeout(() => setToast(null), 2200);
  };

  const handleImportError = (message: string) => {
    setImportOpen(false);
    setToast({ message });
    setTimeout(() => setToast(null), 2600);
  };

  const openImportedBook = async (bookId: number) => {
    await loadBooks();
    const freshBook = (await window.cigeAPI.getBookById(bookId)) as Book | null;
    if (freshBook) {
      setSelectedBook(freshBook);
    }
  };

  const handleImportBookSource = async () => {
    setAddBookDropdownOpen(false);
    try {
      const ids = await window.cigeAPI.importBookSource();
      if (ids.length === 0) {
        setToast({ message: '未导入任何书源' });
      } else {
        setToast({ message: `成功导入 ${ids.length} 个书源` });
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : '导入书源失败' });
    }
    setTimeout(() => setToast(null), 2600);
  };

  const recentlyReadBooks = useMemo(() => {
    return books.slice(0, 5);
  }, [books]);

  const renderRecentlyRead = () => {
    if (recentlyReadBooks.length === 0) return null;
    return (
      <div className="lib-recently-read">
        <div className="lib-section-title">最近阅读</div>
        <div className="lib-recent-scroll">
          {recentlyReadBooks.map((book) => {
            const cover = generateBookCover(book.title, book.author || undefined, 'small');
            const hasCustomCover = Boolean(book.cover);
            return (
              <div
                key={book.id}
                className="lib-recent-item"
                onClick={() => setSelectedBook(book)}
              >
                <div
                  className="lib-recent-cover"
                  style={{
                    background: book.cover || cover.background,
                    color: hasCustomCover ? undefined : cover.color,
                    textShadow: hasCustomCover ? undefined : cover.textShadow,
                  }}
                >
                  {!hasCustomCover && <div className="lib-recent-spine" style={{ background: cover.spineColor }} />}
                  <span className="lib-recent-cover-title">{book.title.slice(0, 5)}</span>
                </div>
                <div className="lib-recent-info">
                  <div className="lib-recent-title">{book.title}</div>
                  <div className="lib-recent-progress">继续阅读</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderBookCard = (book: Book) => {
    const cover = generateBookCover(book.title, book.author || undefined, 'small');
    const hasCustomCover = Boolean(book.cover);
    return (
      <div
        key={book.id}
        className="lib-book-card"
        onClick={() => setSelectedBook(book)}
      >
        <div
          className="lib-book-cover"
          style={{
            background: book.cover || cover.background,
            color: hasCustomCover ? undefined : cover.color,
            textShadow: hasCustomCover ? undefined : cover.textShadow,
            position: 'relative',
          }}
        >
          {!hasCustomCover && <div className="lib-book-cover-spine" style={{ background: cover.spineColor }} />}
          <span className="lib-book-cover-title">{book.title.slice(0, 5)}</span>
          <button
            className={`lib-favorite-btn${book.is_favorite ? ' active' : ''}`}
            onClick={(e) => handleToggleFavorite(e, book)}
            title={book.is_favorite ? '取消收藏' : '收藏'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={book.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          <div className="lib-book-progress-bar">
            <div className="lib-book-progress-fill" style={{ width: '0%' }} />
          </div>
        </div>
        <div className="lib-book-info">
          <div className="lib-book-title">{book.title}</div>
          <div className="lib-book-author">{book.author || '未知作者'}</div>
          {book.description ? (
            <div className="lib-book-category" title={book.description}>
              {book.description.slice(0, 36)}{book.description.length > 36 ? '…' : ''}
            </div>
          ) : (
            <div className="lib-book-category">{book.category}</div>
          )}
        </div>
      </div>
    );
  };

  const renderBookListItem = (book: Book) => {
    const cover = generateBookCover(book.title, book.author || undefined, 'small');
    const hasCustomCover = Boolean(book.cover);
    return (
      <div
        key={book.id}
        className="lib-book-list-item"
        onClick={() => setSelectedBook(book)}
      >
        <div
          className="lib-list-cover"
          style={{
            background: book.cover || cover.background,
            color: hasCustomCover ? undefined : cover.color,
            textShadow: hasCustomCover ? undefined : cover.textShadow,
            position: 'relative',
          }}
        >
          {!hasCustomCover && <div className="lib-list-cover-spine" style={{ background: cover.spineColor }} />}
          <span className="lib-list-cover-title">{book.title.slice(0, 3)}</span>
        </div>
        <div className="lib-list-info">
          <div className="lib-list-title-row">
            <span className="lib-list-title">{book.title}</span>
            {book.is_favorite && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="lib-list-star">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            )}
          </div>
          <div className="lib-list-meta">{book.author || '未知作者'} · {book.description ? book.description.slice(0, 30) + (book.description.length > 30 ? '…' : '') : book.category}</div>
        </div>
        <button
          className="btn btn-danger btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            setDeleteTarget(book);
          }}
        >
          删除
        </button>
      </div>
    );
  };

  return (
    <div className="page-container library-page">
      <div className="library-layout">
        <div className="library-header">
          <div className="lib-search-wrap">
            <svg className="lib-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="lib-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索书名、作者、标签..."
            />
          </div>

          <div className="lib-toolbar-actions">
            <div className="lib-source-filter-wrap" ref={categoryDropdownRef}>
              <button
                className="lib-source-filter"
                onClick={() => setCategoryDropdownOpen((v) => !v)}
              >
                <span>{filter === 'all' ? '全部分类' : filter === 'favorite' ? '收藏' : filter}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {categoryDropdownOpen && (
                <div className="lib-source-filter-dropdown">
                  <div
                    className={`lib-source-filter-option${filter === 'all' ? ' active' : ''}`}
                    onClick={() => { setFilter('all'); setCategoryDropdownOpen(false); }}
                  >全部</div>
                  {CATEGORIES.filter((cat) => cat !== '全部').map((cat) => (
                    <div
                      key={cat}
                      className={`lib-source-filter-option${filter === cat ? ' active' : ''}`}
                      onClick={() => { setFilter(cat); setCategoryDropdownOpen(false); }}
                    >{cat}</div>
                  ))}
                  <div
                    className={`lib-source-filter-option${filter === 'favorite' ? ' active' : ''}`}
                    onClick={() => { setFilter('favorite'); setCategoryDropdownOpen(false); }}
                  >收藏</div>
                </div>
              )}
            </div>

            <div className="lib-view-toggle">
              <button
                className={`lib-view-btn${view === 'card' ? ' active' : ''}`}
                onClick={() => setView('card')}
                title="卡片视图"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
              </button>
              <button
                className={`lib-view-btn${view === 'list' ? ' active' : ''}`}
                onClick={() => setView('list')}
                title="列表视图"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
            </div>

            <button
              className="lib-download-btn"
              onClick={() => setImportManagerOpen(true)}
              title="下载管理"
            >
              <span className="lib-download-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {activeImportCount > 0 && <span className="lib-download-badge" />}
              </span>
              下载
            </button>

            <button
              className="lib-manage-btn"
              onClick={() => setManagerOpen(true)}
              title="书籍管理"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              管理
            </button>

            <div className="lib-add-book-wrap" ref={addBookDropdownRef}>
              <button
                className="lib-add-book-btn"
                onClick={() => setAddBookDropdownOpen((v) => !v)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                添加书籍
              </button>
              {addBookDropdownOpen && (
                <div className="lib-add-book-dropdown">
                  <button onClick={() => { setImportOpen(true); setAddBookDropdownOpen(false); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    导入文件
                  </button>
                  <button onClick={() => { window.cigeAPI.importBookFolder().then(loadBooks); setAddBookDropdownOpen(false); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    导入文件夹
                  </button>
                  <button onClick={() => { window.cigeAPI.importBookUrl('').then(loadBooks); setAddBookDropdownOpen(false); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    导入网络 URL
                  </button>
                  <button onClick={() => { setDiscoveryOpen(true); setAddBookDropdownOpen(false); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    在线发现
                  </button>
                  <button onClick={handleImportBookSource}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    导入书源
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lib-catalog-body">
          {!loaded ? (
            <div className="lib-empty">加载中...</div>
          ) : books.length === 0 ? (
            <div className="lib-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="lib-empty-icon">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <div className="lib-empty-title">书架还是空的</div>
              <div className="lib-empty-sub">去添加一本喜欢的书，开始阅读吧</div>
              <button
                className="lib-empty-btn"
                onClick={() => setImportOpen(true)}
              >
                导入书籍
              </button>
            </div>
          ) : (
            <>
              {renderRecentlyRead()}
              <div className="lib-section-title lib-all-books-title">全部书籍</div>
              {view === 'card' ? (
                <div className="lib-card-grid">
                  {books.map(renderBookCard)}
                </div>
              ) : (
                <div className="lib-list-stack">
                  {books.map(renderBookListItem)}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {toast && (
        <div className="lib-toast">
          {toast.message}
          {toast.link && (
            <button className="lib-toast-link" onClick={() => toast.link && navigate(toast.link)}>
              {toast.linkText || '去查看'}
            </button>
          )}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="删除书籍"
          message={`确定要删除《${deleteTarget.title}》吗？此操作不可撤销。`}
          onConfirm={() => handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onSuccess={handleImportSuccess}
          onError={handleImportError}
        />
      )}

      {managerOpen && (
        <BookManager
          books={books}
          onClose={() => setManagerOpen(false)}
          onRefresh={loadBooks}
          onToast={(msg) => {
            setToast(typeof msg === 'string' ? { message: msg } : msg);
            setTimeout(() => setToast(null), 2200);
          }}
          onOpenSourceManager={() => {
            setManagerOpen(false);
            setSourceManagerOpen(true);
          }}
        />
      )}

      {importManagerOpen && (
        <ImportManager
          books={books}
          progress={importProgress}
          onClose={() => setImportManagerOpen(false)}
          onClear={clearImportProgress}
        />
      )}

      {sourceManagerOpen && (
        <BookSourceManager
          onClose={() => setSourceManagerOpen(false)}
          onRefresh={loadBooks}
          onToast={(msg) => {
            setToast(typeof msg === 'string' ? { message: msg } : msg);
            setTimeout(() => setToast(null), 2200);
          }}
          onOpenSearch={() => {
            setSourceManagerOpen(false);
            setOnlineSearchOpen(true);
          }}
        />
      )}

      {onlineSearchOpen && (
        <OnlineSearch
          initialSourceId={onlineSearchInitialSourceId}
          onClose={() => {
            setOnlineSearchOpen(false);
            setOnlineSearchInitialSourceId(undefined);
          }}
          onToast={(msg) => {
            setToast(typeof msg === 'string' ? { message: msg } : msg);
            setTimeout(() => setToast(null), 2200);
          }}
          onImport={(bookId) => {
            setOnlineSearchOpen(false);
            setOnlineSearchInitialSourceId(undefined);
            openImportedBook(bookId);
          }}
        />
      )}

      {discoveryOpen && (
        <Discovery
          onClose={() => setDiscoveryOpen(false)}
          onToast={(msg) => {
            setToast(typeof msg === 'string' ? { message: msg } : msg);
            setTimeout(() => setToast(null), 2200);
          }}
          onImport={(bookId) => {
            setDiscoveryOpen(false);
            openImportedBook(bookId);
          }}
          onOpenSearch={(id) => {
            setDiscoveryOpen(false);
            setOnlineSearchInitialSourceId(id);
            setOnlineSearchOpen(true);
          }}
        />
      )}

      {selectedBook && (
        <BookDetailCard
          book={selectedBook}
          importProgress={importProgress.get(selectedBook.id)}
          onClose={() => setSelectedBook(null)}
          onRead={() => navigate(`/reader/${selectedBook.id}`)}
          onToggleFavorite={async () => {
            await window.cigeAPI.toggleBookFavorite(selectedBook.id);
            loadBooks();
            const fresh = (await window.cigeAPI.getBookById(selectedBook.id)) as Book | null;
            if (fresh) setSelectedBook(fresh);
          }}
          onDelete={() => {
            setDeleteTarget(selectedBook);
            setSelectedBook(null);
          }}
          onResumeImport={async (bookId) => {
            try {
              const ok = await window.cigeAPI.resumeBookImport(bookId);
              if (!ok) {
                setToast({ message: '当前没有可继续的下载任务' });
                setTimeout(() => setToast(null), 2200);
              }
            } catch (err) {
              setToast({ message: err instanceof Error ? err.message : '继续下载失败' });
              setTimeout(() => setToast(null), 2200);
            }
          }}
        />
      )}
    </div>
  );
};

export default Library;
