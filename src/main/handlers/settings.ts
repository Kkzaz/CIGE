import { ipcMain } from 'electron';
import { getAppSettings, setAppSetting, resetAppSettings, type AppSettings } from '../settings';

export function registerSettingsHandlers(): void {
  ipcMain.handle('app:get-settings', () => getAppSettings());
  // 预加载脚本通过同步方式获取初始设置，避免渲染进程启动时 localStorage 与主进程 JSON 不同步
  ipcMain.on('app:get-settings-sync', (event) => {
    event.returnValue = getAppSettings();
  });
  ipcMain.handle('app:set-setting', (_event, key: keyof AppSettings, value: AppSettings[keyof AppSettings]) => {
    setAppSetting(key, value);
    return true;
  });
  ipcMain.handle('app:reset-settings', () => {
    resetAppSettings();
    return getAppSettings();
  });
}
