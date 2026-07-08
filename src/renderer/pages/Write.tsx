import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '../store';
import useStatusBarStore from '../store/statusBar';
import RichEditor from '../components/RichEditor';
import MaterialPanel from '../components/MaterialPanel';
import ConfirmDialog from '../components/ConfirmDialog';
import SettingsPanel from '../components/SettingsPanel';
import WriteToolbar from '../components/write/WriteToolbar';
import Sidebar from '../components/write/Sidebar';
import WritingItem from '../components/write/WritingItem';
import type { RhymeSuggestion, LyricStats, RhymeSource } from '../components/Editor';
import type { Writing, Folder } from '../../shared/types';

type SaveStatus = 'saved' | 'unsaved' | 'saving';

function htmlToPlainPreview(html: string, maxLines: number = 2): string[] {
  if (!html) return [];
  const withBreaks = html
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  const decoded = withBreaks
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return decoded.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, maxLines);
}

interface NestedFolder extends Folder {
  children: NestedFolder[];
}

const Write: React.FC = () => {
  const { writings, currentWriting, setWritings, setCurrentWriting } = useStore();
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [deleteTarget, setDeleteTarget] = useState<Writing | null>(null);
  const [rhymeSuggestion, setRhymeSuggestion] = useState<RhymeSuggestion | null>(null);
  const [rhymeSource, setRhymeSource] = useState<RhymeSource>('auto');
  const [rhymeRefreshKey, setRhymeRefreshKey] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const { updateStats } = useStatusBarStore();

  const updateSaveStatus = (status: SaveStatus) => {
    setSaveStatus(status);
    updateStats({ saveStatus: status });
  };

  const handleStatsChange = useCallback((stats: LyricStats) => {
    updateStats(stats);
  }, [updateStats]);

  const rhymeCheckOn = true;
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const contentDirtyRef = useRef(false);

  // Refs to avoid re-creating the auto-save interval on every keystroke
  const currentWritingRef = useRef(currentWriting);
  const contentRef = useRef(content);
  const titleRef = useRef(title);

  useEffect(() => { currentWritingRef.current = currentWriting; }, [currentWriting]);
  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { titleRef.current = title; }, [title]);

  // Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'card'>(() => {
    try {
      return (localStorage.getItem('cige_sidebar_view') as 'list' | 'card') || 'list';
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

  const [draggingWritingId, setDraggingWritingId] = useState<number | null>(null);
  const [dragOverUngrouped, setDragOverUngrouped] = useState(false);

  // 使用 ref 保存正在拖拽的 ID，避免 React 状态批量更新导致 drop 时读到旧值
  const draggingWritingRef = useRef<number | null>(null);
  const draggingFolderRef = useRef<number | null>(null);

  // Debounced title derivation
  const titleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current);
    titleTimeoutRef.current = setTimeout(() => {
      const firstLine = htmlToPlainPreview(content, 1)[0];
      const derived = firstLine ? firstLine.replace(/^\[.*?\]\s*/, '') : '未命名';
      if (derived !== title) setTitle(derived);
    }, 300);
    return () => {
      if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current);
    };
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
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const saveOnly = useCallback(async () => {
    const writing = currentWritingRef.current;
    if (!writing) return;
    try {
      await window.cigeAPI.updateWriting(writing.id, { title: titleRef.current, content: contentRef.current });
      await window.cigeAPI.saveSnapshot(writing.id, contentRef.current);
      updateSaveStatus('saved');
      contentDirtyRef.current = false;
    } catch {
      updateSaveStatus('unsaved');
    }
  }, []);

  const doSave = useCallback(async () => {
    const writing = currentWritingRef.current;
    if (!writing) return;
    updateSaveStatus('saving');
    try {
      await window.cigeAPI.updateWriting(writing.id, { title: titleRef.current, content: contentRef.current });
      await window.cigeAPI.saveSnapshot(writing.id, contentRef.current);
      updateSaveStatus('saved');
      contentDirtyRef.current = false;
      loadWritings();
    } catch {
      updateSaveStatus('unsaved');
    }
  }, []);

  useEffect(() => {
    saveTimerRef.current = setInterval(() => {
      if (contentDirtyRef.current) saveOnly();
    }, 15000);
    return () => { if (saveTimerRef.current) clearInterval(saveTimerRef.current); };
  }, [saveOnly]);

  const loadWritings = async () => {
    const data = await window.cigeAPI.getWritings();
    setWritings(data as Writing[]);
    if ((data as Writing[]).length > 0 && !currentWritingRef.current) {
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
    if (window.cigeEditorAPI?.insertTextAtCursor) {
      window.cigeEditorAPI.insertTextAtCursor(text);
      return;
    }
    const newContent = content + (content.endsWith('\n') ? '' : '\n') + text;
    setContent(newContent);
    contentDirtyRef.current = true;
    updateSaveStatus('unsaved');
  };

  const handleReplaceLineEnd = (char: string) => {
    if (window.cigeEditorAPI && window.cigeEditorAPI.replaceCharBeforeCursor) {
      window.cigeEditorAPI.replaceCharBeforeCursor(char);
    } else {
      const newContent = content + char;
      setContent(newContent);
      contentDirtyRef.current = true;
      updateSaveStatus('unsaved');
    }
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
  const handleDragStart = (e: React.DragEvent, writingId: number) => {
    e.stopPropagation();
    draggingWritingRef.current = writingId;
    draggingFolderRef.current = null;
    setDraggingWritingId(writingId);
    setDraggingFolderId(null);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleFolderDragStart = (e: React.DragEvent, folderId: number) => {
    e.stopPropagation();
    draggingFolderRef.current = folderId;
    draggingWritingRef.current = null;
    setDraggingFolderId(folderId);
    setDraggingWritingId(null);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    draggingWritingRef.current = null;
    draggingFolderRef.current = null;
    setDraggingWritingId(null);
    setDraggingFolderId(null);
    setDragOverFolderId(null);
    setDragOverUngrouped(false);
  };

  const handleDragOver = (e: React.DragEvent, folderId: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(folderId);
  };

  const handleDragLeave = () => {
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

  const handleDrop = async (e: React.DragEvent, targetFolderId: number | null) => {
    e.preventDefault();
    e.stopPropagation();

    const writingId = draggingWritingRef.current;
    const folderId = draggingFolderRef.current;

    if (writingId) {
      await window.cigeAPI.updateWriting(writingId, { folder_id: targetFolderId });
      loadWritings();
    } else if (folderId) {
      const isSameFolder = targetFolderId !== null && folderId === targetFolderId;
      if (isSameFolder) return;
      if (targetFolderId !== null && isDescendantFolder(folderId, targetFolderId)) return;
      await window.cigeAPI.moveFolder(folderId, targetFolderId);
      loadFolders();
    }
    handleDragEnd();
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

  // Build nested folder structure
  const buildNestedFolders = (parentId: number | null): NestedFolder[] => {
    return folders
      .filter(f => f.parent_id === parentId)
      .map(f => ({
        ...f,
        children: buildNestedFolders(f.id)
      }));
  };

  const nestedFolders = buildNestedFolders(null);
  const ungroupedWritings = writings.filter(w => w.folder_id == null);

  const handleWritingDrop = (targetWriting: Writing) => async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const writingId = draggingWritingRef.current;
    const folderId = draggingFolderRef.current;
    if (writingId) {
      await window.cigeAPI.updateWriting(writingId, { folder_id: targetWriting.folder_id });
      loadWritings();
    } else if (folderId) {
      const targetParentId = targetWriting.folder_id;
      if (folderId !== targetParentId && !(targetParentId !== null && isDescendantFolder(folderId, targetParentId))) {
        await window.cigeAPI.moveFolder(folderId, targetParentId);
        loadFolders();
      }
    }
    handleDragEnd();
  };

  const renderWritingItem = (w: Writing) => {
    const folder = w.folder_id ? folders.find(f => f.id === w.folder_id) : null;
    return (
      <WritingItem
        key={w.id}
        writing={w}
        viewMode={viewMode}
        isActive={currentWriting?.id === w.id}
        isDragging={draggingWritingId === w.id}
        folderName={folder?.name}
        onSelect={() => selectWriting(w)}
        onDragStart={(e) => handleDragStart(e, w.id)}
        onDragEnd={handleDragEnd}
        onDelete={(e) => {
          e.stopPropagation();
          setDeleteTarget(w);
        }}
        onContextMenu={(e) => handleContextMenu(e, w.id)}
        onDrop={handleWritingDrop(w)}
      />
    );
  };

  const handleInsertMarker = (marker: string) => {
    setContent((prev) => {
      const next = prev ? (prev.endsWith('\n') ? prev : prev + '\n') + marker + '\n' : marker + '\n';
      return next;
    });
    contentDirtyRef.current = true;
    updateSaveStatus('unsaved');
  };

  return (
    <div className="write-workspace-lyric">
      <WriteToolbar
        saveStatus={saveStatus}
        onInsertMarker={handleInsertMarker}
        onUndo={() => document.execCommand('undo')}
        onRedo={() => document.execCommand('redo')}
        onNew={handleNew}
        onSave={doSave}
        onOpenSettings={() => setShowSettings(true)}
      />

      <div className="ws-editor-body">
        <Sidebar
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
          sidebarWidth={sidebarWidth}
          viewMode={viewMode}
          setViewMode={setViewMode}
          folders={folders}
          writings={writings}
          currentWriting={currentWriting}
          nestedFolders={nestedFolders}
          ungroupedWritings={ungroupedWritings}
          expandedFolders={expandedFolders}
          editingFolderId={editingFolderId}
          renameFolderValue={renameFolderValue}
          showNewFolderInput={showNewFolderInput}
          newFolderName={newFolderName}
          draggingFolderId={draggingFolderId}
          draggingWritingId={draggingWritingId}
          dragOverFolderId={dragOverFolderId}
          dragOverUngrouped={dragOverUngrouped}
          isResizing={isResizing}
          onNew={handleNew}
          onNewFolderInputShow={() => {
            if (showNewFolderInput) return;
            setShowNewFolderInput(true);
            setNewFolderName('');
          }}
          onNewFolderNameChange={setNewFolderName}
          onCreateFolder={handleCreateFolder}
          onCancelNewFolder={() => { setShowNewFolderInput(false); setNewFolderName(''); }}
          onToggleFolder={toggleFolder}
          onStartRename={handleStartRename}
          onCommitRename={handleCommitRename}
          onRenameChange={setRenameFolderValue}
          onCancelRename={() => { setEditingFolderId(null); setRenameFolderValue(''); }}
          onDeleteFolder={(folder) => setFolderDeleteTarget(folder)}
          onDragStartFolder={handleFolderDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onUngroupedDragOver={handleUngroupedDragOver}
          onUngroupedDragLeave={handleUngroupedDragLeave}
          onUngroupedDrop={handleUngroupedDrop}
          onResizeStart={handleResizeStart}
          renderWritingItem={renderWritingItem}
        />

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

        <MaterialPanel
          rhymeSuggestion={rhymeSuggestion}
          onInsertText={handleInsertText}
          onReplaceLineEnd={handleReplaceLineEnd}
          source={rhymeSource}
          onSourceChange={setRhymeSource}
          onRefresh={() => setRhymeRefreshKey(k => k + 1)}
        />
      </div>

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

      {folderDeleteTarget && (
        <ConfirmDialog
          title="删除文件夹"
          message={`确定要删除文件夹「${folderDeleteTarget.name}」吗？\n文件夹中的作品将移至"未归类"。`}
          onConfirm={() => handleDeleteFolder(folderDeleteTarget.id)}
          onCancel={() => setFolderDeleteTarget(null)}
        />
      )}

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

      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
};

export default Write;
