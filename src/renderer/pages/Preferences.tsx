import React, { useEffect, useState } from 'react';
import { useAppSettingsStore } from '../store/appSettings';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

interface UpdateInfo {
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
}

const Preferences: React.FC = () => {
  const { autoSyncOnLaunch, showSplash, setAutoSyncOnLaunch, setShowSplash, reset } = useAppSettingsStore();
  const [version, setVersion] = useState<string>('');
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.cigeAPI && typeof window.cigeAPI.getAppVersion === 'function') {
      window.cigeAPI.getAppVersion().then((v) => setVersion(v as string));
    } else {
      setVersion('dev');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.cigeAPI || typeof window.cigeAPI.onUpdateStatus !== 'function') {
      return;
    }
    const removeListener = window.cigeAPI.onUpdateStatus((eventStatus: string, payload?: unknown) => {
      switch (eventStatus) {
        case 'checking':
          setStatus('checking');
          setErrorMsg('');
          break;
        case 'available':
          setStatus('available');
          setUpdateInfo(payload as UpdateInfo);
          break;
        case 'not-available':
          setStatus('not-available');
          break;
        case 'progress': {
          const p = payload as { percent?: number } | undefined;
          setStatus('downloading');
          setProgress(p?.percent ?? 0);
          break;
        }
        case 'downloaded':
          setStatus('downloaded');
          setUpdateInfo(payload as UpdateInfo);
          break;
        case 'error':
          setStatus('error');
          setErrorMsg(String(payload || '检查更新失败'));
          break;
      }
    });
    return removeListener;
  }, []);

  const handleCheck = async () => {
    setStatus('checking');
    setErrorMsg('');
    try {
      const result = await window.cigeAPI.checkForUpdate();
      if ((result as { skipped?: boolean }).skipped) {
        setStatus('not-available');
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDownload = async () => {
    setStatus('downloading');
    try {
      await window.cigeAPI.downloadUpdate();
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleInstall = () => {
    window.cigeAPI.installUpdate();
  };

  const statusText: Record<UpdateStatus, string> = {
    idle: '',
    checking: '正在检查更新...',
    available: `发现新版本：${updateInfo?.version || ''}`,
    'not-available': '当前已是最新版本',
    downloading: `正在下载更新... ${progress.toFixed(0)}%`,
    downloaded: '更新已下载，重启后安装',
    error: errorMsg || '检查更新失败',
  };

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
          <h3 className="preferences-section-title">版本与更新</h3>
          <div className="preferences-card version-card">
            <div className="version-logo">词歌</div>
            <div className="version-info">
              <div className="version-name">词歌 CiGe</div>
              <div className="version-desc">词作者创作辅助应用</div>
              <div className="version-number">版本 {version || '-'}</div>
            </div>
          </div>

          <div className="preferences-card update-card">
            <div className="update-status-row">
              <span className={`update-status ${status === 'error' ? 'error' : ''}`}>
                {statusText[status] || '点击检查是否有新版本'}
              </span>
              {status === 'downloading' && (
                <div className="update-progress">
                  <div className="update-progress-bar" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
            <div className="update-actions">
              {status === 'idle' || status === 'not-available' || status === 'error' ? (
                <button className="btn btn-primary btn-sm" onClick={handleCheck} disabled={status === 'checking'}>
                  {status === 'checking' ? '检查中...' : '检查更新'}
                </button>
              ) : status === 'available' ? (
                <button className="btn btn-primary btn-sm" onClick={handleDownload}>
                  立即下载
                </button>
              ) : status === 'downloaded' ? (
                <button className="btn btn-primary btn-sm" onClick={handleInstall}>
                  重启并安装
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Preferences;
