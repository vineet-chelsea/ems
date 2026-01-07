import { exec, spawn } from 'child_process';
import * as path from 'path';
import * as log from 'electron-log';
import { app } from 'electron';
import * as fs from 'fs';

// Safe logging wrapper
function safeLog(level: 'info' | 'warn' | 'error', message: string, ...args: any[]) {
  try {
    if (log && typeof log[level] === 'function') {
      log[level](message, ...args);
    } else {
      console[level === 'info' ? 'log' : level](message, ...args);
    }
  } catch (err) {
    console[level === 'info' ? 'log' : level](message, ...args);
  }
}

/**
 * Get the path to docker-compose.yml
 * Must be called after app is ready (or use process.cwd() in dev mode)
 */
function getDockerComposePath(): string {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  
  if (isDev) {
    // In dev mode, use process.cwd() which is safe to call at any time
    return path.join(process.cwd(), 'docker-compose.yml');
  } else {
    // In production, app should be ready by the time this is called
    return path.join(process.resourcesPath, 'docker-compose.yml');
  }
}

/**
 * Check if Docker is installed and running
 */
export async function checkDocker(): Promise<boolean> {
  return new Promise((resolve) => {
    exec('docker --version', (error) => {
      if (error) {
        safeLog('error', 'Docker is not installed or not in PATH');
        resolve(false);
      } else {
        exec('docker info', (error) => {
          if (error) {
            safeLog('error', 'Docker daemon is not running');
            resolve(false);
          } else {
            resolve(true);
          }
        });
      }
    });
  });
}

/**
 * Start Docker containers
 */
export async function startDockerContainers(): Promise<boolean> {
  try {
    const dockerComposePath = getDockerComposePath();
    
    if (!fs.existsSync(dockerComposePath)) {
      safeLog('error', `Docker compose file not found at: ${dockerComposePath}`);
      return false;
    }

    const dockerComposeDir = path.dirname(dockerComposePath);
    
    return new Promise((resolve) => {
      safeLog('info', 'Starting Docker containers...');
      
      const dockerCompose = spawn('docker-compose', ['up', '-d'], {
        cwd: dockerComposeDir,
        shell: true,
      });

      let output = '';
      let errorOutput = '';

      dockerCompose.stdout?.on('data', (data) => {
        output += data.toString();
        safeLog('info', data.toString());
      });

      dockerCompose.stderr?.on('data', (data) => {
        errorOutput += data.toString();
        safeLog('error', data.toString());
      });

      dockerCompose.on('close', async (code) => {
        if (code === 0) {
          safeLog('info', 'Docker containers started successfully');
          // Wait a bit for containers to initialize
          safeLog('info', 'Waiting for containers to be ready...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          resolve(true);
        } else {
          safeLog('error', `Docker compose failed with code ${code}`);
          safeLog('error', `Error output: ${errorOutput}`);
          resolve(false);
        }
      });

      dockerCompose.on('error', (error) => {
        safeLog('error', `Failed to start docker-compose: ${error.message}`);
        resolve(false);
      });
    });
  } catch (error: any) {
    safeLog('error', 'Error starting Docker containers:', error);
    return false;
  }
}

/**
 * Stop Docker containers
 */
export async function stopDockerContainers(): Promise<boolean> {
  try {
    const dockerComposePath = getDockerComposePath();
    const dockerComposeDir = path.dirname(dockerComposePath);
    
    return new Promise((resolve) => {
      safeLog('info', 'Stopping Docker containers...');
      
      const dockerCompose = spawn('docker-compose', ['down'], {
        cwd: dockerComposeDir,
        shell: true,
      });

      dockerCompose.on('close', (code) => {
        if (code === 0) {
          safeLog('info', 'Docker containers stopped successfully');
          resolve(true);
        } else {
          safeLog('error', `Failed to stop Docker containers with code ${code}`);
          resolve(false);
        }
      });

      dockerCompose.on('error', (error) => {
        safeLog('error', `Failed to stop docker-compose: ${error.message}`);
        resolve(false);
      });
    });
  } catch (error: any) {
    safeLog('error', 'Error stopping Docker containers:', error);
    return false;
  }
}

/**
 * Check if backend API is healthy
 */
export async function checkBackendHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get('http://localhost:3001/health', (res: any) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    req.on('error', () => {
      resolve(false);
    });

    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Wait for backend to be ready
 */
export async function waitForBackend(maxAttempts = 30, delay = 1000): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const isHealthy = await checkBackendHealth();
    if (isHealthy) {
      safeLog('info', 'Backend API is ready');
      return true;
    }
    safeLog('info', `Waiting for backend... (${i + 1}/${maxAttempts})`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  safeLog('error', 'Backend API did not become ready in time');
  return false;
}

