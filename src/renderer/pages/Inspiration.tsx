import React, { useState, useRef, useEffect } from 'react';

type InspirationTab = 'lyric' | 'chat';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
}

const Select: React.FC<SelectProps> = ({ value, options, onChange, className = '' }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find((o) => o.value === value)?.label || value;

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
    <div className={`insp-select ${className}`} ref={containerRef}>
      <button
        type="button"
        className={`insp-select-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span className="insp-select-text">{selectedLabel}</span>
        <svg
          className="insp-select-arrow"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="insp-select-menu">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`insp-select-item${opt.value === value ? ' active' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface LyricResult {
  songId: number;
  name: string;
  artist: string;
  album?: string;
  similarity: number;
  matchedLyric: string;
  fullLyric?: string;
}

const Inspiration: React.FC = () => {
  const [activeTab, setActiveTab] = useState<InspirationTab>('lyric');

  // Lyric search state
  const [lyricQuery, setLyricQuery] = useState('');
  const [lyricPlatform, setLyricPlatform] = useState('netease');
  const [lyricLoading, setLyricLoading] = useState(false);
  const [lyricResults, setLyricResults] = useState<LyricResult[]>([]);
  const [lyricError, setLyricError] = useState<string | null>(null);
  const [expandedLyricId, setExpandedLyricId] = useState<number | null>(null);

  // Gemini chat state
  const [chatInput, setChatInput] = useState('');
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const unsubscribeChatRef = useRef<(() => void) | null>(null);
  const isInitialChatLoadRef = useRef(false);

  const activeSession = chatSessions.find((s) => s.id === activeChatId) || null;
  const chatMessages = activeSession?.messages || [];

  useEffect(() => {
    if (!window.cigeAPI?.onGeminiChatEvent) return;
    const unsubscribe = window.cigeAPI.onGeminiChatEvent((event) => {
      if (event.type === 'chunk' && event.data) {
        setChatSessions((prev) => {
          const idx = prev.findIndex((s) => s.id === activeChatId);
          if (idx === -1) return prev;
          const session = prev[idx];
          const messages = session.messages;
          const last = messages[messages.length - 1];
          if (last && last.role === 'model') {
            const updatedMessages = [...messages.slice(0, -1), { ...last, content: last.content + event.data }];
            const updated = { ...session, messages: updatedMessages, updatedAt: Date.now() };
            return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
          }
          return prev;
        });
      } else if (event.type === 'done') {
        setChatLoading(false);
      } else if (event.type === 'error') {
        setChatError(event.data || '对话出错');
        setChatLoading(false);
      }
    });
    unsubscribeChatRef.current = unsubscribe;
    return () => {
      unsubscribe();
      unsubscribeChatRef.current = null;
    };
  }, [activeChatId]);

  // Load persisted Gemini chat sessions on mount
  useEffect(() => {
    if (isInitialChatLoadRef.current) return;
    isInitialChatLoadRef.current = true;
    if (!window.cigeAPI?.getAppSettings) return;
    window.cigeAPI
      .getAppSettings()
      .then((settings) => {
        const typedSettings = settings as {
          geminiChats?: ChatSession[];
          geminiChatHistory?: ChatMessage[];
        };
        const sessions = typedSettings.geminiChats;
        if (Array.isArray(sessions) && sessions.length > 0) {
          setChatSessions(sessions);
          setActiveChatId(sessions[0].id);
          return;
        }
        // Migrate legacy single-session history
        const history = typedSettings.geminiChatHistory;
        if (Array.isArray(history) && history.length > 0) {
          const migrated: ChatSession = {
            id: `chat-${Date.now()}`,
            title: history[0]?.content?.slice(0, 20) || '历史对话',
            messages: history,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          setChatSessions([migrated]);
          setActiveChatId(migrated.id);
        }
      })
      .catch(() => {
        // ignore
      });
  }, []);

  // Persist chat sessions whenever they change
  useEffect(() => {
    if (!window.cigeAPI?.setAppSetting || !isInitialChatLoadRef.current) return;
    const timeout = setTimeout(() => {
      const trimmedSessions = chatSessions.map((s) => ({
        ...s,
        messages: s.messages.slice(-100),
      }));
      window.cigeAPI.setAppSetting('geminiChats', trimmedSessions);
    }, 300);
    return () => clearTimeout(timeout);
  }, [chatSessions]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  const createNewChat = (initialMessages: ChatMessage[] = []): ChatSession => {
    const now = Date.now();
    return {
      id: `chat-${now}`,
      title: initialMessages[0]?.content?.slice(0, 20) || '新对话',
      messages: initialMessages,
      createdAt: now,
      updatedAt: now,
    };
  };

  const handleNewChat = () => {
    if (chatLoading) return;
    const session = createNewChat();
    setChatSessions((prev) => [session, ...prev]);
    setActiveChatId(session.id);
    setChatInput('');
    setChatError(null);
  };

  const handleSelectChat = (id: string) => {
    if (chatLoading) return;
    setActiveChatId(id);
    setChatError(null);
  };

  const handleDeleteChat = (id: string) => {
    if (chatLoading) return;
    setChatSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeChatId === id) {
        setActiveChatId(next.length > 0 ? next[0].id : null);
      }
      return next;
    });
  };

  const handleSendChat = () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    if (!window.cigeAPI?.sendGeminiChat) {
      setChatError('当前环境不支持 AI 对话');
      return;
    }

    let targetSessionId = activeChatId;
    let currentMessages: ChatMessage[] = [];

    setChatSessions((prev) => {
      if (targetSessionId) {
        const idx = prev.findIndex((s) => s.id === targetSessionId);
        if (idx !== -1) {
          const session = prev[idx];
          currentMessages = session.messages;
          const userMsg: ChatMessage = { id: `${Date.now()}-user`, role: 'user', content: text };
          const modelPlaceholder: ChatMessage = { id: `${Date.now()}-model`, role: 'model', content: '' };
          const updated = {
            ...session,
            title: session.title === '新对话' ? text.slice(0, 20) : session.title,
            messages: [...session.messages, userMsg, modelPlaceholder],
            updatedAt: Date.now(),
          };
          return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
        }
      }

      // No active session: create one
      const userMsg: ChatMessage = { id: `${Date.now()}-user`, role: 'user', content: text };
      const modelPlaceholder: ChatMessage = { id: `${Date.now()}-model`, role: 'model', content: '' };
      const session = createNewChat([userMsg, modelPlaceholder]);
      session.title = text.slice(0, 20);
      session.updatedAt = Date.now();
      targetSessionId = session.id;
      currentMessages = [];
      setTimeout(() => setActiveChatId(session.id), 0);
      return [session, ...prev];
    });

    setChatInput('');
    setChatLoading(true);
    setChatError(null);

    const history = currentMessages.map((m) => ({ role: m.role, content: m.content }));
    window.cigeAPI.sendGeminiChat(text, history);
  };

  const handleSearchLyrics = async () => {
    const query = lyricQuery.trim();
    if (!query) return;
    setLyricLoading(true);
    setLyricError(null);
    setLyricResults([]);
    try {
      const res = (await window.cigeAPI.searchMusicLyrics(query, lyricPlatform)) as MusicLyricSearchResult;
      if (!res?.success) {
        setLyricError(res?.error || '查询失败');
        return;
      }
      setLyricResults(res.results || []);
    } catch (e) {
      setLyricError(e instanceof Error ? e.message : '查询失败');
    } finally {
      setLyricLoading(false);
    }
  };

  const handleDragStart = (content: string) => {
    sessionStorage.setItem('draggedInspiration', content);
  };

  const renderLyricTab = () => (
    <div className="insp-search-panel">
      <div className="insp-search-bar">
        <textarea
          className="insp-search-input"
          placeholder="输入你的歌词或文案，检索是否已被使用..."
          value={lyricQuery}
          onChange={(e) => setLyricQuery(e.target.value)}
          rows={3}
        />
        <div className="insp-search-controls">
          <Select
            value={lyricPlatform}
            options={[{ value: 'netease', label: '网易云音乐' }]}
            onChange={(val) => setLyricPlatform(val)}
          />
          <button
            className="btn btn-primary insp-search-btn"
            onClick={handleSearchLyrics}
            disabled={lyricLoading || !lyricQuery.trim()}
          >
            {lyricLoading ? '检索中...' : '检索歌词'}
          </button>
        </div>
      </div>

      {lyricError && <div className="insp-search-error">{lyricError}</div>}

      <div className="insp-results">
        {lyricResults.length === 0 && !lyricLoading && !lyricError && (
          <div className="insp-empty">输入文案后点击检索，查看是否存在相似歌词</div>
        )}
        {lyricResults.map((item) => (
          <div
            key={item.songId}
            draggable
            className="insp-result-card"
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', item.matchedLyric || item.name);
              handleDragStart(item.matchedLyric || item.name);
            }}
          >
            <div className="insp-result-header">
              <span className="insp-result-title">{item.name}</span>
              <span className="insp-result-meta">{item.artist}</span>
              {item.album && <span className="insp-result-meta">《{item.album}》</span>}
              <span className={`insp-similarity similarity-${Math.round(item.similarity * 100)}`}>
                相似度 {Math.round(item.similarity * 100)}%
              </span>
            </div>
            {item.matchedLyric && (
              <div className="insp-result-content">{item.matchedLyric}</div>
            )}
            {expandedLyricId === item.songId && item.fullLyric && (
              <div className="insp-result-full-lyric">{item.fullLyric}</div>
            )}
            {item.fullLyric && (
              <button
                type="button"
                className="insp-result-expand"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedLyricId(expandedLyricId === item.songId ? null : item.songId);
                }}
              >
                {expandedLyricId === item.songId ? '收起歌词' : '展开完整歌词'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderChatTab = () => (
    <div className="insp-chat-layout">
      <div className="insp-chat-sidebar">
        <button
          type="button"
          className="insp-chat-new"
          onClick={handleNewChat}
          disabled={chatLoading}
        >
          + 新建对话
        </button>
        <div className="insp-chat-list">
          {chatSessions.length === 0 && (
            <div className="insp-chat-list-empty">暂无对话</div>
          )}
          {chatSessions.map((session) => (
            <div
              key={session.id}
              className={`insp-chat-item${session.id === activeChatId ? ' active' : ''}`}
              onClick={() => handleSelectChat(session.id)}
            >
              <div className="insp-chat-item-title">{session.title || '新对话'}</div>
              <div className="insp-chat-item-meta">
                {new Date(session.updatedAt).toLocaleDateString()}
              </div>
              <button
                type="button"
                className="insp-chat-item-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChat(session.id);
                }}
                disabled={chatLoading}
                title="删除对话"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="insp-chat-panel">
        <div className="insp-chat-header">
          <span className="insp-chat-title">{activeSession?.title || 'AI 对话'}</span>
          {chatSessions.length > 0 && activeChatId && (
            <button
              type="button"
              className="insp-chat-clear"
              onClick={() => handleDeleteChat(activeChatId)}
              disabled={chatLoading}
            >
              删除当前对话
            </button>
          )}
        </div>
        <div className="insp-chat-messages">
          {chatMessages.length === 0 && (
            <div className="insp-empty">在下方输入问题，与 AI 歌词助手对话</div>
          )}
          {chatMessages.map((msg) => (
            <div key={msg.id} className={`insp-chat-message ${msg.role}`}>
              <div className="insp-chat-bubble">
                {msg.content || (msg.role === 'model' ? '...' : '')}
              </div>
            </div>
          ))}
          {chatLoading && chatMessages.length > 0 && chatMessages[chatMessages.length - 1]?.role === 'user' && (
            <div className="insp-chat-message model">
              <div className="insp-chat-bubble">...</div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {chatError && <div className="insp-search-error">{chatError}</div>}

        <div className="insp-chat-input-bar">
          <textarea
            className="insp-chat-input"
            placeholder="输入你的问题..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendChat();
              }
            }}
            rows={2}
            disabled={chatLoading}
          />
          <button
            className="btn btn-primary insp-chat-send"
            onClick={handleSendChat}
            disabled={chatLoading || !chatInput.trim()}
          >
            {chatLoading ? '生成中...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-container inspiration-page">
      <div className="inspiration-header">
        <h2 className="page-title" style={{ fontFamily: 'var(--font-serif)' }}>
          创作检索
        </h2>
      </div>

      <div className="inspiration-layout">
        <div className="inspiration-main">
          {activeTab === 'lyric' && renderLyricTab()}
          {activeTab === 'chat' && renderChatTab()}
        </div>

        <div className="inspiration-side">
          <div className="inspiration-panel">
            <div className="inspiration-panel-title">板块</div>
            <div className="insp-switcher">
              <button
                className={`insp-switcher-btn${activeTab === 'lyric' ? ' active' : ''}`}
                onClick={() => setActiveTab('lyric')}
              >
                歌词查重
              </button>
              <button
                className={`insp-switcher-btn${activeTab === 'chat' ? ' active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                AI 对话
              </button>
            </div>

            <div className="insp-preview">
              <div className="insp-preview-title">使用说明</div>
              <div className="insp-hint">
                {activeTab === 'lyric' ? (
                  <>
                    <p>输入你创作的歌词或文案，检索网易云音乐中是否存在相似歌词。</p>
                    <p>优先走官方接口，无结果时自动尝试网页抓取。</p>
                    <p>结果卡片可拖拽到写作页面的编辑器中，点击可展开完整歌词。</p>
                  </>
                ) : (
                  <>
                    <p>与 Gemini AI 歌词助手对话，获取押韵、意象、修辞和情感表达方面的建议。</p>
                    <p>需要配置 GEMINI_API_KEY 环境变量或创建 tools/.gemini_key 文件。</p>
                    <p>按 Enter 发送，Shift + Enter 换行。</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Inspiration;
