/**
 * Performance Configuration
 * 
 * This file contains all performance-related settings for the EMS system.
 * Settings can be overridden via environment variables for post-deployment tuning.
 */

export interface PerformanceConfig {
  // Sampling intervals (in seconds)
  sampling: {
    defaultInterval: number;        // Default sampling interval
    criticalDeviceInterval: number; // Micrologic 6E interval
    normalDeviceInterval: number;   // Other devices interval
  };
  
  // Database settings
  database: {
    poolSize: number;
    minConnections: number;
    idleTimeout: number;
    connectionTimeout: number;
  };
  
  // Batch processing
  batch: {
    deviceBatchSize: number;       // Devices per batch
    insertBatchSize: number;        // Inserts per batch
  };
  
  // Data retention (in days)
  retention: {
    dataRetentionDays: number;      // Delete data older than this
    cleanupSchedule: string;        // Cron expression
  };
  
  // Worker pool
  workers: {
    maxWorkers: number;             // Max Python script workers
    workerTimeout: number;           // Worker timeout in ms
  };
  
  // Memory management
  memory: {
    maxReportMemoryMB: number;      // Max memory for reports
    spatialSamplingThreshold: number; // Use spatial sampling if rows > this
  };
  
  // Monitoring
  monitoring: {
    enabled: boolean;
    logInterval: number;            // Log metrics every N seconds
  };
}

export const defaultConfig: PerformanceConfig = {
  sampling: {
    defaultInterval: 0.1,            // 100ms
    criticalDeviceInterval: 0.05,     // 50ms for Micrologic
    normalDeviceInterval: 0.2,       // 200ms for others
  },
  database: {
    poolSize: 50,
    minConnections: 10,
    idleTimeout: 30000,
    connectionTimeout: 5000,
  },
  batch: {
    deviceBatchSize: 10,
    insertBatchSize: 100,
  },
  retention: {
    dataRetentionDays: 180,          // 6 months
    cleanupSchedule: '0 2 * * *',    // Daily at 2 AM
  },
  workers: {
    maxWorkers: 10,
    workerTimeout: 5000,
  },
  memory: {
    maxReportMemoryMB: 2048,         // 2GB max for reports
    spatialSamplingThreshold: 100000, // 100k rows
  },
  monitoring: {
    enabled: true,
    logInterval: 60,                  // Every minute
  },
};

// Load config from environment or file
export function loadConfig(): PerformanceConfig {
  const config = { ...defaultConfig };
  
  // Override from environment variables
  if (process.env.SAMPLING_INTERVAL) {
    config.sampling.defaultInterval = parseFloat(process.env.SAMPLING_INTERVAL);
  }
  if (process.env.CRITICAL_INTERVAL) {
    config.sampling.criticalDeviceInterval = parseFloat(process.env.CRITICAL_INTERVAL);
  }
  if (process.env.NORMAL_INTERVAL) {
    config.sampling.normalDeviceInterval = parseFloat(process.env.NORMAL_INTERVAL);
  }
  if (process.env.DB_POOL_SIZE) {
    config.database.poolSize = parseInt(process.env.DB_POOL_SIZE);
  }
  if (process.env.DB_MIN_CONNECTIONS) {
    config.database.minConnections = parseInt(process.env.DB_MIN_CONNECTIONS);
  }
  if (process.env.BATCH_SIZE) {
    config.batch.deviceBatchSize = parseInt(process.env.BATCH_SIZE);
  }
  if (process.env.INSERT_BATCH_SIZE) {
    config.batch.insertBatchSize = parseInt(process.env.INSERT_BATCH_SIZE);
  }
  if (process.env.RETENTION_DAYS) {
    config.retention.dataRetentionDays = parseInt(process.env.RETENTION_DAYS);
  }
  if (process.env.CLEANUP_SCHEDULE) {
    config.retention.cleanupSchedule = process.env.CLEANUP_SCHEDULE;
  }
  if (process.env.MAX_WORKERS) {
    config.workers.maxWorkers = parseInt(process.env.MAX_WORKERS);
  }
  if (process.env.WORKER_TIMEOUT) {
    config.workers.workerTimeout = parseInt(process.env.WORKER_TIMEOUT);
  }
  if (process.env.MAX_REPORT_MEMORY_MB) {
    config.memory.maxReportMemoryMB = parseInt(process.env.MAX_REPORT_MEMORY_MB);
  }
  if (process.env.SPATIAL_SAMPLING_THRESHOLD) {
    config.memory.spatialSamplingThreshold = parseInt(process.env.SPATIAL_SAMPLING_THRESHOLD);
  }
  if (process.env.MONITORING_ENABLED) {
    config.monitoring.enabled = process.env.MONITORING_ENABLED.toLowerCase() === 'true';
  }
  if (process.env.MONITORING_LOG_INTERVAL) {
    config.monitoring.logInterval = parseInt(process.env.MONITORING_LOG_INTERVAL);
  }
  
  return config;
}

