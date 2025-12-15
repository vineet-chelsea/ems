import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { api, setAuthToken, removeAuthToken } from '../services/api';

export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  deviceIds: string[];
}

interface AuthContextType {
  user: User | null;
  users: User[];
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  createUser: (email: string, password: string, role: UserRole, deviceIds: string[]) => Promise<boolean>;
  updateUserDevices: (userId: string, deviceIds: string[]) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  adminResetPassword: (userId: string, newPassword: string) => Promise<boolean>;
  recoverAdminPassword: (email: string, recoveryCode: string, newPassword: string) => Promise<boolean>;
  getRecoveryCode: () => Promise<string | null>;
  regenerateRecoveryCode: () => Promise<string>;
  removeDeviceFromUsers: (deviceId: string) => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = 'energy_monitor_session';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (token) {
          // Verify token and get user info
          const userData = await api.getCurrentUser();
          setUser({
            id: userData.id,
            email: userData.email,
            role: userData.role,
            deviceIds: userData.deviceIds || [],
          });
          
          // Load users list if admin
          if (userData.role === 'admin') {
            await loadUsers();
          }
        }
      } catch (error) {
        // Token invalid or expired
        removeAuthToken();
        localStorage.removeItem(SESSION_KEY);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const loadUsers = async () => {
    try {
      const usersList = await api.getUsers();
      setUsers(usersList);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await api.login(email, password);
      const userSession: User = {
        id: response.user.id,
        email: response.user.email,
        role: response.user.role,
        deviceIds: response.user.deviceIds || [],
      };
      setUser(userSession);
      localStorage.setItem(SESSION_KEY, JSON.stringify(userSession));
      
      // Load users list if admin
      if (userSession.role === 'admin') {
        await loadUsers();
      }
      
      toast.success('Login successful');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Login failed');
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setUsers([]);
    removeAuthToken();
    localStorage.removeItem(SESSION_KEY);
    toast.success('Logged out successfully');
  };

  const createUser = async (email: string, password: string, role: UserRole, deviceIds: string[]): Promise<boolean> => {
    if (!user || user.role !== 'admin') {
      toast.error('Only admins can create users');
      return false;
    }

    try {
      const newUser = await api.register(email, password, role);
      
      // Set device permissions if provided
      if (deviceIds.length > 0) {
        await api.updateUserPermissions(newUser.id, deviceIds);
      }
      
      await loadUsers();
      toast.success('User created successfully');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to create user');
      return false;
    }
  };

  const updateUserDevices = async (userId: string, deviceIds: string[]) => {
    if (!user || user.role !== 'admin') {
      toast.error('Only admins can update user permissions');
      return;
    }

    try {
      await api.updateUserPermissions(userId, deviceIds);
      await loadUsers();
      
      // Update current user if it's the logged-in user
      if (user.id === userId) {
        const updatedUser = { ...user, deviceIds };
        setUser(updatedUser);
        localStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser));
      }
      
      toast.success('User permissions updated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update permissions');
    }
  };

  const deleteUser = async (userId: string) => {
    if (!user || user.role !== 'admin') {
      toast.error('Only admins can delete users');
      return;
    }

    try {
      await api.deleteUser(userId);
      await loadUsers();
      toast.success('User deleted successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete user');
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    if (!user) {
      toast.error('No user logged in');
      return false;
    }

    try {
      await api.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to change password');
      return false;
    }
  };

  const adminResetPassword = async (userId: string, newPassword: string): Promise<boolean> => {
    if (!user || user.role !== 'admin') {
      toast.error('Only admins can reset passwords');
      return false;
    }

    try {
      await api.resetUserPassword(userId, newPassword);
      toast.success('Password reset successfully');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to reset password');
      return false;
    }
  };

  // Recovery code functionality
  const recoverAdminPassword = async (email: string, recoveryCode: string, newPassword: string): Promise<boolean> => {
    try {
      await api.recoverPassword(email, recoveryCode.toUpperCase(), newPassword);
      toast.success('Password recovered successfully. Please login with your new password.');
      return true;
    } catch (error: any) {
      toast.error(error.message || 'Failed to recover password');
      return false;
    }
  };

  const getRecoveryCode = async (): Promise<string | null> => {
    try {
      const code = await api.getRecoveryCode();
      return code;
    } catch (error: any) {
      // Check for specific error messages
      if (error.message?.includes('No recovery code found') || error.message?.includes('404')) {
        // No recovery code exists yet - this is okay, user can generate one
        // Don't show error toast for this case
        return null;
      }
      // Only show error for unexpected errors
      if (!error.message?.includes('404')) {
        toast.error(error.message || 'Failed to get recovery code');
      }
      return null;
    }
  };

  const regenerateRecoveryCode = async (): Promise<string> => {
    try {
      const code = await api.generateRecoveryCode();
      toast.success('New recovery code generated. Save it in a secure location.');
      return code;
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate recovery code');
      return '';
    }
  };

  const removeDeviceFromUsers = async (deviceId: string) => {
    if (!user || user.role !== 'admin') {
      return;
    }

    try {
      // Update all users to remove this device from their permissions
      const usersToUpdate = users.filter(u => u.deviceIds.includes(deviceId));
      
      for (const u of usersToUpdate) {
        const updatedDeviceIds = u.deviceIds.filter(id => id !== deviceId);
        await api.updateUserPermissions(u.id, updatedDeviceIds);
      }
      
      await loadUsers();

      // Update current session if user's devices were affected
      if (user && user.deviceIds.includes(deviceId)) {
        const updatedUser = {
          ...user,
          deviceIds: user.deviceIds.filter(id => id !== deviceId)
        };
        setUser(updatedUser);
        localStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser));
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove device from users');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        users,
        loading,
        login,
        logout,
        createUser,
        updateUserDevices,
        deleteUser,
        changePassword,
        adminResetPassword,
        recoverAdminPassword,
        getRecoveryCode,
        regenerateRecoveryCode,
        removeDeviceFromUsers,
        isAdmin: user?.role === 'admin'
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
