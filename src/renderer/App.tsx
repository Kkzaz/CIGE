import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import StatusBar from './components/StatusBar';
import SplashScreen from './components/SplashScreen';
import Write from './pages/Write';
import Excerpt from './pages/Excerpt';
import Inspiration from './pages/Inspiration';
import Library from './pages/Library';
import RecycleBin from './pages/RecycleBin';
import Preferences from './pages/Preferences';
import useStatusBarStore from './store/statusBar';
import { useAppSettingsStore } from './store/appSettings';

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
    <div className="app-container">
      <div className="draggable-titlebar" />
      <main className="main-content">
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
      <BottomNav />
    </div>
  );
};

export default App;
