import React, { useState, useMemo } from 'react';

function countSyllables(text: string): { total: number; chinese: number; english: number } {
  let chinese = 0;
  let english = 0;

  const segments = text.split(/([\u4e00-\u9fff]+|[a-zA-Z]+)/).filter(Boolean);

  for (const seg of segments) {
    if (/[\u4e00-\u9fff]/.test(seg)) {
      chinese += seg.length;
    } else if (/[a-zA-Z]/.test(seg)) {
      const vowels = seg.match(/[aeiouyAEIOUY]+/g);
      english += vowels ? vowels.length : Math.max(1, Math.ceil(seg.length / 3));
    }
  }

  return { total: chinese + english, chinese, english };
}

const SyllableAnalyzer: React.FC = () => {
  const [text, setText] = useState('');

  const result = useMemo(() => {
    if (!text.trim()) return null;

    const stats = countSyllables(text);
    const lines = text.split('\n').filter((l) => l.trim());
    const lineStats = lines.map((line, i) => ({
      index: i + 1,
      text: line.trim(),
      syllables: countSyllables(line.trim()).total,
    }));

    return { stats, lineStats, lineCount: lines.length };
  }, [text]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <textarea
        className="syllable-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="在此粘贴或输入歌词进行分析..."
      />

      {result && (
        <>
          {/* Stats panel */}
          <div className="syllable-stats">
            <div>
              <div className="syllable-stat-num">{result.stats.total}</div>
              <div className="syllable-stat-label">总音节</div>
            </div>
            <div>
              <div className="syllable-stat-num">{result.stats.chinese}</div>
              <div className="syllable-stat-label">中文字</div>
            </div>
            <div>
              <div className="syllable-stat-num">{result.lineCount}</div>
              <div className="syllable-stat-label">行数</div>
            </div>
          </div>

          {/* Line-by-line breakdown */}
          <div className="rhyme-result-card" style={{ padding: 12 }}>
            <div className="rhyme-final-label" style={{ marginBottom: 10 }}>
              逐行音节
            </div>
            <table className="syllable-table">
              <tbody>
                {result.lineStats.map((line) => (
                  <tr key={line.index}>
                    <td className="col-idx">{line.index}</td>
                    <td className="col-text">{line.text}</td>
                    <td className="col-count">{line.syllables}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default SyllableAnalyzer;
