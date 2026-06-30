import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const navItems = [
  { path: '/write', label: '写作' },
  { path: '/excerpt', label: '摘抄' },
  { path: '/inspiration', label: '灵感' },
  { path: '/library', label: '图书馆' },
  { path: '/recycle-bin', label: '回收站' },
  { path: '/preferences', label: '偏好' },
];

const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`nav-item${isActive ? ' active' : ''}`}
          >
            <span className="nav-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNav;
