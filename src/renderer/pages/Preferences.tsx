import React, { useEffect, useState } from 'react';
import { useAppSettingsStore } from '../store/appSettings';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'macos-signature-error';

interface UpdateInfo {
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border-color)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
};

const Preferences: React.FC = () => {
  const { autoSyncOnLaunch, showSplash, setAutoSyncOnLaunch, setShowSplash, reset } = useAppSettingsStore();
  const [version, setVersion] = useState<string>('');
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // WebDAV 配置
  const [webdavUrl, setWebdavUrl] = useState('https://dav.jianguoyun.com/dav/');
  const [webdavUser, setWebdavUser] = useState('');
  const [webdavPass, setWebdavPass] = useState('');
  const [webdavEnabled, setWebdavEnabled] = useState(false);
  const [webdavTesting, setWebdavTesting] = useState(false);
  const [webdavMsg, setWebdavMsg] = useState('');
  const [webdavSyncing, setWebdavSyncing] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.cigeAPI && typeof window.cigeAPI.getAppVersion === 'function') {
      window.cigeAPI.getAppVersion().then((v) => setVersion(v as string));
    } else {
      setVersion('dev');
    }
    // 加载 WebDAV 配置
    if (typeof window !== 'undefined' && window.cigeAPI && typeof window.cigeAPI.getAppSettings === 'function') {
      window.cigeAPI.getAppSettings().then((settings) => {
        const wd = (settings as { webdav?: { url: string; username: string; password: string; enabled: boolean } }).webdav;
        if (wd) {
          setWebdavUrl(wd.url);
          setWebdavUser(wd.username);
          setWebdavPass(wd.password);
          setWebdavEnabled(wd.enabled);
        }
      }).catch(() => {});
    }
  }, []);

  const saveWebdav = (patch: Partial<{ url: string; username: string; password: string; enabled: boolean }>) => {
    window.cigeAPI?.setAppSetting?.('webdav', {
      url: patch.url ?? webdavUrl,
      username: patch.username ?? webdavUser,
      password: patch.password ?? webdavPass,
      enabled: patch.enabled ?? webdavEnabled,
    });
  };

  const handleTestWebDAV = async () => {
    saveWebdav({});
    setWebdavTesting(true);
    setWebdavMsg('正在测试连接...');
    try {
      const result = await window.cigeAPI?.testWebDAV?.();
      const r = result as { ok: boolean; message: string } | undefined;
      setWebdavMsg(r?.message || '测试失败');
    } catch (err) {
      setWebdavMsg('测试失败: ' + (err as Error).message);
    } finally {
      setWebdavTesting(false);
    }
  };

  const handleSyncWebDAV = async () => {
    setWebdavSyncing(true);
    setWebdavMsg('正在同步...');
    try {
      const result = await window.cigeAPI?.syncWebDAV?.();
      const r = result as { added: number; message: string } | undefined;
      setWebdavMsg(r?.message || '同步完成');
    } catch (err) {
      setWebdavMsg('同步失败: ' + (err as Error).message);
    } finally {
      setWebdavSyncing(false);
    }
  };

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
        case 'macos-signature-error':
          setStatus('macos-signature-error');
          setErrorMsg('当前应用未签名，macOS 自动更新受限');
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

  const handleInstall = () => {
    window.cigeAPI.installUpdate();
  };

  const handleOpenDownloadPage = () => {
    window.cigeAPI.openExternal('https://github.com/Kkzaz/CIGE/releases/latest');
  };

  const statusText: Record<UpdateStatus, string> = {
    idle: '',
    checking: '正在检查更新...',
    available: `发现新版本 ${updateInfo?.version || ''}，正在自动下载...`,
    'not-available': '当前已是最新版本',
    downloading: `正在下载更新... ${progress.toFixed(0)}%`,
    downloaded: '更新已下载，重启后安装',
    error: errorMsg || '检查更新失败',
    'macos-signature-error': errorMsg || 'macOS 自动更新需要应用签名',
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
          <h3 className="preferences-section-title">移动端云同步</h3>
          <div className="preferences-card">
            <div className="preference-row" style={{ alignItems: 'flex-start' }}>
              <div className="preference-info">
                <span className="preference-label">启用云同步（坚果云 WebDAV）</span>
                <span className="preference-desc">
                  配置坚果云账号后，手机端可随时随地记录灵感和旋律动机，通过云端同步到桌面端。
                  <a href="https://help.jianguoyun.com/?p=2064" target="_blank" rel="noopener" style={{ color: 'var(--accent-color)', marginLeft: 4 }}>如何获取应用密码？</a>
                </span>
              </div>
              <span className={`preference-switch ${webdavEnabled ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={webdavEnabled}
                  onChange={(e) => {
                    setWebdavEnabled(e.target.checked);
                    saveWebdav({ enabled: e.target.checked });
                  }}
                />
                <span className="preference-switch-track">
                  <span className="preference-switch-thumb" />
                </span>
              </span>
            </div>

            <div className="webdav-config" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                className="webdav-input"
                type="text"
                placeholder="坚果云账号（邮箱）"
                value={webdavUser}
                onChange={(e) => setWebdavUser(e.target.value)}
                onBlur={() => saveWebdav({ username: webdavUser })}
                style={inputStyle}
              />
              <input
                className="webdav-input"
                type="password"
                placeholder="应用密码（非登录密码）"
                value={webdavPass}
                onChange={(e) => setWebdavPass(e.target.value)}
                onBlur={() => saveWebdav({ password: webdavPass })}
                style={inputStyle}
              />
              <input
                className="webdav-input"
                type="text"
                placeholder="WebDAV 地址"
                value={webdavUrl}
                onChange={(e) => setWebdavUrl(e.target.value)}
                onBlur={() => saveWebdav({ url: webdavUrl })}
                style={inputStyle}
              />
            </div>

            {webdavMsg && (
              <div className="webdav-msg" style={{ marginTop: 8, fontSize: 13, color: webdavMsg.includes('失败') ? 'var(--danger-color)' : 'var(--text-secondary)' }}>
                {webdavMsg}
              </div>
            )}

            <div className="webdav-actions" style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleTestWebDAV}
                disabled={webdavTesting}
              >
                {webdavTesting ? '测试中...' : '测试连接'}
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSyncWebDAV}
                disabled={webdavSyncing || !webdavEnabled}
              >
                {webdavSyncing ? '同步中...' : '立即同步'}
              </button>
            </div>

            <div className="webdav-tip" style={{ marginTop: 10, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              配置完成后，手机访问 PWA 页面即可随时记录。桌面端启动时自动拉取云端新条目。
            </div>
          </div>
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
              {status === 'idle' || status === 'not-available' || status === 'error' || status === 'checking' ? (
                <button className="btn btn-primary btn-sm" onClick={handleCheck} disabled={status === 'checking'}>
                  {status === 'checking' ? '检查中...' : '检查更新'}
                </button>
              ) : status === 'available' || status === 'downloading' ? null : status === 'downloaded' ? (
                <button className="btn btn-primary btn-sm" onClick={handleInstall}>
                  重启并安装
                </button>
              ) : status === 'macos-signature-error' ? (
                <button className="btn btn-primary btn-sm" onClick={handleOpenDownloadPage}>
                  前往 GitHub 下载
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
