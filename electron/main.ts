import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as log from 'electron-log';
import AutoLaunch from 'auto-launch';
import { checkDocker, startDockerContainers, waitForBackend, stopDockerContainers } from './dockerManager.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Suppress harmless console errors (cache and autofill errors are harmless on Windows)
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const message = args.join(' ');
  // Filter out harmless errors
  if (
    message.includes('Unable to move the cache') ||
    message.includes('Unable to create cache') ||
    message.includes('Gpu Cache Creation failed') ||
    message.includes('disk_cache') ||
    message.includes('cache_util_win') ||
    message.includes('Autofill.enable') ||
    message.includes('Autofill.setAddresses') ||
    message.includes("'Autofill.enable' wasn't found") ||
    message.includes("'Autofill.setAddresses' wasn't found")
  ) {
    return; // Silently ignore
  }
  originalConsoleError.apply(console, args);
};

let mainWindow: BrowserWindow | null = null;
let autoLauncher: AutoLaunch | null = null;
// Check if in dev mode - app.isPackaged is safe to check at module load
const isDev = process.env.NODE_ENV === 'development' || (typeof app !== 'undefined' && !app.isPackaged);

/**
 * Creates the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    icon: isDev 
      ? path.join(__dirname, '../public/favicon.ico')
      : path.join(process.resourcesPath, 'build/icon.ico'),
    show: false,
    titleBarStyle: 'default',
  });

  // Suppress DevTools console errors (harmless autofill errors)
  mainWindow.webContents.on('console-message', (event, level, message) => {
    // Filter out harmless autofill errors from DevTools
    if (
      message.includes('Autofill.enable') ||
      message.includes('Autofill.setAddresses') ||
      message.includes("'Autofill.enable' wasn't found") ||
      message.includes("'Autofill.setAddresses' wasn't found")
    ) {
      return; // Silently ignore
    }
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:8080');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    
    // Check for updates after window is ready (commented for now)
    // if (!isDev) {
    //   autoUpdater.checkForUpdatesAndNotify();
    // }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// App event handlers
app.whenReady().then(async () => {
  // Configure logging now that app is ready
  try {
    if (log.transports?.file) {
      log.transports.file.level = 'info';
    }
    if (log.transports?.console) {
      log.transports.console.level = 'debug';
    }
  } catch (error) {
    console.error('Error configuring logging:', error);
  }

  // Initialize AutoLaunch AFTER app is ready
  autoLauncher = new AutoLaunch({
    name: 'Energy Monitoring System',
    path: app.getPath('exe'),
  });

  // Start Docker containers if not in dev mode
  if (!isDev) {
    log.info('Checking Docker...');
    const dockerAvailable = await checkDocker();
    
    if (dockerAvailable) {
      log.info('Docker is available, starting containers...');
      const started = await startDockerContainers();
      
      if (started) {
        log.info('Waiting for backend to be ready...');
        await waitForBackend();
      } else {
        log.warn('Failed to start Docker containers, continuing anyway...');
      }
    } else {
      log.warn('Docker is not available. Backend services may not be available.');
    }
  }
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  // Stop Docker containers when app closes (optional - you may want to keep them running)
  // Uncomment the following lines if you want to stop containers on app close
  // if (!isDev) {
  //   await stopDockerContainers();
  // }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Stop Docker containers on app quit
app.on('before-quit', async () => {
  // Optional: Stop containers on quit
  // if (!isDev) {
  //   await stopDockerContainers();
  // }
});

// Auto-updater configuration (commented for now - GitHub releases setup)
// autoUpdater.autoDownload = false;
// autoUpdater.autoInstallOnAppQuit = true;

// autoUpdater.on('checking-for-update', () => {
//   log.info('Checking for update...');
//   sendStatusToWindow('Checking for update...');
// });

// autoUpdater.on('update-available', (info) => {
//   log.info('Update available:', info.version);
//   sendStatusToWindow('Update available. Downloading...');
//   autoUpdater.downloadUpdate();
// });

// autoUpdater.on('update-not-available', (info) => {
//   log.info('Update not available.');
//   sendStatusToWindow('Update not available.');
// });

// autoUpdater.on('error', (err) => {
//   log.error('Error in auto-updater:', err);
//   sendStatusToWindow('Error in auto-updater: ' + err.message);
// });

// autoUpdater.on('download-progress', (progressObj) => {
//   let log_message = 'Download speed: ' + progressObj.bytesPerSecond;
//   log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
//   log_message = log_message + ' (' + progressObj.transferred + '/' + progressObj.total + ')';
//   log.info(log_message);
//   sendStatusToWindow(log_message);
// });

// autoUpdater.on('update-downloaded', (info) => {
//   log.info('Update downloaded');
//   sendStatusToWindow('Update downloaded. Will install on restart.');
//   
//   // Notify renderer process
//   if (mainWindow) {
//     mainWindow.webContents.send('update-downloaded');
//   }
// });

// function sendStatusToWindow(text: string) {
//   if (mainWindow) {
//     mainWindow.webContents.send('update-status', text);
//   }
// }

// IPC Handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Check for updates handler (commented for now)
// ipcMain.handle('check-for-updates', async () => {
//   if (!isDev) {
//     return autoUpdater.checkForUpdatesAndNotify();
//   }
//   return null;
// });

// Quit and install handler (commented for now)
// ipcMain.handle('quit-and-install', () => {
//   autoUpdater.quitAndInstall(false);
// });

ipcMain.handle('get-auto-launch-enabled', async () => {
  if (!autoLauncher) return false;
  return await autoLauncher.isEnabled();
});

ipcMain.handle('set-auto-launch', async (event, enabled: boolean) => {
  if (!autoLauncher) {
    return { success: false, error: 'Auto-launch not initialized' };
  }
  try {
    if (enabled) {
      await autoLauncher.enable();
      log.info('Auto-launch enabled');
    } else {
      await autoLauncher.disable();
      log.info('Auto-launch disabled');
    }
    return { success: true };
  } catch (error) {
    log.error('Error setting auto-launch:', error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('get-app-path', () => {
  return app.getPath('userData');
});

