import { db } from './connection.js';
import bcrypt from 'bcryptjs';

/**
 * Initialize the main database schema
 * Creates tables for devices, users, and permissions
 * Enables TimescaleDB extension
 */
export async function initializeSchema() {
  try {
    // Enable TimescaleDB extension
    await db.query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE');
    console.log('TimescaleDB extension enabled');

    // Create users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        recovery_code VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add recovery_code column if it doesn't exist (for existing databases)
    await db.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'recovery_code'
        ) THEN
          ALTER TABLE users ADD COLUMN recovery_code VARCHAR(255);
        END IF;
      END $$;
    `);

    // Create user_device_permissions table (many-to-many)
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_device_permissions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id VARCHAR(255) NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, device_id)
      )
    `);

    // Create devices table
    await db.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        subnet_mask VARCHAR(45) NOT NULL DEFAULT '255.255.255.0',
        slave_address INTEGER NOT NULL DEFAULT 1,
        status VARCHAR(20) NOT NULL DEFAULT 'offline',
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        include_in_total_summary BOOLEAN DEFAULT true,
        parameter_mappings JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add slave_address column if it doesn't exist (for existing databases)
    await db.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'devices' AND column_name = 'slave_address'
        ) THEN
          ALTER TABLE devices ADD COLUMN slave_address INTEGER NOT NULL DEFAULT 1;
        END IF;
      END $$;
    `);

    // Update subnet_mask to default 255.255.255.0 if not set (for existing databases)
    await db.query(`
      UPDATE devices 
      SET subnet_mask = '255.255.255.0' 
      WHERE subnet_mask IS NULL OR subnet_mask = '';
    `);

    // Create indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_recovery_code ON users(recovery_code) WHERE recovery_code IS NOT NULL
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_permissions_user_id ON user_device_permissions(user_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_permissions_device_id ON user_device_permissions(device_id)
    `);

    // Create default admin user if it doesn't exist
    await createDefaultAdmin();

    console.log('Database schema initialized');
  } catch (error) {
    console.error('Error initializing schema:', error);
    throw error;
  }
}

/**
 * Create default admin user
 */
async function createDefaultAdmin() {
  try {
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    await db.query(`
      INSERT INTO users (id, email, password_hash, role)
      VALUES ('admin-1', 'admin@energy.local', $1, 'admin')
      ON CONFLICT (id) DO NOTHING
    `, [passwordHash]);
  } catch (error) {
    console.error('Error creating default admin:', error);
    // Don't throw - this is not critical
  }
}

/**
 * Get all device IDs from the devices table
 */
export async function getAllDeviceIds(): Promise<string[]> {
  const result = await db.query('SELECT id FROM devices');
  return result.rows.map(row => row.id);
}

