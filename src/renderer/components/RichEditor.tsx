import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { Strike } from '@tiptap/extension-strike';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Heading } from '@tiptap/extension-heading';
import { Placeholder } from '@tiptap/extension-placeholder';
import { useEditorSettingsStore } from '../store/editorSettings';
import { EditorProps, RhymeSuggestion, LyricStats } from './Editor';
import { findRhymes } from '../../shared/rhyme-data';

function computeLyricStats(text: string): LyricStats {
  const lines = text.split('\n').filter((l) => l.trim());
  const charCount = text.replace(/\s/g, '').length;
  const rhymeFinals: string[] = [];
  let verseCount = 0, chorusCount = 0, bridgeCount = 0, outroCount = 0;

  for (const line of lines) {
    if (line.includes('[主歌]')) verseCount++;
    else if (line.includes('[副歌]')) chorusCount++;
    else if (line.includes('[桥段]')) bridgeCount++;
    else if (line.includes('[尾奏]')) outroCount++;

    const trimmed = line.trimEnd();
    const lastChar = trimmed[trimmed.length - 1];
    if (/[\u4e00-\u9fff]/.test(lastChar)) {
      const results = findRhymes(lastChar);
      if (results.length > 0 && !rhymeFinals.includes(results[0].final)) {
        rhymeFinals.push(results[0].final);
      }
    }
  }
  return { lineCount: lines.length, charCount, rhymeFinals, verseCount, chorusCount, bridgeCount, outroCount };
}

const FloatingToolbar: React.FC<{ editor: ReturnType<typeof useEditor> | null }> = ({ editor }) => {
  const [position, setPosition] = useState({ x: 0, y: 0, visible: false });
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;

    const updatePosition = () => {
      const { selection } = editor.state;
      const isEmpty = selection.empty;
      const isTextBlock = editor.isActive('paragraph') || editor.isActive('heading') || editor.isActive('listItem');
      const hasSelection = !isEmpty && isTextBlock;

      if (hasSelection) {
        const fromCoords = editor.view.coordsAtPos(selection.from);
        const toCoords = editor.view.coordsAtPos(selection.to);
        
        const right = Math.max(fromCoords.right, toCoords.right);
        const bottom = Math.max(fromCoords.bottom, toCoords.bottom);

        const toolbarWidth = 44;
        const toolbarHeight = 320;
        const gap = 0;

        let x = right + gap;
        let y = bottom + gap;

        if (x + toolbarWidth > window.innerWidth - 20) {
          x = Math.min(fromCoords.left, toCoords.left) - toolbarWidth - gap;
        }
        if (y + toolbarHeight > window.innerHeight - 20) {
          y = bottom - toolbarHeight - gap;
        }

        x = Math.max(20, x);
        y = Math.max(20, y);

        setPosition({
          x,
          y,
          visible: true,
        });
      } else {
        setPosition((prev) => ({ ...prev, visible: false }));
      }
    };

    const handleMouseUp = () => {
      updatePosition();
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.floating-toolbar')) {
        setPosition((prev) => ({ ...prev, visible: false }));
      }
    };

    window.addEventListener('resize', updatePosition);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [editor]);

  const handleAction = (action: () => void) => {
    action();
    setTimeout(() => {
      if (editor) {
        const { selection } = editor.state;
        if (!selection.empty) {
          const fromCoords = editor.view.coordsAtPos(selection.from);
          const toCoords = editor.view.coordsAtPos(selection.to);
          
          const right = Math.max(fromCoords.right, toCoords.right);
          const bottom = Math.max(fromCoords.bottom, toCoords.bottom);

          const toolbarWidth = 44;
          const toolbarHeight = 320;
          const gap = 0;

          let x = right + gap;
          let y = bottom + gap;

          if (x + toolbarWidth > window.innerWidth - 20) {
            x = Math.min(fromCoords.left, toCoords.left) - toolbarWidth - gap;
          }
          if (y + toolbarHeight > window.innerHeight - 20) {
            y = bottom - toolbarHeight - gap;
          }

          x = Math.max(20, x);
          y = Math.max(20, y);

          setPosition({
            x,
            y,
            visible: true,
          });
        }
      }
    }, 50);
  };

  if (!editor || !position.visible) return null;

  return (
    <div
      ref={toolbarRef}
      className="floating-toolbar"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <button
        className={`ft-btn${editor.isActive('bold') ? ' active' : ''}`}
        onClick={() => handleAction(() => editor.chain().focus().toggleBold().run())}
        title="加粗"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 3h4v2H5V3zm0 4h4v2H5V7zm0 4h4v2H5v-2z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </button>
      <button
        className={`ft-btn${editor.isActive('italic') ? ' active' : ''}`}
        onClick={() => handleAction(() => editor.chain().focus().toggleItalic().run())}
        title="斜体"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 3l4 8M7 3l4 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </button>
      <button
        className={`ft-btn${editor.isActive('underline') ? ' active' : ''}`}
        onClick={() => handleAction(() => editor.chain().focus().toggleUnderline().run())}
        title="下划线"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 6h10M2 10h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </button>
      <button
        className={`ft-btn${editor.isActive('strike') ? ' active' : ''}`}
        onClick={() => handleAction(() => editor.chain().focus().toggleStrike().run())}
        title="删除线"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 5h8M3 9h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <path d="M2 7l10-4M2 11l10-4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
        </svg>
      </button>

      <span className="ft-divider" />

      {[
        { color: '#c83e3a', label: '红色' },
        { color: '#3b82f6', label: '蓝色' },
        { color: '#22c55e', label: '绿色' },
        { color: '#f59e0b', label: '橙色' },
        { color: '#8b5cf6', label: '紫色' },
      ].map(({ color, label }) => (
        <button
          key={color}
          className={`ft-btn ft-color-btn${editor.isActive('textStyle', { color }) ? ' active' : ''}`}
          onClick={() => handleAction(() => editor.chain().focus().setColor(color).run())}
          title={label}
        >
          <span className="ft-color-dot" style={{ backgroundColor: color }} />
        </button>
      ))}
      <button
        className="ft-btn ft-color-btn"
        onClick={() => handleAction(() => editor.chain().focus().unsetColor().run())}
        title="清除颜色"
      >
        <span className="ft-color-dot ft-color-none" />
      </button>

      <span className="ft-divider" />

      <button
        className={`ft-btn${editor.isActive('heading', { level: 1 }) ? ' active' : ''}`}
        onClick={() => handleAction(() => editor.chain().focus().toggleHeading({ level: 1 }).run())}
        title="标题1"
      >
        <span className="ft-text-btn">H1</span>
      </button>
      <button
        className={`ft-btn${editor.isActive('heading', { level: 2 }) ? ' active' : ''}`}
        onClick={() => handleAction(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}
        title="标题2"
      >
        <span className="ft-text-btn">H2</span>
      </button>
    </div>
  );
};

const RichEditor: React.FC<EditorProps> = ({ value, onChange, onSave, onStatsChange, onRhymeSuggestion, rhymeCheckOn, rhymeSource = 'auto', rhymeRefreshKey = 0 }) => {
  const { fontSize, lineHeight, textAlign, fontFamily } = useEditorSettingsStore();
  const rhymeTimerRef = useRef<number | null>(null);
  const callbackRef = useRef(onRhymeSuggestion);
  const sourceRef = useRef(rhymeSource);
  const refreshKeyRef = useRef(rhymeRefreshKey);
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);
  const rhymeCheckRef = useRef(rhymeCheckOn);

  useEffect(() => {
    callbackRef.current = onRhymeSuggestion;
    rhymeCheckRef.current = rhymeCheckOn;
    sourceRef.current = rhymeSource;
    refreshKeyRef.current = rhymeRefreshKey;
  }, [onRhymeSuggestion, rhymeCheckOn, rhymeSource, rhymeRefreshKey]);

  useEffect(() => {
    if (!editor) return;
    detectRhyme();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rhymeSource, rhymeRefreshKey]);

  const fontStack = fontFamily === 'serif'
    ? 'Georgia, "Noto Serif CJK SC", "Songti SC", "STSong", "SimSun", serif'
    : '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif';

  const editor = useEditor({
    content: value,
    extensions: [
      StarterKit,
      TextStyle,
      Color.configure({ types: [TextStyle.name] }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      Strike,
      Bold,
      Italic,
      Heading.configure({
        levels: [1, 2, 3],
      }),
      Placeholder.configure({
        placeholder: '开始创作你的歌词...',
      }),
    ],
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      editorRef.current = editor;
      if (rhymeTimerRef.current) clearTimeout(rhymeTimerRef.current);
      rhymeTimerRef.current = window.setTimeout(() => {
        detectRhyme();
      }, 150);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const currentContent = editor.getHTML();
    if (currentContent !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    if (onStatsChange) {
      const plainText = editor?.getText() || value;
      onStatsChange(computeLyricStats(plainText));
    }
  }, [value, onStatsChange, editor]);

  useEffect(() => {
    if (!editor) return;
    editorRef.current = editor;
  }, [editor]);

  const detectRhyme = async () => {
    const callback = callbackRef.current;
    const currentEditor = editorRef.current;
    const currentRhymeCheckOn = rhymeCheckRef.current;

    if (!currentEditor || !callback || !currentRhymeCheckOn) {
      callback?.(null);
      return;
    }

    const selection = currentEditor.state.selection;
    const pos = selection.head;

    if (pos <= 0) {
      callback(null);
      return;
    }

    const charBeforeCursor = currentEditor.state.doc.textBetween(pos - 1, pos);

    if (!/[\u4e00-\u9fff]/.test(charBeforeCursor)) {
      callback(null);
      return;
    }

    // 优先尝试本地 Python 韵脚服务（local 模式跳过网络）
    const currentSource = sourceRef.current;
    if (currentSource !== 'local') {
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 2000);
        const resp = await fetch(
          `http://127.0.0.1:8792/rhyme?char=${encodeURIComponent(charBeforeCursor)}&source=${currentSource}`,
          { signal: controller.signal }
        );
        window.clearTimeout(timeout);

        if (resp.ok) {
          const data = await resp.json();
          const chars = (data.characters || []).filter((c: string) => c !== charBeforeCursor);
          const words = (data.words || []).filter((w: string) => w !== charBeforeCursor);
          const examples = data.examples || [];
          if (chars.length || words.length) {
            callback({
              final: data.final || '',
              characters: chars,
              words: words,
              examples: examples,
              lineChar: charBeforeCursor,
            });
            return;
          }
        }
      } catch (e) {
        // 服务未启动或超时，回退到本地数据
      }
    }

    // 回退到本地韵脚数据
    const results = findRhymes(charBeforeCursor);

    if (results.length > 0 && results[0].characters.length > 0) {
      const matches = results[0].characters.filter((c: string) => c !== charBeforeCursor);
      const words = results[0].words || [];
      callback({ final: results[0].final, characters: matches, words: words, examples: [], lineChar: charBeforeCursor });
    } else {
      callback(null);
    }
  };

  useEffect(() => {
    if (!editor) return;

    const triggerRhymeCheck = () => {
      if (rhymeTimerRef.current) clearTimeout(rhymeTimerRef.current);
      rhymeTimerRef.current = window.setTimeout(() => {
        detectRhyme();
      }, 150);
    };

    triggerRhymeCheck();
    document.addEventListener('selectionchange', triggerRhymeCheck);

    window.cigeEditorAPI = {
      replaceCharBeforeCursor: (char: string) => {
        const pos = editor.state.selection.head;
        if (pos > 0) {
          editor.commands.deleteRange({ from: pos - 1, to: pos });
          editor.commands.insertContent(char);
        }
      },
      getCharBeforeCursor: () => {
        const pos = editor.state.selection.head;
        if (pos > 0) {
          return editor.state.doc.textBetween(pos - 1, pos);
        }
        return '';
      },
      toggleBold: () => editor.chain().focus().toggleBold().run(),
      toggleItalic: () => editor.chain().focus().toggleItalic().run(),
      toggleUnderline: () => editor.chain().focus().toggleUnderline().run(),
      toggleStrike: () => editor.chain().focus().toggleStrike().run(),
      setTextAlign: (align: string) => {
        editor.chain().focus().setTextAlign(align as any).run();
      },
    };

    return () => {
      if (rhymeTimerRef.current) clearTimeout(rhymeTimerRef.current);
      document.removeEventListener('selectionchange', triggerRhymeCheck);
      window.cigeEditorAPI = undefined;
    };
  }, [editor, rhymeCheckOn]);

  if (!editor) {
    return null;
  }

  return (
    <div className="lyric-editor-pane">
      <FloatingToolbar editor={editor} />
      <EditorContent
        editor={editor}
        style={{
          fontFamily: fontStack,
          fontSize: `${fontSize}px`,
          lineHeight: lineHeight,
          textAlign: textAlign,
          height: '100%',
        }}
      />
    </div>
  );
};

export default RichEditor;
