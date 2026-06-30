import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Chapter {
  title: string;
  url: string;
}

interface SearchBook {
  name: string;
  author: string;
  coverUrl: string;
  intro: string;
  bookUrl: string;
}

interface OnlineReaderProps {
  sourceId: number;
  book: SearchBook;
  onBack: () => void;
  onImport: (book: SearchBook) => Promise<void>;
}

function extractChapterNum(title: string): number {
  const match = title.match(/第\s*(\d+)\s*[章卷]/);
  return match ? parseInt(match[1], 10) : Infinity;
}

function normalizeChapters(list: Chapter[]): Chapter[] {
  const seen = new Set<string>();
  const unique = list.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
  return [...unique].sort((a, b) => extractChapterNum(a.title) - extractChapterNum(b.title));
}

const TOC_ITEM_HEIGHT = 34;
const PAGE_PADDING_Y = 88; // 48 top + 40 bottom
const PAGE_PADDING_X = 84; // 42 left + 42 right
const SAFETY_MARGIN = 24;

const OnlineReader: React.FC<OnlineReaderProps> = ({ sourceId, book, onBack, onImport }) => {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageGroups, setPageGroups] = useState<number[][]>([]);
  const [tocReversed, setTocReversed] = useState(false);
  const contentCache = useRef<Map<string, string>>(new Map());

  const measureContainerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const tocListRef = useRef<HTMLDivElement>(null);
  const normalizedChaptersRef = useRef<Chapter[]>([]);
  const targetParaRef = useRef<number | null>(null);
  const [tocScrollTop, setTocScrollTop] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function init() {
      setLoading(true);
      setError(null);
      try {
        const detail = (await window.cigeAPI.getBookDetail(sourceId, book.bookUrl)) as {
          name: string;
          author: string;
          tocUrl?: string;
        };
        const tocUrl = detail.tocUrl || book.bookUrl;
        const list = (await window.cigeAPI.getBookSourceChapters(sourceId, tocUrl)) as Chapter[];
        if (!mounted) return;
        const normalized = normalizeChapters(list);
        normalizedChaptersRef.current = normalized;
        setChapters(normalized);
        setTocReversed(false);
        if (normalized.length > 0) {
          setChapterIndex(0);
          await loadChapter(0, normalized);
        } else {
          setError('未获取到章节列表');
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    init();
    return () => {
      mounted = false;
    };
  }, [sourceId, book.bookUrl]);

  async function loadChapter(index: number, list = chapters) {
    if (index < 0 || index >= list.length) return;
    setLoading(true);
    setError(null);
    try {
      const chapter = list[index];
      const cached = contentCache.current.get(chapter.url);
      const text = cached !== undefined ? cached : ((await window.cigeAPI.getBookSourceChapterContent(sourceId, chapter.url)) as string);
      if (cached === undefined) {
        contentCache.current.set(chapter.url, text || '');
      }
      setContent(text || '');
      setChapterIndex(index);
      setCurrentPage(0);
      setPageGroups([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '章节加载失败');
      setContent('');
      setPageGroups([]);
    } finally {
      setLoading(false);
    }
  }

  const paragraphs = React.useMemo(
    () => content.split(/\n+/).map((p) => p.trim()).filter(Boolean),
    [content]
  );

  // Measure paragraphs inside a hidden container that shares the real page box model.
  const recalcPages = React.useCallback(() => {
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
    const onResize = () => {
      const leftPara = pageGroups[currentPage * 2]?.[0];
      if (leftPara !== undefined) {
        targetParaRef.current = leftPara;
      }
      recalcPages();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recalcPages, pageGroups, currentPage]);

  useEffect(() => {
    if (targetParaRef.current !== null && pageGroups.length > 0) {
      const target = targetParaRef.current;
      targetParaRef.current = null;
      for (let i = 0; i < pageGroups.length; i++) {
        if (pageGroups[i].includes(target)) {
          setCurrentPage(Math.floor(i / 2));
          return;
        }
      }
      setCurrentPage(0);
    }
  }, [pageGroups]);

  useEffect(() => {
    if (showToc && tocListRef.current) {
      tocListRef.current.scrollTop = chapterIndex * TOC_ITEM_HEIGHT;
    }
  }, [showToc, chapterIndex]);

  const totalPages = pageGroups.length;
  const screenCount = Math.max(1, Math.ceil(totalPages / 2));

  const goPrev = () => {
    if (currentPage > 0) {
      setCurrentPage((p) => p - 1);
    } else if (chapterIndex > 0) {
      loadChapter(chapterIndex - 1);
    }
  };

  const goNext = () => {
    if (currentPage < screenCount - 1) {
      setCurrentPage((p) => p + 1);
    } else if (chapterIndex < chapters.length - 1) {
      loadChapter(chapterIndex + 1);
    }
  };

  const jumpToChapter = (index: number) => {
    loadChapter(index);
    setShowToc(false);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      await onImport(book);
    } finally {
      setImporting(false);
    }
  };

  const currentChapter = chapters[chapterIndex];
  const leftGroup = pageGroups[currentPage * 2] || [];
  const rightGroup = pageGroups[currentPage * 2 + 1] || [];

  if (loading && !currentChapter) {
    return (
      <div className="lib-reader-empty">
        <div className="lib-reader-empty-title">加载中...</div>
      </div>
    );
  }

  if (error && !currentChapter) {
    return (
      <div className="lib-reader-empty">
        <div className="lib-reader-empty-title">加载失败</div>
        <div className="lib-reader-empty-text">{error}</div>
        <button className="lib-online-page-btn" style={{ marginTop: 16 }} onClick={onBack}>
          返回书架
        </button>
      </div>
    );
  }

  const leftPageNumber = totalPages > 0 ? currentPage * 2 + 1 : 1;
  const rightPageNumber = totalPages > 0 ? Math.min((currentPage + 1) * 2, totalPages) : 1;

  return (
    <div className="lib-online-reader">
      <div className="lib-reader-header">
        <div className="lib-reader-title-row">
          <div>
            <h3 className="lib-reader-title">{book.name}</h3>
            <div className="lib-reader-author">
              {book.author || '未知作者'} · {currentChapter?.title || ''}
            </div>
          </div>
          <div className="lib-reader-actions">
            <button className="lib-reader-action" onClick={() => setShowToc((v) => !v)} title="目录">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <button className="lib-reader-action" onClick={handleImport} disabled={importing} title="加入书架">
              {importing ? (
                <span className="lib-import-spinner">···</span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              )}
            </button>
            <button className="lib-reader-action" onClick={onBack} title="返回书架">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {showToc && (
        <div className="lib-online-toc" onClick={() => setShowToc(false)}>
          <div className="lib-online-toc-inner" onClick={(e) => e.stopPropagation()}>
            <div className="lib-online-toc-header">
              <span>目录</span>
              <button
                className="lib-online-page-btn"
                onClick={() => {
                  setTocReversed((v) => {
                    const next = !v;
                    setChapters(next ? [...normalizedChaptersRef.current].reverse() : normalizedChaptersRef.current);
                    return next;
                  });
                }}
              >
                {tocReversed ? '正序' : '倒序'}
              </button>
            </div>
            <div
              className="lib-online-toc-list"
              ref={tocListRef}
              onScroll={(e) => setTocScrollTop((e.target as HTMLDivElement).scrollTop)}
            >
              <div style={{ height: chapters.length * TOC_ITEM_HEIGHT, position: 'relative' }}>
                {(() => {
                  const containerHeight = tocListRef.current?.clientHeight || 320;
                  const buffer = 5;
                  const startIdx = Math.max(0, Math.floor(tocScrollTop / TOC_ITEM_HEIGHT) - buffer);
                  const visibleCount = Math.ceil(containerHeight / TOC_ITEM_HEIGHT) + buffer * 2;
                  const endIdx = Math.min(chapters.length, startIdx + visibleCount);
                  const visible = chapters.slice(startIdx, endIdx);
                  return (
                    <>
                      <div style={{ height: startIdx * TOC_ITEM_HEIGHT }} />
                      {visible.map((c, idx) => {
                        const i = startIdx + idx;
                        return (
                          <div
                            key={c.url}
                            className={`lib-online-toc-item${i === chapterIndex ? ' active' : ''}`}
                            style={{ position: 'absolute', top: i * TOC_ITEM_HEIGHT, left: 0, right: 0, height: TOC_ITEM_HEIGHT }}
                            onClick={() => jumpToChapter(i)}
                          >
                            {c.title}
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="lib-book-stage">
        <button
          className={`lib-page-turn lib-page-turn-prev${chapterIndex === 0 && currentPage === 0 ? ' disabled' : ''}`}
          onClick={goPrev}
          title="上一页"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="lib-open-book" ref={measureContainerRef}>
          <div className="lib-book-spine" />
          <div className="lib-book-page lib-book-page-left">
            <div className="lib-page-number">{leftPageNumber}</div>
            <div className="lib-page-content">
              {leftGroup.length === 0 ? (
                <div className="lib-page-end">本章完</div>
              ) : (
                leftGroup.map((idx) => (
                  <p key={`l-${currentPage}-${idx}`} className={`lib-para${currentPage === 0 && idx === leftGroup[0] ? ' drop-cap' : ''}`}>
                    {paragraphs[idx]}
                  </p>
                ))
              )}
            </div>
          </div>
          <div className="lib-book-page lib-book-page-right">
            <div className="lib-page-number">{rightPageNumber}</div>
            <div className="lib-page-content">
              {rightGroup.length === 0 ? (
                <div className="lib-page-end">本章完</div>
              ) : (
                rightGroup.map((idx) => (
                  <p key={`r-${currentPage}-${idx}`} className="lib-para">
                    {paragraphs[idx]}
                  </p>
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
          className={`lib-page-turn lib-page-turn-next${chapterIndex >= chapters.length - 1 && currentPage >= screenCount - 1 ? ' disabled' : ''}`}
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
          {currentChapter?.title || ''} · 第 {leftPageNumber}-{rightPageNumber} 页 / 共 {totalPages} 页
        </span>
        <div className="lib-online-chapter-actions">
          <button className="lib-online-page-btn" disabled={chapterIndex <= 0} onClick={() => loadChapter(chapterIndex - 1)}>
            上一章
          </button>
          <button
            className="lib-online-page-btn"
            disabled={chapterIndex >= chapters.length - 1}
            onClick={() => loadChapter(chapterIndex + 1)}
          >
            下一章
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnlineReader;
