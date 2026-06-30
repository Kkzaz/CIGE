import React, { useState, useRef } from 'react';

interface ImportDialogProps {
  onClose: () => void;
  onSuccess: (count: number) => void;
  onError: (message: string) => void;
}

type ImportTab = 'file' | 'folder' | 'url' | 'clipboard' | 'manual';

const TABS: { key: ImportTab; label: string; icon: React.ReactNode }[] = [
  {
    key: 'file',
    label: '本地文件',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    key: 'folder',
    label: '文件夹',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    key: 'url',
    label: '网络链接',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    key: 'clipboard',
    label: '剪贴板',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    ),
  },
  {
    key: 'manual',
    label: '手动录入',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
];

const ImportDialog: React.FC<ImportDialogProps> = ({ onClose, onSuccess, onError }) => {
  const [activeTab, setActiveTab] = useState<ImportTab>('file');
  const [url, setUrl] = useState('');
  const [clipboard, setClipboard] = useState('');
  const [manual, setManual] = useState({ title: '', author: '', category: '', tags: '', content: '' });
  const [loading, setLoading] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const handleFileImport = async () => {
    setLoading(true);
    try {
      const imported = await window.cigeAPI.importBookFile();
      onSuccess(imported?.length || 0);
    } catch (err) {
      onError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setLoading(false);
    }
  };

  const handleFolderImport = async () => {
    setLoading(true);
    try {
      const imported = await window.cigeAPI.importBookFolder();
      onSuccess(imported?.length || 0);
    } catch (err) {
      onError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setLoading(false);
    }
  };

  const handleUrlImport = async () => {
    if (!url.trim()) return onError('请输入链接地址');
    setLoading(true);
    try {
      await window.cigeAPI.importBookUrl(url.trim());
      onSuccess(1);
    } catch (err) {
      onError(err instanceof Error ? err.message : '链接导入失败');
    } finally {
      setLoading(false);
    }
  };

  const handleClipboardImport = async () => {
    if (!clipboard.trim()) return onError('剪贴板内容为空');
    setLoading(true);
    try {
      const lines = clipboard.split(/\n/).map((l) => l.trim()).filter(Boolean);
      let title = '剪贴板书源';
      let author = '';
      let content = clipboard;
      if (lines.length >= 3) {
        title = lines[0].replace(/^[#《\s]+|[》\s]+$/g, '');
        const possibleAuthor = lines[1];
        if (possibleAuthor.length < 30 && !possibleAuthor.includes('，') && !possibleAuthor.includes('。')) {
          author = possibleAuthor.replace(/^作者[：:]?\s*/, '');
          content = lines.slice(2).join('\n\n');
        }
      }
      await window.cigeAPI.importBookManual({ title, author, content, category: '导入', tags: '剪贴板' });
      onSuccess(1);
    } catch (err) {
      onError(err instanceof Error ? err.message : '剪贴板导入失败');
    } finally {
      setLoading(false);
    }
  };

  const handleManualImport = async () => {
    if (!manual.title.trim() || !manual.content.trim()) {
      return onError('请填写书名和正文');
    }
    setLoading(true);
    try {
      await window.cigeAPI.importBookManual({
        title: manual.title,
        author: manual.author,
        content: manual.content,
        category: manual.category || '导入',
        tags: manual.tags || '导入书源',
      });
      onSuccess(1);
    } catch (err) {
      onError(err instanceof Error ? err.message : '录入失败');
    } finally {
      setLoading(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setClipboard(text);
    } catch {
      onError('无法读取剪贴板，请手动粘贴');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="import-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="import-dialog-header">
          <h3 className="import-dialog-title">导入书源</h3>
          <button className="import-dialog-close" onClick={onClose}>×</button>
        </div>

        <div className="import-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`import-tab${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="import-dialog-body">
          {activeTab === 'file' && (
            <div className="import-panel">
              <div className="import-hint">选择本地 .txt / .md 文件，可多选批量导入</div>
              <button className="import-primary-btn" onClick={handleFileImport} disabled={loading}>
                {loading ? '导入中...' : '选择文件'}
              </button>
            </div>
          )}

          {activeTab === 'folder' && (
            <div className="import-panel">
              <div className="import-hint">选择一个文件夹，自动导入其中所有 .txt / .md 文件</div>
              <button className="import-primary-btn" onClick={handleFolderImport} disabled={loading}>
                {loading ? '导入中...' : '选择文件夹'}
              </button>
            </div>
          )}

          {activeTab === 'url' && (
            <div className="import-panel">
              <div className="import-hint">输入在线书源或网页链接，自动抓取文本内容</div>
              <input
                ref={urlInputRef}
                className="import-input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/book.txt"
              />
              <button className="import-primary-btn" onClick={handleUrlImport} disabled={loading || !url.trim()}>
                {loading ? '抓取中...' : '开始导入'}
              </button>
            </div>
          )}

          {activeTab === 'clipboard' && (
            <div className="import-panel">
              <div className="import-hint">将复制的文本粘贴到下方，支持自动识别书名和作者</div>
              <div className="import-clipboard-actions">
                <button className="import-secondary-btn" onClick={handlePasteFromClipboard}>读取剪贴板</button>
              </div>
              <textarea
                className="import-textarea"
                value={clipboard}
                onChange={(e) => setClipboard(e.target.value)}
                placeholder="在此粘贴文本内容..."
                rows={10}
              />
              <button className="import-primary-btn" onClick={handleClipboardImport} disabled={loading || !clipboard.trim()}>
                {loading ? '导入中...' : '导入剪贴板'}
              </button>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="import-panel">
              <div className="import-hint">手动录入书籍信息</div>
              <div className="import-form-grid">
                <input
                  className="import-input"
                  value={manual.title}
                  onChange={(e) => setManual({ ...manual, title: e.target.value })}
                  placeholder="书名 *"
                />
                <input
                  className="import-input"
                  value={manual.author}
                  onChange={(e) => setManual({ ...manual, author: e.target.value })}
                  placeholder="作者"
                />
                <input
                  className="import-input"
                  value={manual.category}
                  onChange={(e) => setManual({ ...manual, category: e.target.value })}
                  placeholder="分类"
                />
                <input
                  className="import-input"
                  value={manual.tags}
                  onChange={(e) => setManual({ ...manual, tags: e.target.value })}
                  placeholder="标签，用逗号分隔"
                />
              </div>
              <textarea
                className="import-textarea"
                value={manual.content}
                onChange={(e) => setManual({ ...manual, content: e.target.value })}
                placeholder="正文内容 *"
                rows={10}
              />
              <button
                className="import-primary-btn"
                onClick={handleManualImport}
                disabled={loading || !manual.title.trim() || !manual.content.trim()}
              >
                {loading ? '保存中...' : '保存书籍'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportDialog;
