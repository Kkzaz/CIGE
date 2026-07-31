// 编辑器共享类型（从已删除的 CodeMirror 版 Editor.tsx 抽出）
// 供 RichEditor 与 Write 页面复用

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
