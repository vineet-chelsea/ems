import { exec, spawn } from 'child_process';
import * as path from 'path';
import * as log from 'electron-log';
import { app } from 'electron';
import * as fs from 'fs';

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
        log.error('Docker is not installed or not in PATH');
        resolve(false);
      } else {
        exec('docker info', (error) => {
          if (error) {
            log.error('Docker daemon is not running');
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
      log.error(`Docker compose file not found at: ${dockerComposePath}`);
      return false;
    }

    const dockerComposeDir = path.dirname(dockerComposePath);
    
    return new Promise((resolve) => {
      log.info('Starting Docker containers...');
      
      const dockerCompose = spawn('docker-compose', ['up', '-d'], {
        cwd: dockerComposeDir,
        shell: true,
      });

      let output = '';
      let errorOutput = '';

      dockerCompose.stdout?.on('data', (data) => {
        output += data.toString();
        log.info(data.toString());
      });

      dockerCompose.stderr?.on('data', (data) => {
        errorOutput += data.toString();
        log.error(data.toString());
      });

      dockerCompose.on('close', (code) => {
        if (code === 0) {
          log.info('Docker containers started successfully');
          resolve(true);
        } else {
          log.error(`Docker compose failed with code ${code}`);
          log.error(`Error output: ${errorOutput}`);
          resolve(false);
        }
      });

      dockerCompose.on('error', (error) => {
        log.error(`Failed to start docker-compose: ${error.message}`);
        resolve(false);
      });
    });
  } catch (error) {
    log.error('Error starting Docker containers:', error);
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
      log.info('Stopping Docker containers...');
      
      const dockerCompose = spawn('docker-compose', ['down'], {
        cwd: dockerComposeDir,
        shell: true,
      });

      dockerCompose.on('close', (code) => {
        if (code === 0) {
          log.info('Docker containers stopped successfully');
          resolve(true);
        } else {
          log.error(`Failed to stop Docker containers with code ${code}`);
          resolve(false);
        }
      });

      dockerCompose.on('error', (error) => {
        log.error(`Failed to stop docker-compose: ${error.message}`);
        resolve(false);
      });
    });
  } catch (error) {
    log.error('Error stopping Docker containers:', error);
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
      log.info('Backend API is ready');
      return true;
    }
    log.info(`Waiting for backend... (${i + 1}/${maxAttempts})`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  log.error('Backend API did not become ready in time');
  return false;
}

