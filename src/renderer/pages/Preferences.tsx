import React, { useEffect, useState } from 'react';
import { useAppSettingsStore } from '../store/appSettings';

const Preferences: React.FC = () => {
  const { autoSyncOnLaunch, showSplash, setAutoSyncOnLaunch, setShowSplash, reset } = useAppSettingsStore();
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.cigeAPI && typeof window.cigeAPI.getAppVersion === 'function') {
      window.cigeAPI.getAppVersion().then((v) => setVersion(v as string));
    } else {
      setVersion('dev');
    }
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <h2 className="page-title" style={{ fontFamily: 'var(--font-serif)' }}>
          偏好
        </h2>
      </div>

      <div className="preferences-layout">
        <div className="preferences-section">
          <h3 className="preferences-section-title">基础设置</h3>
          <div className="preferences-card">
            <label className="preference-row">
              <div className="preference-info">
                <span className="preference-label">启动时自动同步热点/金句</span>
                <span className="preference-desc">应用启动后自动从网络拉取抖音、小红书热榜及金句数据</span>
              </div>
              <span className={`preference-switch ${autoSyncOnLaunch ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={autoSyncOnLaunch}
                  onChange={(e) => setAutoSyncOnLaunch(e.target.checked)}
                />
                <span className="preference-switch-track">
                  <span className="preference-switch-thumb" />
                </span>
              </span>
            </label>

            <label className="preference-row">
              <div className="preference-info">
                <span className="preference-label">启动时显示开屏动画</span>
                <span className="preference-desc">每次打开应用时展示"词歌"开屏过渡动画</span>
              </div>
              <span className={`preference-switch ${showSplash ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={showSplash}
                  onChange={(e) => setShowSplash(e.target.checked)}
                />
                <span className="preference-switch-track">
                  <span className="preference-switch-thumb" />
                </span>
              </span>
            </label>
          </div>

          <button className="btn btn-secondary btn-sm preferences-reset" onClick={reset}>
            恢复默认设置
          </button>
        </div>

        <div className="preferences-section">
          <h3 className="preferences-section-title">版本介绍</h3>
          <div className="preferences-card version-card">
            <div className="version-logo">词歌</div>
            <div className="version-info">
              <div className="version-name">词歌 CiGe</div>
              <div className="version-desc">词作者创作辅助应用</div>
              <div className="version-number">版本 {version || '-'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Preferences;
