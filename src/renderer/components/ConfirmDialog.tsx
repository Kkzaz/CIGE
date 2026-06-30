import React from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ title, message, onConfirm, onCancel }) => {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title">{title}</div>
        <div className="confirm-message">{message}</div>
        <div className="confirm-actions">
          <button onClick={onCancel} className="btn btn-secondary btn-sm">
            取消
          </button>
          <button onClick={onConfirm} className="btn btn-danger btn-sm">
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
