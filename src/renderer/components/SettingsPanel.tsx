import React from 'react';
import { useEditorSettingsStore, fontOptions } from '../store/editorSettings';

interface SettingsPanelProps {
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const {
    fontSize,
    lineHeight,
    textAlign,
    showLineNumbers,
    fontFamily,
    setFontSize,
    setLineHeight,
    setTextAlign,
    setShowLineNumbers,
    setFontFamily,
    reset,
  } = useEditorSettingsStore();

  return (
    <div className="settings-panel-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h3 className="settings-title">编辑器设置</h3>
          <button className="settings-close-btn" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="settings-content">
          <div className="settings-section">
            <label className="settings-label">字体</label>
            <div className="settings-font-buttons">
              {fontOptions.map((font) => (
                <button
                  key={font.value}
                  className={`settings-font-btn ${fontFamily === font.value ? 'active' : ''}`}
                  onClick={() => setFontFamily(font.value)}
                  title={font.label}
                >
                  <span className={`settings-font-preview ${font.value}`}>{font.preview}</span>
                  <span className="settings-font-label">{font.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="settings-section">
            <label className="settings-label">字体大小</label>
            <div className="settings-slider-row">
              <input
                type="range"
                min="12"
                max="24"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="settings-slider"
              />
              <span className="settings-value">{fontSize}px</span>
            </div>
          </div>

          <div className="settings-section">
            <label className="settings-label">行高</label>
            <div className="settings-slider-row">
              <input
                type="range"
                min="1.4"
                max="2.4"
                step="0.1"
                value={lineHeight}
                onChange={(e) => setLineHeight(Number(e.target.value))}
                className="settings-slider"
              />
              <span className="settings-value">{lineHeight}</span>
            </div>
          </div>

          <div className="settings-section">
            <label className="settings-label">对齐方式</label>
            <div className="settings-align-buttons">
              <button
                className={`settings-align-btn ${textAlign === 'left' ? 'active' : ''}`}
                onClick={() => setTextAlign('left')}
                title="左对齐"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4H14M2 8H11M2 12H13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </button>
              <button
                className={`settings-align-btn ${textAlign === 'center' ? 'active' : ''}`}
                onClick={() => setTextAlign('center')}
                title="居中"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4H12M3 8H13M5 12H11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </button>
              <button
                className={`settings-align-btn ${textAlign === 'right' ? 'active' : ''}`}
                onClick={() => setTextAlign('right')}
                title="右对齐"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4H14M5 8H14M3 12H14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          <div className="settings-section">
            <label className="settings-checkbox-label">
              <input
                type="checkbox"
                checked={showLineNumbers}
                onChange={(e) => setShowLineNumbers(e.target.checked)}
                className="settings-checkbox"
              />
              <span>显示行号</span>
            </label>
          </div>
        </div>

        <div className="settings-footer">
          <button className="settings-reset-btn" onClick={reset}>
            恢复默认
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;