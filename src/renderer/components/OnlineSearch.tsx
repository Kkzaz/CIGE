import React, { useEffect, useState } from 'react';

interface BookSource {
  id: number;
  name: string;
  url: string;
  group_name: string;
  config: string;
  enabled: number;
}

interface SearchBook {
  name: string;
  author: string;
  coverUrl: string;
  intro: string;
  bookUrl: string;
}

interface SearchGroup {
  sourceName: string;
  sourceId?: number;
  books: SearchBook[];
}

interface OnlineSearchProps {
  onClose: () => void;
  onToast: (message: string) => void;
  onImport: () => void;
  initialSourceId?: number;
}

const OnlineSearch: React.FC<OnlineSearchProps> = ({ onClose, onToast, onImport, initialSourceId }) => {
  const [sources, setSources] = useState<BookSource[]>([]);
  const [sourceId, setSourceId] = useState<number | 'all'>('all');
  const [keyword, setKeyword] = useState('');
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingUrl, setImportingUrl] = useState<string | null>(null);

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    try {
      const data = await window.cigeAPI.getBookSources();
      const enabledSources = (data as BookSource[]).filter((s) => s.enabled);
      setSources(enabledSources);
      if (initialSourceId && enabledSources.some((s) => s.id === initialSourceId)) {
        setSourceId(initialSourceId);
      }
    } catch {
      onToast('加载书源失败');
    }
  };

  const selectedSource = sources.find((s) => s.id === sourceId);

  const isComicSource = (source?: BookSource) => {
    if (!source) return false;
    try {
      const cfg = JSON.parse(source.config);
      return cfg.bookSourceType === 2 || cfg.bookSourceType === '2';
    } catch {
      return false;
    }
  };

  const handleSearch = async () => {
    if (!keyword.trim()) return;
    if (sourceId !== 'all' && isComicSource(selectedSource)) {
      onToast('当前书源为漫画源，图书馆暂不支持漫画阅读');
      return;
    }
    setLoading(true);
    setGroups([]);
    try {
      if (sourceId === 'all') {
        const data = await window.cigeAPI.searchBookAllSources(keyword.trim());
        setGroups((data as SearchGroup[]) || []);
        const total = (data as SearchGroup[]).reduce((sum, g) => sum + g.books.length, 0);
        if (total === 0) onToast('未找到相关书籍');
      } else {
        const data = await window.cigeAPI.searchBookBySource(Number(sourceId), keyword.trim());
        const books = (data as SearchBook[]) || [];
        if (books.length === 0) {
          onToast('未找到相关书籍');
          setGroups([]);
        } else {
          setGroups([{ sourceName: selectedSource?.name || '当前书源', sourceId: Number(sourceId), books }]);
        }
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (book: SearchBook, groupSourceId?: number) => {
    const sid = groupSourceId || (sourceId !== 'all' ? Number(sourceId) : undefined);
    if (!sid) {
      onToast('无法确定书源，请从单书源搜索结果导入');
      return;
    }
    setImportingUrl(book.bookUrl);
    try {
      await window.cigeAPI.importBookFromSource(sid, book.bookUrl, 50);
      onToast(`《${book.name}》已导入图书馆`);
      onImport();
    } catch (err) {
      onToast(err instanceof Error ? err.message : '导入失败');
    } finally {
      setImportingUrl(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="online-search" onClick={(e) => e.stopPropagation()}>
        <div className="online-search-header">
          <h3 className="online-search-title">在线搜书</h3>
          <button className="online-search-close" onClick={onClose}>×</button>
        </div>

        <div className="online-search-toolbar">
          <select
            className="online-search-select"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">全部书源</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{isComicSource(s) ? ' [漫画]' : ''}
              </option>
            ))}
          </select>
          <input
            className="online-search-input"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="输入书名或作者"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className="online-search-btn primary" onClick={handleSearch} disabled={loading || !keyword.trim()}>
            {loading ? '搜索中...' : '搜索'}
          </button>
        </div>

        <div className="online-search-body">
          {sources.length === 0 && (
            <div className="online-search-empty">没有可用的书源，请先到「书源管理」中导入并启用。</div>
          )}

          {groups.length === 0 && sources.length > 0 && !loading && keyword === '' && (
            <div className="online-search-empty">输入关键词开始搜索</div>
          )}

          {groups.map((group) => (
            <div key={group.sourceName} className="online-search-group">
              <div className="online-search-group-title">{group.sourceName}</div>
              {group.books.map((book) => (
                <div key={book.bookUrl} className="online-search-result">
                  <div className="online-search-result-cover" style={{ background: book.coverUrl ? `url(${book.coverUrl}) center/cover` : '#D4C4A8' }} />
                  <div className="online-search-result-info">
                    <div className="online-search-result-name">{book.name}</div>
                    <div className="online-search-result-author">{book.author || '未知作者'}</div>
                    <div className="online-search-result-intro">{book.intro || '暂无简介'}</div>
                  </div>
                  <button
                    className="online-search-import-btn"
                    onClick={() => handleImport(book, group.sourceId)}
                    disabled={importingUrl === book.bookUrl}
                  >
                    {importingUrl === book.bookUrl ? '导入中...' : '导入'}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OnlineSearch;
