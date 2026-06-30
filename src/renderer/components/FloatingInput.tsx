import React, { useState, useRef, useEffect } from 'react';

const FloatingInput: React.FC = () => {
  const [content, setContent] = useState('');
  const [source, setSource] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!content.trim()) return;

    setStatus('saving');
    try {
      await window.cigeAPI.createExcerpt({
        content: content.trim(),
        source: source.trim(),
        tags: tags.trim(),
      });
      setStatus('saved');
      setTimeout(() => {
        window.close();
      }, 600);
    } catch {
      setStatus('idle');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      window.close();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div onKeyDown={handleKeyDown} className="floating-overlay">
      <div className="floating-header">
        <span className="floating-hint">
          快速摘抄 &middot; Cmd+Enter 保存 &middot; Esc 关闭
        </span>
        <button onClick={() => window.close()} className="floating-close" />
      </div>

      <textarea
        ref={inputRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="在此输入摘抄内容..."
        className="floating-textarea"
      />

      <div className="floating-row">
        <input
          className="excerpt-search-input"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="来源 (可选)"
          style={{ flex: 1 }}
        />
        <input
          className="excerpt-search-input"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="标签,逗号分隔"
          style={{ flex: 1 }}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={!content.trim() || status === 'saving'}
        className="btn btn-primary floating-submit"
        style={{
          opacity: !content.trim() ? 0.5 : 1,
        }}
      >
        {status === 'idle' ? '保存摘抄' : status === 'saving' ? '...' : '已保存'}
      </button>
    </div>
  );
};

export default FloatingInput;
