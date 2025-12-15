const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Get auth token from localStorage
function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

// Store auth token
export function setAuthToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

// Remove auth token
export function removeAuthToken(): void {
  localStorage.removeItem('auth_token');
}

export interface Device {
  id: string;
  name: string;
  type: string;
  ipAddress: string;
  subnetMask: string;
  slaveAddress: number;
  status: 'online' | 'offline' | 'connecting';
  lastSeen: string;
  includeInTotalSummary: boolean;
  parameterMappings?: Record<string, string>;
}

export interface DataPoint {
  id?: number;
  timestamp: string;
  VR?: number;
  VY?: number;
  VB?: number;
  V1?: number;
  V2?: number;
  V3?: number;
  V?: number;
  Vavg?: number;
  Vpeak?: number;
  IR?: number;
  IY?: number;
  IB?: number;
  I1?: number;
  I2?: number;
  I3?: number;
  I?: number;
  Iavg?: number;
  Ipeak?: number;
  P1?: number;
  P2?: number;
  P3?: number;
  Ptotal?: number;
  Q1?: number;
  Q2?: number;
  Q3?: number;
  Qtotal?: number;
  S1?: number;
  S2?: number;
  S3?: number;
  Stotal?: number;
  PF1?: number;
  PF2?: number;
  PF3?: number;
  PFavg?: number;
  PF?: number;
  frequency?: number;
  energy_active?: number;
  energy_reactive?: number;
  energy_apparent?: number;
  THD_V1?: number;
  THD_V2?: number;
  THD_V3?: number;
  THD_I1?: number;
  THD_I2?: number;
  THD_I3?: number;
  THD_V?: number;
  THD_I?: number;
  temperature?: number;
  humidity?: number;
}

class ApiService {
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const token = getAuthToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    // Add auth token if available
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      // Handle 401 (unauthorized) - token expired or invalid
      if (response.status === 401) {
        removeAuthToken();
        // Redirect to login if not already there
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
      }
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // Auth endpoints
  async login(email: string, password: string): Promise<{ token: string; user: any }> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    setAuthToken(data.token);
    return data;
  }

  async getCurrentUser(): Promise<any> {
    return this.request('/auth/me');
  }

  async register(email: string, password: string, role: 'admin' | 'user' = 'user'): Promise<any> {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, role }),
    });
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  // Recovery code endpoints
  async getRecoveryCode(): Promise<string> {
    try {
      const response = await this.request<{ recoveryCode: string }>('/auth/recovery-code');
      return response.recoveryCode;
    } catch (error: any) {
      // If 404, it means no recovery code exists - this is expected
      if (error.message?.includes('404') || error.message?.includes('No recovery code found')) {
        throw new Error('No recovery code found');
      }
      throw error;
    }
  }

  async generateRecoveryCode(): Promise<string> {
    const response = await this.request<{ recoveryCode: string }>('/auth/recovery-code/generate', {
      method: 'POST',
    });
    return response.recoveryCode;
  }

  async recoverPassword(email: string, recoveryCode: string, newPassword: string): Promise<void> {
    await this.request('/auth/recover-password', {
      method: 'POST',
      body: JSON.stringify({ email, recoveryCode, newPassword }),
    });
  }

  // User management endpoints (admin only)
  async getUsers(): Promise<any[]> {
    return this.request('/users');
  }

  async getUser(userId: string): Promise<any> {
    return this.request(`/users/${userId}`);
  }

  async updateUserPermissions(userId: string, deviceIds: string[]): Promise<void> {
    await this.request(`/users/${userId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ deviceIds }),
    });
  }

  async deleteUser(userId: string): Promise<void> {
    await this.request(`/users/${userId}`, {
      method: 'DELETE',
    });
  }

  async resetUserPassword(userId: string, newPassword: string): Promise<void> {
    await this.request(`/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    });
  }

  // Device endpoints
  async getDevices(): Promise<Device[]> {
    return this.request<Device[]>('/devices');
  }

  async getDevice(id: string): Promise<Device> {
    return this.request<Device>(`/devices/${id}`);
  }

  async createDevice(device: Omit<Device, 'lastSeen'> & { parameterMappings?: Record<string, string> }): Promise<Device> {
    return this.request<Device>('/devices', {
      method: 'POST',
      body: JSON.stringify(device),
    });
  }

  async updateDevice(id: string, updates: Partial<Device>): Promise<Device> {
    return this.request<Device>(`/devices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteDevice(id: string): Promise<void> {
    await this.request(`/devices/${id}`, {
      method: 'DELETE',
    });
  }

  async updateDeviceStatus(id: string, status: 'online' | 'offline' | 'connecting'): Promise<Device> {
    return this.request<Device>(`/devices/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // Data endpoints
  async getDeviceData(
    deviceId: string,
    options?: {
      startTime?: string;
      endTime?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ deviceId: string; count: number; data: DataPoint[] }> {
    const params = new URLSearchParams();
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());

    const query = params.toString();
    return this.request<{ deviceId: string; count: number; data: DataPoint[] }>(
      `/data/${deviceId}${query ? `?${query}` : ''}`
    );
  }

  async getLatestData(deviceId: string): Promise<DataPoint> {
    return this.request<DataPoint>(`/data/${deviceId}/latest`);
  }

  async insertDataPoint(deviceId: string, dataPoint: Partial<DataPoint>): Promise<{ id: number; timestamp: string }> {
    return this.request<{ id: number; timestamp: string }>(`/data/${deviceId}`, {
      method: 'POST',
      body: JSON.stringify(dataPoint),
    });
  }

  async getDeviceStats(
    deviceId: string,
    options?: { startTime?: string; endTime?: string }
  ): Promise<any> {
    const params = new URLSearchParams();
    if (options?.startTime) params.append('startTime', options.startTime);
    if (options?.endTime) params.append('endTime', options.endTime);

    const query = params.toString();
    return this.request(`/data/${deviceId}/stats${query ? `?${query}` : ''}`);
  }

  // Health check
  async healthCheck(): Promise<{ status: string; database: string }> {
    return this.request<{ status: string; database: string }>('/health');
  }

  // Device configuration endpoints
  async getDeviceConfig(deviceType: string): Promise<any> {
    return this.request(`/device-configs/${deviceType}`);
  }

  async getDeviceTypes(): Promise<{ deviceTypes: string[] }> {
    return this.request<{ deviceTypes: string[] }>('/device-configs');
  }

  // Test device connection
  async testDeviceConnection(ipAddress: string, slaveAddress: number = 1): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    pingSuccess: boolean;
    modbusSuccess: boolean;
  }> {
    return this.request('/devices/test-connection', {
      method: 'POST',
      body: JSON.stringify({ ipAddress, slaveAddress }),
    });
  }
}

export const api = new ApiService();

