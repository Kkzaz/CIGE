import React, { useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import type { Inspiration as InspirationType } from '../../shared/types';

type InspirationTab = 'hot' | 'quotes';

interface HotTrendItem extends InspirationType {
  platform: 'xiaohongshu' | 'douyin';
}

interface QuoteItem extends InspirationType {
  platform: string;
  label: string;
}

const Inspiration: React.FC = () => {
  const [activeTab, setActiveTab] = useState<InspirationTab>('hot');
  const [hotTrends, setHotTrends] = useState<HotTrendItem[]>([]);
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<InspirationType | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadingMoreRef = useRef(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setHasMore(true);
  }, [activeTab]);



  const loadMore = async () => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      let added = 0;
      if (activeTab === 'hot') {
        added = (await window.cigeAPI.fetchMoreHotTrends()) || 0;
      } else {
        added = (await window.cigeAPI.fetchMoreQuotes()) || 0;
      }
      if (added > 0) {
        await loadData(activeTab);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error('加载更多失败', e);
      setHasMore(false);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  const loadData = async (type?: 'hot' | 'quotes') => {
    try {
      if (!type || type === 'hot') {
        const inspirations = (await window.cigeAPI.getInspirations()) as InspirationType[];
        const trends = inspirations
          .filter((i) => i.tags?.includes('热榜'))
          .map((i) => ({
            ...i,
            platform: i.tags?.includes('抖音') ? 'douyin' : 'xiaohongshu',
          })) as HotTrendItem[];
        setHotTrends(trends);
      }

      if (!type || type === 'quotes') {
        const inspirations = (await window.cigeAPI.getInspirations()) as InspirationType[];
        const quoteItems = inspirations
          .filter((i) => i.tags?.includes('金句'))
          .map((i) => {
            const isNetease = i.tags?.includes('网易云热评');
            const isHitokoto = i.tags?.includes('一言');
            const isLocal = i.tags?.includes('精选');
            return {
              ...i,
              platform: isNetease ? 'netease' : isHitokoto ? 'hitokoto' : isLocal ? 'local' : 'xiaohongshu',
              label: isNetease ? '网易云热评' : isHitokoto ? '一言' : isLocal ? '精选' : '文案标签',
            };
          }) as QuoteItem[];
        setQuotes(quoteItems);
      }
    } finally {
      if (!type) setLoaded(true);
    }
  };

  const handleDelete = async (id: number) => {
    await window.cigeAPI.deleteInspiration(id);
    setDeleteTarget(null);
    loadData();
  };

  const handleDragStart = (content: string) => {
    sessionStorage.setItem('draggedInspiration', content);
  };

  const xhsItems = hotTrends.filter((i) => i.platform === 'xiaohongshu');
  const dyItems = hotTrends.filter((i) => i.platform === 'douyin');

  const renderHotColumn = (
    title: string,
    items: HotTrendItem[],
    platformKey: string,
    tagClass: string
  ) => (
    <div key={platformKey} className="insp-hot-column">
      <div className="insp-hot-column-header">
        <span className={`insp-hot-badge ${tagClass}`}>{title}</span>
        <span className="insp-hot-count">{items.length}</span>
      </div>
      <div className="insp-hot-list">
        {items.length === 0 ? (
          <div className="insp-empty">暂无 {title} 热点</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              draggable
              className="insp-hot-card"
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', item.content);
                handleDragStart(item.content);
              }}
            >
              <div className="insp-hot-text">{item.content}</div>
              <div className="insp-hot-meta">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(item);
                  }}
                  className="btn btn-danger btn-sm"
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderQuotesList = (items: QuoteItem[]) => (
    <div className="insp-quotes-list">
      {items.length === 0 ? (
        <div className="insp-empty">暂无金句文案</div>
      ) : (
        items.map((item) => (
          <div
            key={item.id}
            draggable
            className="insp-quote-card"
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', item.content);
              handleDragStart(item.content);
            }}
          >
            <div className="insp-quote-text">{item.content}</div>
            <div className="insp-quote-meta">
              <span className={`insp-quote-tag insp-quote-tag-${item.platform}`}>{item.label}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(item);
                }}
                className="btn btn-danger btn-sm"
              >
                删除
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );

  const getPreviewTitle = () => {
    if (activeTab === 'hot') return '热点';
    return '金句文案';
  };

  const getPreviewItems = (): { id: number; content: string; title?: string; source?: string; kind: 'hot' | 'quote' }[] => {
    if (activeTab === 'hot') {
      return hotTrends.slice(0, 8).map((t) => ({ id: t.id, content: t.content, title: t.platform === 'douyin' ? '抖音' : '小红书', kind: 'hot' as const }));
    }
    return quotes.slice(0, 8).map((q) => ({ id: q.id, content: q.content, title: q.label, kind: 'quote' as const }));
  };

  const previewTitle = getPreviewTitle();
  const previewItems = getPreviewItems();

  return (
    <div className="page-container inspiration-page">
      <div className="inspiration-header">
        <h2 className="page-title" style={{ fontFamily: 'var(--font-serif)' }}>
          {activeTab === 'hot' ? '热点' : '金句文案'}
        </h2>
      </div>

      <div className="inspiration-layout">
        {/* Main content area */}
        <div className="inspiration-main">
          {!loaded ? (
            <div className="insp-empty">加载中...</div>
          ) : activeTab === 'hot' ? (
            <>
              <div className="insp-hot-grid">
                {renderHotColumn('小红书', xhsItems, 'xhs', 'insp-badge-xhs')}
                {renderHotColumn('抖音', dyItems, 'dy', 'insp-badge-dy')}
              </div>
              {hasMore && !loadingMore && (
                <button className="btn-load-more" onClick={loadMore}>
                  加载更多热点
                </button>
              )}
              {loadingMore && <div className="insp-load-more">正在加载更多...</div>}
              {!hasMore && <div className="insp-no-more">已加载全部热点</div>}
            </>
          ) : (
            <>
              {renderQuotesList(quotes)}
              {hasMore && !loadingMore && (
                <button className="btn-load-more" onClick={loadMore}>
                  加载更多金句
                </button>
              )}
              {loadingMore && <div className="insp-load-more">正在加载更多...</div>}
              {!hasMore && <div className="insp-no-more">已加载全部金句</div>}
            </>
          )}
        </div>

        {/* Right side panel: switcher + preview */}
        <div className="inspiration-side">
          <div className="inspiration-panel">
            <div className="inspiration-panel-title">板块</div>
            <div className="insp-switcher">
              <button
                className={`insp-switcher-btn${activeTab === 'hot' ? ' active' : ''}`}
                onClick={() => setActiveTab('hot')}
              >
                热点
              </button>
              <button
                className={`insp-switcher-btn${activeTab === 'quotes' ? ' active' : ''}`}
                onClick={() => setActiveTab('quotes')}
              >
                金句
              </button>
            </div>

            <div className="insp-preview">
              <div className="insp-preview-title">{previewTitle}精选</div>
              <div className="insp-preview-list">
                {previewItems.length === 0 ? (
                  <div className="insp-empty">暂无内容</div>
                ) : (
                  previewItems.map((item) => (
                    <div
                      key={`preview-${item.kind}-${item.id}`}
                      className="insp-preview-item"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', item.content);
                        handleDragStart(item.content);
                      }}
                    >
                      <div className="insp-preview-text">{item.content}</div>
                      {'title' in item && (
                        <span className={`insp-preview-tag ${item.title === '抖音' ? 'insp-tag-dy' : 'insp-tag-xhs'}`}>
                          {item.title}
                        </span>
                      )}
                      {'source' in item && item.source && (
                        <span className="insp-preview-source">{item.source}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="删除灵感"
          message="确定要删除这条灵感吗？此操作不可撤销。"
          onConfirm={() => handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

export default Inspiration;
