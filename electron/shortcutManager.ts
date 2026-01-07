import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as log from 'electron-log';

/**
 * Create desktop shortcut for Windows
 */
export async function createDesktopShortcut(): Promise<boolean> {
  if (process.platform !== 'win32') {
    log.info('Desktop shortcuts are only supported on Windows');
    return false;
  }

  try {
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    const exePath = isDev
      ? path.join(process.cwd(), 'node_modules', '.bin', 'electron.cmd')
      : app.getPath('exe');

    const desktopPath = path.join(require('os').homedir(), 'Desktop');
    const shortcutPath = path.join(desktopPath, 'Energy Monitoring System.lnk');

    // Check if shortcut already exists
    if (fs.existsSync(shortcutPath)) {
      log.info('Desktop shortcut already exists');
      return true;
    }

    // Use PowerShell to create shortcut
    const powershellScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("${shortcutPath.replace(/\\/g, '/')}")
$Shortcut.TargetPath = "${exePath.replace(/\\/g, '/')}"
$Shortcut.WorkingDirectory = "${path.dirname(exePath).replace(/\\/g, '/')}"
$Shortcut.Description = "Energy Monitoring System"
$Shortcut.IconLocation = "${isDev ? path.join(process.cwd(), 'public', 'favicon.ico').replace(/\\/g, '/') : path.join(process.resourcesPath, 'build', 'icon.ico').replace(/\\/g, '/')}"
$Shortcut.Save()
`;

    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    await execAsync(`powershell -Command "${powershellScript.replace(/"/g, '\\"')}"`);
    
    log.info('Desktop shortcut created successfully');
    return true;
  } catch (error: any) {
    log.error('Failed to create desktop shortcut:', error.message);
    return false;
  }
}

/**
 * Remove desktop shortcut
 */
export async function removeDesktopShortcut(): Promise<boolean> {
  if (process.platform !== 'win32') {
    return false;
  }

  try {
    const desktopPath = path.join(require('os').homedir(), 'Desktop');
    const shortcutPath = path.join(desktopPath, 'Energy Monitoring System.lnk');

    if (fs.existsSync(shortcutPath)) {
      fs.unlinkSync(shortcutPath);
      log.info('Desktop shortcut removed');
      return true;
    }
    return false;
  } catch (error: any) {
    log.error('Failed to remove desktop shortcut:', error.message);
    return false;
  }
}

