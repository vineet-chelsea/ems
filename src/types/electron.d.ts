/**
 * Type definitions for Electron API exposed via preload script
 * These types ensure TypeScript knows about window.electronAPI
 */
declare global {
  interface Window {
    electronAPI?: {
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

export {};

