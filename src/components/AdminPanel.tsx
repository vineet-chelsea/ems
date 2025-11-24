import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { UserPlus, Trash2, Settings, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

interface AdminPanelProps {
  devices: Array<{ id: string; name: string }>;
}

export const AdminPanel = ({ devices }: AdminPanelProps) => {
  const { users, createUser, updateUserDevices, deleteUser, adminResetPassword, user } = useAuth();
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');

  const handleCreateUser = () => {
    if (newEmail && newPassword) {
      if (createUser(newEmail, newPassword, newRole, [])) {
        setNewEmail('');
        setNewPassword('');
        setNewRole('user');
        setIsCreateOpen(false);
      }
    }
  };

  const handleOpenDevicePermissions = (userId: string) => {
    const targetUser = users.find(u => u.id === userId);
    if (targetUser) {
      setSelectedUserId(userId);
      setSelectedDevices(targetUser.deviceIds || []);
    }
  };

  const handleSaveDevicePermissions = () => {
    if (selectedUserId) {
      updateUserDevices(selectedUserId, selectedDevices);
      setSelectedUserId(null);
    }
  };

  const toggleDevice = (deviceId: string) => {
    setSelectedDevices(prev =>
      prev.includes(deviceId)
        ? prev.filter(id => id !== deviceId)
        : [...prev, deviceId]
    );
  };

  const handleResetPassword = () => {
    if (!resetPasswordUserId || !resetPasswordValue) return;

    if (resetPasswordValue.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (adminResetPassword(resetPasswordUserId, resetPasswordValue)) {
      setResetPasswordUserId(null);
      setResetPasswordValue('');
    }
  };

  if (user?.role !== 'admin') {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
        <CardDescription>Create and manage user accounts and device permissions</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Create New User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>Add a new user to the system</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="new-email">Email</Label>
                  <Input
                    id="new-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="user@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-role">Role</Label>
                  <Select value={newRole} onValueChange={(value: 'admin' | 'user') => setNewRole(value)}>
                    <SelectTrigger id="new-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreateUser} className="w-full">
                  Create User
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Devices Access</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <span className={u.role === 'admin' ? 'text-primary font-medium' : ''}>
                    {u.role}
                  </span>
                </TableCell>
                <TableCell>
                  {u.role === 'admin' ? 'All devices' : `${u.deviceIds?.length || 0} devices`}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {u.role !== 'admin' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenDevicePermissions(u.id)}
                        title="Device Permissions"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setResetPasswordUserId(u.id)}
                      title="Reset Password"
                    >
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    {u.id !== user?.id && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteUser(u.id)}
                        title="Delete User"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Dialog open={!!selectedUserId} onOpenChange={() => setSelectedUserId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Device Permissions</DialogTitle>
              <DialogDescription>
                Select which devices this user can access
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {devices.map((device) => (
                <div key={device.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={device.id}
                    checked={selectedDevices.includes(device.id)}
                    onCheckedChange={() => toggleDevice(device.id)}
                  />
                  <label
                    htmlFor={device.id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {device.name}
                  </label>
                </div>
              ))}
              {devices.length === 0 && (
                <p className="text-sm text-muted-foreground">No devices available</p>
              )}
              <Button onClick={handleSaveDevicePermissions} className="w-full">
                Save Permissions
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!resetPasswordUserId} onOpenChange={() => setResetPasswordUserId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Set a new password for {users.find(u => u.id === resetPasswordUserId)?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="reset-password">New Password</Label>
                <Input
                  id="reset-password"
                  type="password"
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  placeholder="Enter new password"
                  minLength={6}
                />
                <p className="text-xs text-muted-foreground">
                  Password must be at least 6 characters
                </p>
              </div>
              <Button onClick={handleResetPassword} className="w-full">
                Reset Password
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
