import React, { useEffect, useState } from 'react';

interface BookSource {
  id: number;
  name: string;
  url: string;
  group_name: string;
  config: string;
  enabled: number;
  created_at: string;
}

interface BookSourceManagerProps {
  onClose: () => void;
  onRefresh: () => void;
  onToast: (message: string) => void;
  onOpenSearch: () => void;
}

const BookSourceManager: React.FC<BookSourceManagerProps> = ({ onClose, onRefresh, onToast, onOpenSearch }) => {
  const [sources, setSources] = useState<BookSource[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    setLoading(true);
    try {
      const data = await window.cigeAPI.getBookSources();
      setSources(data as BookSource[]);
    } catch (err) {
      onToast('加载书源失败');
    } finally {
      setLoading(false);
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

  const handleImport = async () => {
    try {
      const ids = await window.cigeAPI.importBookSource();
      if (ids.length === 0) {
        onToast('未导入任何书源');
        return;
      }
      onToast(`成功导入 ${ids.length} 个书源`);
      loadSources();
    } catch (err) {
      onToast(err instanceof Error ? err.message : '导入失败');
    }
  };

  const handleToggle = async (id: number) => {
    try {
      await window.cigeAPI.toggleBookSource(id);
      loadSources();
    } catch {
      onToast('切换失败');
    }
  };

  const handleEnableAll = async () => {
    if (!window.confirm('确定启用所有书源吗？')) return;
    try {
      const count = await window.cigeAPI.enableAllBookSources();
      loadSources();
      onRefresh();
      onToast(`已启用 ${count} 个书源`);
    } catch {
      onToast('启用失败');
    }
  };

  const handleSwap = async () => {
    if (!window.confirm('确定交换所有书源的启用状态吗？')) return;
    try {
      const counts = await window.cigeAPI.swapBookSourceEnabledStates();
      loadSources();
      onRefresh();
      onToast(`已交换：已启用 ${counts.enabled || 0}，未启用 ${counts.disabled || 0}`);
    } catch {
      onToast('交换失败');
    }
  };

  const handleDelete = async (source: BookSource) => {
    if (!window.confirm(`确定删除书源「${source.name}」？`)) return;
    try {
      await window.cigeAPI.deleteBookSource(source.id);
      loadSources();
      onRefresh();
      onToast('已删除');
    } catch {
      onToast('删除失败');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="book-source-manager" onClick={(e) => e.stopPropagation()}>
        <div className="book-source-manager-header">
          <h3 className="book-source-manager-title">书源管理</h3>
          <button className="book-source-manager-close" onClick={onClose}>×</button>
        </div>

        <div className="book-source-manager-toolbar">
          <div className="book-source-manager-hint">
            <div className="book-source-manager-hint-title">书源使用说明</div>
            <div className="book-source-manager-hint-steps">
              1. 导入书源 JSON 配置文件<br />
              2. 确保书源已启用（显示"启用"状态）<br />
              3. 通过「在线搜索」或「发现」功能搜索书籍<br />
              4. 点击「导入」将书籍添加到图书馆
            </div>
          </div>
          <div className="book-source-manager-actions">
            <button className="book-source-manager-btn" onClick={handleImport}>导入书源</button>
            <button className="book-source-manager-btn" onClick={handleEnableAll}>全部启用</button>
            <button className="book-source-manager-btn" onClick={handleSwap}>交换状态</button>
            <button className="book-source-manager-btn primary" onClick={onOpenSearch}>在线搜索</button>
          </div>
        </div>

        <div className="book-source-manager-body">
          {loading ? (
            <div className="book-source-manager-empty">加载中...</div>
          ) : sources.length === 0 ? (
            <div className="book-source-manager-empty">
              暂无书源，请先导入书源 JSON
              <br />
              <button className="book-source-manager-btn" onClick={handleImport} style={{ marginTop: 12 }}>
                导入书源
              </button>
            </div>
          ) : (
            <div className="book-source-manager-columns">
              <div className="book-source-manager-column">
                <div className="book-source-manager-column-title">
                  未启用
                  <span className="book-source-manager-column-count">
                    {sources.filter((s) => !s.enabled).length}
                  </span>
                </div>
                <div className="book-source-manager-list">
                  {sources.filter((s) => !s.enabled).map((source) => renderSourceRow(source))}
                  {sources.filter((s) => !s.enabled).length === 0 && (
                    <div className="book-source-manager-column-empty">暂无未启用书源</div>
                  )}
                </div>
              </div>
              <div className="book-source-manager-column">
                <div className="book-source-manager-column-title">
                  已启用
                  <span className="book-source-manager-column-count">
                    {sources.filter((s) => s.enabled).length}
                  </span>
                </div>
                <div className="book-source-manager-list">
                  {sources.filter((s) => s.enabled).map((source) => renderSourceRow(source))}
                  {sources.filter((s) => s.enabled).length === 0 && (
                    <div className="book-source-manager-column-empty">暂无已启用书源</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  function renderSourceRow(source: BookSource) {
    return (
      <div key={source.id} className={`book-source-row${source.enabled ? '' : ' disabled'}`}>
        <div className="book-source-info">
          <div className="book-source-name">
            {source.name}
            {isComicSource(source) && <span className="book-source-tag comic">漫画</span>}
          </div>
          <div className="book-source-meta">
            {source.group_name && <span>{source.group_name}</span>}
            <span>{source.url}</span>
          </div>
        </div>
        <div className="book-source-actions">
          <button
            className={`book-source-toggle${source.enabled ? ' active' : ''}`}
            onClick={() => handleToggle(source.id)}
          >
            {source.enabled ? '禁用' : '启用'}
          </button>
          <button className="book-source-action" onClick={() => handleDelete(source)}>删除</button>
        </div>
      </div>
    );
  }
};

export default BookSourceManager;
