import React, { useState, useMemo } from 'react';

interface Book {
  id: number;
  title: string;
  author: string;
  description: string;
  content: string;
  cover: string;
  category: string;
  tags: string;
  is_favorite: number;
  created_at: string;
  updated_at: string;
}

interface BookManagerProps {
  books: Book[];
  onClose: () => void;
  onRefresh: () => void;
  onToast: (message: string) => void;
}

const BookManager: React.FC<BookManagerProps> = ({ books, onClose, onRefresh, onToast }) => {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [editForm, setEditForm] = useState({ title: '', author: '', category: '', tags: '', content: '' });
  const [query, setQuery] = useState('');

  const filteredBooks = useMemo(() => {
    if (!query.trim()) return books;
    const q = query.trim().toLowerCase();
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q) ||
        b.tags.toLowerCase().includes(q)
    );
  }, [books, query]);

  const allSelected = filteredBooks.length > 0 && filteredBooks.every((b) => selectedIds.has(b.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      const next = new Set(selectedIds);
      filteredBooks.forEach((b) => next.delete(b.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filteredBooks.forEach((b) => next.add(b.id));
      setSelectedIds(next);
    }
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(`确定要删除选中的 ${selectedIds.size} 本书吗？此操作不可撤销。`);
    if (!confirmed) return;
    try {
      await window.cigeAPI.batchDeleteBooks(Array.from(selectedIds));
      setSelectedIds(new Set());
      onToast(`已删除 ${selectedIds.size} 本书`);
      onRefresh();
    } catch (err) {
      onToast('删除失败');
    }
  };

  const handleEdit = (book: Book) => {
    setEditingBook(book);
    setEditForm({
      title: book.title,
      author: book.author,
      category: book.category,
      tags: book.tags,
      content: book.content,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingBook) return;
    if (!editForm.title.trim() || !editForm.content.trim()) {
      onToast('书名和正文不能为空');
      return;
    }
    try {
      await window.cigeAPI.updateBook(editingBook.id, {
        title: editForm.title,
        author: editForm.author,
        category: editForm.category,
        tags: editForm.tags,
        content: editForm.content,
      });
      setEditingBook(null);
      onToast('已保存修改');
      onRefresh();
    } catch (err) {
      onToast('保存失败');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="book-manager" onClick={(e) => e.stopPropagation()}>
        <div className="book-manager-header">
          <h3 className="book-manager-title">书源管理</h3>
          <button className="book-manager-close" onClick={onClose}>×</button>
        </div>

        <div className="book-manager-toolbar">
          <div className="book-manager-search">
            <svg className="book-manager-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="book-manager-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索书名、作者、分类..."
            />
          </div>
          <div className="book-manager-actions">
            <span className="book-manager-count">已选 {selectedIds.size} 本</span>
            <button
              className="book-manager-btn danger"
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0}
            >
              批量删除
            </button>
          </div>
        </div>

        <div className="book-manager-body">
          <div className="book-manager-row head">
            <input
              type="checkbox"
              className="book-manager-checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
            />
            <span className="book-manager-col title">书名</span>
            <span className="book-manager-col author">作者</span>
            <span className="book-manager-col category">分类</span>
            <span className="book-manager-col actions">操作</span>
          </div>

          {filteredBooks.length === 0 ? (
            <div className="book-manager-empty">暂无书籍</div>
          ) : (
            filteredBooks.map((book) => (
              <div key={book.id} className="book-manager-row">
                <input
                  type="checkbox"
                  className="book-manager-checkbox"
                  checked={selectedIds.has(book.id)}
                  onChange={() => toggleSelect(book.id)}
                />
                <span className="book-manager-col title" title={book.title}>{book.title}</span>
                <span className="book-manager-col author" title={book.author}>{book.author || '-'}</span>
                <span className="book-manager-col category">{book.category}</span>
                <span className="book-manager-col actions">
                  <button className="book-manager-action" onClick={() => handleEdit(book)}>编辑</button>
                  <button
                    className="book-manager-action danger"
                    onClick={async () => {
                      if (!window.confirm(`确定删除《${book.title}》？`)) return;
                      try {
                        await window.cigeAPI.deleteBook(book.id);
                        onToast('已删除');
                        onRefresh();
                      } catch {
                        onToast('删除失败');
                      }
                    }}
                  >
                    删除
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {editingBook && (
        <div className="modal-overlay" onClick={() => setEditingBook(null)}>
          <div className="book-edit-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="book-edit-header">
              <h3 className="book-edit-title">编辑书籍</h3>
              <button className="book-edit-close" onClick={() => setEditingBook(null)}>×</button>
            </div>
            <div className="book-edit-body">
              <div className="book-edit-grid">
                <input
                  className="book-edit-input"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  placeholder="书名 *"
                />
                <input
                  className="book-edit-input"
                  value={editForm.author}
                  onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
                  placeholder="作者"
                />
                <input
                  className="book-edit-input"
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  placeholder="分类"
                />
                <input
                  className="book-edit-input"
                  value={editForm.tags}
                  onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                  placeholder="标签，用逗号分隔"
                />
              </div>
              <textarea
                className="book-edit-textarea"
                value={editForm.content}
                onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                placeholder="正文内容 *"
                rows={12}
              />
            </div>
            <div className="book-edit-footer">
              <button className="book-edit-btn secondary" onClick={() => setEditingBook(null)}>取消</button>
              <button className="book-edit-btn primary" onClick={handleSaveEdit}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookManager;
