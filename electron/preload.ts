import { contextBridge, ipcRenderer } from 'electron';

/**
 * Expose protected methods that allow the renderer process to use
 * the ipcRenderer without exposing the entire object
 */
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  // quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  getAutoLaunchEnabled: () => ipcRenderer.invoke('get-auto-launch-enabled'),
  setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('set-auto-launch', enabled),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  // onUpdateStatus: (callback: (status: string) => void) => {
  //   ipcRenderer.on('update-status', (event, status) => callback(status));
  // },
  // onUpdateDownloaded: (callback: () => void) => {
  //   ipcRenderer.on('update-downloaded', () => callback());
  // },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

/**
 * Type definitions for TypeScript
 */
declare global {
  interface Window {
    electronAPI: {
      getAppVersion: () => Promise<string>;
      // checkForUpdates: () => Promise<any>;
      // quitAndInstall: () => Promise<void>;
      getAutoLaunchEnabled: () => Promise<boolean>;
      setAutoLaunch: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
      getAppPath: () => Promise<string>;
      // onUpdateStatus: (callback: (status: string) => void) => void;
      // onUpdateDownloaded: (callback: () => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}

