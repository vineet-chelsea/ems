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
  
  // GPU Acceleration
  gpu: {
    enabled: boolean;               // Enable GPU acceleration
    useForReports: boolean;         // Use GPU for report generation
    useForStatistics: boolean;      // Use GPU for statistics
    minRowsForGPU: number;          // Minimum rows to use GPU (avoid overhead)
  };
}

export const defaultConfig: PerformanceConfig = {
  sampling: {
    defaultInterval: 2,            // 100ms
    criticalDeviceInterval: 0.5,     // 50ms for Micrologic
    normalDeviceInterval: 2,       // 200ms for others
  },
  database: {
    poolSize: 50,
    minConnections: 10,
    idleTimeout: 30000,
    connectionTimeout: 5000,
  },
  batch: {
    deviceBatchSize: 15,              // Process 15 devices in parallel
    insertBatchSize: 200,             // Insert 200 rows per batch
  },
  retention: {
    dataRetentionDays: 180,          // 6 months
    cleanupSchedule: '0 2 * * *',    // Daily at 2 AM
  },
  workers: {
    maxWorkers: 18,                   // 18 workers to handle 15 devices + headroom
    workerTimeout: 8000,              // 8 second timeout
  },
  memory: {
    maxReportMemoryMB: 2048,         // 2GB max for reports
    spatialSamplingThreshold: 100000, // 100k rows
  },
  monitoring: {
    enabled: true,
    logInterval: 60,                  // Every minute
  },
  gpu: {
    enabled: true,                    // Enable GPU acceleration
    useForReports: true,              // Use GPU for report generation
    useForStatistics: true,           // Use GPU for statistics
    minRowsForGPU: 100000,            // Use GPU for queries with >100k rows
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
  if (process.env.GPU_ENABLED) {
    config.gpu.enabled = process.env.GPU_ENABLED.toLowerCase() === 'true';
  }
  if (process.env.GPU_USE_FOR_REPORTS) {
    config.gpu.useForReports = process.env.GPU_USE_FOR_REPORTS.toLowerCase() === 'true';
  }
  if (process.env.GPU_USE_FOR_STATISTICS) {
    config.gpu.useForStatistics = process.env.GPU_USE_FOR_STATISTICS.toLowerCase() === 'true';
  }
  if (process.env.GPU_MIN_ROWS) {
    config.gpu.minRowsForGPU = parseInt(process.env.GPU_MIN_ROWS);
  }
  
  return config;
}

