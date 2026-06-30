import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { EditorView, keymap, Decoration, ViewPlugin, WidgetType, DecorationSet, ViewUpdate } from '@codemirror/view';
import { StateField, RangeSetBuilder } from '@codemirror/state';
import { EditorSelection } from '@codemirror/state';
import { findRhymes } from '../../shared/rhyme-data';
import { useEditorSettingsStore } from '../store/editorSettings';

/* ====================== Types ====================== */

export interface RhymeSuggestion {
  final: string;
  characters: string[];
  words: string[];
  examples: string[];
  lineChar: string;
}

export interface LyricStats {
  lineCount: number;
  charCount: number;
  rhymeFinals: string[];
  verseCount: number;
  chorusCount: number;
  bridgeCount: number;
  outroCount: number;
}

export type RhymeSource = 'auto' | 'wanmei' | 'souyun' | 'local';

export interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  onStatsChange?: (stats: LyricStats) => void;
  onRhymeSuggestion?: (suggestion: RhymeSuggestion | null) => void;
  rhymeCheckOn: boolean;
  rhymeSource?: RhymeSource;
  rhymeRefreshKey?: number;
}

/* ====================== Constants ====================== */

const STRUCTURE_MARKERS = ['[主歌]', '[副歌]', '[桥段]', '[尾奏]'];

const RHYME_PALETTE = [
  '#8B775A', '#6B9E7A', '#C07E5A', '#6B8EB5', '#B57A9A',
  '#5A8B8B', '#B5895A', '#7A6BB5', '#5A9E8B', '#B56B7A',
  '#8B8B5A', '#6B7AB5', '#9E8B5A', '#5A6B9E', '#A07A6B',
];

/* ====================== Utils ====================== */

function countSyllables(text: string): number {
  let count = 0;
  for (const ch of text) if (/[\u4e00-\u9fff]/.test(ch)) count++;
  return count;
}

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

function computeRhymeCheck(text: string) {
  const lines = text.split('\n');
  const lineFinal: { lineNum: number; char: string; final: string | null }[] = [];
  const finalToColor = new Map<string, string>();
  let colorIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimEnd();
    if (!trimmed) continue;
    const lastChar = trimmed[trimmed.length - 1];
    if (/[\u4e00-\u9fff]/.test(lastChar)) {
      const results = findRhymes(lastChar);
      const final = results.length > 0 ? results[0].final : null;
      lineFinal.push({ lineNum: i + 1, char: lastChar, final });
      if (final && !finalToColor.has(final)) {
        finalToColor.set(final, RHYME_PALETTE[colorIdx % RHYME_PALETTE.length]);
        colorIdx++;
      }
    }
  }
  return { lineFinal, colorMap: finalToColor };
}

/* ====================== CodeMirror Extensions ====================== */

class SyllableWidget extends WidgetType {
  constructor(readonly count: number) { super(); }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'lyric-syllable-count';
    span.textContent = String(this.count);
    return span;
  }
}

const syllableCountField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(_deco, tr) {
    if (!tr.docChanged) return _deco;
    const builder = new RangeSetBuilder<Decoration>();
    const doc = tr.state.doc;
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const text = line.text.trimEnd();
      if (!text) continue;
      if (STRUCTURE_MARKERS.some((m) => text.includes(m))) continue;
      const syl = countSyllables(text);
      if (syl === 0) continue;
      builder.add(line.to, line.to, Decoration.widget({ widget: new SyllableWidget(syl), side: 1 }));
    }
    return builder.finish();
  },
});

const structureHighlight = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(_deco, tr) {
    if (!tr.docChanged) return _deco;
    const builder = new RangeSetBuilder<Decoration>();
    const doc = tr.state.doc;
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const trimmed = line.text.trim();
      if (STRUCTURE_MARKERS.some((m) => trimmed === m || trimmed.startsWith(m))) {
        builder.add(line.from, line.from, Decoration.line({ attributes: { class: 'lyric-structure-line' } }));
      }
    }
    return builder.finish();
  },
});

// First non-empty line = title (large / centered)
const titleLineField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(_deco, tr) {
    if (!tr.docChanged) return _deco;
    const builder = new RangeSetBuilder<Decoration>();
    const doc = tr.state.doc;
    for (let i = 1; i <= doc.lines; i++) {
      if (!doc.line(i).text.trim()) continue;
      builder.add(doc.line(i).from, doc.line(i).from, Decoration.line({ attributes: { class: 'lyric-title-line' } }));
      break;
    }
    return builder.finish();
  },
});

function createRhymeCheckPlugin(enabledRef: React.MutableRefObject<boolean>) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) { this.decorations = this.build(view); }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view);
      }
      build(view: EditorView) {
        if (!enabledRef.current) return Decoration.none;
        const builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.doc;
        const result = computeRhymeCheck(doc.toString());
        for (const { lineNum, final } of result.lineFinal) {
          if (lineNum > doc.lines) continue;
          const line = doc.line(lineNum);
          const color = final ? result.colorMap.get(final) : null;
          builder.add(line.from, line.to, Decoration.line({
            attributes: {
              class: 'lyric-rhyme-line',
              style: `--rlc:${color || '#C95B4B'};--rlb:${color ? color + '14' : 'rgba(201,91,75,0.08)'}`,
            },
          }));
        }
        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations }
  );
}

/* ====================== Component ====================== */

const Editor: React.FC<EditorProps> = ({
  value, onChange, onSave, onStatsChange, onRhymeSuggestion, rhymeCheckOn,
}) => {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const rhymeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rhymeCheckRef = useRef(false);
  const { fontSize, lineHeight, textAlign, showLineNumbers, fontFamily } = useEditorSettingsStore();

  useEffect(() => { rhymeCheckRef.current = rhymeCheckOn; }, [rhymeCheckOn]);

  const detectRhyme = useCallback(() => {
    const view = editorRef.current?.view;
    if (!view || !onRhymeSuggestion) return;
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    const trimmed = line.text.trimEnd();
    if (!trimmed) { onRhymeSuggestion(null); return; }
    const lastChar = trimmed[trimmed.length - 1];
    if (!/[\u4e00-\u9fff]/.test(lastChar)) { onRhymeSuggestion(null); return; }
    const results = findRhymes(lastChar);
    if (results.length > 0 && results[0].characters.length > 0) {
      const matches = results[0].characters.filter((c) => c !== lastChar);
      onRhymeSuggestion({ final: results[0].final, characters: matches, words: results[0].words || [], examples: [], lineChar: lastChar });
    } else {
      onRhymeSuggestion(null);
    }
  }, [onRhymeSuggestion]);

  useEffect(() => {
    if (rhymeTimerRef.current) clearTimeout(rhymeTimerRef.current);
    rhymeTimerRef.current = setTimeout(detectRhyme, 200);
    return () => { if (rhymeTimerRef.current) clearTimeout(rhymeTimerRef.current); };
  }, [value, detectRhyme]);

  useEffect(() => {
    if (onStatsChange) onStatsChange(computeLyricStats(value));
  }, [value, onStatsChange]);

  const saveKeyExtension = useMemo(() => {
    if (!onSave) return [];
    return [keymap.of([{ key: 'Mod-s', run: () => { onSave(); return true; }, preventDefault: true }])];
  }, [onSave]);

  const rhymeCheckPlugin = useMemo(() => createRhymeCheckPlugin(rhymeCheckRef), []);

  const editorTheme = useMemo(() => {
    const lineHeightPx = Math.round(fontSize * lineHeight);
    const fontStack = fontFamily === 'serif' 
      ? 'Georgia, "Noto Serif CJK SC", "Songti SC", "STSong", "SimSun", serif'
      : '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif';
    return EditorView.theme({
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
        borderLeftColor: '#7A6B5A !important', 
        borderLeftWidth: '2px !important',
        animation: 'cm-cursor-blink 1s step-end infinite',
      },
      '.cm-selectionBackground, .cm-focused .cm-selectionBackground': { 
        backgroundColor: 'rgba(139,119,90,0.18) !important',
        borderRadius: '3px',
      },
      '.cm-activeLine': { 
        backgroundColor: 'rgba(139,119,90,0.05) !important',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'rgba(139,119,90,0.03) !important',
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
  }, [fontSize, lineHeight, textAlign, showLineNumbers]);

  const extensions = useMemo(() => [
    EditorView.lineWrapping,
    editorTheme,
    ...saveKeyExtension,
    EditorView.contentAttributes.of({ spellcheck: false }),
  ], [editorTheme, saveKeyExtension, fontSize, lineHeight, textAlign, showLineNumbers]);

  return (
    <div className="lyric-editor-pane">
      <CodeMirror
        ref={editorRef}
        value={value}
        onChange={onChange}
        extensions={extensions}
        height="100%"
        editable
      />
    </div>
  );
};

export default Editor;
