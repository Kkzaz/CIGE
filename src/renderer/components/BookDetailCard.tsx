import React, { useEffect, useRef, useState } from 'react';
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

interface Chapter {
  id: number;
  title: string;
}

interface ReadingProgress {
  book_id: number;
  chapter_id: number;
  scroll_top: number;
  updated_at: string;
}

interface ImportProgress {
  bookId: number;
  status: string;
  completed: number;
  total: number;
  message?: string;
}

interface BookDetailCardProps {
  book: Book;
  importProgress?: ImportProgress;
  onClose: () => void;
  onRead: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onResumeImport?: (bookId: number) => void;
}

const BookDetailCard: React.FC<BookDetailCardProps> = ({
  book,
  importProgress,
  onClose,
  onRead,
  onToggleFavorite,
  onDelete,
  onResumeImport,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [entering, setEntering] = useState(true);
  const [closing, setClosing] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [progress, setProgress] = useState<ReadingProgress | null>(null);

  const coverStyle = generateBookCover(book.title, book.author || undefined, 'large');
  const coverBackground = book.cover || coverStyle.background;

  useEffect(() => {
    const timer = setTimeout(() => setEntering(false), 30);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.cigeAPI.getBookChapters(book.id),
      window.cigeAPI.getBookReadingProgress(book.id),
    ]).then(([chaptersData, progressData]) => {
      if (cancelled) return;
      setChapters((chaptersData as Chapter[]) || []);
      setProgress((progressData as ReadingProgress | null) || null);
    }).catch(() => {
      // ignore
    });
    return () => { cancelled = true; };
  }, [book.id]);

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 280);
  };

  const handleRead = () => {
    setClosing(true);
    setTimeout(onRead, 220);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const activeTags = book.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const currentChapter = progress?.chapter_id
    ? chapters.find((c) => c.id === progress.chapter_id)
    : null;

  const wordCount = book.content?.length || 0;
  const displayWordCount = wordCount > 10000
    ? `${(wordCount / 10000).toFixed(1)} 万字`
    : `${wordCount} 字`;

  const formatLastRead = () => {
    if (!progress || !currentChapter) return '尚未开始阅读';
    return `上次读到：${currentChapter.title}`;
  };

  const downloadPercent = importProgress && importProgress.total > 0
    ? Math.round((importProgress.completed / importProgress.total) * 100)
    : 0;

  const statusText = (status?: string) => {
    switch (status) {
      case 'running':
        return '下载中';
      case 'paused':
        return '已暂停';
      case 'completed':
        return '下载完成';
      case 'error':
        return '下载失败';
      case 'cancelled':
        return '已取消';
      default:
        return status || '';
    }
  };

  const isDownloadActive = importProgress && importProgress.status !== 'completed';

  return (
    <div
      className={`book-detail-overlay${closing ? ' closing' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={panelRef}
        className={`book-detail-panel${entering ? ' entering' : ''}${closing ? ' closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="book-detail-close" onClick={handleClose} aria-label="关闭">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="book-detail-content">
          <div className="book-detail-cover-wrap">
            <div
              className="book-detail-cover"
              style={{
                background: coverBackground,
                color: coverStyle.color,
                textShadow: coverStyle.textShadow,
              }}
            >
              {!book.cover && <div className="book-detail-cover-spine" style={{ background: coverStyle.spineColor }} />}
              <span className="book-detail-cover-title">{book.title}</span>
              <div className="book-detail-cover-author">{book.author || '未知作者'}</div>
            </div>
          </div>

          <div className="book-detail-info">
            <div className="book-detail-meta">
              <span className="book-detail-category">{book.category || '未分类'}</span>
              {activeTags.length > 0 && (
                <div className="book-detail-tags">
                  {activeTags.slice(0, 4).map((tag, i) => (
                    <span key={i} className="book-detail-tag">{tag}</span>
                  ))}
                </div>
              )}
            </div>

            <h2 className="book-detail-title">{book.title}</h2>
            <div className="book-detail-author">{book.author || '未知作者'}</div>

            <div className="book-detail-stats">
              <span>{chapters.length > 0 ? `${chapters.length} 章` : '单章节'}</span>
              <span>{displayWordCount}</span>
              <span className="book-detail-last-read">{formatLastRead()}</span>
            </div>

            {isDownloadActive && importProgress && (
              <div className="book-detail-download">
                <div className="book-detail-download-row">
                  <span className="book-detail-download-status">{statusText(importProgress.status)}</span>
                  <span className="book-detail-download-count">
                    {importProgress.completed} / {importProgress.total} 章
                  </span>
                </div>
                <div className="book-detail-download-track">
                  <div
                    className="book-detail-download-bar"
                    style={{ width: `${downloadPercent}%` }}
                  />
                </div>
                <div className="book-detail-download-actions">
                  {importProgress.status === 'running' && (
                    <button
                      className="book-detail-download-btn"
                      onClick={() => window.cigeAPI.pauseBookImport(book.id)}
                    >
                      暂停
                    </button>
                  )}
                  {(importProgress.status === 'paused' || importProgress.status === 'cancelled' || importProgress.status === 'error') && (
                    <button
                      className="book-detail-download-btn primary"
                      onClick={() => onResumeImport?.(book.id)}
                    >
                      继续下载
                    </button>
                  )}
                  {(importProgress.status === 'running' || importProgress.status === 'paused') && (
                    <button
                      className="book-detail-download-btn"
                      onClick={() => window.cigeAPI.cancelBookImport(book.id)}
                    >
                      取消
                    </button>
                  )}
                </div>
              </div>
            )}

            <p className="book-detail-description">
              {book.description || '暂无简介'}
            </p>

            <div className="book-detail-actions">
              <button className="book-detail-read-btn" onClick={handleRead}>
                开始阅读
              </button>
              <button
                className={`book-detail-action-btn${book.is_favorite ? ' active' : ''}`}
                onClick={onToggleFavorite}
                title={book.is_favorite ? '取消收藏' : '收藏'}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={book.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
              <button
                className="book-detail-action-btn"
                onClick={onDelete}
                title="删除"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookDetailCard;
