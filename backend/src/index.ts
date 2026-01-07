// Set timezone to IST (Indian Standard Time) for the entire application
// This must be done BEFORE any other imports that might use Date/time
process.env.TZ = 'Asia/Kolkata';

import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from './db/connection.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { deviceRoutes } from './routes/devices.js';
import { dataRoutes } from './routes/data.js';
import { eventRoutes } from './routes/events.js';
import { deviceConfigRoutes } from './routes/deviceConfigs.js';
import { patchRoutes } from './routes/patches.js';
import { initializeSchema } from './db/schema.js';
import { cleanupOrphanedTables } from './db/tableManager.js';
import { initializeKafkaProducer, disconnectKafkaProducer, isKafkaEnabled } from './services/kafka.js';
import { startDataCollection, stopDataCollection } from './services/dataCollector.js';
import { initializeTimescaleDB } from './db/connection.js';
import { startDataRetentionScheduler } from './services/dataRetention.js';

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3001;

// Function to kill process on port 3001 (Windows)
async function killProcessOnPort(port: number): Promise<void> {
  try {
    console.log(`Checking for processes on port ${port}...`);
    
    // Find process using the port (Windows)
    const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
    
    if (!stdout || stdout.trim().length === 0) {
      console.log(`No process found on port ${port}`);
      return;
    }
    
    // Parse the output to get PID
    // Format: TCP    0.0.0.0:3001    0.0.0.0:0    LISTENING    12345
    const lines = stdout.trim().split('\n');
    const pids = new Set<number>();
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const pid = parseInt(parts[parts.length - 1]);
        if (!isNaN(pid) && pid > 0) {
          pids.add(pid);
        }
      }
    }
    
    if (pids.size === 0) {
      console.log(`No valid PID found for port ${port}`);
      return;
    }
    
    // Kill each process
    for (const pid of pids) {
      try {
        console.log(`Killing process ${pid} on port ${port}...`);
        await execAsync(`taskkill /PID ${pid} /F`);
        console.log(`✓ Successfully killed process ${pid}`);
      } catch (error: any) {
        // Process might already be dead or access denied
        if (error.message?.includes('not found') || error.message?.includes('not running')) {
          console.log(`Process ${pid} already terminated`);
        } else {
          console.warn(`Failed to kill process ${pid}:`, error.message);
        }
      }
    }
    
    // Wait a moment for the port to be released
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log(`Port ${port} should now be available`);
  } catch (error: any) {
    // If netstat doesn't find anything, that's fine - port is free
    if (error.message?.includes('findstr') || error.code === 1) {
      console.log(`No process found on port ${port} (port is free)`);
    } else {
      console.warn(`Error checking port ${port}:`, error.message);
    }
  }
}

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Debug: Log all requests to /api/devices
app.use('/api/devices', (req, res, next) => {
  console.log(`[DEVICES ROUTER] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/device-configs', deviceConfigRoutes);
app.use('/api/patches', patchRoutes);

// Initialize database and cleanup orphaned tables on startup
async function initialize() {
  try {
    // Kill any process blocking port 3001 before starting
    await killProcessOnPort(Number(PORT));
    
    // Test database connection with retry logic
    // Increased retries and delay to handle PostgreSQL startup after system restart
    const { testConnection } = await import('./db/connection.js');
    await testConnection(15, 3000); // 15 retries, starting with 3 second delay (up to 45 seconds total)
    
    // Initialize TimescaleDB (if available)
    await initializeTimescaleDB();
    
    // Initialize database schema (create devices table if it doesn't exist)
    await initializeSchema();
    console.log('Database schema initialized');
    
    // Initialize Kafka producer if enabled
    if (isKafkaEnabled()) {
      await initializeKafkaProducer();
      console.log('Kafka producer initialized');
    }
    
    // Cleanup orphaned tables (tables without corresponding devices)
    // This is non-critical, so errors are logged but don't prevent startup
    await cleanupOrphanedTables();
    
    // Start data retention scheduler
    startDataRetentionScheduler();
    
    // Check GPU availability
    try {
      const { gpuProcessor } = await import('./services/gpuProcessor.js');
      const gpuStatus = await gpuProcessor.checkGPUAvailability();
      if (gpuStatus.gpu_available) {
        console.log('✓ GPU acceleration available:', gpuStatus);
      } else {
        console.log('ℹ GPU acceleration not available (CPU fallback will be used)');
      }
    } catch (error) {
      console.warn('Could not check GPU availability:', error);
    }
    
    // Start data collection service (uses configurable interval from performance.config.ts)
    startDataCollection();
    console.log('Data collection service started');
    
    // Load config for logging
    const { loadConfig } = await import('./config/performance.config.js');
    const perfConfig = loadConfig();
    
    app.listen(PORT, () => {
      console.log(`Backend API server running on port ${PORT}`);
      console.log(`Kafka: ${isKafkaEnabled() ? 'Enabled' : 'Disabled'}`);
      console.log(`Data Collection: Enabled (interval: ${perfConfig.sampling.defaultInterval}s)`);
    });
  } catch (error) {
    console.error('Failed to initialize:', error);
    process.exit(1);
  }
}

initialize();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await stopDataCollection();
  await disconnectKafkaProducer();
  // Wait a bit for any pending queries to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
  try {
    await db.end();
  } catch (error: any) {
    console.error('Error closing database pool:', error.message);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await stopDataCollection();
  await disconnectKafkaProducer();
  // Wait a bit for any pending queries to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
  try {
    await db.end();
  } catch (error: any) {
    console.error('Error closing database pool:', error.message);
  }
  process.exit(0);
});

