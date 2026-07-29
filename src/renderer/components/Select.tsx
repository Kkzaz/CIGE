import React, { useState, useRef, useEffect } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
  /** 触发按钮最小宽度，默认 96px */
  minWidth?: number;
  /** 占位文案（value 为空时显示） */
  placeholder?: string;
}

/**
 * 应用统一的下拉框组件，样式由 .insp-select 系列类定义。
 */
const Select: React.FC<SelectProps> = ({
  value,
  options,
  onChange,
  className = '',
  minWidth,
  placeholder,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find((o) => o.value === value)?.label
    || (value ? value : (placeholder ?? '请选择'));

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div
      className={`insp-select ${className}`}
      ref={containerRef}
      style={minWidth ? { minWidth } : undefined}
    >
      <button
        type="button"
        className={`insp-select-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span className="insp-select-text">{selectedLabel}</span>
        <svg
          className="insp-select-arrow"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="insp-select-menu">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`insp-select-item${opt.value === value ? ' active' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Select;
