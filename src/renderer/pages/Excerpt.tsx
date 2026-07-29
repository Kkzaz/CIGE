import React, { useEffect, useRef, useState } from 'react';
import type { Excerpt, ExcerptAudio } from '../../shared/types';
import ConfirmDialog from '../components/ConfirmDialog';
import Select from '../components/Select';
import AudioRecorder from '../components/excerpt/AudioRecorder';
import AudioPlayer from '../components/excerpt/AudioPlayer';

const PILL_COLORS = ['tag-pill-0', 'tag-pill-1', 'tag-pill-2', 'tag-pill-3', 'tag-pill-4'];

const MicIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="5.5" y="1.5" width="3" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M3 7c0 2.2 1.8 4 4 4s4-1.8 4-4M7 11v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

/** 统一的摘抄表单组件（创建 / 编辑共用） */
interface ExcerptFormProps {
  initialContent?: string;
  initialSource?: string;
  initialTags?: string;
  pendingAudios: Array<{ buffer: ArrayBuffer; duration: number }>;
  recordingFor: boolean;
  onSave: (content: string, source: string, tags: string) => void;
  onCancel: () => void;
  onAudioSave: (buffer: ArrayBuffer, duration: number) => void;
  onAudioDelete: (idx: number) => void;
  onStartRecord: () => void;
  submitLabel: string;
}

const ExcerptForm: React.FC<ExcerptFormProps> = ({
  initialContent = '',
  initialSource = '',
  initialTags = '',
  pendingAudios,
  recordingFor,
  onSave,
  onCancel,
  onAudioSave,
  onAudioDelete,
  onStartRecord,
  submitLabel,
}) => {
  const [content, setContent] = useState(initialContent);
  const [source, setSource] = useState(initialSource);
  const [tags, setTags] = useState(initialTags);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动聚焦
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (content.trim()) onSave(content, source, tags);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="excerpt-card excerpt-form-card">
      <div className="excerpt-form-inner">
        <textarea
          ref={textareaRef}
          className="inspiration-textarea excerpt-form-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入摘抄内容..."
        />
        <div className="excerpt-form-meta">
          <input
            className="excerpt-search-input"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="来源（如：作者《作品》）"
          />
          <input
            className="excerpt-search-input"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="标签，逗号分隔"
          />
        </div>
        {recordingFor ? (
          <AudioRecorder
            onSave={(b, d) => onAudioSave(b, d)}
            onCancel={onCancel}
          />
        ) : (
          <div className="excerpt-audio-module">
            {pendingAudios.map((a, idx) => (
              <AudioPlayer
                key={idx}
                buffer={a.buffer}
                duration={a.duration}
                excerptId={-1 - idx}
                onDelete={() => onAudioDelete(idx)}
              />
            ))}
            <button className="excerpt-audio-link" onClick={onStartRecord}>
              <MicIcon />
              <span>{pendingAudios.length > 0 ? '继续添加录音' : '添加录音'}</span>
            </button>
          </div>
        )}
        <div className="excerpt-form-actions">
          <span className="excerpt-form-hint">Cmd+Enter 保存 · Esc 取消</span>
          <div className="excerpt-form-btns">
            <button onClick={onCancel} className="btn btn-secondary btn-sm">
              取消
            </button>
            <button
              onClick={() => onSave(content, source, tags)}
              className="btn btn-primary btn-sm"
              disabled={!content.trim()}
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Excerpt: React.FC = () => {
  const [excerpts, setExcerpts] = useState<Excerpt[]>([]);
  const [audiosByExcerpt, setAudiosByExcerpt] = useState<Record<number, ExcerptAudio[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSource, setEditSource] = useState('');
  const [editTags, setEditTags] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Excerpt | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [recordingFor, setRecordingFor] = useState<number | 'new' | null>(null);
  const [pendingAudios, setPendingAudios] = useState<Array<{ buffer: ArrayBuffer; duration: number }>>([]);
  const [editPendingAudios, setEditPendingAudios] = useState<Array<{ buffer: ArrayBuffer; duration: number }>>([]);
  const [clipboardHint, setClipboardHint] = useState<string | null>(null);
  const lastClipboardRef = useRef<string>('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadExcerpts();
    checkClipboard();
  }, []);

  const checkClipboard = async () => {
    try {
      const text = window.electronClipboard?.readText() ?? await navigator.clipboard.readText();
      if (!text || text.trim().length < 2) return;
      if (text === lastClipboardRef.current) return;
      lastClipboardRef.current = text;
      setClipboardHint(text.trim());
    } catch {
      // 剪贴板权限不可用时静默忽略
    }
  };

  const loadExcerpts = async () => {
    const { excerpts: list, audios } = await window.cigeAPI.getExcerptsWithAudios();
    setExcerpts(list as Excerpt[]);
    setAudiosByExcerpt(audios as Record<number, ExcerptAudio[]>);
  };

  // 实时搜索（300ms 防抖）
  const debouncedSearch = (query: string, tag: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => doSearch(query, tag), 300);
  };

  const doSearch = async (query: string, tag: string) => {
    if (!query.trim() && !tag.trim()) {
      loadExcerpts();
      return;
    }
    const data = await window.cigeAPI.searchExcerpts(query.trim(), tag.trim() || undefined);
    setExcerpts(data as Excerpt[]);
  };

  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    debouncedSearch(value, tagFilter);
  };

  const handleTagFilterChange = (value: string) => {
    setTagFilter(value);
    debouncedSearch(searchQuery, value);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setTagFilter('');
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    loadExcerpts();
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
    setEditPendingAudios([]);
  };

  const handleSaveEdit = async (content: string, source: string, tags: string) => {
    if (editingId === null) return;
    await window.cigeAPI.updateExcerpt(editingId, { content, source, tags });
    for (const a of editPendingAudios) {
      await window.cigeAPI.saveExcerptAudio(editingId, a.buffer, a.duration);
    }
    setEditPendingAudios([]);
    setEditingId(null);
    loadExcerpts();
  };

  const handleCreate = async (content: string, source: string, tags: string) => {
    if (!content.trim()) return;
    const id = await window.cigeAPI.createExcerpt({
      content: content.trim(),
      source: source.trim(),
      tags: tags.trim(),
    });
    for (const a of pendingAudios) {
      await window.cigeAPI.saveExcerptAudio(id, a.buffer, a.duration);
    }
    setPendingAudios([]);
    setNewContent('');
    setIsCreating(false);
    loadExcerpts();
  };

  const handleCancelCreate = () => {
    setPendingAudios([]);
    setIsCreating(false);
  };

  const handleSaveRecording = async (excerptId: number, buffer: ArrayBuffer, duration: number) => {
    const audio = await window.cigeAPI.saveExcerptAudio(excerptId, buffer, duration) as ExcerptAudio;
    setAudiosByExcerpt((prev) => ({
      ...prev,
      [excerptId]: [...(prev[excerptId] || []), audio],
    }));
    setRecordingFor(null);
  };

  const handleDeleteAudio = async (excerptId: number, audioId: number) => {
    await window.cigeAPI.deleteExcerptAudio(audioId);
    setAudiosByExcerpt((prev) => ({
      ...prev,
      [excerptId]: (prev[excerptId] || []).filter((a) => a.id !== audioId),
    }));
  };

  const renderCardAudioModule = (item: Excerpt) => {
    const audios = audiosByExcerpt[item.id] || [];
    return (
      <div className="excerpt-audio-module">
        {audios.map((a) => (
          <AudioPlayer
            key={a.id}
            audioPath={a.audio_path}
            duration={a.duration}
            excerptId={item.id}
            onDelete={() => handleDeleteAudio(item.id, a.id)}
          />
        ))}
        {recordingFor === item.id ? (
          <AudioRecorder
            onSave={(b, d) => handleSaveRecording(item.id, b, d)}
            onCancel={() => setRecordingFor(null)}
          />
        ) : (
          <button className="excerpt-audio-link" onClick={() => setRecordingFor(item.id)}>
            <MicIcon />
            <span>{audios.length > 0 ? '继续添加录音' : '添加录音'}</span>
          </button>
        )}
      </div>
    );
  };

  const allTags = [...new Set(
    excerpts.flatMap((e) => e.tags.split(',').map((t) => t.trim()).filter(Boolean))
  )].sort();

  return (
    <div className="page-container">
      {/* 剪贴板提示条 */}
      {clipboardHint && (
        <div className="excerpt-clipboard-hint">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <rect x="4" y="2" width="6" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
            <rect x="5" y="1" width="4" height="2" rx="0.5" fill="currentColor" />
            <path d="M5 6h4M5 8h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span className="excerpt-clipboard-preview">
            检测到剪贴板内容：{clipboardHint.length > 40 ? clipboardHint.slice(0, 40) + '...' : clipboardHint}
          </span>
          <button
            className="excerpt-clipboard-btn"
            onClick={() => {
              setNewContent(clipboardHint);
              setClipboardHint(null);
              setIsCreating(true);
            }}
          >
            粘贴到新摘抄
          </button>
          <button
            className="excerpt-clipboard-close"
            onClick={() => setClipboardHint(null)}
            aria-label="关闭"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {/* 搜索栏 */}
      <div className="excerpt-search-bar">
        <div className="excerpt-search-field">
          <input
            className="excerpt-search-input"
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder="全文搜索摘抄..."
          />
          {searchQuery && (
            <button className="excerpt-search-clear" onClick={() => handleSearchInput('')} aria-label="清除">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        {allTags.length > 0 && (
          <Select
            value={tagFilter}
            onChange={(v) => handleTagFilterChange(v)}
            options={[
              { value: '', label: '全部标签' },
              ...allTags.map((tag) => ({ value: tag, label: tag })),
            ]}
            minWidth={120}
          />
        )}
        {(searchQuery || tagFilter) && (
          <button onClick={clearSearch} className="btn btn-secondary btn-sm">
            重置
          </button>
        )}
        <button
          onClick={() => setIsCreating(true)}
          className="btn btn-primary btn-sm excerpt-add-btn"
        >
          + 添加摘抄
        </button>
      </div>

      {/* 创建表单 */}
      {isCreating && (
        <ExcerptForm
          initialContent={newContent}
          pendingAudios={pendingAudios}
          recordingFor={recordingFor === 'new'}
          onSave={handleCreate}
          onCancel={handleCancelCreate}
          onAudioSave={(b, d) => { setPendingAudios((prev) => [...prev, { buffer: b, duration: d }]); setRecordingFor(null); }}
          onAudioDelete={(idx) => setPendingAudios((prev) => prev.filter((_, i) => i !== idx))}
          onStartRecord={() => setRecordingFor('new')}
          submitLabel="保存"
        />
      )}

      {/* 摘抄列表 */}
      <div className="excerpt-list">
        {excerpts.length === 0 ? (
          <div className="excerpt-empty">
            <div className="excerpt-empty-icon">"</div>
            <div className="excerpt-empty-text">
              {searchQuery || tagFilter ? '没有匹配的摘抄' : '暂无摘抄'}
            </div>
            {!searchQuery && !tagFilter && (
              <button onClick={() => setIsCreating(true)} className="btn btn-primary btn-sm" style={{ marginTop: 10 }}>
                创建第一条摘抄
              </button>
            )}
          </div>
        ) : (
          excerpts.map((item) => (
            <div key={item.id} className="excerpt-card">
              {editingId === item.id ? (
                <ExcerptForm
                  initialContent={editContent}
                  initialSource={editSource}
                  initialTags={editTags}
                  pendingAudios={editPendingAudios}
                  recordingFor={recordingFor === item.id}
                  onSave={handleSaveEdit}
                  onCancel={() => setEditingId(null)}
                  onAudioSave={(b, d) => { setEditPendingAudios((prev) => [...prev, { buffer: b, duration: d }]); setRecordingFor(null); }}
                  onAudioDelete={(idx) => setEditPendingAudios((prev) => prev.filter((_, i) => i !== idx))}
                  onStartRecord={() => setRecordingFor(item.id)}
                  submitLabel="更新"
                />
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
                          className={`excerpt-tag-chip ${PILL_COLORS[idx % PILL_COLORS.length]}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTagFilterChange(tag);
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="excerpt-actions">
                    <span className="excerpt-date">{item.created_at}</span>
                    <div className="excerpt-action-btns">
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
              {editingId !== item.id && renderCardAudioModule(item)}
            </div>
          ))
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="删除摘抄"
          message="确定要删除这条摘抄吗？删除后可在回收站恢复。"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

export default Excerpt;
