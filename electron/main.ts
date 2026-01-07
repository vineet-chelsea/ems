import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as log from 'electron-log';
import AutoLaunch from 'auto-launch';
import { spawn, execSync, exec } from 'child_process';
import { checkDocker, startDockerContainers, waitForBackend, stopDockerContainers } from './dockerManager.js';
import { createDesktopShortcut } from './shortcutManager.js';
import * as fs from 'fs';

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

// Safe logging wrapper
function safeLog(level: 'info' | 'warn' | 'error', message: string, ...args: any[]) {
  try {
    if (log && typeof log[level] === 'function') {
      log[level](message, ...args);
    } else {
      console[level === 'info' ? 'log' : level](message, ...args);
    }
  } catch (err) {
    console[level === 'info' ? 'log' : level](message, ...args);
  }
}

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
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, try multiple paths to find the dist folder
    // Path 1: Relative to dist-electron (when packaged in asar)
    const distPath1 = path.join(__dirname, '../dist/index.html');
    // Path 2: Using app.getAppPath() (app.asar root)
    const distPath2 = path.join(app.getAppPath(), 'dist', 'index.html');
    // Path 3: Using process.resourcesPath (unpacked resources)
    const distPath3 = path.join(process.resourcesPath, 'app', 'dist', 'index.html');
    // Path 4: Relative to app.asar (if dist is at root of asar)
    const distPath4 = path.join(app.getAppPath(), 'index.html');
    
    const pathsToTry = [distPath1, distPath2, distPath3, distPath4];
    let loadAttempted = false;
    
    const tryLoadPath = (index: number) => {
      if (index >= pathsToTry.length) {
        console.error('All paths failed. Tried:', pathsToTry);
        safeLog('error', 'Failed to load frontend from all paths');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show(); // Show window anyway
        }
        return;
      }
      
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }
      
      const currentPath = pathsToTry[index];
      safeLog('info', `Trying to load from: ${currentPath}`);
      
      mainWindow.loadFile(currentPath).catch((error) => {
        safeLog('warn', `Failed to load from ${currentPath}:`, error);
        tryLoadPath(index + 1); // Try next path
      });
    };
    
    tryLoadPath(0);
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    
    // Check for updates after window is ready (commented for now)
    // if (!isDev) {
    //   autoUpdater.checkForUpdatesAndNotify();
    // }
  });
  
  // Also show window if it loads successfully
  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  
  // Handle load errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
    // Try to show window anyway
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
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

  // Create desktop shortcut if it doesn't exist
  if (!isDev) {
    try {
      await createDesktopShortcut();
    } catch (error: any) {
      safeLog('warn', 'Could not create desktop shortcut:', error);
    }
  }

  // Enable auto-launch by default (if not already enabled)
  if (!isDev && autoLauncher) {
    try {
      const isEnabled = await autoLauncher.isEnabled();
      if (!isEnabled) {
        await autoLauncher.enable();
        safeLog('info', 'Auto-launch enabled on startup');
      } else {
        safeLog('info', 'Auto-launch already enabled');
      }
    } catch (error: any) {
      safeLog('warn', 'Could not enable auto-launch:', error);
    }
  }

  // Start backend services if not in dev mode
  // Note: Database is running on local PostgreSQL service (not Docker)
  if (!isDev) {
    safeLog('info', 'Starting backend services...');
    safeLog('info', 'Using local PostgreSQL service (not Docker)');
    safeLog('info', 'Database connection: localhost:5432/ems_db (user: ems_user)');
    
    // Start backend directly - it will connect to local PostgreSQL
    await startBackendDirectly();
  }
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Handle window close - but don't quit immediately on Windows
// This allows the app to stay running for auto-start functionality
app.on('window-all-closed', async () => {
  // On Windows, keep the app running (it will be in system tray or background)
  // User can quit explicitly from the app menu
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    app.quit();
  }
  // On Windows, we keep running - user can quit from app menu if needed
});

// Backend process handle for direct start
let backendProcess: any = null;

/**
 * Check if PostgreSQL service is running (Windows)
 */
async function checkPostgreSQLService(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      exec('Get-Service -Name "*postgresql*" -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Running" }', 
        { shell: 'powershell.exe' }, 
        (error: any, stdout: string) => {
          if (error || !stdout || stdout.trim().length === 0) {
            resolve(false);
          } else {
            resolve(true);
          }
        }
      );
    } catch (error) {
      resolve(false); // Assume running if we can't check
    }
  });
}

/**
 * Start backend directly (without Docker)
 */
async function startBackendDirectly(): Promise<void> {
  try {
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    let backendPath = isDev
      ? path.join(process.cwd(), 'backend')
      : path.join(process.resourcesPath, 'backend');
    
    let backendIndexPath = path.join(backendPath, 'dist', 'index.js');
    
    // In production, check multiple possible locations
    if (!fs.existsSync(backendIndexPath) && !isDev) {
      // Try app.asar unpacked location
      const altPath1 = path.join(app.getAppPath(), '..', 'backend', 'dist', 'index.js');
      if (fs.existsSync(altPath1)) {
        backendIndexPath = altPath1;
        backendPath = path.dirname(path.dirname(altPath1));
        safeLog('info', `Using backend path: ${backendPath}`);
      } else {
        // Try resourcesPath directly
        const altPath2 = path.join(process.resourcesPath, 'backend', 'dist', 'index.js');
        if (fs.existsSync(altPath2)) {
          backendIndexPath = altPath2;
          backendPath = path.join(process.resourcesPath, 'backend');
          safeLog('info', `Using backend path: ${backendPath}`);
        }
      }
    }
    
    // Check if backend is built
    if (!fs.existsSync(backendIndexPath)) {
      safeLog('error', `Backend not found. Searched:`);
      safeLog('error', `  - ${path.join(backendPath, 'dist', 'index.js')}`);
      if (!isDev) {
        safeLog('error', `  - ${path.join(app.getAppPath(), '..', 'backend', 'dist', 'index.js')}`);
        safeLog('error', `  - ${path.join(process.resourcesPath, 'backend', 'dist', 'index.js')}`);
      }
      safeLog('error', 'Please ensure backend is built: cd backend && npm run build');
      safeLog('error', 'Then rebuild the Electron app: npm run build:win');
      return;
    }

    safeLog('info', 'Starting backend directly...');
    safeLog('info', `Backend path: ${backendPath}`);
    safeLog('info', `Backend index file: ${backendIndexPath}`);
    
    // Check if PostgreSQL service is running (non-blocking check)
    const pgRunning = await checkPostgreSQLService();
    if (!pgRunning) {
      safeLog('warn', '⚠ PostgreSQL service may not be running');
      safeLog('warn', '   Check Windows Services or start PostgreSQL manually');
      safeLog('warn', '   Backend will still attempt to connect (may take longer)');
    } else {
      safeLog('info', '✓ PostgreSQL service is running');
    }
    
    // Verify Node.js is available
    try {
      const nodeVersion = execSync('node --version', { encoding: 'utf-8' }).trim();
      safeLog('info', `Node.js version: ${nodeVersion}`);
    } catch (error) {
      safeLog('warn', 'Could not check Node.js version (this is non-critical)');
    }
    
    // Start backend process
    // Configure environment for local PostgreSQL connection
    safeLog('info', `Spawning backend process: node ${backendIndexPath}`);
    safeLog('info', 'Backend will connect to local PostgreSQL on localhost:5432');
    
    backendProcess = spawn('node', [backendIndexPath], {
      cwd: backendPath,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: '3001',
        // Ensure backend uses local PostgreSQL (these are already defaults, but explicit is better)
        DB_HOST: process.env.DB_HOST || 'localhost',
        DB_PORT: process.env.DB_PORT || '5432',
        DB_NAME: process.env.DB_NAME || 'ems_db',
        DB_USER: process.env.DB_USER || 'ems_user',
        DB_PASSWORD: process.env.DB_PASSWORD || 'ems_password',
      },
    });
    
    if (!backendProcess || !backendProcess.pid) {
      safeLog('error', 'Failed to spawn backend process - process object is null or has no PID');
      return;
    }
    
    safeLog('info', `Backend process spawned with PID: ${backendProcess.pid}`);

    backendProcess.stdout?.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      safeLog('info', `[Backend] ${message}`);
    });

    backendProcess.stderr?.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      safeLog('error', `[Backend] ${message}`);
    });

    backendProcess.on('error', (error: Error) => {
      safeLog('error', `Failed to start backend process: ${error.message}`);
      safeLog('error', `Error details: ${error.stack || 'No stack trace'}`);
      backendProcess = null;
    });

    backendProcess.on('exit', (code: number, signal: string | null) => {
      if (code !== null && code !== 0) {
        safeLog('error', `Backend process exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`);
        safeLog('error', 'This usually means:');
        safeLog('error', '  1. PostgreSQL service is not running (check Windows Services)');
        safeLog('error', '  2. Database connection failed (wrong credentials or database does not exist)');
        safeLog('error', '  3. Backend encountered a fatal error during startup');
        safeLog('error', '  4. Missing dependencies or configuration');
        safeLog('error', '');
        safeLog('error', 'Troubleshooting:');
        safeLog('error', '  - Check if PostgreSQL service is running: Get-Service -Name "*postgresql*"');
        safeLog('error', '  - Verify database exists: psql -U postgres -c "\\l" | findstr ems_db');
        safeLog('error', '  - Verify user exists: psql -U postgres -c "\\du" | findstr ems_user');
        safeLog('error', '  - Check backend logs above for detailed error messages');
        
        // Try to show a user-friendly error in the main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-error', {
            message: 'Backend failed to start. Check console for details.',
            code,
            signal
          });
        }
      } else {
        safeLog('warn', `Backend process exited${signal ? ` (signal: ${signal})` : ''}`);
      }
      backendProcess = null;
    });

    // Wait for backend to be ready (give it more time since it needs to connect to database)
    safeLog('info', 'Waiting for backend to be ready (this may take up to 45 seconds if database is starting)...');
    const backendReady = await waitForBackend(60, 2000); // 60 attempts, 2 second delay = up to 2 minutes
    if (backendReady) {
      safeLog('info', '✓ Backend is ready and accepting connections');
    } else {
      safeLog('error', '✗ Backend did not become ready. Check backend logs for errors.');
      safeLog('error', 'Common issues:');
      safeLog('error', '  1. PostgreSQL is not running (start Docker containers or local PostgreSQL)');
      safeLog('error', '  2. Database credentials are incorrect');
      safeLog('error', '  3. Database does not exist');
    }
  } catch (error: any) {
    safeLog('error', 'Error starting backend directly:', error);
  }
}

// Stop Docker containers on app quit
app.on('before-quit', async () => {
  // Stop backend process if running directly
  if (backendProcess) {
    safeLog('info', 'Stopping backend process...');
    backendProcess.kill();
    backendProcess = null;
  }
  
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
      safeLog('info', 'Auto-launch enabled');
    } else {
      await autoLauncher.disable();
      safeLog('info', 'Auto-launch disabled');
    }
    return { success: true };
  } catch (error: any) {
    safeLog('error', 'Error setting auto-launch:', error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('get-app-path', () => {
  return app.getPath('userData');
});

