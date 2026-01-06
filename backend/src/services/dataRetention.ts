/**
 * Data Retention Service
 * 
 * Automatically cleans up old data based on retention policy.
 * Runs on a configurable schedule (default: daily at 2 AM).
 */

import { db } from '../db/connection.js';
import { getDeviceTableName } from '../db/tableManager.js';
import { loadConfig } from '../config/performance.config.js';
import * as cron from 'node-cron';

const config = loadConfig();

export async function cleanupOldData(): Promise<void> {
  try {
    console.log('Starting data retention cleanup...');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.retention.dataRetentionDays);

    console.log(`Deleting data older than ${cutoffDate.toISOString()} (${config.retention.dataRetentionDays} days)`);

    // Get all device tables
    const tablesResult = await db.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE 'device_%'
      ORDER BY tablename
    `);

    let totalDeleted = 0;
    const deletedByTable: Record<string, number> = {};

    for (const row of tablesResult.rows) {
      const tableName = row.tablename;
      
      try {
        // Check if table has timestamp column
        const hasTimestamp = await db.query(`
          SELECT EXISTS(
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = $1 AND column_name = 'timestamp'
          ) as exists
        `, [tableName]);

        if (!hasTimestamp.rows[0]?.exists) {
          continue;
        }

        // Delete old data
        const deleteResult = await db.query(`
          DELETE FROM ${tableName}
          WHERE timestamp < $1
        `, [cutoffDate]);

        const deleted = deleteResult.rowCount || 0;
        totalDeleted += deleted;
        deletedByTable[tableName] = deleted;
        
        if (deleted > 0) {
          console.log(`  Deleted ${deleted} rows from ${tableName}`);
          
          // Vacuum to reclaim space (non-blocking)
          db.query(`VACUUM ANALYZE ${tableName}`).catch(err => {
            console.warn(`  Warning: VACUUM failed for ${tableName}:`, err.message);
          });
        }
      } catch (error: any) {
        console.error(`  Error cleaning ${tableName}:`, error.message);
      }
    }

    // Also clean device_events table
    try {
      const eventsResult = await db.query(`
        DELETE FROM device_events
        WHERE event_timestamp < $1
      `, [cutoffDate]);
      
      const eventsDeleted = eventsResult.rowCount || 0;
      totalDeleted += eventsDeleted;
      deletedByTable['device_events'] = eventsDeleted;
      
      if (eventsDeleted > 0) {
        console.log(`  Deleted ${eventsDeleted} events from device_events`);
        db.query('VACUUM ANALYZE device_events').catch(err => {
          console.warn('  Warning: VACUUM failed for device_events:', err.message);
        });
      }
    } catch (error: any) {
      console.error('  Error cleaning device_events:', error.message);
    }

    console.log(`✓ Cleanup complete: ${totalDeleted} total rows deleted`);
    if (Object.keys(deletedByTable).length > 0) {
      console.log('  Breakdown by table:', deletedByTable);
    }
  } catch (error: any) {
    console.error('Error in data retention cleanup:', error);
    throw error;
  }
}

export function startDataRetentionScheduler(): void {
  console.log(`Starting data retention scheduler (cron: ${config.retention.cleanupSchedule})`);
  console.log(`  Retention period: ${config.retention.dataRetentionDays} days`);
  
  // Validate cron expression
  if (!cron.validate(config.retention.cleanupSchedule)) {
    console.error(`Invalid cron expression: ${config.retention.cleanupSchedule}`);
    console.error('Using default schedule: 0 2 * * * (daily at 2 AM)');
    config.retention.cleanupSchedule = '0 2 * * *';
  }
  
  cron.schedule(config.retention.cleanupSchedule, async () => {
    console.log(`[${new Date().toISOString()}] Running scheduled data retention cleanup...`);
    try {
      await cleanupOldData();
    } catch (error) {
      console.error('Scheduled cleanup failed:', error);
    }
  });

  console.log('✓ Data retention scheduler started');
}

