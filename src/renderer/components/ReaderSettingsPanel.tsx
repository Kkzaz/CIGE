import React, { useEffect, useRef } from 'react';
import { useAppSettingsStore, type ReaderTheme, type ReaderFontFamily } from '../store/appSettings';

interface ReaderSettingsPanelProps {
  onClose: () => void;
}

const FONT_OPTIONS: { value: ReaderFontFamily; label: string }[] = [
  { value: 'serif', label: '衬线' },
  { value: 'sans', label: '无衬线' },
  { value: 'system', label: '系统' },
];

const THEME_OPTIONS: { value: ReaderTheme; label: string }[] = [
  { value: 'light', label: '明亮' },
  { value: 'sepia', label: '暖色' },
  { value: 'dark', label: '暗色' },
];

const ReaderSettingsPanel: React.FC<ReaderSettingsPanelProps> = ({ onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    readerFontSize,
    readerLineHeight,
    readerParaSpacing,
    readerTheme,
    readerFontFamily,
    setReaderFontSize,
    setReaderLineHeight,
    setReaderParaSpacing,
    setReaderTheme,
    setReaderFontFamily,
  } = useAppSettingsStore();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={panelRef} className="reader-settings-panel" onClick={(e) => e.stopPropagation()}>
      <div className="reader-settings-header">
        <span className="reader-settings-title">阅读设置</span>
        <button className="reader-settings-close" onClick={onClose} aria-label="关闭">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="reader-settings-body">
        <div className="reader-settings-row">
          <span className="reader-settings-label">字号</span>
          <div className="reader-settings-control">
            <button
              className="reader-settings-step"
              onClick={() => setReaderFontSize(readerFontSize - 1)}
              aria-label="减小字号"
            >
              A-
            </button>
            <span className="reader-settings-value">{readerFontSize}px</span>
            <button
              className="reader-settings-step"
              onClick={() => setReaderFontSize(readerFontSize + 1)}
              aria-label="增大字号"
            >
              A+
            </button>
          </div>
        </div>

        <div className="reader-settings-row">
          <label className="reader-settings-label" htmlFor="reader-line-height">
            行高
          </label>
          <input
            id="reader-line-height"
            className="reader-settings-range"
            type="range"
            min={1.2}
            max={2.5}
            step={0.1}
            value={readerLineHeight}
            onChange={(e) => setReaderLineHeight(parseFloat(e.target.value))}
          />
          <span className="reader-settings-value">{readerLineHeight.toFixed(1)}</span>
        </div>

        <div className="reader-settings-row">
          <label className="reader-settings-label" htmlFor="reader-para-spacing">
            段间距
          </label>
          <input
            id="reader-para-spacing"
            className="reader-settings-range"
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={readerParaSpacing}
            onChange={(e) => setReaderParaSpacing(parseFloat(e.target.value))}
          />
          <span className="reader-settings-value">{readerParaSpacing.toFixed(1)}em</span>
        </div>

        <div className="reader-settings-row stacked">
          <span className="reader-settings-label">主题</span>
          <div className="reader-settings-options">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`reader-settings-option${readerTheme === opt.value ? ' active' : ''}`}
                onClick={() => setReaderTheme(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="reader-settings-row stacked">
          <span className="reader-settings-label">字体</span>
          <div className="reader-settings-options">
            {FONT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`reader-settings-option${readerFontFamily === opt.value ? ' active' : ''}`}
                onClick={() => setReaderFontFamily(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReaderSettingsPanel;
