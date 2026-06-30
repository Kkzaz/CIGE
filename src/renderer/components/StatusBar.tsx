import React from 'react';

interface StatusBarProps {
  charCount: number;
  lineCount: number;
  rhymeFinals: string[];
  verseCount: number;
  chorusCount: number;
  bridgeCount: number;
  outroCount: number;
  saveStatus: 'saved' | 'saving' | 'unsaved';
}

const StatusBar: React.FC<StatusBarProps> = ({
  charCount,
  lineCount,
  rhymeFinals,
  verseCount,
  chorusCount,
  bridgeCount,
  outroCount,
  saveStatus,
}) => {
  return (
    <div className="global-statusbar">
      <div className="ws-status-left">
        <span>{charCount} 字</span>
        <span className="ws-status-sep">|</span>
        <span>{lineCount} 行</span>
        <span className="ws-status-sep">|</span>
        <span>韵脚 {rhymeFinals.length} 种</span>
        <span className="ws-status-sep">|</span>
        <span>主歌 {verseCount}</span>
        <span>副歌 {chorusCount}</span>
        {bridgeCount > 0 && <span>桥段 {bridgeCount}</span>}
        {outroCount > 0 && <span>尾奏 {outroCount}</span>}
      </div>
      <div className="ws-status-right">
        <span className={`ws-status-dot ${saveStatus}`} />
        {saveStatus === 'saved' ? '已保存' : saveStatus === 'saving' ? '保存中' : '未保存'}
      </div>
    </div>
  );
};

export default StatusBar;
