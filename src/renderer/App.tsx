import React, { useState, useEffect, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import StatusBar from './components/StatusBar';
import SplashScreen from './components/SplashScreen';
import useStatusBarStore from './store/statusBar';
import { useAppSettingsStore } from './store/appSettings';

const Write = React.lazy(() => import('./pages/Write'));
const Excerpt = React.lazy(() => import('./pages/Excerpt'));
const Inspiration = React.lazy(() => import('./pages/Inspiration'));
const Library = React.lazy(() => import('./pages/Library'));
const ReaderPage = React.lazy(() => import('./pages/ReaderPage'));
const RecycleBin = React.lazy(() => import('./pages/RecycleBin'));
const Preferences = React.lazy(() => import('./pages/Preferences'));

const PageFallback: React.FC = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      color: 'var(--text-secondary)',
      fontSize: 14,
    }}
  >
    加载中…
  </div>
);

console.log('[CiGe App] App component loaded');

const PageWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div className="page-enter">{children}</div>;
};

const App: React.FC = () => {
  const { showSplash: showSplashSetting } = useAppSettingsStore();
  const [showSplash, setShowSplash] = useState(showSplashSetting);
  const location = useLocation();
  const { charCount, lineCount, rhymeFinals, verseCount, chorusCount, bridgeCount, outroCount, saveStatus } = useStatusBarStore();

  const showStatusBar = location.pathname === '/write';
  const isReader = location.pathname.startsWith('/reader/');

  useEffect(() => {
    console.log('[CiGe App] Location changed:', location.pathname);
  }, [location]);

  const handleSplashComplete = () => {
    console.log('[CiGe App] SplashScreen completed, showing main content');
    setShowSplash(false);
  };

  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  console.log('[CiGe App] Rendering main content');

  return (
    <div className={`app-container${isReader ? ' reader-active' : ''}`}>
      {!isReader && <div className="draggable-titlebar" />}
      <main className={`main-content${isReader ? ' main-content-reader' : ''}`}>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/write" replace />} />
            <Route
              path="/write"
              element={
                <PageWrapper key="write">
                  <Write />
                </PageWrapper>
              }
            />
            <Route
              path="/excerpt"
              element={
                <PageWrapper key="excerpt">
                  <Excerpt />
                </PageWrapper>
              }
            />
            <Route
              path="/inspiration"
              element={
                <PageWrapper key="inspiration">
                  <Inspiration />
                </PageWrapper>
              }
            />
            <Route
              path="/library"
              element={
                <PageWrapper key="library">
                  <Library />
                </PageWrapper>
              }
            />
            <Route
              path="/reader/:bookId"
              element={
                <PageWrapper key="reader">
                  <ReaderPage />
                </PageWrapper>
              }
            />
            <Route
              path="/recycle-bin"
              element={
                <PageWrapper key="recycle-bin">
                  <RecycleBin />
                </PageWrapper>
              }
            />
            <Route
              path="/preferences"
              element={
                <PageWrapper key="preferences">
                  <Preferences />
                </PageWrapper>
              }
            />
          </Routes>
        </Suspense>
      </main>
      {showStatusBar && (
        <StatusBar
          charCount={charCount}
          lineCount={lineCount}
          rhymeFinals={rhymeFinals}
          verseCount={verseCount}
          chorusCount={chorusCount}
          bridgeCount={bridgeCount}
          outroCount={outroCount}
          saveStatus={saveStatus}
        />
      )}
      {!isReader && <BottomNav />}
    </div>
  );
};

export default App;
