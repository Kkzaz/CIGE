import React, { useState } from 'react';
import RhymeSearch from '../components/RhymeSearch';
import SyllableAnalyzer from '../components/SyllableAnalyzer';

const Rhyme: React.FC = () => {
  const [activeTool, setActiveTool] = useState<'rhyme' | 'syllable'>('rhyme');

  const tools = [
    { key: 'rhyme' as const, label: '押韵词典' },
    { key: 'syllable' as const, label: '音节分析' },
  ];

  return (
    <div className="page-container">
      <div className="rhyme-layout">
        {/* Tool selection sidebar */}
        <div className="rhyme-sidebar">
          <div style={{ marginBottom: 12 }}>
            <h2 className="page-title" style={{ fontFamily: 'var(--font-serif)', marginBottom: 0 }}>
              韵律工具
            </h2>
          </div>
          {tools.map((tool) => (
            <button
              key={tool.key}
              onClick={() => setActiveTool(tool.key)}
              className={`rhyme-tool-btn${activeTool === tool.key ? ' active' : ''}`}
            >
              {tool.label}
            </button>
          ))}
        </div>

        {/* Tool content */}
        <div className="rhyme-content" style={{ padding: 8 }}>
          {activeTool === 'rhyme' ? <RhymeSearch /> : <SyllableAnalyzer />}
        </div>
      </div>
    </div>
  );
};

export default Rhyme;
