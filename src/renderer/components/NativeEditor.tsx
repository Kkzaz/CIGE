import React, { useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState, EditorSelection } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { findRhymes } from '../../shared/rhyme-data';
import { EditorProps, RhymeSuggestion, LyricStats } from './Editor';
import { useEditorSettingsStore } from '../store/editorSettings';

const STRUCTURE_MARKERS = ['[主歌]', '[副歌]', '[桥段]', '[尾奏]'];

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

const NativeEditor: React.FC<EditorProps> = ({ value, onChange, onSave, onStatsChange, onRhymeSuggestion, rhymeCheckOn }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const rhymeTimerRef = useRef<number | null>(null);
  const callbackRef = useRef(onRhymeSuggestion);
  const checkOnRef = useRef(rhymeCheckOn);
  const { fontSize, lineHeight, textAlign, showLineNumbers, fontFamily } = useEditorSettingsStore();

  const formatText = (wrapChar: string) => {
    const view = viewRef.current;
    if (!view) return;
    const selection = view.state.selection;
    const selectedText = view.state.doc.sliceString(selection.main.from, selection.main.to);
    const wrappedText = wrapChar + selectedText + wrapChar;
    view.dispatch({
      changes: {
        from: selection.main.from,
        to: selection.main.to,
        insert: wrappedText,
      },
      selection: EditorSelection.cursor(selection.main.from + wrappedText.length),
    });
  };

  useEffect(() => {
    window.cigeEditorAPI = { formatText };
  }, []);

  useEffect(() => { 
    callbackRef.current = onRhymeSuggestion; 
    checkOnRef.current = rhymeCheckOn;
  }, [onRhymeSuggestion, rhymeCheckOn]);

  const detectRhyme = () => {
    const view = viewRef.current;
    const callback = callbackRef.current;
    const rhymeEnabled = checkOnRef.current;
    
    console.log('[Rhyme Debug] detectRhyme called:', { view: !!view, rhymeEnabled, callback: !!callback });
    
    if (!view || !callback || !rhymeEnabled) {
      callback?.(null);
      return;
    }

    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    const trimmed = line.text.trimEnd();
    
    console.log('[Rhyme Debug] Line text:', line.text, 'trimmed:', trimmed);
    
    if (!trimmed) {
      callback(null);
      return;
    }

    const lastChar = trimmed[trimmed.length - 1];
    console.log('[Rhyme Debug] Last char:', lastChar, 'isChinese:', /[\u4e00-\u9fff]/.test(lastChar));
    
    if (!/[\u4e00-\u9fff]/.test(lastChar)) {
      callback(null);
      return;
    }

    const results = findRhymes(lastChar);
    console.log('[Rhyme Debug] findRhymes results:', results);
    
    if (results.length > 0 && results[0].characters.length > 0) {
      const matches = results[0].characters.filter((c: string) => c !== lastChar);
      console.log('[Rhyme Debug] Matches:', matches);
      callback({ final: results[0].final, characters: matches, lineChar: lastChar });
    } else {
      callback(null);
    }
  };

  useEffect(() => {
    if (!editorRef.current) return;

    const fontStack = fontFamily === 'serif' 
      ? 'Georgia, "Noto Serif CJK SC", "Songti SC", "STSong", "SimSun", serif'
      : '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif';

    const lineHeightPx = Math.round(fontSize * lineHeight);

    const theme = EditorView.theme({
      '&': {
        fontFamily: fontStack,
        fontSize: `${fontSize}px`,
        backgroundColor: 'transparent',
        height: '100%',
      },
      '.cm-content': {
        fontFamily: fontStack,
        lineHeight: lineHeight,
        padding: `${fontSize * 1.5}px ${fontSize * 2}px`,
        minHeight: '100%',
        background: `linear-gradient(to bottom, rgba(139,119,90,0.04) 1px, transparent 1px), rgba(255,252,245,0.8)`,
        backgroundSize: `100% ${lineHeightPx}px`,
        letterSpacing: '0.015em',
        textAlign: textAlign,
      },
      '.cm-line': { 
        lineHeight: lineHeight, 
        padding: '2px 0',
        minHeight: `${lineHeightPx}px`,
        textAlign: textAlign,
      },
      '.cm-cursor': { 
        borderLeftColor: '#7A6B5A', 
        borderLeftWidth: '2px',
        animation: 'cm-cursor-blink 1s step-end infinite',
      },
      '.cm-selectionBackground, .cm-focused .cm-selectionBackground': { 
        backgroundColor: 'rgba(139,119,90,0.18)',
        borderRadius: '3px',
      },
      '.cm-activeLine': { 
        backgroundColor: 'rgba(139,119,90,0.05)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'rgba(139,119,90,0.03)',
      },
      '.cm-gutters': {
        fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
        backgroundColor: 'rgba(255,249,240,0.6)',
        backdropFilter: 'blur(8px)',
        borderRight: '0.5px solid rgba(139,119,90,0.15)',
        color: 'var(--text-tertiary)', 
        fontSize: `${Math.max(10, fontSize * 0.7)}px`,
        paddingRight: '8px',
        display: showLineNumbers ? 'flex' : 'none',
      },
      '.cm-lineNumbers .cm-gutterElement': { 
        padding: `0 ${fontSize * 0.6}px 0 ${fontSize}px`,
        textAlign: 'right',
        opacity: '0.6',
      },
      '.cm-focused .cm-lineNumbers .cm-gutterElement': {
        opacity: '1',
      },
      '.cm-scroller': {
        overflow: 'auto',
      },
    }, { dark: false });

    const defaultKeymap = [
      { key: 'Mod-z', run: (view: EditorView) => { 
        const history = view.state.history;
        if (history) history.undo();
        return true; 
      } },
      { key: 'Mod-Shift-z', run: (view: EditorView) => { 
        const history = view.state.history;
        if (history) history.redo();
        return true; 
      } },
      { key: 'Mod-y', run: (view: EditorView) => { 
        const history = view.state.history;
        if (history) history.redo();
        return true; 
      } },
      { key: 'Mod-c', run: (view: EditorView) => { 
        const selection = view.state.selection;
        if (!selection.empty) {
          const text = view.state.doc.sliceString(selection.main.from, selection.main.to);
          navigator.clipboard.writeText(text);
        }
        return true; 
      } },
      { key: 'Mod-x', run: (view: EditorView) => { 
        const selection = view.state.selection;
        if (!selection.empty) {
          const text = view.state.doc.sliceString(selection.main.from, selection.main.to);
          navigator.clipboard.writeText(text);
          view.dispatch({ changes: { from: selection.main.from, to: selection.main.to, insert: '' } });
        }
        return true; 
      } },
      { key: 'Mod-v', run: async (view: EditorView) => { 
        const text = await navigator.clipboard.readText();
        const selection = view.state.selection;
        view.dispatch({ changes: { from: selection.main.from, to: selection.main.to, insert: text } });
        return true; 
      } },
      { key: 'Mod-a', run: (view: EditorView) => { 
        view.dispatch({ selection: EditorSelection.create([EditorSelection.range(0, view.state.doc.length)]) });
        return true; 
      } },
      { key: 'Mod-s', run: () => { 
        if (onSave) onSave();
        return true; 
      } },
    ];

    const state = EditorState.create({
      doc: value,
      extensions: [
        theme,
        EditorView.lineWrapping,
        keymap.of(defaultKeymap),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    setTimeout(() => {
      console.log('[Rhyme Debug] Initial rhyme check');
      detectRhyme();
    }, 100);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!viewRef.current) return;
    const currentValue = viewRef.current.state.doc.toString();
    if (currentValue !== value) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      });
    }
  }, [value]);

  useEffect(() => {
    if (onStatsChange) {
      onStatsChange(computeLyricStats(value));
    }
  }, [value, onStatsChange]);

  useEffect(() => {
    console.log('[Rhyme Debug] Value changed, triggering rhyme check');
    if (rhymeTimerRef.current) clearTimeout(rhymeTimerRef.current);
    rhymeTimerRef.current = window.setTimeout(() => {
      detectRhyme();
    }, 200);

    return () => {
      if (rhymeTimerRef.current) clearTimeout(rhymeTimerRef.current);
    };
  }, [value]);

  return <div className="lyric-editor-pane" ref={editorRef} />;
};

export default NativeEditor;