import React, { useEffect, useState, useCallback } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import type { DeletedItem } from '../../shared/types';

const RecycleBin: React.FC = () => {
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [permDeleteTarget, setPermDeleteTarget] = useState<DeletedItem | null>(null);
  const [loading, setLoading] = useState(true);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const data = await window.cigeAPI.getDeletedItems();
    setItems(data as DeletedItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleRestore = async (item: DeletedItem) => {
    await window.cigeAPI.restoreItem(item.type, item.id);
    loadItems();
  };

  const handlePermanentDelete = async () => {
    if (!permDeleteTarget) return;
    await window.cigeAPI.permanentDeleteItem(permDeleteTarget.type, permDeleteTarget.id);
    setPermDeleteTarget(null);
    loadItems();
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case 'writing': return '作品';
      case 'excerpt': return '摘抄';
      case 'inspiration': return '灵感';
      default: return type;
    }
  };

  const typeClass = (type: string) => {
    switch (type) {
      case 'writing': return 'tag-pill-0';
      case 'excerpt': return 'tag-pill-2';
      case 'inspiration': return 'tag-pill-4';
      default: return '';
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title" style={{ fontFamily: 'var(--font-serif)' }}>
          回收站
        </h2>
        <span style={{
          fontSize: 12,
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-sans)',
        }}>
          {items.length} 个已删除项
        </span>
      </div>

      {loading ? (
        <div className="empty-state" style={{ height: 300 }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13 }}>
            加载中...
          </span>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state" style={{ height: 300 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 28, opacity: 0.3 }}>?</span>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13, color: 'var(--text-tertiary)' }}>
              回收站为空
            </span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              className="excerpt-card"
              style={{ borderLeftColor: 'var(--text-tertiary)', opacity: 0.88 }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 6,
                  }}>
                    <span className={`tag-pill ${typeClass(item.type)}`} style={{ cursor: 'default' }}>
                      {typeLabel(item.type)}
                    </span>
                    <span className="excerpt-date">{item.deleted_at}</span>
                  </div>
                  <div style={{
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                    fontFamily: 'var(--font-serif)',
                    maxHeight: 40,
                    overflow: 'hidden',
                  }}>
                    {item.title || item.preview}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => handleRestore(item)}
                    className="btn btn-secondary btn-sm"
                  >
                    恢复
                  </button>
                  <button
                    onClick={() => setPermDeleteTarget(item)}
                    className="btn btn-danger btn-sm"
                  >
                    永久删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {permDeleteTarget && (
        <ConfirmDialog
          title="永久删除"
          message={`确定要永久删除这条${typeLabel(permDeleteTarget.type)}吗？此操作不可恢复，数据将彻底清除。`}
          onConfirm={handlePermanentDelete}
          onCancel={() => setPermDeleteTarget(null)}
        />
      )}
    </div>
  );
};

export default RecycleBin;
