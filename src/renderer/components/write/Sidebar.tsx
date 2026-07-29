import React, { useRef } from 'react';
import FolderTree, { NestedFolder } from './FolderTree';
import type { Writing, Folder } from '../../../shared/types';

interface SidebarProps {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  sidebarWidth: number;
  viewMode: 'list' | 'card';
  setViewMode: (mode: 'list' | 'card') => void;
  folders: Folder[];
  writings: Writing[];
  currentWriting: Writing | null;
  nestedFolders: NestedFolder[];
  ungroupedWritings: Writing[];
  expandedFolders: number[];
  editingFolderId: number | null;
  renameFolderValue: string;
  showNewFolderInput: boolean;
  newFolderName: string;
  draggingFolderId: number | null;
  draggingWritingId: number | null;
  dragOverFolderId: number | null;
  dragOverUngrouped: boolean;
  isResizing: boolean;
  onNew: () => void;
  onNewFolderInputShow: () => void;
  onNewFolderNameChange: (value: string) => void;
  onCreateFolder: () => void;
  onCancelNewFolder: () => void;
  onToggleFolder: (id: number) => void;
  onStartRename: (folder: Folder) => void;
  onCommitRename: (id: number) => void;
  onRenameChange: (value: string) => void;
  onCancelRename: () => void;
  onDeleteFolder: (folder: Folder) => void;
  onDragStartFolder: (e: React.DragEvent, id: number) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, id: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, id: number | null) => void;
  onUngroupedDragOver: (e: React.DragEvent) => void;
  onUngroupedDragLeave: () => void;
  onUngroupedDrop: (e: React.DragEvent) => void;
  onResizeStart: (e: React.MouseEvent) => void;
  renderWritingItem: (w: Writing) => React.ReactNode;
  getWritingsInFolder: (folderId: number) => Writing[];
}

const Sidebar: React.FC<SidebarProps> = ({
  sidebarCollapsed,
  setSidebarCollapsed,
  sidebarWidth,
  viewMode,
  setViewMode,
  folders,
  writings,
  nestedFolders,
  ungroupedWritings,
  currentWriting,
  expandedFolders,
  editingFolderId,
  renameFolderValue,
  showNewFolderInput,
  newFolderName,
  draggingFolderId,
  draggingWritingId,
  dragOverFolderId,
  dragOverUngrouped,
  isResizing,
  onNew,
  onNewFolderInputShow,
  onNewFolderNameChange,
  onCreateFolder,
  onCancelNewFolder,
  onToggleFolder,
  onStartRename,
  onCommitRename,
  onRenameChange,
  onCancelRename,
  onDeleteFolder,
  onDragStartFolder,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onUngroupedDragOver,
  onUngroupedDragLeave,
  onUngroupedDrop,
  onResizeStart,
  renderWritingItem,
  getWritingsInFolder,
}) => {
  const collapseGuardRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justCollapsedRef = useRef(false);

  const sidebarClasses = [
    'ws-sidebar',
    sidebarCollapsed ? 'collapsed' : '',
    viewMode === 'card' && !sidebarCollapsed ? 'ws-sidebar-card-view' : '',
  ].filter(Boolean).join(' ');

  if (sidebarCollapsed) {
    return (
      <div
        className="ws-sidebar-collapsed-bar"
        onMouseEnter={() => {
          if (justCollapsedRef.current) {
            justCollapsedRef.current = false;
            return;
          }
          collapseGuardRef.current = setTimeout(() => setSidebarCollapsed(false), 200);
        }}
        onMouseLeave={() => {
          if (collapseGuardRef.current) {
            clearTimeout(collapseGuardRef.current);
            collapseGuardRef.current = null;
          }
        }}
      >
        <button
          className="ws-sidebar-toggle"
          onClick={() => setSidebarCollapsed(false)}
          title="展开侧边栏"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className={sidebarClasses} style={{ width: `${sidebarWidth}px` }}>
      <div className="ws-sidebar-header">
        <button
          className="ws-sidebar-toggle"
          onClick={() => { justCollapsedRef.current = true; setSidebarCollapsed(true); }}
          title="折叠侧边栏"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="ws-sidebar-view-toggle">
          <button
            className={`ws-btn ws-btn-icon${viewMode === 'list' ? ' active' : ''}`}
            onClick={() => setViewMode('list')}
            title="列表视图"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M2 3H12M2 7H12M2 11H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            className={`ws-btn ws-btn-icon${viewMode === 'card' ? ' active' : ''}`}
            onClick={() => setViewMode('card')}
            title="卡片视图"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <rect x="2" y="2" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="8" y="2" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="2" y="8" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="8" y="8" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          </button>
        </div>
        <button
          className="ws-btn ws-btn-icon"
          onClick={onNew}
          title="新建文本"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M7 3V11M3 7H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
        <button
          className="ws-btn ws-btn-icon"
          onClick={onNewFolderInputShow}
          title="新建文件夹"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <rect x="3" y="5" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M7 5V2M5 3H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {showNewFolderInput && (
        <div className="ws-folder-new-input">
          <input
            className="input"
            placeholder="文件夹名称"
            value={newFolderName}
            onChange={(e) => onNewFolderNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCreateFolder();
              if (e.key === 'Escape') { onCancelNewFolder(); }
            }}
            onBlur={() => {
              if (newFolderName.trim()) onCreateFolder();
              else onCancelNewFolder();
            }}
            autoFocus
          />
        </div>
      )}

      <div className={`ws-sidebar-list${viewMode === 'card' ? ' ws-sidebar-list-card' : ''}`}>
        {writings.length === 0 && folders.length === 0 ? (
          <div className="ws-sidebar-empty">暂无作品</div>
        ) : (
          <>
            {nestedFolders.map((folder) => (
              <FolderTree
                key={folder.id}
                folder={folder}
                currentWriting={currentWriting}
                expandedFolders={expandedFolders}
                draggingFolderId={draggingFolderId}
                draggingWritingId={draggingWritingId}
                dragOverFolderId={dragOverFolderId}
                editingFolderId={editingFolderId}
                renameFolderValue={renameFolderValue}
                onToggle={onToggleFolder}
                onDragStartFolder={onDragStartFolder}
                onDragEnd={onDragEnd}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onStartRename={onStartRename}
                onCommitRename={onCommitRename}
                onRenameChange={onRenameChange}
                onCancelRename={onCancelRename}
                onDeleteFolder={onDeleteFolder}
                writingsInFolder={getWritingsInFolder}
                renderWritingItem={renderWritingItem}
              />
            ))}

            <div
              className={`ws-folder-item${dragOverUngrouped ? ' drag-over' : ''}`}
              onDragOver={onUngroupedDragOver}
              onDragLeave={onUngroupedDragLeave}
              onDrop={onUngroupedDrop}
            >
              <div className="ws-sidebar-section-label">未归类</div>
              <div className="ws-folder-children">
                {ungroupedWritings.length === 0 ? (
                  <div className="ws-folder-empty">拖拽文档或文件夹到这里</div>
                ) : (
                  ungroupedWritings.map((w) => renderWritingItem(w))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div
        className={`ws-sidebar-resizer${isResizing ? ' dragging' : ''}`}
        onMouseDown={onResizeStart}
      />
    </div>
  );
};

export default Sidebar;
