import { db } from '../dist/db/connection.js';

async function deleteEm6400Events() {
  try {
    const result = await db.query(
      `DELETE FROM device_events 
       WHERE device_id IN (SELECT id FROM devices WHERE type = $1)`,
      ['EM6400']
    );
    console.log(`✓ Deleted ${result.rowCount} EM6400 events from device_events table`);
    await db.end();
    process.exit(0);
  } catch (error) {
    console.error('Error deleting EM6400 events:', error);
    await db.end();
    process.exit(1);
  }
}

deleteEm6400Events();

