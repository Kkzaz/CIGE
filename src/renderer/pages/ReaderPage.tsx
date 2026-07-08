import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Reader from '../components/Reader';

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

const ReaderPage: React.FC = () => {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const id = Number(bookId);
        if (!id || isNaN(id)) {
          setError('书籍 ID 无效');
          setLoading(false);
          return;
        }
        const data = (await window.cigeAPI.getBookById(id)) as Book | null;
        if (!mounted) return;
        if (!data) {
          setError('未找到该书籍');
        } else {
          setBook(data);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [bookId]);

  useEffect(() => {
    window.cigeAPI.setReaderActive(true);
    return () => {
      window.cigeAPI.setReaderActive(false);
    };
  }, []);

  if (loading) {
    return (
      <div className="reader-page-loading">
        <div className="reader-page-spinner" />
        <span>正在打开书籍…</span>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="reader-page-error">
        <h2>{error || '无法加载书籍'}</h2>
        <button className="btn btn-primary" onClick={() => navigate('/library')}>
          返回书架
        </button>
      </div>
    );
  }

  return (
    <Reader
      book={book}
      immersiveMode={false}
      onImmersiveChange={() => {}}
      onBack={() => navigate('/library')}
      onToggleFavorite={async () => {
        await window.cigeAPI.toggleBookFavorite(book.id);
        const fresh = (await window.cigeAPI.getBookById(book.id)) as Book | null;
        if (fresh) setBook(fresh);
      }}
      onDelete={() => navigate('/library')}
      onToast={() => {}}
    />
  );
};

export default ReaderPage;
