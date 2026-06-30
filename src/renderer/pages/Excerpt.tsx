import React, { useEffect, useState } from 'react';
import type { Excerpt } from '../../shared/types';
import ConfirmDialog from '../components/ConfirmDialog';

const PILL_COLORS = ['tag-pill-0', 'tag-pill-1', 'tag-pill-2', 'tag-pill-3', 'tag-pill-4'];

const Excerpt: React.FC = () => {
  const [excerpts, setExcerpts] = useState<Excerpt[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSource, setEditSource] = useState('');
  const [editTags, setEditTags] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Excerpt | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newSource, setNewSource] = useState('');
  const [newTags, setNewTags] = useState('');

  useEffect(() => {
    loadExcerpts();
  }, []);

  const loadExcerpts = async () => {
    const data = await window.cigeAPI.getExcerpts();
    setExcerpts(data as Excerpt[]);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() && !tagFilter.trim()) {
      loadExcerpts();
      return;
    }
    const data = await window.cigeAPI.searchExcerpts(
      searchQuery.trim(),
      tagFilter.trim() || undefined
    );
    setExcerpts(data as Excerpt[]);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await window.cigeAPI.deleteExcerpt(deleteTarget.id);
    setDeleteTarget(null);
    loadExcerpts();
  };

  const handleEdit = (item: Excerpt) => {
    setEditingId(item.id);
    setEditContent(item.content);
    setEditSource(item.source);
    setEditTags(item.tags);
  };

  const handleSaveEdit = async () => {
    if (editingId === null) return;
    await window.cigeAPI.updateExcerpt(editingId, {
      content: editContent,
      source: editSource,
      tags: editTags,
    });
    setEditingId(null);
    loadExcerpts();
  };

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    await window.cigeAPI.createExcerpt({
      content: newContent.trim(),
      source: newSource.trim(),
      tags: newTags.trim(),
    });
    setNewContent('');
    setNewSource('');
    setNewTags('');
    setIsCreating(false);
    loadExcerpts();
  };

  const handleCancelCreate = () => {
    setNewContent('');
    setNewSource('');
    setNewTags('');
    setIsCreating(false);
  };

  const allTags = [...new Set(
    excerpts.flatMap((e) => e.tags.split(',').map((t) => t.trim()).filter(Boolean))
  )].sort();

  return (
    <div className="page-container">
      {/* Search bar */}
      <div className="excerpt-search-bar">
        <input
          className="excerpt-search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="全文搜索摘抄..."
          style={{ flex: 1 }}
        />
        <input
          className="excerpt-search-input"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          placeholder="标签"
          style={{ width: 120 }}
        />
        <button onClick={handleSearch} className="btn btn-primary btn-sm">
          搜索
        </button>
        <button
          onClick={() => { setSearchQuery(''); setTagFilter(''); loadExcerpts(); }}
          className="btn btn-secondary btn-sm"
        >
          重置
        </button>
        <button
          onClick={() => setIsCreating(true)}
          className="btn btn-primary btn-sm"
        >
          添加摘抄
        </button>
      </div>

      {/* Create form */}
      {isCreating && (
        <div className="excerpt-card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <textarea
              className="inspiration-textarea"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="输入摘抄内容..."
              style={{ height: 80, marginBottom: 0 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="excerpt-search-input"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                placeholder="来源（如：作者《作品》）"
                style={{ flex: 1 }}
              />
              <input
                className="excerpt-search-input"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="标签，逗号分隔"
                style={{ flex: 1 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button onClick={handleCancelCreate} className="btn btn-secondary btn-sm">
                取消
              </button>
              <button onClick={handleCreate} className="btn btn-primary btn-sm">
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tag cloud */}
      {allTags.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: 14,
        }}>
          {allTags.map((tag, idx) => (
            <span
              key={tag}
              onClick={() => {
                setTagFilter(tagFilter === tag ? '' : tag);
                if (tagFilter !== tag) {
                  setSearchQuery('');
                } else {
                  loadExcerpts();
                }
              }}
              className={`tag-pill ${PILL_COLORS[idx % PILL_COLORS.length]}${tagFilter === tag ? ' active' : ''}`}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Excerpt list */}
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        {excerpts.length === 0 ? (
          <div className="empty-state" style={{ height: 300 }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13 }}>
              暂无摘抄，使用 Cmd+Shift+C 快速添加
            </span>
          </div>
        ) : (
          excerpts.map((item) => (
            <div key={item.id} className="excerpt-card">
              {editingId === item.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <textarea
                    className="inspiration-textarea"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    style={{ height: 80 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="excerpt-search-input"
                      value={editSource}
                      onChange={(e) => setEditSource(e.target.value)}
                      placeholder="来源"
                      style={{ flex: 1 }}
                    />
                    <input
                      className="excerpt-search-input"
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="标签,逗号分隔"
                      style={{ flex: 1 }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditingId(null)} className="btn btn-secondary btn-sm">
                      取消
                    </button>
                    <button onClick={handleSaveEdit} className="btn btn-primary btn-sm">
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <div className="excerpt-row">
                  <div className="excerpt-main">
                    <div className="excerpt-content">
                      {item.content}
                    </div>
                    <div className="excerpt-meta-left">
                      {item.source && (
                        <span className="excerpt-source">
                          &mdash; {item.source}
                        </span>
                      )}
                      {item.tags.split(',').map((t) => t.trim()).filter(Boolean).map((tag, idx) => (
                        <span
                          key={idx}
                          onClick={(e) => {
                            e.stopPropagation();
                            setTagFilter(tag);
                            handleSearch();
                          }}
                          style={{
                            display: 'inline-flex',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 10,
                            color: 'var(--text-tertiary)',
                            background: 'var(--bg-tertiary)',
                            cursor: 'pointer',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="excerpt-actions">
                    <span className="excerpt-date">{item.created_at}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => handleEdit(item)}
                        className="excerpt-action-btn"
                        title="编辑"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M11.2 2.8L9.8 4.2L7 1.4L5.6 2.8L8.4 5.6L11.2 2.8ZM1 11.2V13H2.8L10.4 5.4L7.6 2.6L1 11.2Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteTarget(item)}
                        className="excerpt-action-btn excerpt-action-btn-danger"
                        title="删除"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M2 4H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                          <path d="M5 4V12C5 12.276 5.105 12.53 5.293 12.707C5.48 12.895 5.724 13 6 13H8C8.276 13 8.52 12.895 8.707 12.707C8.895 12.53 9 12.276 9 12V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                          <path d="M5 4L3 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                          <path d="M9 4L11 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="删除摘抄"
          message="确定要删除这条摘抄吗？此操作不可撤销。"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

export default Excerpt;
