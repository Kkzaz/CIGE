import React, { useEffect, useState } from 'react';
import { generateBookCover } from '../utils/cover';

interface SearchBook {
  name: string;
  author: string;
  coverUrl: string;
  intro: string;
  bookUrl: string;
}

interface BookDetail {
  name: string;
  author: string;
  intro: string;
  coverUrl: string;
  tocUrl: string;
  kind?: string;
}

interface Chapter {
  title: string;
  url: string;
}

interface BookSourcePreviewProps {
  sourceId: number;
  book: SearchBook;
  onClose: () => void;
  onImport: (bookId: number) => void;
  onToast: (message: string) => void;
}

const BookSourcePreview: React.FC<BookSourcePreviewProps> = ({ sourceId, book, onClose, onImport, onToast }) => {
  const [closing, setClosing] = useState(false);
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingDetail(true);
    setLoadingChapters(false);
    setChapters([]);
    setError(null);

    const loadChapters = async (tocUrl: string) => {
      setLoadingChapters(true);
      try {
        const list = await window.cigeAPI.getBookSourceChapters(sourceId, tocUrl);
        if (cancelled) return;
        setChapters((list as Chapter[]) || []);
      } catch (err) {
        if (cancelled) return;
        onToast(err instanceof Error ? err.message : '加载目录失败');
      } finally {
        if (!cancelled) setLoadingChapters(false);
      }
    };

    (async () => {
      try {
        const data = await window.cigeAPI.getBookDetail(sourceId, book.bookUrl);
        if (cancelled) return;
        const d = data as BookDetail | null;
        setDetail(d);
        // 很多书源详情页提取不到 tocUrl，回退到直接用 bookUrl 抓目录
        await loadChapters(d?.tocUrl || book.bookUrl);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '加载详情失败');
        // 详情失败时仍尝试用 bookUrl 加载目录
        await loadChapters(book.bookUrl);
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sourceId, book.bookUrl, onToast]);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => onClose(), 250);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = (await window.cigeAPI.importBookFromSource(sourceId, book.bookUrl)) as { id: number };
      onToast(`《${book.name}》已导入图书馆`);
      onImport(result.id);
      handleClose();
    } catch (err) {
      onToast(err instanceof Error ? err.message : '导入失败');
      setImporting(false);
    }
  };

  const coverStyle = generateBookCover(book.name, book.author || undefined, 'large');
  const displayCover = book.coverUrl || detail?.coverUrl;
  const hasCustomCover = Boolean(displayCover);

  return (
    <div className={`book-detail-overlay source-preview-overlay${closing ? ' closing' : ''}`} onClick={handleClose}>
      <div className={`book-detail-panel source-preview-panel${closing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <button className="book-detail-close source-preview-close" onClick={handleClose}>×</button>

        <div className="source-preview-content">
          <div className="source-preview-header">
            <div
              className="source-preview-cover"
              style={{
                background: displayCover ? `url(${displayCover}) center/cover` : coverStyle.background,
                color: hasCustomCover ? undefined : coverStyle.color,
                textShadow: hasCustomCover ? undefined : coverStyle.textShadow,
              }}
            >
              {!hasCustomCover && <div className="source-preview-cover-spine" style={{ background: coverStyle.spineColor }} />}
              {!hasCustomCover && <span className="source-preview-cover-title">{book.name.slice(0, 5)}</span>}
            </div>
            <div className="source-preview-info">
              <div className="source-preview-meta">
                <span className="source-preview-kind">{detail?.kind || '网络小说'}</span>
              </div>
              <h2 className="source-preview-title">{book.name}</h2>
              <div className="source-preview-author">{book.author || detail?.author || '未知作者'}</div>
              <p className="source-preview-intro">{detail?.intro || book.intro || '暂无简介'}</p>
            </div>
          </div>

          <div className="source-preview-chapters">
            <div className="source-preview-section-title">目录</div>
            {loadingDetail || loadingChapters ? (
              <div className="source-preview-loading">加载中...</div>
            ) : chapters.length === 0 ? (
              error ? (
                <div className="source-preview-error">{error}</div>
              ) : (
                <div className="source-preview-empty">暂无目录</div>
              )
            ) : (
              <div className="source-preview-chapter-list">
                {chapters.slice(0, 50).map((chapter, idx) => (
                  <div key={chapter.url} className="source-preview-chapter-item">
                    <span className="source-preview-chapter-number">{idx + 1}</span>
                    <span className="source-preview-chapter-title">{chapter.title}</span>
                  </div>
                ))}
                {chapters.length > 50 && (
                  <div className="source-preview-more">共 {chapters.length} 章</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="source-preview-actions">
          <button className="source-preview-import-btn" onClick={handleImport} disabled={importing}>
            {importing ? '导入中...' : '导入到图书馆'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookSourcePreview;
