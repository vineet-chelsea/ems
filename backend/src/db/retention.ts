import { db } from './connection.js';
import { getDeviceTableName } from './tableManager.js';

/**
 * Set up data retention policies for TimescaleDB hypertables
 * Automatically drops data older than specified retention period
 */
export async function setupRetentionPolicy(
  deviceId: string,
  retentionPeriod: string = '90 days'
): Promise<void> {
  const tableName = getDeviceTableName(deviceId);
  
  try {
    // Add retention policy (drops chunks older than retention period)
    await db.query(`
      SELECT add_retention_policy(
        '${tableName}',
        INTERVAL '${retentionPeriod}',
        if_not_exists => TRUE
      )
    `);
    console.log(`Retention policy set for ${tableName}: ${retentionPeriod}`);
  } catch (error: any) {
    if (!error.message?.includes('already exists')) {
      console.error(`Error setting retention policy for ${tableName}:`, error);
      throw error;
    }
  }
}

/**
 * Set up retention policy for all device tables
 */
export async function setupRetentionPoliciesForAllDevices(
  retentionPeriod: string = '90 days'
): Promise<void> {
  try {
    const result = await db.query('SELECT id FROM devices');
    
    for (const row of result.rows) {
      await setupRetentionPolicy(row.id, retentionPeriod);
    }
    
    console.log(`Retention policies configured for all devices: ${retentionPeriod}`);
  } catch (error) {
    console.error('Error setting up retention policies:', error);
    throw error;
  }
}

/**
 * Remove retention policy for a device
 */
export async function removeRetentionPolicy(deviceId: string): Promise<void> {
  const tableName = getDeviceTableName(deviceId);
  
  try {
    // Get all retention policies for this table
    const policies = await db.query(`
      SELECT job_id, hypertable_name 
      FROM timescaledb_information.jobs 
      WHERE proc_name = 'policy_retention' 
      AND hypertable_name = '${tableName}'
    `);
    
    for (const policy of policies.rows) {
      await db.query(`SELECT remove_retention_policy('${tableName}', ${policy.job_id})`);
    }
    
    console.log(`Retention policy removed for ${tableName}`);
  } catch (error: any) {
    if (!error.message?.includes('does not exist')) {
      console.error(`Error removing retention policy for ${tableName}:`, error);
      throw error;
    }
  }
}

