import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, RefreshCw, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { toast } from 'sonner';

/**
 * AutoUpdate Component
 * Handles application updates via electron-updater
 * GitHub releases functionality is commented out for now
 */
export function AutoUpdate() {
  const [updateStatus, setUpdateStatus] = useState<string>('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    if (window.electronAPI) {
      // Get app version
      window.electronAPI.getAppVersion().then(version => {
        setAppVersion(version);
      });

      // Listen for update status (commented for now - GitHub releases setup)
      // window.electronAPI.onUpdateStatus((status: string) => {
      //   setUpdateStatus(status);
      //   if (status.includes('Update available')) {
      //     setUpdateAvailable(true);
      //     toast.info('Update available! Downloading...');
      //   }
      // });

      // Listen for update downloaded (commented for now)
      // window.electronAPI.onUpdateDownloaded(() => {
      //   setUpdateAvailable(true);
      //   toast.success('Update downloaded! Click to restart and install.');
      // });

      // Check for updates on mount (commented for now)
      // checkForUpdates();

      return () => {
        // window.electronAPI.removeAllListeners('update-status');
        // window.electronAPI.removeAllListeners('update-downloaded');
      };
    }
  }, []);

  /**
   * Check for available updates
   * Currently commented out - uncomment when GitHub releases are configured
   */
  const checkForUpdates = () => {
    if (window.electronAPI) {
      // window.electronAPI.checkForUpdates().catch(err => {
      //   console.error('Error checking for updates:', err);
      //   toast.error('Failed to check for updates');
      // });
      toast.info('Auto-update feature will be enabled after GitHub releases setup');
    }
  };

  /**
   * Restart application and install update
   * Currently commented out - uncomment when GitHub releases are configured
   */
  const handleRestartAndInstall = () => {
    if (window.electronAPI) {
      // window.electronAPI.quitAndInstall();
    }
  };

  // Don't render if not running in Electron
  if (!window.electronAPI) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Application Updates</CardTitle>
        <CardDescription>
          Current version: {appVersion || 'Loading...'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info alert about GitHub releases setup */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Auto-Update Setup</AlertTitle>
          <AlertDescription>
            Auto-update functionality is currently disabled. To enable:
            <ol className="list-decimal list-inside mt-2 space-y-1 text-sm">
              <li>Configure GitHub releases in package.json build.publish section</li>
              <li>Uncomment auto-updater code in electron/main.ts</li>
              <li>Uncomment update handlers in electron/preload.ts</li>
              <li>Uncomment update methods in this component</li>
            </ol>
          </AlertDescription>
        </Alert>

        {/* Update status display (commented for now) */}
        {/* {updateStatus && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Update Status</AlertTitle>
            <AlertDescription>{updateStatus}</AlertDescription>
          </Alert>
        )} */}

        {/* Update available alert (commented for now) */}
        {/* {updateAvailable && (
          <Alert className="border-green-500">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertTitle>Update Ready</AlertTitle>
            <AlertDescription>
              A new version has been downloaded. Restart the application to install it.
            </AlertDescription>
          </Alert>
        )} */}

        <div className="flex gap-2">
          <Button onClick={checkForUpdates} variant="outline" disabled>
            <RefreshCw className="w-4 h-4 mr-2" />
            Check for Updates
          </Button>
          {/* {updateAvailable && (
            <Button onClick={handleRestartAndInstall} className="bg-green-600 hover:bg-green-700">
              <Download className="w-4 h-4 mr-2" />
              Restart & Install Update
            </Button>
          )} */}
        </div>
      </CardContent>
    </Card>
  );
}

