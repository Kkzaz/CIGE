import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '../store';
import useStatusBarStore from '../store/statusBar';
import RichEditor from '../components/RichEditor';
import MaterialPanel from '../components/MaterialPanel';
import ConfirmDialog from '../components/ConfirmDialog';
import SettingsPanel from '../components/SettingsPanel';
import type { RhymeSuggestion, LyricStats, RhymeSource } from '../components/Editor';
import type { Writing, Folder } from '../../shared/types';

type SaveStatus = 'saved' | 'unsaved' | 'saving';
type ViewMode = 'list' | 'card';

const Write: React.FC = () => {
  const { writings, currentWriting, setWritings, setCurrentWriting } = useStore();
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [deleteTarget, setDeleteTarget] = useState<Writing | null>(null);
  const [rhymeSuggestion, setRhymeSuggestion] = useState<RhymeSuggestion | null>(null);
  const [rhymeSource, setRhymeSource] = useState<RhymeSource>('auto');
  const [rhymeRefreshKey, setRhymeRefreshKey] = useState(0);
  const [lyricStats, setLyricStats] = useState<LyricStats>({
    lineCount: 0, charCount: 0, rhymeFinals: [], verseCount: 0, chorusCount: 0, bridgeCount: 0, outroCount: 0,
  });
  const [showSettings, setShowSettings] = useState(false);
  const { updateStats } = useStatusBarStore();

  const updateSaveStatus = (status: SaveStatus) => {
    setSaveStatus(status);
    updateStats({ saveStatus: status });
  };

  const handleStatsChange = useCallback((stats: LyricStats) => {
    setLyricStats(stats);
    updateStats(stats);
  }, [updateStats]);

  const rhymeCheckOn = true;
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contentDirtyRef = useRef(false);

  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const collapseGuardRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justCollapsedRef = useRef(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem('cige_sidebar_view') as ViewMode) || 'list';
    } catch { return 'list'; }
  });
  const [folders, setFolders] = useState<Folder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<number[]>([]);
  const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<Folder | null>(null);
  const creatingFolderRef = useRef(false);

  // Context menu for writings
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; writingId: number } | null>(null);

  // Drag and drop state
  const [draggingFolderId, setDraggingFolderId] = useState<number | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<number | null>(null);

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('cige_sidebar_width');
      return saved ? parseInt(saved, 10) : 180;
    } catch { return 180; }
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Auto-derive title from first line of content
  useEffect(() => {
    const lines = content.split('\n');
    const firstNonEmpty = lines.find((l) => l.trim());
    const derived = firstNonEmpty ? firstNonEmpty.trim().replace(/^\[.*?\]\s*/, '') : '未命名';
    if (derived !== title) setTitle(derived);
  }, [content]);

  useEffect(() => {
    setExpandedFolders([]);
    loadWritings();
    loadFolders();
  }, []);

  useEffect(() => { try { localStorage.setItem('cige_sidebar_view', viewMode); } catch {} }, [viewMode]);

  useEffect(() => {
    try { localStorage.setItem('cige_sidebar_width', sidebarWidth.toString()); } catch {}
  }, [sidebarWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      const clampedWidth = Math.max(120, Math.min(320, newWidth));
      setSidebarWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleClick = () => handleCloseContextMenu();
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const saveOnly = useCallback(async () => {
    if (!currentWriting) return;
    try {
      await window.cigeAPI.updateWriting(currentWriting.id, { title, content });
      await window.cigeAPI.saveSnapshot(currentWriting.id, content);
      updateSaveStatus('saved');
      contentDirtyRef.current = false;
    } catch {
      updateSaveStatus('unsaved');
    }
  }, [currentWriting, title, content]);

  const doSave = useCallback(async () => {
    if (!currentWriting) return;
    updateSaveStatus('saving');
    try {
      await window.cigeAPI.updateWriting(currentWriting.id, { title, content });
      await window.cigeAPI.saveSnapshot(currentWriting.id, content);
      updateSaveStatus('saved');
      contentDirtyRef.current = false;
      
      const newId = await window.cigeAPI.createWriting('未命名');
      const newWriting = await window.cigeAPI.getWritingById(newId as number);
      setCurrentWriting(newWriting as Writing);
      setContent('');
      setTitle('未命名');
      contentDirtyRef.current = false;
      loadWritings();
    } catch {
      updateSaveStatus('unsaved');
    }
  }, [currentWriting, title, content]);

  useEffect(() => {
    saveTimerRef.current = setInterval(() => {
      if (contentDirtyRef.current) saveOnly();
    }, 15000);
    return () => { if (saveTimerRef.current) clearInterval(saveTimerRef.current); };
  }, [currentWriting, content, title, saveOnly]);

  const loadWritings = async () => {
    const data = await window.cigeAPI.getWritings();
    setWritings(data as Writing[]);
    if ((data as Writing[]).length > 0 && !currentWriting) {
      selectWriting((data as Writing[])[0]);
    }
  };

  const loadFolders = async () => {
    const data = await window.cigeAPI.getFolders();
    setFolders(data as Folder[]);
    setExpandedFolders([]);
  };

  const selectWriting = async (writing: Writing) => {
    const full = await window.cigeAPI.getWritingById(writing.id);
    setCurrentWriting(full as Writing);
    setContent((full as Writing).content);
    updateSaveStatus('saved');
    contentDirtyRef.current = false;
  };

  const handleNew = async () => {
    const id = await window.cigeAPI.createWriting('未命名');
    const newWriting = await window.cigeAPI.getWritingById(id as number);
    setCurrentWriting(newWriting as Writing);
    setContent('');
    setTitle('未命名');
    updateSaveStatus('saved');
    contentDirtyRef.current = false;
    loadWritings();
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    if (!contentDirtyRef.current) {
      contentDirtyRef.current = true;
      updateSaveStatus('unsaved');
    }
  };

  const handleInsertText = (text: string) => {
    const newContent = content + (content.endsWith('\n') ? '' : '\n') + text;
    setContent(newContent);
    contentDirtyRef.current = true;
    updateSaveStatus('unsaved');
  };

  const handleReplaceLineEnd = (char: string) => {
    if (window.cigeEditorAPI && window.cigeEditorAPI.replaceCharBeforeCursor) {
      window.cigeEditorAPI.replaceCharBeforeCursor(char);
    } else {
      const lines = content.split('\n');
      if (lines.length === 0) return;
      let lastNonEmpty = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim()) { lastNonEmpty = i; break; }
      }
      if (lastNonEmpty >= 0) {
        const line = lines[lastNonEmpty];
        const trimmed = line.trimEnd();
        if (trimmed.length > 0) {
          const lastChar = trimmed[trimmed.length - 1];
          if (/[\u4e00-\u9fff]/.test(lastChar)) {
            lines[lastNonEmpty] = line.slice(0, -1) + char;
          } else {
            lines[lastNonEmpty] = line + char;
          }
        } else {
          lines[lastNonEmpty] = line + char;
        }
      }
      const newContent = lines.join('\n');
      setContent(newContent);
      contentDirtyRef.current = true;
      updateSaveStatus('unsaved');
    }
  };

  const handleFormatText = (action: string) => {
    if (!window.cigeEditorAPI) return;
    switch (action) {
      case 'bold':
        window.cigeEditorAPI.toggleBold();
        break;
      case 'italic':
        window.cigeEditorAPI.toggleItalic();
        break;
      case 'underline':
        window.cigeEditorAPI.toggleUnderline();
        break;
      case 'strike':
        window.cigeEditorAPI.toggleStrike();
        break;
      case 'align-left':
        window.cigeEditorAPI.setTextAlign('left');
        break;
      case 'align-center':
        window.cigeEditorAPI.setTextAlign('center');
        break;
      case 'align-right':
        window.cigeEditorAPI.setTextAlign('right');
        break;
    }
    contentDirtyRef.current = true;
    updateSaveStatus('unsaved');
  };

  const handleDeleteWriting = async (id: number) => {
    await window.cigeAPI.deleteWriting(id);
    if (currentWriting?.id === id) {
      setCurrentWriting(null);
      setContent('');
      setTitle('');
      contentDirtyRef.current = false;
    }
    loadWritings();
  };

  // ---- Folder actions ----
  const [creatingFolderParentId, setCreatingFolderParentId] = useState<number | null>(null);

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || creatingFolderRef.current) return;
    creatingFolderRef.current = true;
    try {
      await window.cigeAPI.createFolder(name, creatingFolderParentId);
    } catch (err) {
      console.error('Failed to create folder:', err);
    } finally {
      creatingFolderRef.current = false;
      setNewFolderName('');
      setCreatingFolderParentId(null);
      setShowNewFolderInput(false);
      loadFolders();
    }
  };

  const handleStartRename = (folder: Folder) => {
    setEditingFolderId(folder.id);
    setRenameFolderValue(folder.name);
  };

  const handleCommitRename = async (folderId: number) => {
    const name = renameFolderValue.trim();
    if (name) {
      await window.cigeAPI.renameFolder(folderId, name);
    }
    setEditingFolderId(null);
    setRenameFolderValue('');
    loadFolders();
  };

  const handleDeleteFolder = async (folderId: number) => {
    await window.cigeAPI.deleteFolder(folderId);
    setFolderDeleteTarget(null);
    loadFolders();
    loadWritings();
  };

  const toggleFolder = (folderId: number) => {
    setExpandedFolders(prev => {
      if (prev.includes(folderId)) {
        return prev.filter(id => id !== folderId);
      } else {
        return [...prev, folderId];
      }
    });
  };

  // ---- Drag and drop ----
  const [draggingWritingId, setDraggingWritingId] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, writingId: number) => {
    setDraggingWritingId(writingId);
    setDraggingFolderId(null);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleFolderDragStart = (e: React.DragEvent, folderId: number) => {
    setDraggingFolderId(folderId);
    setDraggingWritingId(null);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggingWritingId(null);
    setDraggingFolderId(null);
    setDragOverFolderId(null);
  };

  const handleDragOver = (e: React.DragEvent, folderId: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(folderId);
  };

  const handleDragLeave = (e?: React.DragEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setDragOverFolderId(null);
  };

  // Check if target folder is a descendant of the dragging folder (prevent circular reference)
  const isDescendantFolder = (parentId: number, childId: number | null): boolean => {
    if (childId === null) return false;
    const folder = folders.find(f => f.id === childId);
    if (!folder) return false;
    if (folder.parent_id === parentId) return true;
    return isDescendantFolder(parentId, folder.parent_id);
  };

  const [dragOverUngrouped, setDragOverUngrouped] = useState(false);

  const handleDrop = async (e: React.DragEvent, targetFolderId: number | null) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (draggingWritingId) {
      await window.cigeAPI.updateWriting(draggingWritingId, { folder_id: targetFolderId });
      loadWritings();
    } else if (draggingFolderId) {
      // Allow moving folder to root (null) or to a different folder
      const isSameFolder = targetFolderId !== null && draggingFolderId === targetFolderId;
      if (isSameFolder) {
        return;
      }
      // Prevent dragging a folder into its own descendant
      if (targetFolderId !== null && isDescendantFolder(draggingFolderId, targetFolderId)) {
        return;
      }
      console.log(`Moving folder ${draggingFolderId} to parent ${targetFolderId}`);
      await window.cigeAPI.moveFolder(draggingFolderId, targetFolderId);
      loadFolders();
    }
    setDraggingWritingId(null);
    setDraggingFolderId(null);
    setDragOverFolderId(null);
    setDragOverUngrouped(false);
  };

  const handleUngroupedDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverUngrouped(true);
  };

  const handleUngroupedDragLeave = () => {
    setDragOverUngrouped(false);
  };

  const handleUngroupedDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await handleDrop(e, null);
  };

  const handleContextMenu = (e: React.MouseEvent, writingId: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, writingId });
  };

  const handleRemoveFromFolder = async () => {
    if (contextMenu) {
      await window.cigeAPI.updateWriting(contextMenu.writingId, { folder_id: null });
      loadWritings();
    }
    setContextMenu(null);
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  // Get writings grouped
  const getWritingsInFolder = (folderId: number): Writing[] => {
    return writings.filter(w => w.folder_id === folderId);
  };

  const ungroupedWritings = writings.filter(w => w.folder_id == null || w.folder_id === null);

  // Get subfolders for a folder
  const getSubfolders = (folderId: number | null): Folder[] => {
    return folders.filter(f => f.parent_id === folderId);
  };

  // Build nested folder structure
  interface NestedFolder extends Folder {
    children: NestedFolder[];
  }

  const buildNestedFolders = (parentId: number | null): NestedFolder[] => {
    return folders
      .filter(f => f.parent_id === parentId)
      .map(f => ({
        ...f,
        children: buildNestedFolders(f.id)
      }));
  };

  const nestedFolders = buildNestedFolders(null);

  // ---- Render helpers ----

  const renderFolderTree = (folder: NestedFolder, depth: number = 0) => {
    const hasChildren = getWritingsInFolder(folder.id).length > 0 || folder.children.length > 0;
    
    return (
      <div
        key={folder.id}
        className={`ws-folder-item${dragOverFolderId === folder.id ? ' drag-over' : ''}${draggingFolderId === folder.id ? ' dragging' : ''}`}
        draggable
        onDragStart={(e) => handleFolderDragStart(e, folder.id)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, folder.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, folder.id)}
        style={{ paddingLeft: depth > 0 ? `${depth * 12}px` : 0 }}
      >
        <div className="ws-folder-item-inner">
          <span
            className="ws-folder-chevron"
            onClick={(e) => { e.stopPropagation(); toggleFolder(folder.id); }}
          >
            {expandedFolders.includes(folder.id) ? '▼' : '▶'}
          </span>
          <svg className="ws-folder-icon" width="12" height="12" viewBox="0 0 14 14" fill="none">
            <rect x="2" y="4" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M6 4V1M3 4H11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          {editingFolderId === folder.id ? (
            <input
              className="ws-folder-rename-input"
              value={renameFolderValue}
              onChange={(e) => setRenameFolderValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCommitRename(folder.id);
                if (e.key === 'Escape') { setEditingFolderId(null); setRenameFolderValue(''); }
              }}
              onBlur={() => handleCommitRename(folder.id)}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="ws-folder-name"
              onDoubleClick={() => handleStartRename(folder)}
            >{folder.name}</span>
          )}
          <div className="ws-folder-actions">
            <button
              className="ws-folder-action-btn"
              onClick={(e) => { e.stopPropagation(); handleStartRename(folder); }}
              title="重命名"
            >&#9998;</button>
            <button
              className="ws-folder-action-btn ws-folder-action-del"
              onClick={(e) => { e.stopPropagation(); setFolderDeleteTarget(folder); }}
              title="删除文件夹"
            >&times;</button>
          </div>
        </div>
        {expandedFolders.includes(folder.id) && (folder.children.length > 0 || getWritingsInFolder(folder.id).length > 0) && (
          <div className="ws-folder-children">
            {/* Render subfolders */}
            {folder.children.map(subFolder => renderFolderTree(subFolder, depth + 1))}
            {/* Render writings in this folder */}
            {getWritingsInFolder(folder.id).map(w => renderWritingItem(w))}
          </div>
        )}
      </div>
    );
  };

  const renderWritingItem = (w: Writing) => {
    if (viewMode === 'list') {
      return (
        <div
          key={w.id}
          className={`ws-sidebar-item${currentWriting?.id === w.id ? ' active' : ''}${draggingWritingId === w.id ? ' dragging' : ''}`}
          onClick={() => selectWriting(w)}
          draggable
          onDragStart={(e) => handleDragStart(e, w.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Drop on a writing item: move dragging item to the same folder
            if (draggingWritingId) {
              window.cigeAPI.updateWriting(draggingWritingId, { folder_id: w.folder_id }).then(() => {
                loadWritings();
              });
            } else if (draggingFolderId) {
              // Move folder to the same parent as this writing's folder
              const targetParentId = w.folder_id;
              if (draggingFolderId !== targetParentId && !(targetParentId !== null && isDescendantFolder(draggingFolderId, targetParentId))) {
                window.cigeAPI.moveFolder(draggingFolderId, targetParentId).then(() => {
                  loadFolders();
                });
              }
            }
            setDraggingWritingId(null);
            setDraggingFolderId(null);
            setDragOverFolderId(null);
          }}
          onContextMenu={(e) => handleContextMenu(e, w.id)}
        >
          <span className="ws-sidebar-item-title">{w.title || '未命名'}</span>
          <button
            className="ws-sidebar-item-del"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(w);
            }}
          >&times;</button>
        </div>
      );
    }
    // Card view
    const previewLines = (w.content || '').split('\n').filter(l => l.trim()).slice(0, 2);
    const folder = w.folder_id ? folders.find(f => f.id === w.folder_id) : null;
    
    return (
      <div
        key={w.id}
        className={`ws-sidebar-card${currentWriting?.id === w.id ? ' active' : ''}${draggingWritingId === w.id ? ' dragging' : ''}`}
        onClick={() => selectWriting(w)}
        draggable
        onDragStart={(e) => handleDragStart(e, w.id)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (draggingWritingId) {
            window.cigeAPI.updateWriting(draggingWritingId, { folder_id: w.folder_id }).then(() => {
              loadWritings();
            });
          } else if (draggingFolderId) {
            const targetParentId = w.folder_id;
            if (draggingFolderId !== targetParentId && !(targetParentId !== null && isDescendantFolder(draggingFolderId, targetParentId))) {
              window.cigeAPI.moveFolder(draggingFolderId, targetParentId).then(() => {
                loadFolders();
              });
            }
          }
          setDraggingWritingId(null);
          setDraggingFolderId(null);
          setDragOverFolderId(null);
        }}
        onContextMenu={(e) => handleContextMenu(e, w.id)}
      >
        <div className="ws-sidebar-card-preview">
          {previewLines.length > 0
            ? previewLines.map((line, i) => <span key={i}>{line}<br /></span>)
            : <span className="ws-sidebar-card-preview-empty">暂无内容</span>
          }
        </div>
        <div className="ws-sidebar-card-title">
          <span className="ws-sidebar-card-title-text">{w.title || '未命名'}</span>
          <button
            className="ws-sidebar-item-del"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(w);
            }}
          >&times;</button>
        </div>
        {folder && (
          <div className="ws-sidebar-card-meta">
            <span className="ws-sidebar-card-folder">
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                <rect x="2" y="4" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M6 4V1M3 4H11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              {folder.name}
            </span>
          </div>
        )}
      </div>
    );
  };

  // Determine sidebar className
  const sidebarClasses = [
    'ws-sidebar',
    sidebarCollapsed ? 'collapsed' : '',
    viewMode === 'card' && !sidebarCollapsed ? 'ws-sidebar-card-view' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="write-workspace-lyric">
      {/* ---- Toolbar ---- */}
      <div className="ws-toolbar">
        <div className="ws-toolbar-left">
          <button className="ws-btn" onClick={() => {
            const marker = '[主歌]';
            setContent(content ? (content.endsWith('\n') ? content : content + '\n') + marker + '\n' : marker + '\n');
            contentDirtyRef.current = true;
            updateSaveStatus('unsaved');
          }} title="插入主歌">[主歌]</button>
          <button className="ws-btn" onClick={() => {
            const marker = '[副歌]';
            setContent(content ? (content.endsWith('\n') ? content : content + '\n') + marker + '\n' : marker + '\n');
            contentDirtyRef.current = true;
            updateSaveStatus('unsaved');
          }} title="插入副歌">[副歌]</button>
          <button className="ws-btn" onClick={() => {
            const marker = '[桥段]';
            setContent(content ? (content.endsWith('\n') ? content : content + '\n') + marker + '\n' : marker + '\n');
            contentDirtyRef.current = true;
            updateSaveStatus('unsaved');
          }} title="插入桥段">[桥段]</button>
          <button className="ws-btn" onClick={() => {
            const marker = '[尾奏]';
            setContent(content ? (content.endsWith('\n') ? content : content + '\n') + marker + '\n' : marker + '\n');
            contentDirtyRef.current = true;
            updateSaveStatus('unsaved');
          }} title="插入尾奏">[尾奏]</button>

        </div>

        <div className="ws-toolbar-right">
          <button className="ws-btn ws-btn-icon" onClick={() => document.execCommand('undo')} title="撤销">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M4 3L1 6L4 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M1 6H9A4 4 0 0 1 13 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
          <button className="ws-btn ws-btn-icon" onClick={() => document.execCommand('redo')} title="重做">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M10 3L13 6L10 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M13 6H5A4 4 0 0 0 1 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>

          <span className="ws-divider" />

          <button
            className="ws-btn ws-btn-icon"
            onClick={handleNew}
            title="新建文档"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M7 3V11M3 7H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span>新建</span>
          </button>

          <button
            className="ws-btn ws-btn-icon"
            onClick={() => setShowSettings(true)}
            title="设置"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M13.7 13.7a7.9 7.9 0 0 0 0-11.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>

          <button
            className={`ws-btn ws-btn-save${saveStatus === 'saving' ? ' saving' : ''}`}
            onClick={doSave}
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

      {/* ---- Three-column body ---- */}
      <div className="ws-editor-body">
        {/* Left: works sidebar */}
        {sidebarCollapsed ? (
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
        ) : (
          <div className={sidebarClasses} style={{ width: `${sidebarWidth}px` }}>
            {/* Header */}
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
                onClick={handleNew}
                title="新建文本"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <path d="M7 3V11M3 7H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </button>
              <button
                className="ws-btn ws-btn-icon"
                onClick={() => {
                  if (showNewFolderInput) return;
                  setShowNewFolderInput(true);
                  setNewFolderName('');
                }}
                title="新建文件夹"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <rect x="3" y="5" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M7 5V2M5 3H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* New folder input */}
            {showNewFolderInput && (
              <div className="ws-folder-new-input">
                <input
                  className="input"
                  placeholder="文件夹名称"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                    if (e.key === 'Escape') { setShowNewFolderInput(false); setNewFolderName(''); }
                  }}
                  onBlur={() => {
                    if (newFolderName.trim()) handleCreateFolder();
                    else setShowNewFolderInput(false);
                  }}
                  autoFocus
                />
              </div>
            )}

            {/* Works list */}
            <div className={`ws-sidebar-list${viewMode === 'card' ? ' ws-sidebar-list-card' : ''}`}>
              {writings.length === 0 && folders.length === 0 ? (
                <div className="ws-sidebar-empty">暂无作品</div>
              ) : (
                <>
                  {/* Nested folder tree */}
                  {nestedFolders.map(folder => renderFolderTree(folder))}

                  {/* Ungrouped writings - always show if there are ungrouped items or dragging */}
                  <div
                    className={`ws-folder-item${dragOverUngrouped ? ' drag-over' : ''}`}
                    onDragOver={handleUngroupedDragOver}
                    onDragLeave={handleUngroupedDragLeave}
                    onDrop={handleUngroupedDrop}
                  >
                    <div className="ws-sidebar-section-label">未归类</div>
                    <div className="ws-folder-children">
                      {ungroupedWritings.length === 0 ? (
                        <div className="ws-folder-empty">拖拽文档或文件夹到这里</div>
                      ) : (
                        ungroupedWritings.map(w => renderWritingItem(w))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Sidebar resizer */}
            <div
              className={`ws-sidebar-resizer${isResizing ? ' dragging' : ''}`}
              onMouseDown={handleResizeStart}
            />
          </div>
        )}

        {/* Center: editor */}
        {currentWriting ? (
          <RichEditor
            value={content}
            onChange={handleContentChange}
            onSave={doSave}
            onRhymeSuggestion={setRhymeSuggestion}
            onStatsChange={handleStatsChange}
            rhymeCheckOn={rhymeCheckOn}
            rhymeSource={rhymeSource}
            rhymeRefreshKey={rhymeRefreshKey}
          />
        ) : (
          <div className="write-empty">
            <div className="write-empty-logo">CiGe</div>
            <div className="write-empty-text">新建或选择一篇作品开始写作</div>
            <button onClick={handleNew} className="btn btn-primary" style={{ marginTop: 12 }}>
              新建作品
            </button>
          </div>
        )}

        {/* Right: rhyme panel */}
        <MaterialPanel
          rhymeSuggestion={rhymeSuggestion}
          onInsertText={handleInsertText}
          onReplaceLineEnd={handleReplaceLineEnd}
          source={rhymeSource}
          onSourceChange={setRhymeSource}
          onRefresh={() => setRhymeRefreshKey(k => k + 1)}
        />
      </div>



      {/* ---- Confirm dialog for writing delete ---- */}
      {deleteTarget && (
        <ConfirmDialog
          title="删除作品"
          message={`确定要删除「${deleteTarget.title}」吗？已删除的作品可在回收站恢复。`}
          onConfirm={() => {
            handleDeleteWriting(deleteTarget.id);
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* ---- Confirm dialog for folder delete ---- */}
      {folderDeleteTarget && (
        <ConfirmDialog
          title="删除文件夹"
          message={`确定要删除文件夹「${folderDeleteTarget.name}」吗？\n文件夹中的作品将移至"未归类"。`}
          onConfirm={() => handleDeleteFolder(folderDeleteTarget.id)}
          onCancel={() => setFolderDeleteTarget(null)}
        />
      )}

      {/* ---- Context menu for writings ---- */}
      {contextMenu && (
        <div
          className="ws-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="ws-context-menu-item"
            onClick={handleRemoveFromFolder}
          >
            移至未归类
          </button>
        </div>
      )}

      {/* ---- Settings panel ---- */}
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
};

export default Write;