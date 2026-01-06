/**
 * Migration script to update existing Micrologic 6E devices
 * Ensures all protection settings columns exist and are properly initialized
 */

import { db } from '../db/connection.js';
import { initializeSchema } from '../db/schema.js';

async function updateExistingDevices() {
  try {
    console.log('Starting device update migration...');
    
    // First, ensure schema is initialized (this will add columns if they don't exist)
    console.log('Initializing schema...');
    await initializeSchema();
    
    // Verify all protection columns exist
    const columnsCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'devices' 
        AND column_name LIKE 'protection_%'
      ORDER BY column_name
    `);
    
    console.log('Found protection columns:', columnsCheck.rows.map((r: any) => r.column_name));
    
    // Get all Micrologic 6E devices
    const devices = await db.query(`
      SELECT id, name, type
      FROM devices
      WHERE type = 'MICROLOGIC_6E'
    `);
    
    console.log(`Found ${devices.rows.length} Micrologic 6E device(s)`);
    
    // For each device, ensure protection columns are accessible (they should be NULL by default)
    for (const device of devices.rows) {
      console.log(`Checking device: ${device.name} (${device.id})`);
      
      // Verify device has all protection columns (they should all be NULL for existing devices)
      const deviceData = await db.query(`
        SELECT 
          protection_ir,
          protection_tr,
          protection_isd,
          protection_tsd,
          protection_ii,
          protection_ig,
          protection_tg
        FROM devices
        WHERE id = $1
      `, [device.id]);
      
      if (deviceData.rows.length > 0) {
        const data = deviceData.rows[0];
        console.log(`  Protection settings:`, {
          ir: data.protection_ir,
          tr: data.protection_tr,
          isd: data.protection_isd,
          tsd: data.protection_tsd,
          ii: data.protection_ii,
          ig: data.protection_ig,
          tg: data.protection_tg,
        });
      } else {
        console.log(`  Warning: Device not found in database`);
      }
    }
    
    console.log('✓ Device update migration completed successfully');
    console.log('All existing Micrologic 6E devices now have protection settings columns available');
    
  } catch (error: any) {
    console.error('✗ Error during device update migration:', error);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateExistingDevices()
    .then(() => {
      console.log('Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

export { updateExistingDevices };

