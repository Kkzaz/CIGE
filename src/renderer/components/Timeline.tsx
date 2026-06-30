import React from 'react';
import type { Inspiration } from '../../shared/types';

interface TimelineProps {
  items: Inspiration[];
  onDelete: (id: number) => void;
  onDragStart: (content: string) => void;
  onRequestDelete: (item: Inspiration) => void;
}

const Timeline: React.FC<TimelineProps> = ({ items, onDelete, onDragStart, onRequestDelete }) => {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13 }}>
          暂无灵感碎片
        </span>
      </div>
    );
  }

  const grouped: Record<string, Inspiration[]> = {};
  items.forEach((item) => {
    const date = item.created_at.split(' ')[0];
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(item);
  });

  return (
    <div className="timeline-container">
      {Object.entries(grouped).map(([date, groupItems]) => (
        <div key={date} className="timeline-group">
          <div className="timeline-date">{date}</div>
          <div className="timeline-track">
            {groupItems.map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', item.content);
                  onDragStart(item.content);
                }}
                className="timeline-item"
              >
                <div className="timeline-dot" />
                <div className="timeline-content">{item.content}</div>
                <div className="timeline-footer">
                  <div className="timeline-tags">
                    {item.tags.split(',').map((t) => t.trim()).filter(Boolean).map((tag, i) => (
                      <span key={i} className="tag">{tag}</span>
                    ))}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDelete(item);
                    }}
                    className="btn btn-danger btn-sm"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Timeline;
