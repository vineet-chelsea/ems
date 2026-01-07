#!/usr/bin/env node
/**
 * Wrapper script to start Electron dev environment
 * This is used by PM2 to properly execute npm scripts on Windows
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Use npm.cmd on Windows, npm on Unix
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const child = spawn(npmCmd, ['run', 'dev:electron'], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true
});

child.on('error', (error) => {
  console.error('Failed to start Electron dev:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

// Handle termination signals
process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
});

