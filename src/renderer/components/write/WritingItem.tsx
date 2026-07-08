import React from 'react';
import type { Writing } from '../../../shared/types';

interface WritingItemProps {
  writing: Writing;
  viewMode: 'list' | 'card';
  isActive: boolean;
  isDragging: boolean;
  folderName?: string;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

const WritingItem: React.FC<WritingItemProps> = ({
  writing,
  viewMode,
  isActive,
  isDragging,
  folderName,
  onSelect,
  onDragStart,
  onDragEnd,
  onDelete,
  onContextMenu,
  onDrop,
}) => {
  const dragHandlers = onDrop
    ? {
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          onDrop(e);
        },
      }
    : {};

  if (viewMode === 'list') {
    return (
      <div
        className={`ws-sidebar-item${isActive ? ' active' : ''}${isDragging ? ' dragging' : ''}`}
        onClick={onSelect}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onContextMenu={onContextMenu}
        {...dragHandlers}
      >
        <span className="ws-sidebar-item-title">{writing.title || '未命名'}</span>
        <button
          className="ws-sidebar-item-del"
          onClick={onDelete}
        >&times;</button>
      </div>
    );
  }

  return (
    <div
      className={`ws-sidebar-card${isActive ? ' active' : ''}${isDragging ? ' dragging' : ''}`}
      onClick={onSelect}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onContextMenu={onContextMenu}
      {...dragHandlers}
    >
      <div className="ws-sidebar-card-title">
        <span className="ws-sidebar-card-title-text">{writing.title || '未命名'}</span>
        <button
          className="ws-sidebar-item-del"
          onClick={onDelete}
        >&times;</button>
      </div>
      {folderName && (
        <div className="ws-sidebar-card-meta">
          <span className="ws-sidebar-card-folder">
            <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
              <rect x="2" y="4" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6 4V1M3 4H11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            {folderName}
          </span>
        </div>
      )}
    </div>
  );
};

export default WritingItem;
