import React, { useState, useMemo } from 'react';
import { findRhymes, getRhymeCategories, getRhymeGroup } from '../../shared/rhyme-data';

const RhymeSearch: React.FC = () => {
  const [keyword, setKeyword] = useState('');
  const [selectedFinal, setSelectedFinal] = useState('');
  const categories = useMemo(() => getRhymeCategories(), []);

  const results = useMemo(() => {
    if (selectedFinal) {
      const group = getRhymeGroup(selectedFinal);
      return group ? [{ final: group.final, characters: group.characters }] : [];
    }
    if (keyword && keyword.length > 0) {
      return findRhymes(keyword);
    }
    return [];
  }, [keyword, selectedFinal]);

  return (
    <div>
      {/* Search input */}
      <div style={{ marginBottom: 14 }}>
        <input
          className="excerpt-search-input"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setSelectedFinal('');
          }}
          placeholder="输入词语查找押韵..."
          style={{ width: '100%', marginBottom: 10 }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <span
            onClick={() => setSelectedFinal('')}
            className={`rhyme-cat-tag${!selectedFinal ? ' active' : ''}`}
          >
            全部
          </span>
          {categories.map((final) => (
            <span
              key={final}
              onClick={() => {
                setSelectedFinal(final);
                setKeyword('');
              }}
              className={`rhyme-cat-tag${selectedFinal === final ? ' active' : ''}`}
            >
              {final}
            </span>
          ))}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {results.map((group) => (
            <div key={group.final} className="rhyme-result-card">
              <div className="rhyme-final-label">韵母: {group.final}</div>
              <div className="rhyme-char-grid">
                {group.characters.map((char) => (
                  <span key={char} className="rhyme-char-item" title={`韵母: ${group.final}`}>
                    {char}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {keyword && results.length === 0 && (
        <div className="empty-state" style={{ height: 160 }}>
          <span style={{ fontFamily: 'var(--font-serif)' }}>
            未找到与"{keyword}"押韵的字
          </span>
        </div>
      )}
    </div>
  );
};

export default RhymeSearch;
