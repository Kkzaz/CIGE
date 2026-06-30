import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles/global.css';

console.log('[CiGe] Renderer process starting...');

window.addEventListener('error', (event) => {
  console.error('[CiGe Global Error]', event.error, event.message, event.filename, event.lineno);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[CiGe Unhandled Promise Rejection]', event.reason);
});

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[CiGe Error Boundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, fontFamily: '-apple-system, sans-serif', color: '#333' }}>
          <h2>应用启动失败</h2>
          <p style={{ color: '#666' }}>错误信息: {this.state.error?.message}</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: 10, padding: '8px 16px', cursor: 'pointer' }}>
            刷新重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
