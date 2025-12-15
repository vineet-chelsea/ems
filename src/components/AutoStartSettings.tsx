import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

/**
 * AutoStartSettings Component
 * Allows users to enable/disable auto-launch on system startup
 */
export function AutoStartSettings() {
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (window.electronAPI) {
      // Get current auto-launch status
      window.electronAPI.getAutoLaunchEnabled().then(enabled => {
        setAutoLaunchEnabled(enabled);
        setLoading(false);
      }).catch(err => {
        console.error('Error getting auto-launch status:', err);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  /**
   * Toggle auto-launch setting
   */
  const handleToggle = async (enabled: boolean) => {
    if (window.electronAPI) {
      setLoading(true);
      try {
        const result = await window.electronAPI.setAutoLaunch(enabled);
        if (result.success) {
          setAutoLaunchEnabled(enabled);
          toast.success(
            enabled 
              ? 'Application will start automatically on system startup' 
              : 'Auto-start disabled'
          );
        } else {
          toast.error('Failed to update auto-start setting: ' + (result.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Error setting auto-launch:', error);
        toast.error('Failed to update auto-start setting');
      } finally {
        setLoading(false);
      }
    }
  };

  // Don't render if not running in Electron
  if (!window.electronAPI) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Startup Settings</CardTitle>
        <CardDescription>
          Control whether the application starts automatically when you log in
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto-start">Launch on System Startup</Label>
            <p className="text-sm text-muted-foreground">
              Automatically start the application when you log in to your computer
            </p>
          </div>
          <Switch
            id="auto-start"
            checked={autoLaunchEnabled}
            onCheckedChange={handleToggle}
            disabled={loading}
          />
        </div>
      </CardContent>
    </Card>
  );
}

