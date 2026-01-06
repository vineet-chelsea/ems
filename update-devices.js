/**
 * Simple script to trigger device migration
 * Run this after restarting the backend to ensure all devices are updated
 */

const API_BASE = 'http://localhost:3001/api';

async function migrateDevices() {
  const token = localStorage.getItem('auth_token') || prompt('Enter auth token:');
  
  if (!token) {
    console.error('No auth token provided');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/devices/migrate-existing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✓ Migration successful:', result.message);
      console.log(`  Updated ${result.devicesUpdated} device(s)`);
    } else {
      console.error('✗ Migration failed:', result.error);
    }
  } catch (error) {
    console.error('✗ Error calling migration endpoint:', error);
  }
}

// For browser console usage
if (typeof window !== 'undefined') {
  window.migrateDevices = migrateDevices;
  console.log('Run migrateDevices() in the browser console to update devices');
}

// For Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { migrateDevices };
}

