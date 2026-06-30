import { globalShortcut, BrowserWindow } from 'electron';

let floatingWindow: BrowserWindow | null = null;

export function registerGlobalShortcuts(mainWindow: BrowserWindow): void {
  // Cmd+Shift+C: open floating excerpt input
  globalShortcut.register('Command+Shift+C', () => {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      floatingWindow.focus();
      return;
    }

    floatingWindow = new BrowserWindow({
      width: 480,
      height: 320,
      alwaysOnTop: true,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      hasShadow: true,
      vibrancy: 'hud',
      visualEffectState: 'active',
      webPreferences: {
        preload: require('path').join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // In dev, load from vite; in prod, load from file
    const isDev = !require('electron').app.isPackaged;
    if (isDev) {
      floatingWindow.loadURL('http://localhost:5173/floating.html');
    } else {
      floatingWindow.loadFile(
        require('path').join(__dirname, '..', 'renderer', 'floating.html')
      );
    }

    floatingWindow.on('closed', () => {
      floatingWindow = null;
    });
  });
}

export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll();
}
