import React from 'react';

interface Book {
  id: number;
  title: string;
}

interface ImportProgress {
  bookId: number;
  status: string;
  completed: number;
  total: number;
  message?: string;
}

interface ImportManagerProps {
  books: Book[];
  progress: Map<number, ImportProgress>;
  onClose: () => void;
  onClear?: (bookId: number) => void;
}

const ImportManager: React.FC<ImportManagerProps> = ({ books, progress, onClose, onClear }) => {
  const items = Array.from(progress.values()).sort((a, b) => b.bookId - a.bookId);

  const getTitle = (bookId: number) => {
    const book = books.find((b) => b.id === bookId);
    return book?.title || `书籍 #${bookId}`;
  };

  const statusText = (status: string) => {
    switch (status) {
      case 'running':
        return '下载中';
      case 'paused':
        return '已暂停';
      case 'completed':
        return '已完成';
      case 'cancelled':
        return '已取消';
      case 'error':
        return '失败';
      default:
        return status;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="import-manager" onClick={(e) => e.stopPropagation()}>
        <div className="import-manager-header">
          <h3 className="import-manager-title">下载管理</h3>
          <button className="import-manager-close" onClick={onClose}>×</button>
        </div>

        <div className="import-manager-body">
          {items.length === 0 ? (
            <div className="import-manager-empty">暂无进行中的下载任务</div>
          ) : (
            items.map((item) => {
              const percent = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0;
              return (
                <div key={item.bookId} className="import-manager-row">
                  <div className="import-manager-info">
                    <div className="import-manager-name" title={getTitle(item.bookId)}>
                      {getTitle(item.bookId)}
                    </div>
                    <div className="import-manager-meta">
                      <span className={`import-manager-status ${item.status}`}>{statusText(item.status)}</span>
                      <span className="import-manager-count">
                        {item.completed} / {item.total} 章
                      </span>
                    </div>
                  </div>

                  <div className="import-manager-progress">
                    <div className="import-manager-track">
                      <div
                        className="import-manager-bar"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="import-manager-percent">{percent}%</span>
                  </div>

                  <div className="import-manager-actions">
                    {item.status === 'running' && (
                      <button
                        className="import-manager-btn"
                        onClick={() => window.cigeAPI.pauseBookImport(item.bookId)}
                        title="暂停"
                      >
                        暂停
                      </button>
                    )}
                    {(item.status === 'paused' || item.status === 'cancelled' || item.status === 'error') && (
                      <button
                        className="import-manager-btn primary"
                        onClick={() => window.cigeAPI.resumeBookImport(item.bookId)}
                        title="继续"
                      >
                        继续
                      </button>
                    )}
                    {(item.status === 'running' || item.status === 'paused') && (
                      <button
                        className="import-manager-btn danger"
                        onClick={() => window.cigeAPI.cancelBookImport(item.bookId)}
                        title="取消"
                      >
                        取消
                      </button>
                    )}
                    {(item.status === 'completed' || item.status === 'cancelled' || item.status === 'error') && onClear && (
                      <button
                        className="import-manager-btn"
                        onClick={() => onClear(item.bookId)}
                        title="移除记录"
                      >
                        移除
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportManager;
