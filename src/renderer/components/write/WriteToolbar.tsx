import React from 'react';

type SaveStatus = 'saved' | 'unsaved' | 'saving';

interface WriteToolbarProps {
  saveStatus: SaveStatus;
  onInsertMarker: (marker: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onNew: () => void;
  onSave: () => void;
  onOpenSettings: () => void;
}

const WriteToolbar: React.FC<WriteToolbarProps> = ({
  saveStatus,
  onInsertMarker,
  onUndo,
  onRedo,
  onNew,
  onSave,
  onOpenSettings,
}) => {
  return (
    <div className="ws-toolbar">
      <div className="ws-toolbar-left">
        <button className="ws-btn" onClick={() => onInsertMarker('[主歌]')} title="插入主歌">[主歌]</button>
        <button className="ws-btn" onClick={() => onInsertMarker('[副歌]')} title="插入副歌">[副歌]</button>
        <button className="ws-btn" onClick={() => onInsertMarker('[桥段]')} title="插入桥段">[桥段]</button>
        <button className="ws-btn" onClick={() => onInsertMarker('[尾奏]')} title="插入尾奏">[尾奏]</button>
      </div>

      <div className="ws-toolbar-right">
        <button className="ws-btn ws-btn-icon" onClick={onUndo} title="撤销">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M4 3L1 6L4 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M1 6H9A4 4 0 0 1 13 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </button>
        <button className="ws-btn ws-btn-icon" onClick={onRedo} title="重做">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M10 3L13 6L10 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M13 6H5A4 4 0 0 0 1 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </button>

        <span className="ws-divider" />

        <button className="ws-btn ws-btn-icon" onClick={onNew} title="新建文档">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M7 3V11M3 7H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <span>新建</span>
        </button>

        <button className="ws-btn ws-btn-icon" onClick={onOpenSettings} title="设置">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M13.7 13.7a7.9 7.9 0 0 0 0-11.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>

        <button
          className={`ws-btn ws-btn-save${saveStatus === 'saving' ? ' saving' : ''}`}
          onClick={onSave}
          title="保存 (Cmd+S)"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M11 13V7H3V13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 1H10L13 4V13H1V1H3Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            <path d="M8 1V5H5V1" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
          </svg>
          <span>保存</span>
          <span className="ws-shortcut-hint">Cmd+S</span>
        </button>
      </div>
    </div>
  );
};

export default WriteToolbar;
