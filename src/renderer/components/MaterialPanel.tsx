import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { RhymeSuggestion, RhymeSource } from './Editor';

interface MaterialPanelProps {
  rhymeSuggestion: RhymeSuggestion | null;
  onInsertText: (text: string) => void;
  onReplaceLineEnd: (char: string) => void;
  source?: RhymeSource;
  onSourceChange?: (source: RhymeSource) => void;
  onRefresh?: () => void;
}

type TabKey = 'rhyme' | 'materials';
type MaterialsSubTab = 'hot' | 'poetry';

const SOURCE_OPTIONS: { value: RhymeSource; label: string }[] = [
  { value: 'auto', label: '自动（完美韵脚 → 搜韵）' },
  { value: 'wanmei', label: '完美韵脚' },
  { value: 'souyun', label: '搜韵' },
  { value: 'local', label: '本地韵脚' },
];

const SourceSelector: React.FC<{
  source: RhymeSource;
  onChange?: (source: RhymeSource) => void;
  onRefresh?: () => void;
}> = ({ source, onChange, onRefresh }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentLabel = SOURCE_OPTIONS.find((o) => o.value === source)?.label || source;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="frp-rhyme-source-row" ref={containerRef}>
      <span className="frp-rhyme-source-label">来源</span>
      <div className="frp-rhyme-source-controls">
        <div className="frp-rhyme-source-dropdown">
          <button
            className={`frp-rhyme-source-trigger${open ? ' open' : ''}`}
            onClick={() => setOpen(!open)}
            type="button"
          >
            <span className="frp-rhyme-source-text">{currentLabel}</span>
            <svg className="frp-rhyme-source-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          {open && (
            <div className="frp-rhyme-source-menu">
              {SOURCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`frp-rhyme-source-item${opt.value === source ? ' active' : ''}`}
                  onClick={() => {
                    onChange?.(opt.value);
                    setOpen(false);
                  }}
                  type="button"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          className="frp-rhyme-refresh-btn"
          title="刷新韵脚"
          onClick={onRefresh}
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
        </button>
      </div>
    </div>
  );
};

const INITIAL_CHAR_VISIBLE = 60;
const EXPAND_CHAR_STEP = 50;
const INITIAL_WORD_VISIBLE = 100;
const EXPAND_WORD_STEP = 50;
const INITIAL_EXAMPLE_VISIBLE = 10;
const EXPAND_EXAMPLE_STEP = 50;
const MAX_WORD_LENGTH = 15;

const MaterialPanel: React.FC<MaterialPanelProps> = ({
  rhymeSuggestion,
  onInsertText,
  onReplaceLineEnd,
  source = 'auto',
  onSourceChange,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('rhyme');
  const [materialsSubTab, setMaterialsSubTab] = useState<MaterialsSubTab>('hot');
  const [visibleChars, setVisibleChars] = useState(INITIAL_CHAR_VISIBLE);
  const [wordVisibleMap, setWordVisibleMap] = useState<Record<number, number>>({});
  const [visibleExamples, setVisibleExamples] = useState(INITIAL_EXAMPLE_VISIBLE);
  const [hotTrends, setHotTrends] = useState<{ id: number; content: string; tags?: string; platform: string }[]>([]);
  const [poetryQuotes, setPoetryQuotes] = useState<{ id: number; content: string; source?: string; tags?: string }[]>([]);
  const [materialsLoaded, setMaterialsLoaded] = useState(false);
  const loadRef = useRef(false);

  const wordGroups = useMemo(() => {
    if (!rhymeSuggestion?.words) return [];
    const groups: Record<number, string[]> = {};
    for (const word of rhymeSuggestion.words) {
      const len = Math.min(Math.max(word.length, 1), MAX_WORD_LENGTH);
      if (!groups[len]) groups[len] = [];
      groups[len].push(word);
    }
    return Object.entries(groups)
      .map(([len, words]) => ({ len: Number(len), words }))
      .sort((a, b) => a.len - b.len);
  }, [rhymeSuggestion?.words]);

  // 切换韵字时重置展开数量
  useEffect(() => {
    setVisibleChars(INITIAL_CHAR_VISIBLE);
    setWordVisibleMap({});
    setVisibleExamples(INITIAL_EXAMPLE_VISIBLE);
  }, [rhymeSuggestion?.lineChar]);

  // Lazy load materials
  useEffect(() => {
    if (activeTab !== 'materials' || loadRef.current) return;
    loadRef.current = true;
    (async () => {
      try {
        const excerpts = await window.cigeAPI.getExcerpts() as any[];
        const inspirations = await window.cigeAPI.getInspirations() as any[];
        const trends = inspirations
          .filter((i: any) => i.tags?.includes('热榜'))
          .map((i: any) => ({
            ...i,
            platform: i.tags?.includes('抖音') ? 'douyin' : 'xiaohongshu',
          }));
        const poems = excerpts.map((e: any) => ({ ...e, type: 'poetry' }));
        setHotTrends(trends.slice(0, 100));
        setPoetryQuotes(poems.slice(0, 100));
      } catch {}
      setMaterialsLoaded(true);
    })();
  }, [activeTab]);

  return (
    <div className="ws-rhyme-panel">
      {/* Tabs */}
      <div className="frp-tabs">
        <button
          className={`frp-tab${activeTab === 'rhyme' ? ' active' : ''}`}
          onClick={() => setActiveTab('rhyme')}
        >韵脚建议</button>
        <button
          className={`frp-tab${activeTab === 'materials' ? ' active' : ''}`}
          onClick={() => setActiveTab('materials')}
        >素材引用</button>
      </div>

      {/* Content */}
      <div className="frp-content">
        {activeTab === 'rhyme' && (
          <div className="frp-rhyme-body">
            <SourceSelector
              source={source}
              onChange={onSourceChange}
              onRefresh={onRefresh}
            />
            {rhymeSuggestion ? (
              <>
                <div className="frp-rhyme-header">
                  <span className="frp-rhyme-char">{rhymeSuggestion.lineChar}</span>
                  <span className="frp-rhyme-final">韵母: {rhymeSuggestion.final}</span>
                </div>
                
                {wordGroups.map(({ len, words }) => {
                  const visible = wordVisibleMap[len] ?? INITIAL_WORD_VISIBLE;
                  return (
                    <React.Fragment key={len}>
                      <div className="frp-rhyme-section-title">{len}字词语</div>
                      <div className="frp-rhyme-words-grid">
                        {words.slice(0, visible).map((word, i) => (
                          <button
                            key={i}
                            className="frp-rhyme-word-btn"
                            onClick={() => onReplaceLineEnd(word)}
                          >{word}</button>
                        ))}
                      </div>
                      {words.length > visible && (
                        <button
                          className="frp-rhyme-toggle frp-rhyme-toggle-bottom"
                          onClick={() => setWordVisibleMap((m) => ({ ...m, [len]: (m[len] ?? INITIAL_WORD_VISIBLE) + EXPAND_WORD_STEP }))}
                        >展开更多{len}字词语</button>
                      )}
                    </React.Fragment>
                  );
                })}

                <div className="frp-rhyme-section-title">单字</div>
                <div className="frp-rhyme-grid">
                  {rhymeSuggestion.characters.slice(0, visibleChars).map((char, i) => (
                    <button
                      key={i}
                      className="frp-rhyme-btn"
                      onClick={() => onReplaceLineEnd(char)}
                    >{char}</button>
                  ))}
                </div>
                {rhymeSuggestion.characters.length > visibleChars && (
                  <button
                    className="frp-rhyme-toggle frp-rhyme-toggle-bottom"
                    onClick={() => setVisibleChars((v) => v + EXPAND_CHAR_STEP)}
                  >展开更多单字</button>
                )}

                {rhymeSuggestion.examples && rhymeSuggestion.examples.length > 0 && (
                  <>
                    <div className="frp-rhyme-section-title">例句</div>
                    <div className="frp-rhyme-examples">
                      {rhymeSuggestion.examples.slice(0, visibleExamples).map((sentence, i) => (
                        <div key={i} className="frp-rhyme-example">{sentence}</div>
                      ))}
                    </div>
                    {rhymeSuggestion.examples.length > visibleExamples && (
                      <button
                        className="frp-rhyme-toggle frp-rhyme-toggle-bottom"
                        onClick={() => setVisibleExamples((v) => v + EXPAND_EXAMPLE_STEP)}
                      >展开更多例句</button>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="frp-rhyme-empty">
                <div className="frp-hint-title">将光标移至歌词行末尾</div>
                <div className="frp-hint-text">自动显示该行末字的同韵字建议</div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'materials' && (
          <div className="frp-materials-body">
            {/* 灵感二级标签 */}
            <div className="frp-materials-subtabs">
              <button
                className={`frp-materials-subtab${materialsSubTab === 'hot' ? ' active' : ''}`}
                onClick={() => setMaterialsSubTab('hot')}
              >热点</button>
              <button
                className={`frp-materials-subtab${materialsSubTab === 'poetry' ? ' active' : ''}`}
                onClick={() => setMaterialsSubTab('poetry')}
              >诗词歌赋</button>
            </div>

            {!materialsLoaded ? (
              <div className="frp-materials-loading">加载中...</div>
            ) : materialsSubTab === 'hot' ? (
              <div className="frp-hot-grid">
                <div className="frp-hot-column">
                  <div className="frp-hot-column-title">小红书</div>
                  {hotTrends.filter((i) => i.platform === 'xiaohongshu').length === 0 ? (
                    <div className="frp-materials-empty">暂无小红书热点</div>
                  ) : (
                    hotTrends
                      .filter((i) => i.platform === 'xiaohongshu')
                      .map((item) => (
                        <div
                          key={`xhs-${item.id}`}
                          className="frp-material-card"
                          onClick={() => onInsertText(item.content)}
                        >
                          <div className="frp-material-text">{item.content}</div>
                          <div className="frp-material-meta">
                            <span className="tag-pill tag-pill-1">小红书</span>
                          </div>
                        </div>
                      ))
                  )}
                </div>
                <div className="frp-hot-column">
                  <div className="frp-hot-column-title">抖音</div>
                  {hotTrends.filter((i) => i.platform === 'douyin').length === 0 ? (
                    <div className="frp-materials-empty">暂无抖音热点</div>
                  ) : (
                    hotTrends
                      .filter((i) => i.platform === 'douyin')
                      .map((item) => (
                        <div
                          key={`dy-${item.id}`}
                          className="frp-material-card"
                          onClick={() => onInsertText(item.content)}
                        >
                          <div className="frp-material-text">{item.content}</div>
                          <div className="frp-material-meta">
                            <span className="tag-pill tag-pill-2">抖音</span>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            ) : (
              <div className="frp-poetry-list">
                {poetryQuotes.length === 0 ? (
                  <div className="frp-materials-empty">暂无诗词名句，可在「素材库」中添加摘抄</div>
                ) : (
                  poetryQuotes.map((item) => (
                    <div
                      key={`poetry-${item.id}`}
                      className="frp-material-card"
                      onClick={() => onInsertText(item.content)}
                    >
                      <div className="frp-material-text">{item.content}</div>
                      {item.source && (
                        <div className="frp-material-meta">
                          <span className="frp-material-source">{item.source}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MaterialPanel;
