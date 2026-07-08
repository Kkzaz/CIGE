import React, { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import ReaderSettingsPanel from './ReaderSettingsPanel';
import { useAppSettingsStore } from '../store/appSettings';

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

interface Chapter {
  id: number;
  title: string;
  start_paragraph: number;
  end_paragraph: number;
}

interface ReaderProps {
  book: Book;
  immersiveMode: boolean;
  onImmersiveChange: (value: boolean) => void;
  onBack?: () => void;
  onToggleFavorite?: () => void;
  onDelete?: () => void;
  onCreateExcerpt?: (text: string, source: string) => void;
  onToast?: (message: string, link?: string, linkText?: string) => void;
}

const Reader: React.FC<ReaderProps> = ({
  book,
  immersiveMode,
  onImmersiveChange,
  onBack,
  onToggleFavorite,
  onDelete,
  onCreateExcerpt,
  onToast,
}) => {
  const readerRef = useRef<HTMLDivElement>(null);
  const readerScrollRef = useRef<HTMLDivElement>(null);
  const chapterRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const tocItemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapterId, setCurrentChapterId] = useState<number | null>(null);
  const [readerProgress, setReaderProgress] = useState(0);
  const [chapterProgress, setChapterProgress] = useState(0);
  const [readerBarsVisible, setReaderBarsVisible] = useState(true);
  const [showReaderSettings, setShowReaderSettings] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [tocSortAsc, setTocSortAsc] = useState(true);

  const [selectedText, setSelectedText] = useState('');
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const [isEntering, setIsEntering] = useState(true);
  const [showReaderHint, setShowReaderHint] = useState(false);

  const pendingRestoreRef = useRef<{ chapterId: number; scrollTop: number } | null>(null);
  const progressRef = useRef<{ chapterId: number | null; scrollTop: number }>({ chapterId: null, scrollTop: 0 });
  const saveProgressTimerRef = useRef<number | null>(null);
  const hideBarsTimerRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number; moved: boolean } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const {
    readerFontSize,
    readerLineHeight,
    readerParaSpacing,
    readerTheme,
    readerFontFamily,
    readerReadingSpeed,
    readerAutoEnterImmersive,
  } = useAppSettingsStore();

  const rawParagraphs = useMemo(() => book.content.split(/\n+/).map((p) => p.trim()), [book.content]);
  const paragraphs = useMemo(() => rawParagraphs.filter(Boolean), [rawParagraphs]);

  const sortedChapters = useMemo(() => {
    if (tocSortAsc) return chapters;
    return [...chapters].reverse();
  }, [chapters, tocSortAsc]);

  const activeTags = useMemo(() => {
    return book.tags.split(',').map((t) => t.trim()).filter(Boolean);
  }, [book.tags]);

  const currentChapterIndex = useMemo(() => {
    return chapters.findIndex((c) => c.id === currentChapterId);
  }, [chapters, currentChapterId]);

  const estimatedRemainingMinutes = useMemo(() => {
    if (!book.content || readerReadingSpeed <= 0) return 0;
    const remainingRatio = Math.max(0, 100 - readerProgress) / 100;
    const remainingChars = book.content.length * remainingRatio;
    return Math.max(0, Math.round(remainingChars / readerReadingSpeed));
  }, [book.content, readerProgress, readerReadingSpeed]);

  // Load chapters and saved progress when book changes
  useEffect(() => {
    setSelectedText('');
    setSelectionPos(null);
    setContextMenu(null);
    setShowToc(false);
    setShowReaderSettings(false);
    setIsEntering(true);

    const hintKey = `cige:reader-hint-seen:${book.id}`;
    const hasSeenHint = localStorage.getItem(hintKey) === '1';
    if (!hasSeenHint) {
      setShowReaderHint(true);
    }

    Promise.all([
      window.cigeAPI.getBookChapters(book.id),
      window.cigeAPI.getBookReadingProgress(book.id),
    ]).then(([data, progress]) => {
      const list = (data as Chapter[]) || [];
      const saved = progress as { book_id: number; chapter_id: number; scroll_top: number; updated_at: string } | null;
      setChapters(list);
      if (saved) {
        pendingRestoreRef.current = { chapterId: saved.chapter_id, scrollTop: saved.scroll_top };
        setCurrentChapterId(saved.chapter_id);
      } else if (list.length > 0) {
        setCurrentChapterId(list[0].id);
      }
    });

    const timer = window.setTimeout(() => setIsEntering(false), 450);

    if (readerAutoEnterImmersive) {
      onImmersiveChange(true);
    }

    return () => {
      window.clearTimeout(timer);
    };
  }, [book.id, readerAutoEnterImmersive, onImmersiveChange]);

  // Restore reading position or reset scroll when chapters load
  useLayoutEffect(() => {
    if (!readerScrollRef.current || chapters.length === 0) return;

    if (pendingRestoreRef.current) {
      const { chapterId, scrollTop } = pendingRestoreRef.current;
      const chapterExists = chapters.some((c) => c.id === chapterId);
      const el = chapterExists ? chapterRefs.current.get(chapterId) : null;
      const container = readerScrollRef.current;
      if (el) {
        container.scrollTop = el.offsetTop + scrollTop;
      } else {
        container.scrollTop = 0;
        setCurrentChapterId(chapters[0]?.id ?? null);
      }
      pendingRestoreRef.current = null;
    } else {
      readerScrollRef.current.scrollTop = 0;
      setCurrentChapterId(chapters[0]?.id ?? null);
      setReaderProgress(0);
    }
  }, [book.id, chapters]);

  // Observe current chapter and progress
  useEffect(() => {
    const container = readerScrollRef.current;
    if (!container || chapters.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = Number(entry.target.getAttribute('data-chapter-id'));
          if (entry.isIntersecting && entry.intersectionRatio > 0) {
            setCurrentChapterId(id);
          }
        });
      },
      {
        root: container,
        threshold: [0, 0.25, 0.5, 0.75, 1],
        rootMargin: '-20% 0px -60% 0px',
      }
    );

    chapterRefs.current.forEach((el) => observer.observe(el));

    const saveProgress = () => {
      const { chapterId, scrollTop } = progressRef.current;
      window.cigeAPI.saveBookReadingProgress(book.id, {
        chapter_id: chapterId ?? chapters[0]?.id ?? 0,
        scroll_top: scrollTop,
      });
    };

    const updateChapterProgress = () => {
      if (!currentChapterId) return;
      const el = chapterRefs.current.get(currentChapterId);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const chapterHeight = el.offsetHeight;
      const visibleTop = Math.max(rect.top, containerRect.top);
      const visibleBottom = Math.min(rect.bottom, containerRect.bottom);
      const visibleHeight = Math.max(0, visibleBottom - visibleTop);
      const scrolledPast = containerRect.top - rect.top;
      const ratio = chapterHeight > 0 ? Math.min(1, Math.max(0, scrolledPast / chapterHeight)) : 0;
      setChapterProgress(Math.round(ratio * 100));
    };

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight - container.clientHeight;
      const progress = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;
      setReaderProgress(Math.min(100, Math.max(0, progress)));
      updateChapterProgress();

      progressRef.current = { chapterId: currentChapterId, scrollTop };
      if (saveProgressTimerRef.current) window.clearTimeout(saveProgressTimerRef.current);
      saveProgressTimerRef.current = window.setTimeout(saveProgress, 800);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      observer.disconnect();
      container.removeEventListener('scroll', handleScroll);
      if (saveProgressTimerRef.current) {
        window.clearTimeout(saveProgressTimerRef.current);
        saveProgressTimerRef.current = null;
      }
      saveProgress();
    };
  }, [chapters, book.id, currentChapterId]);

  // Immersive auto-hide reader bars
  useEffect(() => {
    if (!immersiveMode) {
      setReaderBarsVisible(true);
      return;
    }

    const resetTimer = () => {
      setReaderBarsVisible(true);
      if (hideBarsTimerRef.current) window.clearTimeout(hideBarsTimerRef.current);
      hideBarsTimerRef.current = window.setTimeout(() => {
        setReaderBarsVisible(false);
      }, 2500);
    };

    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (hideBarsTimerRef.current) window.clearTimeout(hideBarsTimerRef.current);
      setReaderBarsVisible(true);
    };
  }, [immersiveMode]);

  // Close floating panels when toolbars auto-hide in immersive mode
  useEffect(() => {
    if (immersiveMode && !readerBarsVisible) {
      setShowReaderSettings(false);
      setShowToc(false);
    }
  }, [immersiveMode, readerBarsVisible]);

  // Save progress on visibility change / unload
  const flushReadingProgress = useCallback(() => {
    const { chapterId, scrollTop } = progressRef.current;
    window.cigeAPI.saveBookReadingProgress(book.id, {
      chapter_id: chapterId ?? chapters[0]?.id ?? 0,
      scroll_top: scrollTop,
    });
  }, [book.id, chapters]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushReadingProgress();
    };
    const onBeforeUnload = () => flushReadingProgress();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
      flushReadingProgress();
    };
  }, [flushReadingProgress]);

  // Keyboard navigation
  useEffect(() => {
    const container = readerScrollRef.current;
    if (!container) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        container.scrollBy({ top: -container.clientHeight * 0.8, behavior: 'smooth' });
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        container.scrollBy({ top: container.clientHeight * 0.8, behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const scrollToChapter = useCallback((chapterId: number) => {
    const el = chapterRefs.current.get(chapterId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setCurrentChapterId(chapterId);
      setShowToc(false);
    }
  }, []);

  const prevShowTocRef = useRef(false);
  useEffect(() => {
    if (showToc && !prevShowTocRef.current && currentChapterId) {
      const el = tocItemRefs.current.get(currentChapterId);
      el?.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
    prevShowTocRef.current = showToc;
  }, [showToc, currentChapterId]);

  const clearSelectionUI = () => {
    setSelectedText('');
    setSelectionPos(null);
    setContextMenu(null);
    window.getSelection()?.removeAllRanges();
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
    if (!text) return;
    try {
      if (onCreateExcerpt) {
        onCreateExcerpt(text, `${book.title} · ${book.author}`);
      } else {
        await window.cigeAPI.createExcerpt({
          content: text,
          source: `${book.title} · ${book.author}`,
          tags: `图书馆,${book.category}`,
        });
      }
      clearSelectionUI();
      onToast?.('已摘录到摘抄页面', '/excerpt', '去查看');
    } catch (err) {
      console.error('摘录失败', err);
      onToast?.('摘录失败');
    }
  };

  const handleReaderClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    // Left quarter: scroll up one screen
    if (x < width / 4) {
      e.stopPropagation();
      readerScrollRef.current?.scrollBy({ top: -rect.height * 0.8, behavior: 'smooth' });
      return;
    }

    // Right quarter: scroll down one screen
    if (x > (width * 3) / 4) {
      e.stopPropagation();
      readerScrollRef.current?.scrollBy({ top: rect.height * 0.8, behavior: 'smooth' });
      return;
    }

    // Middle third: toggle reader bars
    e.stopPropagation();
    setReaderBarsVisible((v) => {
      const next = !v;
      if (hideBarsTimerRef.current) window.clearTimeout(hideBarsTimerRef.current);
      hideBarsTimerRef.current = next ? window.setTimeout(() => setReaderBarsVisible(false), 2500) : null;
      return next;
    });
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now(), moved: false };

    longPressTimerRef.current = window.setTimeout(() => {
      if (!touchStartRef.current || touchStartRef.current.moved) return;
      const text = window.getSelection()?.toString().trim();
      if (text) {
        setSelectedText(text);
        if (readerRef.current) {
          const readerRect = readerRef.current.getBoundingClientRect();
          setContextMenu({
            x: touch.clientX - readerRect.left,
            y: touch.clientY - readerRect.top,
          });
        }
      }
    }, 600);
  };

  const handleTouchMove = () => {
    if (touchStartRef.current) touchStartRef.current.moved = true;
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const start = touchStartRef.current;
    if (!start) return;
    touchStartRef.current = null;

    if (start.moved) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const dt = Date.now() - start.time;

    // Treat as click if minimal movement
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 300) {
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const width = rect.width;
      if (x < width / 4) {
        readerScrollRef.current?.scrollBy({ top: -rect.height * 0.8, behavior: 'smooth' });
      } else if (x > (width * 3) / 4) {
        readerScrollRef.current?.scrollBy({ top: rect.height * 0.8, behavior: 'smooth' });
      } else {
        setReaderBarsVisible((v) => {
          const next = !v;
          if (hideBarsTimerRef.current) window.clearTimeout(hideBarsTimerRef.current);
          hideBarsTimerRef.current = next ? window.setTimeout(() => setReaderBarsVisible(false), 2500) : null;
          return next;
        });
      }
      return;
    }

    // Vertical swipe
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 40) {
      const container = readerScrollRef.current;
      if (!container) return;
      container.scrollBy({ top: dy > 0 ? -container.clientHeight * 0.8 : container.clientHeight * 0.8, behavior: 'smooth' });
    }
  };

  const formatProgressText = () => {
    const chapterIndex = currentChapterId ? Math.max(0, currentChapterIndex) : 0;
    const chapterText = chapters.length > 0
      ? `第 ${chapterIndex + 1}/${chapters.length} 章`
      : '';
    const chapterPct = chapters.length > 0 ? `本章 ${chapterProgress}%` : '';
    const totalPct = `全书 ${readerProgress}%`;
    const time = estimatedRemainingMinutes > 0 ? `剩余约 ${estimatedRemainingMinutes} 分钟` : '';
    return [chapterText, chapterPct, totalPct, time].filter(Boolean).join(' · ');
  };

  const isVolumeTitle = (title: string) => {
    return /^(第[零一二两三四五六七八九十百千万\d]+[卷篇部])/.test(title);
  };

  return (
    <div
      className={`library-reader theme-${readerTheme}`}
      ref={readerRef}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
      onClick={() => setContextMenu(null)}
    >
      {isEntering && (
        <div className="reader-enter-cover" style={{ background: book.cover || 'var(--bg-tertiary)' }}>
          <div className="reader-enter-cover-inner">
            <h2 className="reader-enter-title">{book.title}</h2>
            {book.author && <div className="reader-enter-author">{book.author}</div>}
          </div>
        </div>
      )}

      {showReaderHint && (
        <div
          className="lib-reader-hint"
          onClick={() => {
            setShowReaderHint(false);
            localStorage.setItem(`cige:reader-hint-seen:${book.id}`, '1');
          }}
        >
          <div className="lib-reader-hint-content">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>点击左右两侧翻页，点击中间显示/隐藏菜单</span>
          </div>
        </div>
      )}

      <div className={`lib-reader-header${immersiveMode && !readerBarsVisible ? ' hidden' : ''}`}>
        <div className="lib-reader-title-row">
          <div>
            <h3 className="lib-reader-title">{book.title}</h3>
            <div className="lib-reader-author">{book.author}</div>
          </div>
          <div className="lib-reader-actions">
            {onBack && (
              <button className="lib-reader-action" onClick={onBack} title="返回书架">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
            )}
            {onToggleFavorite && (
              <button
                className={`lib-reader-action${book.is_favorite ? ' active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite();
                }}
                title={book.is_favorite ? '取消收藏' : '收藏'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={book.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
            )}
            <button
              className={`lib-reader-action${immersiveMode ? ' active' : ''}`}
              onClick={() => onImmersiveChange(!immersiveMode)}
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
              className={`lib-reader-action${showReaderSettings ? ' active' : ''}`}
              onClick={() => setShowReaderSettings((v) => !v)}
              title="阅读设置"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            {onDelete && (
              <button className="lib-reader-action" onClick={onDelete} title="删除">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {activeTags.length > 0 && (
          <div className="lib-reader-tags">
            {activeTags.map((tag, i) => (
              <span key={i} className="lib-reader-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>

      <div className="lib-book-stage">
        <div
          className={`lib-reader-scroll font-${readerFontFamily}${isEntering ? ' reader-enter-active' : ''}`}
          ref={readerScrollRef}
          style={{
            fontSize: readerFontSize,
            lineHeight: readerLineHeight,
            '--reader-para-spacing': `${readerParaSpacing}em`,
          } as React.CSSProperties}
          onClick={handleReaderClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={(e) => e.stopPropagation()}
        >
          {chapters.length === 0 ? (
            <div className="lib-reader-empty">暂无章节内容</div>
          ) : (
            <div className="lib-reader-scroll-inner">
              {chapters.map((chapter) => {
                const chapterParas = rawParagraphs.slice(chapter.start_paragraph, chapter.end_paragraph + 1);
                return (
                  <div
                    key={chapter.id}
                    className="lib-chapter"
                    data-chapter-id={chapter.id}
                    ref={(el) => {
                      if (el) chapterRefs.current.set(chapter.id, el);
                    }}
                  >
                    <h3 className={`lib-chapter-title${isVolumeTitle(chapter.title) ? ' volume' : ''}`}>{chapter.title}</h3>
                    {chapterParas.map((para, idx) =>
                      para ? (
                        <p
                          key={`p-${chapter.id}-${idx}`}
                          className="lib-para"
                        >
                          {para}
                        </p>
                      ) : null
                    )}
                    <div className="lib-chapter-end">本章完</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className={`lib-reader-footer${immersiveMode && !readerBarsVisible ? ' hidden' : ''}`}>
        <div className="lib-reader-progress-bar">
          <div className="lib-reader-progress-fill" style={{ width: `${readerProgress}%` }} />
        </div>
        <span className="lib-reader-current-chapter">
          {chapters.find((c) => c.id === currentChapterId)?.title || book.title || ''}
        </span>
        <span className="lib-reader-progress">{formatProgressText()}</span>
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
            <div className="lib-toc-actions">
              <button
                className="lib-toc-sort"
                onClick={() => setTocSortAsc((v) => !v)}
                title={tocSortAsc ? '切换倒序' : '切换正序'}
              >
                {tocSortAsc ? '正序' : '倒序'}
              </button>
              <button className="lib-toc-close" onClick={() => setShowToc(false)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
          <div className="lib-toc-content">
            {sortedChapters.length > 0 ? (
              sortedChapters.map((chapter, idx) => (
                <button
                  key={chapter.id}
                  ref={(el) => {
                    if (el) tocItemRefs.current.set(chapter.id, el);
                    else tocItemRefs.current.delete(chapter.id);
                  }}
                  className={`lib-toc-item${chapter.id === currentChapterId ? ' active' : ''}`}
                  onClick={() => scrollToChapter(chapter.id)}
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

      {showReaderSettings && (
        <ReaderSettingsPanel onClose={() => setShowReaderSettings(false)} />
      )}
    </div>
  );
};

export default Reader;
