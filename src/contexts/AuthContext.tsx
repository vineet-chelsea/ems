import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'sonner';

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
  login: (email: string, password: string) => boolean;
  logout: () => void;
  createUser: (email: string, password: string, role: UserRole, deviceIds: string[]) => boolean;
  updateUserDevices: (userId: string, deviceIds: string[]) => void;
  deleteUser: (userId: string) => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'energy_monitor_users';
const SESSION_KEY = 'energy_monitor_session';

// Initialize with default admin user
const DEFAULT_USERS = [
  {
    id: 'admin-1',
    email: 'admin@energy.local',
    password: 'admin123', // In production, this should be hashed
    role: 'admin' as UserRole,
    deviceIds: []
  }
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  // Load users from localStorage
  useEffect(() => {
    const storedUsers = localStorage.getItem(STORAGE_KEY);
    if (storedUsers) {
      setUsers(JSON.parse(storedUsers));
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_USERS));
      setUsers(DEFAULT_USERS);
    }

    // Restore session
    const session = localStorage.getItem(SESSION_KEY);
    if (session) {
      const sessionUser = JSON.parse(session);
      setUser(sessionUser);
    }
  }, []);

  const login = (email: string, password: string): boolean => {
    const storedUsers = localStorage.getItem(STORAGE_KEY);
    if (!storedUsers) return false;

    const userList = JSON.parse(storedUsers);
    const foundUser = userList.find(
      (u: any) => u.email === email && u.password === password
    );

    if (foundUser) {
      const userSession: User = {
        id: foundUser.id,
        email: foundUser.email,
        role: foundUser.role,
        deviceIds: foundUser.deviceIds
      };
      setUser(userSession);
      localStorage.setItem(SESSION_KEY, JSON.stringify(userSession));
      toast.success('Login successful');
      return true;
    }

    toast.error('Invalid email or password');
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
    toast.success('Logged out successfully');
  };

  const createUser = (email: string, password: string, role: UserRole, deviceIds: string[]): boolean => {
    if (!user || user.role !== 'admin') {
      toast.error('Only admins can create users');
      return false;
    }

    const storedUsers = localStorage.getItem(STORAGE_KEY);
    const userList = storedUsers ? JSON.parse(storedUsers) : [];

    // Check if user already exists
    if (userList.find((u: any) => u.email === email)) {
      toast.error('User with this email already exists');
      return false;
    }

    const newUser = {
      id: `user-${Date.now()}`,
      email,
      password,
      role,
      deviceIds
    };

    userList.push(newUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userList));
    setUsers(userList);
    toast.success('User created successfully');
    return true;
  };

  const updateUserDevices = (userId: string, deviceIds: string[]) => {
    if (!user || user.role !== 'admin') {
      toast.error('Only admins can update user permissions');
      return;
    }

    const storedUsers = localStorage.getItem(STORAGE_KEY);
    if (!storedUsers) return;

    const userList = JSON.parse(storedUsers);
    const updatedUsers = userList.map((u: any) =>
      u.id === userId ? { ...u, deviceIds } : u
    );

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUsers));
    setUsers(updatedUsers);
    toast.success('User permissions updated');
  };

  const deleteUser = (userId: string) => {
    if (!user || user.role !== 'admin') {
      toast.error('Only admins can delete users');
      return;
    }

    const storedUsers = localStorage.getItem(STORAGE_KEY);
    if (!storedUsers) return;

    const userList = JSON.parse(storedUsers);
    const updatedUsers = userList.filter((u: any) => u.id !== userId);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUsers));
    setUsers(updatedUsers);
    toast.success('User deleted successfully');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        users,
        login,
        logout,
        createUser,
        updateUserDevices,
        deleteUser,
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
