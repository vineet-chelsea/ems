import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Zap, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const { login, recoverAdminPassword } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(email, password)) {
      navigate('/');
    }
  };

  const handleRecovery = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!recoveryCode || !newPassword) {
      toast.error('Please fill in all fields');
      return;
    }

    if (recoverAdminPassword(recoveryEmail, recoveryCode, newPassword)) {
      setIsRecoveryOpen(false);
      setRecoveryEmail('');
      setRecoveryCode('');
      setNewPassword('');
      toast.success('You can now login with your new password');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Zap className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Energy Monitor</CardTitle>
          <CardDescription>
            Enter your credentials to access the dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@energy.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full">
              Sign In
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Dialog open={isRecoveryOpen} onOpenChange={setIsRecoveryOpen}>
              <DialogTrigger asChild>
                <Button variant="link" className="text-sm">
                  Forgot Password?
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-primary" />
                    Admin Password Recovery
                  </DialogTitle>
                  <DialogDescription>
                    Enter your admin email and recovery code to reset your password
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleRecovery} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="recovery-email">Admin Email</Label>
                    <Input
                      id="recovery-email"
                      type="email"
                      placeholder="admin@energy.local"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recovery-code">Recovery Code</Label>
                    <Input
                      id="recovery-code"
                      type="text"
                      placeholder="XXXX-XXXX"
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                      required
                      maxLength={9}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter the 8-character recovery code
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password-recovery">New Password</Label>
                    <Input
                      id="new-password-recovery"
                      type="password"
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Recover Password
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="mt-4 p-3 bg-muted rounded-md text-sm">
            <p className="font-semibold mb-1">Default Admin Credentials:</p>
            <p className="text-muted-foreground">Email: admin@energy.local</p>
            <p className="text-muted-foreground">Password: admin123</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
