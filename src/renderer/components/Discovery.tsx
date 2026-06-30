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

interface ExploreGroup {
  title: string;
  books: SearchBook[];
}

interface DiscoveryProps {
  onClose: () => void;
  onToast: (message: string) => void;
  onImport: () => void;
  onOpenSearch?: (sourceId: number) => void;
}

const Discovery: React.FC<DiscoveryProps> = ({ onClose, onToast, onImport, onOpenSearch }) => {
  const [sources, setSources] = useState<BookSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [groups, setGroups] = useState<ExploreGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingUrl, setImportingUrl] = useState<string | null>(null);

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    try {
      const data = await window.cigeAPI.getBookSources();
      const enabled = (data as BookSource[]).filter((s) => s.enabled);
      setSources(enabled);
      if (enabled.length > 0 && !selectedSourceId) {
        setSelectedSourceId(enabled[0].id);
      }
    } catch {
      onToast('加载书源失败');
    }
  };

  useEffect(() => {
    if (!selectedSourceId) return;
    loadExplore(selectedSourceId);
  }, [selectedSourceId]);

  const loadExplore = async (sourceId: number) => {
    setLoading(true);
    setGroups([]);
    try {
      const data = await window.cigeAPI.exploreBookSource(sourceId);
      setGroups((data as ExploreGroup[]) || []);
      if ((data as ExploreGroup[]).length === 0) {
        onToast('该书源暂无发现内容');
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : '获取失败');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (sourceId: number, book: SearchBook) => {
    setImportingUrl(book.bookUrl);
    try {
      await window.cigeAPI.importBookFromSource(sourceId, book.bookUrl, 50);
      onToast(`《${book.name}》已导入图书馆`);
      onImport();
    } catch (err) {
      onToast(err instanceof Error ? err.message : '导入失败');
    } finally {
      setImportingUrl(null);
    }
  };

  const isComicSource = (source: BookSource) => {
    try {
      const cfg = JSON.parse(source.config);
      return cfg.bookSourceType === 2 || cfg.bookSourceType === '2';
    } catch {
      return false;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="discovery-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="discovery-header">
          <h3 className="discovery-title">书源发现</h3>
          <button className="discovery-close" onClick={onClose}>×</button>
        </div>

        <div className="discovery-toolbar">
          <div className="discovery-source-tabs">
            {sources.length === 0 ? (
              <span className="discovery-empty-hint">暂无可用书源</span>
            ) : (
              sources.map((source) => (
                <button
                  key={source.id}
                  className={`discovery-source-tab${selectedSourceId === source.id ? ' active' : ''}`}
                  onClick={() => setSelectedSourceId(source.id)}
                >
                  {source.name}
                  {isComicSource(source) && <span className="discovery-source-tag">漫画</span>}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="discovery-body">
          {loading ? (
            <div className="discovery-empty">加载中...</div>
          ) : groups.length === 0 ? (
            <div className="discovery-empty">
              {selectedSourceId ? (
                <>
                  该书源暂无发现内容，可能未配置发现规则。
                  {onOpenSearch && (
                    <>
                      <br />
                      <button
                        className="discovery-search-fallback"
                        onClick={() => selectedSourceId && onOpenSearch(selectedSourceId)}
                      >
                        去搜索看看
                      </button>
                    </>
                  )}
                </>
              ) : (
                '请选择书源'
              )}
            </div>
          ) : (
            groups.map((group, idx) => (
              <div key={idx} className="discovery-group">
                <div className="discovery-group-title">{group.title}</div>
                <div className="discovery-books">
                  {group.books.map((book) => (
                    <div key={book.bookUrl} className="discovery-book">
                      <div
                        className="discovery-book-cover"
                        style={{ background: book.coverUrl ? `url(${book.coverUrl}) center/cover` : '#D4C4A8' }}
                      />
                      <div className="discovery-book-info">
                        <div className="discovery-book-name">{book.name}</div>
                        <div className="discovery-book-author">{book.author || '未知作者'}</div>
                        <div className="discovery-book-intro">{book.intro || '暂无简介'}</div>
                      </div>
                      <button
                        className="discovery-import-btn"
                        onClick={() => selectedSourceId && handleImport(selectedSourceId, book)}
                        disabled={importingUrl === book.bookUrl}
                      >
                        {importingUrl === book.bookUrl ? '导入中...' : '导入'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Discovery;
