import React from 'react';
import type { Writing, Folder } from '../../../shared/types';

export interface NestedFolder extends Folder {
  children: NestedFolder[];
}

interface FolderTreeProps {
  folder: NestedFolder;
  depth?: number;
  currentWriting: Writing | null;
  expandedFolders: number[];
  draggingFolderId: number | null;
  draggingWritingId: number | null;
  dragOverFolderId: number | null;
  editingFolderId: number | null;
  renameFolderValue: string;
  onToggle: (id: number) => void;
  onDragStartFolder: (e: React.DragEvent, id: number) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, id: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, id: number | null) => void;
  onStartRename: (folder: Folder) => void;
  onCommitRename: (id: number) => void;
  onRenameChange: (value: string) => void;
  onCancelRename: () => void;
  onDeleteFolder: (folder: Folder) => void;
  writingsInFolder: (id: number) => Writing[];
  renderWritingItem: (w: Writing) => React.ReactNode;
}

const FolderTree: React.FC<FolderTreeProps> = ({
  folder,
  depth = 0,
  currentWriting,
  expandedFolders,
  draggingFolderId,
  draggingWritingId,
  dragOverFolderId,
  editingFolderId,
  renameFolderValue,
  onToggle,
  onDragStartFolder,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onStartRename,
  onCommitRename,
  onRenameChange,
  onCancelRename,
  onDeleteFolder,
  writingsInFolder,
  renderWritingItem,
}) => {
  const hasChildren = writingsInFolder(folder.id).length > 0 || folder.children.length > 0;
  const isExpanded = expandedFolders.includes(folder.id);

  return (
    <div
      className={`ws-folder-item${dragOverFolderId === folder.id ? ' drag-over' : ''}${draggingFolderId === folder.id ? ' dragging' : ''}`}
      draggable
      onDragStart={(e) => onDragStartFolder(e, folder.id)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, folder.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, folder.id)}
      style={{ paddingLeft: depth > 0 ? `${depth * 12}px` : 0 }}
    >
      <div className="ws-folder-item-inner">
        <span
          className="ws-folder-chevron"
          onClick={(e) => { e.stopPropagation(); onToggle(folder.id); }}
        >
          {isExpanded ? '▼' : '▶'}
        </span>
        <svg className="ws-folder-icon" width="12" height="12" viewBox="0 0 14 14" fill="none">
          <rect x="2" y="4" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M6 4V1M3 4H11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        {editingFolderId === folder.id ? (
          <input
            className="ws-folder-rename-input"
            value={renameFolderValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitRename(folder.id);
              if (e.key === 'Escape') { onCancelRename(); }
            }}
            onBlur={() => onCommitRename(folder.id)}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="ws-folder-name"
            onDoubleClick={() => onStartRename(folder)}
          >{folder.name}</span>
        )}
        <div className="ws-folder-actions">
          <button
            className="ws-folder-action-btn"
            onClick={(e) => { e.stopPropagation(); onStartRename(folder); }}
            title="重命名"
          >&#9998;</button>
          <button
            className="ws-folder-action-btn ws-folder-action-del"
            onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder); }}
            title="删除文件夹"
          >&times;</button>
        </div>
      </div>
      {isExpanded && hasChildren && (
        <div className="ws-folder-children">
          {folder.children.map((subFolder) => (
            <FolderTree
              key={subFolder.id}
              folder={subFolder}
              depth={depth + 1}
              currentWriting={currentWriting}
              expandedFolders={expandedFolders}
              draggingFolderId={draggingFolderId}
              draggingWritingId={draggingWritingId}
              dragOverFolderId={dragOverFolderId}
              editingFolderId={editingFolderId}
              renameFolderValue={renameFolderValue}
              onToggle={onToggle}
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
              writingsInFolder={writingsInFolder}
              renderWritingItem={renderWritingItem}
            />
          ))}
          {writingsInFolder(folder.id).map((w) => renderWritingItem(w))}
        </div>
      )}
    </div>
  );
};

export default FolderTree;
