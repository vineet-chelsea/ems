import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { ShieldAlert, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export const AdminRecoveryDialog = () => {
  const { getRecoveryCode, regenerateRecoveryCode, isAdmin } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadRecoveryCode = async () => {
    setLoading(true);
    try {
      const code = await getRecoveryCode();
      setRecoveryCode(code);
    } catch (error) {
      // Error already handled in getRecoveryCode
      setRecoveryCode(null);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
  };

  // Load recovery code when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadRecoveryCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleCopy = () => {
    if (recoveryCode) {
      navigator.clipboard.writeText(recoveryCode);
      toast.success('Recovery code copied to clipboard');
    }
  };

  const handleRegenerate = async () => {
    setLoading(true);
    try {
      const newCode = await regenerateRecoveryCode();
      if (newCode) {
        setRecoveryCode(newCode);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" onClick={handleOpen}>
          <ShieldAlert className="h-4 w-4 mr-2" />
          View Recovery Code
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Admin Password Recovery Code</DialogTitle>
          <DialogDescription>
            Keep this code safe. Use it to recover your admin password if you forget it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <Card className="p-4 bg-muted">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-1">Your Recovery Code</p>
                {loading ? (
                  <p className="text-2xl font-mono font-bold tracking-wider text-muted-foreground">Loading...</p>
                ) : recoveryCode ? (
                  <p className="text-2xl font-mono font-bold tracking-wider">{recoveryCode}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No recovery code found. Generate one below.</p>
                )}
              </div>
              {recoveryCode && (
                <Button variant="ghost" size="icon" onClick={handleCopy}>
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>
          
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              <strong>Important:</strong> Store this code in a secure location. You'll need it to recover your password if you forget it.
            </p>
            <p className="text-sm text-muted-foreground">
              The recovery code can be used on the login page by clicking "Forgot Password?"
            </p>
          </div>

          <Button 
            variant="outline" 
            onClick={handleRegenerate} 
            className="w-full"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Generate New Recovery Code
          </Button>

          <p className="text-xs text-destructive">
            Warning: Generating a new code will invalidate the old one.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
