import { db } from './connection.js';
import { getAllDeviceIds } from './schema.js';
import { setupRetentionPolicy } from './retention.js';

/**
 * Creates a TimescaleDB hypertable for a specific device to store time-series data
 * Each device gets its own hypertable with comprehensive data columns
 * Hypertables are optimized for time-series data with automatic partitioning
 */
export async function createDeviceTable(deviceId: string): Promise<void> {
  const tableName = `device_${deviceId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id BIGSERIAL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      
      -- Voltage measurements (3-phase)
      VR NUMERIC(10, 3),
      VY NUMERIC(10, 3),
      VB NUMERIC(10, 3),
      V1 NUMERIC(10, 3),
      V2 NUMERIC(10, 3),
      V3 NUMERIC(10, 3),
      V NUMERIC(10, 3),
      Vavg NUMERIC(10, 3),
      Vpeak NUMERIC(10, 3),
      
      -- Current measurements (3-phase)
      IR NUMERIC(10, 3),
      IY NUMERIC(10, 3),
      IB NUMERIC(10, 3),
      I1 NUMERIC(10, 3),
      I2 NUMERIC(10, 3),
      I3 NUMERIC(10, 3),
      I NUMERIC(10, 3),
      Iavg NUMERIC(10, 3),
      Ipeak NUMERIC(10, 3),
      
      -- Power measurements
      P1 NUMERIC(10, 3),
      P2 NUMERIC(10, 3),
      P3 NUMERIC(10, 3),
      Ptotal NUMERIC(10, 3),
      Q1 NUMERIC(10, 3),
      Q2 NUMERIC(10, 3),
      Q3 NUMERIC(10, 3),
      Qtotal NUMERIC(10, 3),
      S1 NUMERIC(10, 3),
      S2 NUMERIC(10, 3),
      S3 NUMERIC(10, 3),
      Stotal NUMERIC(10, 3),
      
      -- Power Factor
      PF1 NUMERIC(5, 3),
      PF2 NUMERIC(5, 3),
      PF3 NUMERIC(5, 3),
      PFavg NUMERIC(5, 3),
      PF NUMERIC(5, 3),
      
      -- Frequency
      frequency NUMERIC(6, 3),
      
      -- Energy
      energy_active NUMERIC(15, 3),
      energy_reactive NUMERIC(15, 3),
      energy_apparent NUMERIC(15, 3),
      
      -- Harmonics
      THD_V1 NUMERIC(6, 3),
      THD_V2 NUMERIC(6, 3),
      THD_V3 NUMERIC(6, 3),
      THD_I1 NUMERIC(6, 3),
      THD_I2 NUMERIC(6, 3),
      THD_I3 NUMERIC(6, 3),
      THD_V NUMERIC(6, 3),
      THD_I NUMERIC(6, 3),
      
      -- Additional measurements
      temperature NUMERIC(6, 2),
      humidity NUMERIC(6, 2),
      
      -- Primary key on timestamp for TimescaleDB
      PRIMARY KEY (id, timestamp)
    )
  `;

  // Convert to hypertable if not already a hypertable
  const createHypertableQuery = `
    SELECT create_hypertable('${tableName}', 'timestamp', 
      chunk_time_interval => INTERVAL '1 day',
      if_not_exists => TRUE
    )
  `;

  // Create indexes for performance
  const createIndexesQuery = `
    CREATE INDEX IF NOT EXISTS ${tableName}_timestamp_idx ON ${tableName}(timestamp DESC);
    CREATE INDEX IF NOT EXISTS ${tableName}_ptotal_idx ON ${tableName}(timestamp DESC, ptotal) WHERE ptotal IS NOT NULL;
    CREATE INDEX IF NOT EXISTS ${tableName}_pf_idx ON ${tableName}(timestamp DESC, pf) WHERE pf IS NOT NULL;
  `;

  // Enable compression (TimescaleDB feature)
  const enableCompressionQuery = `
    ALTER TABLE ${tableName} SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = 'id',
      timescaledb.compress_orderby = 'timestamp DESC'
    )
  `;

  try {
    // Create table
    await db.query(createTableQuery);
    
    // Convert to hypertable
    try {
      await db.query(createHypertableQuery);
      console.log(`Hypertable ${tableName} created successfully`);
    } catch (error: any) {
      // Table might already be a hypertable
      if (!error.message?.includes('already a hypertable')) {
        throw error;
      }
    }
    
    // Create indexes
    await db.query(createIndexesQuery);
    
    // Enable compression for data older than 7 days
    try {
      await db.query(enableCompressionQuery);
      await db.query(`
        SELECT add_compression_policy('${tableName}', INTERVAL '7 days', if_not_exists => TRUE)
      `);
      console.log(`Compression enabled for ${tableName}`);
    } catch (error: any) {
      // Compression might already be enabled
      if (!error.message?.includes('already compressed')) {
        console.warn(`Could not enable compression for ${tableName}:`, error.message);
      }
    }
    
    console.log(`TimescaleDB hypertable ${tableName} configured successfully`);
  } catch (error) {
    console.error(`Error creating hypertable ${tableName}:`, error);
    throw error;
  }
}

/**
 * Deletes a device table
 */
export async function deleteDeviceTable(deviceId: string): Promise<void> {
  const tableName = `device_${deviceId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  
  try {
    await db.query(`DROP TABLE IF EXISTS ${tableName}`);
    console.log(`Table ${tableName} deleted successfully`);
  } catch (error) {
    console.error(`Error deleting table ${tableName}:`, error);
    throw error;
  }
}

/**
 * Gets the table name for a device
 */
export function getDeviceTableName(deviceId: string): string {
  return `device_${deviceId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

/**
 * Cleans up orphaned tables (tables for devices that no longer exist)
 * Only cleans up device data tables (device_*), never core schema tables
 */
export async function cleanupOrphanedTables(): Promise<void> {
  try {
    // Core schema tables that should never be dropped
    const protectedTables = ['devices', 'users', 'user_device_permissions'];
    
    // Get all device IDs from devices table
    const deviceIds = await getAllDeviceIds();
    
    // Get all tables that match device_* pattern (but not the devices table itself)
    const tablesResult = await db.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE 'device_%'
      AND tablename != 'devices'
    `);
    
    const existingTables = tablesResult.rows.map(row => row.tablename);
    
    // Find orphaned tables
    let deletedCount = 0;
    for (const tableName of existingTables) {
      // Skip protected tables (shouldn't match the pattern, but double-check)
      if (protectedTables.includes(tableName)) {
        console.log(`Skipping protected table: ${tableName}`);
        continue;
      }
      
      // Extract device ID from table name (device_<id>)
      const deviceId = tableName.replace(/^device_/, '');
      
      // Skip if deviceId is empty (shouldn't happen, but safety check)
      if (!deviceId || deviceId.length === 0) {
        console.log(`Skipping invalid table name: ${tableName}`);
        continue;
      }
      
      // Check if device exists
      if (!deviceIds.includes(deviceId)) {
        try {
          console.log(`Deleting orphaned table: ${tableName}`);
          await db.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
          deletedCount++;
        } catch (dropError: any) {
          // Log but continue - some tables might have dependencies
          console.warn(`Could not drop table ${tableName}:`, dropError.message);
        }
      }
    }
    
    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} orphaned table(s)`);
    } else {
      console.log('No orphaned tables found');
    }
  } catch (error) {
    // Log error but don't throw - allow server to start even if cleanup fails
    console.error('Error cleaning up orphaned tables:', error);
    // Don't throw - this is a non-critical operation
  }
}

