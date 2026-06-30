import React, { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '../components/ConfirmDialog';
import ImportDialog from '../components/ImportDialog';
import BookManager from '../components/BookManager';
import BookSourceManager from '../components/BookSourceManager';
import OnlineSearch from '../components/OnlineSearch';
import OnlineReader from '../components/OnlineReader';
import Discovery from '../components/Discovery';

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

interface SearchBook {
  name: string;
  author: string;
  coverUrl: string;
  intro: string;
  bookUrl: string;
}

interface ExploreCategory {
  title: string;
  url: string;
}

type LibraryView = 'card' | 'list';
type FilterTab = 'all' | 'favorite' | string;
type LibraryMode = 'local' | 'online';

const CATEGORIES = ['全部', '诗歌', '散文', '笔记'];
const COVER_PALETTE = ['#C4A77D', '#A89F91', '#8B7355', '#B8A99A', '#9E8B7D', '#7D8B8B', '#9A8B7A', '#8B9A7A'];

function getCoverColor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COVER_PALETTE[Math.abs(hash) % COVER_PALETTE.length];
}

const Library: React.FC = () => {
  const navigate = useNavigate();
  const readerRef = useRef<HTMLDivElement>(null);
  const leftPageRef = useRef<HTMLDivElement>(null);
  const rightPageRef = useRef<HTMLDivElement>(null);
  const measureContainerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  const [books, setBooks] = useState<Book[]>([]);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [view, setView] = useState<LibraryView>('card');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [sources, setSources] = useState<{ id: number; name: string }[]>([]);
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [pageGroups, setPageGroups] = useState<number[][]>([]);

  const [selectedText, setSelectedText] = useState('');
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const [toast, setToast] = useState<{ message: string; link?: string; linkText?: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Book | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [sourceManagerOpen, setSourceManagerOpen] = useState(false);
  const [onlineSearchOpen, setOnlineSearchOpen] = useState(false);
  const [onlineSearchInitialSourceId, setOnlineSearchInitialSourceId] = useState<number | undefined>(undefined);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Online source bookshelf state
  const [mode, setMode] = useState<LibraryMode>('local');
  const [onlineSourceId, setOnlineSourceId] = useState<number | null>(null);
  const [categories, setCategories] = useState<ExploreCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<ExploreCategory | null>(null);
  const [onlineBooks, setOnlineBooks] = useState<SearchBook[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlinePage, setOnlinePage] = useState(1);
  const [onlinePageSize, setOnlinePageSize] = useState(30);
  const [importingUrl, setImportingUrl] = useState<string | null>(null);
  const [onlineReaderBook, setOnlineReaderBook] = useState<SearchBook | null>(null);
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const [localSourceDropdownOpen, setLocalSourceDropdownOpen] = useState(false);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [scopeDropdownOpen, setScopeDropdownOpen] = useState(false);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [chapters, setChapters] = useState<{ id: number; title: string; start_paragraph: number; end_paragraph: number }[]>([]);

  const sourceDropdownRef = useRef<HTMLDivElement>(null);
  const localSourceDropdownRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const scopeDropdownRef = useRef<HTMLDivElement>(null);
  const onlineBookshelfRef = useRef<HTMLDivElement>(null);
  const firstCardRef = useRef<HTMLDivElement>(null);
  const initialPageSizeRef = useRef(true);
  const loadedOnlineKeyRef = useRef<string | null>(null);

  // Online search state
  const [onlineSearchQuery, setOnlineSearchQuery] = useState('');
  const [onlineSearchScope, setOnlineSearchScope] = useState<'current' | 'all'>('current');
  const [onlineSearchMode, setOnlineSearchMode] = useState(false);

  useEffect(() => {
    loadBooks();
    loadSources();
  }, [filter, query, sourceFilter]);

  useEffect(() => {
    if (mode === 'online' && onlineSourceId) {
      loadCategories(onlineSourceId);
    }
  }, [mode, onlineSourceId]);

  useEffect(() => {
    if (mode === 'online' && onlineSourceId && activeCategory) {
      loadedOnlineKeyRef.current = null;
      loadCategoryBooks(onlineSourceId, activeCategory.url, onlinePage, onlinePageSize);
    }
  }, [mode, onlineSourceId, activeCategory, onlinePage]);

  // When only pageSize changes, avoid reloading if current books are enough to fill the view
  useEffect(() => {
    if (mode === 'online' && onlineSourceId && activeCategory) {
      if (onlineBooks.length >= onlinePageSize) return;
      const key = `${onlineSourceId}|${activeCategory.url}|${onlinePage}|${onlinePageSize}`;
      if (loadedOnlineKeyRef.current === key) return;
      loadCategoryBooks(onlineSourceId, activeCategory.url, onlinePage, onlinePageSize);
    }
  }, [mode, onlineSourceId, activeCategory, onlinePage, onlinePageSize, onlineBooks.length]);

  // Recalculate online page size based on container and card dimensions
  useEffect(() => {
    const shelf = onlineBookshelfRef.current;
    if (!shelf) return;

    const computePageSize = () => {
      const shelfRect = shelf.getBoundingClientRect();
      const header = shelf.querySelector('.lib-online-header');
      const headerHeight = header ? (header as HTMLElement).getBoundingClientRect().height : 60;
      const card = firstCardRef.current;
      const cardRect = card ? card.getBoundingClientRect() : null;
      const gap = 10;
      const minWidth = 84;
      const cols = Math.max(1, Math.floor((shelfRect.width + gap) / (minWidth + gap)));
      const availableHeight = shelfRect.height - headerHeight - 16; // 16 = header margin-bottom
      const cardHeight = cardRect ? cardRect.height : 200;
      const rows = Math.max(1, Math.floor((availableHeight + gap) / (cardHeight + gap)));
      return Math.max(1, cols * rows);
    };

    let updateTimer: NodeJS.Timeout | null = null;
    const update = () => {
      if (updateTimer) clearTimeout(updateTimer);
      updateTimer = setTimeout(() => {
        const size = computePageSize();
        setOnlinePageSize((prev) => (prev !== size ? size : prev));
      }, 300);
    };

    const ro = new ResizeObserver(update);
    ro.observe(shelf);
    if (firstCardRef.current) ro.observe(firstCardRef.current);
    update();
    return () => {
      ro.disconnect();
      if (updateTimer) clearTimeout(updateTimer);
    };
  }, [onlineBooks]);

  useEffect(() => {
    setOnlineReaderBook(null);
  }, [onlineSourceId, activeCategory, onlinePage, onlineSearchMode]);

  useEffect(() => {
    if (mode === 'local') setOnlineReaderBook(null);
  }, [mode]);

  // Reset to first page when book changes
  useEffect(() => {
    setCurrentPage(0);
    setSelectedText('');
    setSelectionPos(null);
    setContextMenu(null);
  }, [activeBook?.id]);

  // Close custom dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sourceDropdownRef.current && !sourceDropdownRef.current.contains(e.target as Node)) {
        setSourceDropdownOpen(false);
      }
      if (localSourceDropdownRef.current && !localSourceDropdownRef.current.contains(e.target as Node)) {
        setLocalSourceDropdownOpen(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        setCategoryDropdownOpen(false);
      }
      if (scopeDropdownRef.current && !scopeDropdownRef.current.contains(e.target as Node)) {
        setScopeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadBooks = async () => {
    const options: { category?: string; favorite?: boolean; query?: string; sourceTag?: string } = {};
    if (filter && filter !== 'all' && filter !== 'favorite') {
      options.category = filter;
    }
    if (filter === 'favorite') {
      options.favorite = true;
    }
    if (query.trim()) {
      options.query = query.trim();
    }
    if (sourceFilter && sourceFilter !== 'all') {
      options.sourceTag = `书源,${sourceFilter}`;
    }
    const data = (await window.cigeAPI.getBooks(options)) as Book[];
    setBooks(data);
    if (!activeBook && data.length > 0) {
      setActiveBook(data[0]);
    }
    setLoaded(true);
  };

  const loadSources = async () => {
    try {
      const data = await window.cigeAPI.getBookSources();
      const enabled = (data as { id: number; name: string; enabled: number }[]).filter((s) => s.enabled);
      setSources(enabled);
      if (enabled.length > 0 && onlineSourceId === null) {
        setOnlineSourceId(enabled[0].id);
      }
    } catch {
      // ignore
    }
  };

  const loadCategories = async (sourceId: number) => {
    try {
      const data = await window.cigeAPI.exploreBookSourceCategories(sourceId);
      const list = (data as ExploreCategory[]) || [];
      setCategories(list);
      if (list.length > 0 && !activeCategory) {
        setActiveCategory(list[0]);
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : '加载分类失败' });
      setTimeout(() => setToast(null), 2200);
    }
  };

  const loadCategoryBooks = async (sourceId: number, categoryUrl: string, page: number, pageSize: number) => {
    const key = `${sourceId}|${categoryUrl}|${page}|${pageSize}`;
    if (loadedOnlineKeyRef.current === key) return;

    setOnlineLoading(true);
    try {
      const data = await window.cigeAPI.exploreBookSourceCategoryBooks(sourceId, categoryUrl, page, pageSize);
      setOnlineBooks((data as SearchBook[]) || []);
      loadedOnlineKeyRef.current = key;
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : '加载书籍失败' });
      setTimeout(() => setToast(null), 2200);
      setOnlineBooks([]);
      loadedOnlineKeyRef.current = null;
    } finally {
      setOnlineLoading(false);
    }
  };

  const handleImportOnlineBook = async (book: SearchBook) => {
    if (!onlineSourceId) return;
    setImportingUrl(book.bookUrl);
    try {
      const imported = await window.cigeAPI.importBookFromSource(onlineSourceId, book.bookUrl, 10);
      setToast({ message: `《${book.name}》已导入本地书架` });
      setTimeout(() => setToast(null), 2200);
      // Switch to local mode and select the imported book
      setMode('local');
      loadBooks();
      if (imported && (imported as { id: number }).id) {
        const fresh = await window.cigeAPI.getBookById((imported as { id: number }).id);
        if (fresh) setActiveBook(fresh as Book);
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : '导入失败' });
      setTimeout(() => setToast(null), 2600);
    } finally {
      setImportingUrl(null);
    }
  };

  const handleOnlineSearch = async () => {
    const keyword = onlineSearchQuery.trim();
    if (!keyword) return;
    setOnlineLoading(true);
    setOnlineSearchMode(true);
    setActiveCategory(null);
    try {
      if (onlineSearchScope === 'current') {
        if (!onlineSourceId) {
          setToast({ message: '请先选择一个书源' });
          setTimeout(() => setToast(null), 2200);
          return;
        }
        const data = await window.cigeAPI.searchBookBySource(onlineSourceId, keyword);
        setOnlineBooks((data as SearchBook[]) || []);
      } else {
        const results = (await window.cigeAPI.searchBookAllSources(keyword)) as {
          sourceName: string;
          sourceId?: number;
          books: SearchBook[];
        }[];
        const merged: SearchBook[] = [];
        for (const r of results) {
          for (const b of r.books) {
            merged.push({ ...b, author: b.author ? `${b.author} · ${r.sourceName}` : r.sourceName });
          }
        }
        setOnlineBooks(merged);
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : '搜索失败' });
      setTimeout(() => setToast(null), 2200);
      setOnlineBooks([]);
    } finally {
      setOnlineLoading(false);
    }
  };

  const exitOnlineSearch = () => {
    setOnlineSearchMode(false);
    setOnlineSearchQuery('');
    if (onlineSourceId && activeCategory) {
      loadCategoryBooks(onlineSourceId, activeCategory.url, onlinePage, onlinePageSize);
    } else {
      setOnlineBooks([]);
    }
  };

  const paragraphs = useMemo(() => {
    if (!activeBook) return [];
    return activeBook.content
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
  }, [activeBook?.content]);

  useEffect(() => {
    if (activeBook) {
      window.cigeAPI.getBookChapters(activeBook.id).then((data) => {
        setChapters((data as { id: number; title: string; start_paragraph: number; end_paragraph: number }[]) || []);
      });
    } else {
      setChapters([]);
    }
  }, [activeBook?.id]);

  const PAGE_PADDING_Y = 88;
  const SAFETY_MARGIN = 24;

  const recalcPages = useCallback(() => {
    if (!measureContainerRef.current || !measureRef.current || paragraphs.length === 0) {
      setPageGroups([]);
      return;
    }
    const pageHeight = measureContainerRef.current.clientHeight - PAGE_PADDING_Y - SAFETY_MARGIN;
    if (pageHeight <= 0) {
      setPageGroups([]);
      return;
    }
    const measureChildren = Array.from(measureRef.current.children) as HTMLElement[];
    const offsets = measureChildren.map((c) => ({
      top: c.offsetTop,
      height: c.offsetHeight,
    }));

    const groups: number[][] = [];
    let currentPageIndex = 0;
    paragraphs.forEach((_, i) => {
      const { top, height } = offsets[i] || { top: 0, height: 0 };
      const pageIndex = Math.max(0, Math.floor((top + height * 0.2) / pageHeight));
      currentPageIndex = Math.max(currentPageIndex, pageIndex);
      while (groups.length <= currentPageIndex) groups.push([]);
      groups[currentPageIndex].push(i);
    });

    setPageGroups((prev) => {
      if (
        prev.length === groups.length &&
        prev.every((p, i) => p.length === groups[i].length && p.every((v, j) => v === groups[i][j]))
      ) {
        return prev;
      }
      return groups;
    });
  }, [paragraphs]);

  useLayoutEffect(() => {
    recalcPages();
  }, [recalcPages]);

  useEffect(() => {
    setCurrentPage(0);
  }, [activeBook?.id]);

  useEffect(() => {
    const onResize = () => {
      setCurrentPage(0);
      recalcPages();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recalcPages]);

  const totalPages = pageGroups.length;
  const screenCount = useMemo(() => Math.max(1, Math.ceil(pageGroups.length / 2)), [pageGroups.length]);

  const leftParagraphs = useMemo(() => {
    const group = pageGroups[currentPage * 2] || [];
    return group.map((i) => paragraphs[i]);
  }, [pageGroups, currentPage, paragraphs]);

  const rightParagraphs = useMemo(() => {
    const group = pageGroups[currentPage * 2 + 1] || [];
    return group.map((i) => paragraphs[i]);
  }, [pageGroups, currentPage, paragraphs]);

  const goPrev = useCallback(() => {
    setCurrentPage((p) => Math.max(0, p - 1));
    clearSelectionUI();
  }, []);

  const goNext = useCallback(() => {
    setCurrentPage((p) => Math.min(screenCount - 1, p + 1));
    clearSelectionUI();
  }, [screenCount]);

  const clearSelectionUI = () => {
    setSelectedText('');
    setSelectionPos(null);
    setContextMenu(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleToggleFavorite = async (e: React.MouseEvent, book: Book) => {
    e.stopPropagation();
    await window.cigeAPI.toggleBookFavorite(book.id);
    loadBooks();
    if (activeBook?.id === book.id) {
      setActiveBook({ ...activeBook, is_favorite: activeBook.is_favorite ? 0 : 1 });
    }
  };

  const handleDelete = async (id: number) => {
    await window.cigeAPI.deleteBook(id);
    setDeleteTarget(null);
    if (activeBook?.id === id) {
      const remaining = books.filter((b) => b.id !== id);
      setActiveBook(remaining[0] || null);
    }
    loadBooks();
  };

  const captureSelection = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || '';
    return { selection, text };
  };

  const updateSelectionPopover = () => {
    const { text } = captureSelection();
    if (text.length > 0 && readerRef.current) {
      const selection = window.getSelection();
      const range = selection?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      if (rect) {
        const readerRect = readerRef.current.getBoundingClientRect();
        setSelectionPos({
          x: rect.left - readerRect.left + rect.width / 2,
          y: rect.top - readerRect.top - 44,
        });
      }
      setSelectedText(text);
    } else {
      clearSelectionUI();
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // Ignore if clicking buttons/actions
    if ((e.target as HTMLElement).closest('button')) return;
    updateSelectionPopover();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const { text } = captureSelection();
    if (!text) {
      setContextMenu(null);
      return;
    }
    setSelectedText(text);
    if (readerRef.current) {
      const readerRect = readerRef.current.getBoundingClientRect();
      setContextMenu({
        x: e.clientX - readerRect.left,
        y: e.clientY - readerRect.top,
      });
    }
  };

  const handleExcerpt = async () => {
    const text = selectedText || window.getSelection()?.toString().trim();
    if (!text || !activeBook) return;
    try {
      await window.cigeAPI.createExcerpt({
        content: text,
        source: `${activeBook.title} · ${activeBook.author}`,
        tags: `图书馆,${activeBook.category}`,
      });
      clearSelectionUI();
      setToast({ message: '已摘录到摘抄页面', link: '/excerpt', linkText: '去查看' });
      setTimeout(() => setToast(null), 2200);
    } catch (err) {
      console.error('摘录失败', err);
      setToast({ message: '摘录失败' });
      setTimeout(() => setToast(null), 2200);
    }
  };

  const handleImportSuccess = (count: number) => {
    setImportOpen(false);
    setToast({ message: count > 0 ? `成功导入 ${count} 本书` : '未导入任何书籍' });
    loadBooks();
    setTimeout(() => setToast(null), 2200);
  };

  const handleImportError = (message: string) => {
    setToast({ message });
    setTimeout(() => setToast(null), 2600);
  };

  // Keyboard navigation for page turning
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!activeBook) return;
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeBook, goPrev, goNext]);

  const activeTags = activeBook?.tags
    ? activeBook.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  const renderBookCard = (book: Book) => {
    const isActive = activeBook?.id === book.id;
    return (
      <div
        key={book.id}
        className={`lib-book-card${isActive ? ' active' : ''}`}
        onClick={() => setActiveBook(book)}
      >
        <div
          className="lib-book-cover"
          style={{ background: book.cover || 'var(--bg-tertiary)' }}
        >
          <span className="lib-book-cover-title">{book.title.slice(0, 4)}</span>
          <button
            className={`lib-favorite-btn${book.is_favorite ? ' active' : ''}`}
            onClick={(e) => handleToggleFavorite(e, book)}
            title={book.is_favorite ? '取消收藏' : '收藏'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={book.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        </div>
        <div className="lib-book-info">
          <div className="lib-book-title">{book.title}</div>
          <div className="lib-book-author">{book.author}</div>
          <div className="lib-book-category">{book.category}</div>
        </div>
      </div>
    );
  };

  const renderBookListItem = (book: Book) => {
    const isActive = activeBook?.id === book.id;
    return (
      <div
        key={book.id}
        className={`lib-book-list-item${isActive ? ' active' : ''}`}
        onClick={() => setActiveBook(book)}
      >
        <div
          className="lib-list-cover"
          style={{ background: book.cover || 'var(--bg-tertiary)' }}
        />
        <div className="lib-list-info">
          <div className="lib-list-title-row">
            <span className="lib-list-title">{book.title}</span>
            {book.is_favorite && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="lib-list-star">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            )}
          </div>
          <div className="lib-list-meta">{book.author} · {book.category}</div>
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
    <div className="page-container">
      <div className={`library-layout${immersiveMode ? ' immersive' : ''}`}>
        {/* Left: catalog */}
        <div className="library-catalog">
          <div className="library-catalog-header">
            <div className="lib-catalog-title-row">
              <div className="lib-mode-tabs">
                <button
                  className={`lib-mode-tab${mode === 'local' ? ' active' : ''}`}
                  onClick={() => setMode('local')}
                >
                  本地书架
                </button>
                <button
                  className={`lib-mode-tab${mode === 'online' ? ' active' : ''}`}
                  onClick={() => setMode('online')}
                >
                  在线书源
                </button>
              </div>
              <button className="lib-source-btn" onClick={() => setSourceManagerOpen(true)} title="书源管理">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                书源
              </button>
            </div>
          </div>

          {mode === 'online' && (
            <div className="lib-online-source-bar" ref={sourceDropdownRef}>
              <button
                className="lib-online-source-select"
                onClick={() => setSourceDropdownOpen((v) => !v)}
                disabled={sources.length === 0}
              >
                <span className="lib-online-source-select-text">
                  {sources.find((s) => s.id === onlineSourceId)?.name || '暂无可用书源'}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {sourceDropdownOpen && (
                <div className="lib-online-source-dropdown">
                  {sources.length === 0 ? (
                    <div className="lib-online-source-option disabled">暂无可用书源</div>
                  ) : (
                    sources.map((s) => (
                      <div
                        key={s.id}
                        className={`lib-online-source-option${s.id === onlineSourceId ? ' active' : ''}`}
                        onClick={() => {
                          setOnlineSourceId(s.id);
                          setActiveCategory(null);
                          setOnlinePage(1);
                          setSourceDropdownOpen(false);
                        }}
                      >
                        {s.name}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {mode === 'online' && (
            <div className="lib-online-search-row">
              <div className="lib-online-search-wrap">
                <svg className="lib-online-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  className="lib-online-search-input"
                  value={onlineSearchQuery}
                  onChange={(e) => setOnlineSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleOnlineSearch()}
                  placeholder="搜索书名、作者..."
                />
              </div>
              <div className="lib-online-search-scope-wrap" ref={scopeDropdownRef}>
                <button
                  className="lib-online-search-scope"
                  onClick={() => setScopeDropdownOpen((v) => !v)}
                >
                  <span>{onlineSearchScope === 'current' ? '当前书源' : '全部书源'}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {scopeDropdownOpen && (
                  <div className="lib-online-search-scope-dropdown">
                    <button
                      className={`lib-online-search-scope-option ${onlineSearchScope === 'current' ? 'active' : ''}`}
                      onClick={() => {
                        setOnlineSearchScope('current');
                        setScopeDropdownOpen(false);
                      }}
                    >
                      当前书源
                    </button>
                    <button
                      className={`lib-online-search-scope-option ${onlineSearchScope === 'all' ? 'active' : ''}`}
                      onClick={() => {
                        setOnlineSearchScope('all');
                        setScopeDropdownOpen(false);
                      }}
                    >
                      全部书源
                    </button>
                  </div>
                )}
              </div>
              <button className="lib-online-search-btn" onClick={handleOnlineSearch}>
                搜索
              </button>
              {onlineSearchMode && (
                <button className="lib-online-search-back" onClick={exitOnlineSearch}>
                  返回分类
                </button>
              )}
            </div>
          )}

          {mode === 'local' && (
            <div className="lib-local-toolbar">
              <div className="lib-search-wrap lib-toolbar-search">
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
                        onClick={() => {
                          setFilter('all');
                          setCategoryDropdownOpen(false);
                        }}
                      >
                        全部
                      </div>
                      {CATEGORIES.filter((cat) => cat !== '全部').map((cat) => {
                        const key = cat === '全部' ? 'all' : cat;
                        return (
                          <div
                            key={key}
                            className={`lib-source-filter-option${filter === key ? ' active' : ''}`}
                            onClick={() => {
                              setFilter(key);
                              setCategoryDropdownOpen(false);
                            }}
                          >
                            {cat}
                          </div>
                        );
                      })}
                      <div
                        className={`lib-source-filter-option${filter === 'favorite' ? ' active' : ''}`}
                        onClick={() => {
                          setFilter('favorite');
                          setCategoryDropdownOpen(false);
                        }}
                      >
                        收藏
                      </div>
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
              </div>
            </div>
          )}

          {mode === 'online' && (
            <div className="lib-filter-bar">
              {categories.length === 0 ? (
                <div className="lib-category-empty">暂无分类，请检查书源是否支持发现</div>
              ) : (
                categories.map((cat) => {
                  const isActive = activeCategory?.url === cat.url;
                  return (
                    <button
                      key={cat.url}
                      className={`lib-filter-pill${isActive ? ' active' : ''}`}
                      onClick={() => {
                        setActiveCategory(cat);
                        setOnlinePage(1);
                      }}
                      title={cat.title}
                    >
                      {cat.title}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {mode === 'local' && (
            <div className="lib-catalog-body">
              {!loaded ? (
                <div className="lib-empty">加载中...</div>
              ) : books.length === 0 ? (
                <div className="lib-empty">
                  <div>暂无书籍</div>
                </div>
              ) : view === 'card' ? (
                <div className="lib-card-grid">
                  {books.map(renderBookCard)}
                </div>
              ) : (
                <div className="lib-list-stack">
                  {books.map(renderBookListItem)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: reading area */}
        <div
          className={`library-reader${mode === 'online' ? ' online' : ''}`}
          ref={readerRef}
          onMouseUp={mode === 'local' ? handleMouseUp : undefined}
          onContextMenu={mode === 'local' ? handleContextMenu : undefined}
          onClick={() => setContextMenu(null)}
        >
          {mode === 'online' ? (
            onlineReaderBook && onlineSourceId ? (
              <OnlineReader
                sourceId={onlineSourceId}
                book={onlineReaderBook}
                onBack={() => setOnlineReaderBook(null)}
                onImport={async (book) => {
                  await handleImportOnlineBook(book);
                }}
              />
            ) : (
              <div className="lib-online-bookshelf" ref={onlineBookshelfRef}>
                <div className="lib-online-header">
                  <h3 className="lib-online-title">
                    {onlineSearchMode
                      ? `搜索结果：${onlineSearchQuery}`
                      : activeCategory
                      ? activeCategory.title
                      : '请选择分类'}
                  </h3>
                  {!onlineSearchMode && activeCategory && (
                    <div className="lib-online-pagination">
                      <button
                        className="lib-online-page-btn"
                        disabled={onlinePage <= 1}
                        onClick={() => setOnlinePage((p) => Math.max(1, p - 1))}
                      >
                        上一页
                      </button>
                      <span className="lib-online-page-info">第 {onlinePage} 页</span>
                      <button
                        className="lib-online-page-btn"
                        onClick={() => setOnlinePage((p) => p + 1)}
                      >
                        下一页
                      </button>
                    </div>
                  )}
                </div>

                {onlineLoading ? (
                  <div className="lib-reader-empty">
                    <div className="lib-reader-empty-title">加载中...</div>
                  </div>
                ) : !onlineSearchMode && !activeCategory ? (
                  <div className="lib-reader-empty">
                    <div className="lib-reader-empty-title">选择分类</div>
                    <div className="lib-reader-empty-text">在左侧选择分类查看书籍</div>
                  </div>
                ) : onlineBooks.length === 0 ? (
                  <div className="lib-reader-empty">
                    <div className="lib-reader-empty-title">暂无书籍</div>
                    <div className="lib-reader-empty-text">
                      {onlineSearchMode ? '未搜索到相关书籍' : '该分类下没有抓取到书籍'}
                    </div>
                  </div>
                ) : (
                  <div className="lib-card-grid">
                    {onlineBooks.map((book, idx) => (
                      <div
                        key={book.bookUrl}
                        ref={idx === 0 ? firstCardRef : undefined}
                        className="lib-book-card"
                        onClick={() => setOnlineReaderBook(book)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="lib-book-cover" style={{ background: getCoverColor(book.name) }}>
                          <span className="lib-book-cover-title">{book.name.slice(0, 4)}</span>
                        </div>
                        <div className="lib-book-info">
                          <div className="lib-book-title" title={book.name}>{book.name}</div>
                          <div className="lib-book-author">{book.author || '未知作者'}</div>
                          {book.intro && (
                            <div className="lib-book-intro" title={book.intro}>{book.intro}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          ) : !activeBook ? (
            <div className="lib-reader-empty">
              <div className="lib-reader-empty-title">选择一本书开始阅读</div>
              <div className="lib-reader-empty-text">在左侧目录中选择书籍，可收藏、摘录名句</div>
            </div>
          ) : (
            <>
              <div className="lib-reader-header">
                <div className="lib-reader-title-row">
                  <h3 className="lib-reader-title">{activeBook.title}</h3>
                  <div className="lib-reader-actions">
                    <button
                      className={`lib-reader-action${activeBook.is_favorite ? ' active' : ''}`}
                      onClick={(e) => handleToggleFavorite(e, activeBook)}
                      title={activeBook.is_favorite ? '取消收藏' : '收藏'}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={activeBook.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                    <button
                      className={`lib-reader-action${immersiveMode ? ' active' : ''}`}
                      onClick={() => setImmersiveMode(!immersiveMode)}
                      title={immersiveMode ? '退出沉浸' : '沉浸式阅读'}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="15 3 21 9 21 15 15 21 9 21 3 15 3 9 9 3" />
                        <line x1="21" y1="9" x2="3" y2="9" />
                        <line x1="21" y1="15" x2="3" y2="15" />
                        <line x1="9" y1="3" x2="9" y2="21" />
                        <line x1="15" y1="3" x2="15" y2="21" />
                      </svg>
                    </button>
                    <button
                      className={`lib-reader-action${showToc ? ' active' : ''}`}
                      onClick={() => setShowToc(!showToc)}
                      title={showToc ? '关闭目录' : '目录'}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="21" y2="18" />
                        <line x1="3" y1="6" x2="3.01" y2="6" />
                        <line x1="3" y1="12" x2="3.01" y2="12" />
                        <line x1="3" y1="18" x2="3.01" y2="18" />
                      </svg>
                    </button>
                    <button
                      className="lib-reader-action"
                      onClick={() => setDeleteTarget(activeBook)}
                      title="删除"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="lib-reader-author">{activeBook.author}</div>
                {activeTags.length > 0 && (
                  <div className="lib-reader-tags">
                    {activeTags.map((tag, i) => (
                      <span key={i} className="lib-reader-tag">{tag}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="lib-book-stage">
                <button
                  className={`lib-page-turn lib-page-turn-prev${currentPage === 0 ? ' disabled' : ''}`}
                  onClick={goPrev}
                  title="上一页"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>

                <div className="lib-open-book" ref={measureContainerRef}>
                  <div className="lib-book-spine" />
                  <div className="lib-book-page lib-book-page-left" ref={leftPageRef}>
                    <div className="lib-page-number">{currentPage * 2 + 1}</div>
                    <div className="lib-page-content">
                      {leftParagraphs.length === 0 ? (
                        <div className="lib-page-end">本书完</div>
                      ) : (
                        leftParagraphs.map((para, idx) => (
                          <p key={`l-${currentPage}-${idx}`} className="lib-para">{para}</p>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="lib-book-page lib-book-page-right" ref={rightPageRef}>
                    <div className="lib-page-number">{currentPage * 2 + 2}</div>
                    <div className="lib-page-content">
                      {rightParagraphs.length === 0 ? (
                        <div className="lib-page-end">本书完</div>
                      ) : (
                        rightParagraphs.map((para, idx) => (
                          <p key={`r-${currentPage}-${idx}`} className="lib-para">{para}</p>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Hidden measurement container shares the same box model as a real page */}
                  <div ref={measureRef} className="lib-page-measure">
                    {paragraphs.map((para, idx) => (
                      <p key={`m-${idx}`} className="lib-para">
                        {para}
                      </p>
                    ))}
                  </div>
                </div>

                <button
                  className={`lib-page-turn lib-page-turn-next${currentPage >= screenCount - 1 ? ' disabled' : ''}`}
                  onClick={goNext}
                  title="下一页"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>

              <div className="lib-reader-footer">
                <span className="lib-page-info">
                  第 {currentPage * 2 + 1}-{Math.min((currentPage + 1) * 2, totalPages)} 页 / 共 {totalPages} 页
                </span>
                <div className="lib-page-jump">
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    className="lib-page-input"
                    placeholder="页"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = parseInt((e.target as HTMLInputElement).value, 10);
                        if (!isNaN(val)) {
                          setCurrentPage(Math.min(screenCount - 1, Math.max(0, Math.floor((val - 1) / 2))));
                          clearSelectionUI();
                        }
                      }
                    }}
                  />
                </div>
              </div>

              {selectionPos && selectedText && (
                <div
                  className="lib-excerpt-popover"
                  style={{ left: selectionPos.x, top: selectionPos.y }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button className="lib-excerpt-btn" onClick={handleExcerpt}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                    摘录
                  </button>
                </div>
              )}

              {contextMenu && (
                <div
                  className="lib-context-menu"
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button className="lib-context-item" onClick={handleExcerpt}>摘录到摘抄</button>
                  <button className="lib-context-item" onClick={clearSelectionUI}>取消</button>
                </div>
              )}

              {showToc && (
                <div className="lib-toc-panel" onClick={(e) => e.stopPropagation()}>
                  <div className="lib-toc-header">
                    <span className="lib-toc-title">目录</span>
                    <button className="lib-toc-close" onClick={() => setShowToc(false)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  <div className="lib-toc-content">
                    {chapters.length > 0 ? (
                      chapters.map((chapter, idx) => (
                        <button
                          key={chapter.id}
                          className="lib-toc-item"
                          onClick={() => {
                            const targetParaIndex = chapter.start_paragraph;
                            const pageIndex = pageGroups.findIndex((group) =>
                              group.includes(targetParaIndex)
                            );
                            if (pageIndex >= 0) {
                              setCurrentPage(pageIndex);
                              setShowToc(false);
                            }
                          }}
                        >
                          <span className="lib-toc-number">{idx + 1}</span>
                          <span className="lib-toc-chapter">{chapter.title}</span>
                        </button>
                      ))
                    ) : (
                      <div className="lib-toc-empty">暂无目录</div>
                    )}
                  </div>
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
          onImport={() => {
            loadBooks();
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
          onImport={() => {
            loadBooks();
          }}
          onOpenSearch={(id) => {
            setDiscoveryOpen(false);
            setOnlineSearchInitialSourceId(id);
            setOnlineSearchOpen(true);
          }}
        />
      )}
    </div>
  );
};

export default Library;
