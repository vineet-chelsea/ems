import { db } from './connection.js';
import bcrypt from 'bcryptjs';

/**
 * Initialize the main database schema
 * Creates tables for devices, users, and permissions
 * Enables TimescaleDB extension
 */
export async function initializeSchema() {
  try {
    // Set timezone to IST (Indian Standard Time) for the session
    try {
      await db.query("SET timezone = 'Asia/Kolkata'");
      console.log('Database timezone set to IST (Asia/Kolkata)');
    } catch (tzError: any) {
      console.warn('Failed to set timezone to IST:', tzError.message || tzError);
    }
    
    // Enable TimescaleDB extension (optional - only if installed)
    try {
      await db.query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE');
      console.log('TimescaleDB extension enabled');
    } catch (timescaleError: any) {
      // TimescaleDB is optional - continue without it if not installed
      if (timescaleError?.code === '0A000' || timescaleError?.message?.includes('timescaledb')) {
        console.log('TimescaleDB extension not available - continuing without it (optional)');
      } else {
        // Re-throw if it's a different error
        throw timescaleError;
      }
    }

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

    // Create devices table FIRST (before user_device_permissions which references it)
    await db.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        subnet_mask VARCHAR(45) NOT NULL DEFAULT '255.255.255.0',
        slave_address INTEGER NOT NULL DEFAULT 1,
        breaker_rating INTEGER,
        unit_cost NUMERIC(12, 4),
        status VARCHAR(20) NOT NULL DEFAULT 'offline',
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        include_in_total_summary BOOLEAN DEFAULT true,
        parameter_mappings JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create user_device_permissions table (many-to-many) - AFTER devices table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_device_permissions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id VARCHAR(255) NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, device_id)
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

    // Add breaker_rating column if it doesn't exist (for existing databases)
    await db.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'devices' AND column_name = 'breaker_rating'
        ) THEN
          ALTER TABLE devices ADD COLUMN breaker_rating INTEGER;
        END IF;
      END $$;
    `);

    // Add unit_cost column if it doesn't exist (for existing databases)
    await db.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'devices' AND column_name = 'unit_cost'
        ) THEN
          ALTER TABLE devices ADD COLUMN unit_cost NUMERIC(12, 4);
        END IF;
      END $$;
    `);

    // Add Micrologic 6E protection settings columns if they don't exist
    await db.query(`
      DO $$ 
      BEGIN
        -- Ir (Long Time Overload): Range 0.1 to 1.0
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'devices' AND column_name = 'protection_ir'
        ) THEN
          ALTER TABLE devices ADD COLUMN protection_ir NUMERIC(3, 1) CHECK (protection_ir IS NULL OR (protection_ir >= 0.1 AND protection_ir <= 1.0));
        END IF;
        
        -- tr (Long time overload duration): Range 0.5 to 25 seconds
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'devices' AND column_name = 'protection_tr'
        ) THEN
          ALTER TABLE devices ADD COLUMN protection_tr NUMERIC(4, 1) CHECK (protection_tr IS NULL OR (protection_tr >= 0.5 AND protection_tr <= 25.0));
        END IF;
        
        -- Isd (Short Time): Range 1 to 10 with steps 0.5
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'devices' AND column_name = 'protection_isd'
        ) THEN
          ALTER TABLE devices ADD COLUMN protection_isd NUMERIC(3, 1) CHECK (protection_isd IS NULL OR (protection_isd >= 1.0 AND protection_isd <= 10.0));
        END IF;
        
        -- tsd: Range 0.1 to 0.4 seconds
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'devices' AND column_name = 'protection_tsd'
        ) THEN
          ALTER TABLE devices ADD COLUMN protection_tsd NUMERIC(2, 1) CHECK (protection_tsd IS NULL OR (protection_tsd >= 0.1 AND protection_tsd <= 0.4));
        END IF;
        
        -- Ii (Instantaneous): Range 2 to 10
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'devices' AND column_name = 'protection_ii'
        ) THEN
          ALTER TABLE devices ADD COLUMN protection_ii NUMERIC(3, 1) CHECK (protection_ii IS NULL OR (protection_ii >= 2.0 AND protection_ii <= 10.0));
        END IF;
        
        -- Ig: Options A, B, C, D, E, F
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'devices' AND column_name = 'protection_ig'
        ) THEN
          ALTER TABLE devices ADD COLUMN protection_ig VARCHAR(1) CHECK (protection_ig IS NULL OR protection_ig IN ('A', 'B', 'C', 'D', 'E', 'F'));
        END IF;
        
        -- tg(s): Range 0.1 to 0.4 seconds
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'devices' AND column_name = 'protection_tg'
        ) THEN
          ALTER TABLE devices ADD COLUMN protection_tg NUMERIC(2, 1) CHECK (protection_tg IS NULL OR (protection_tg >= 0.1 AND protection_tg <= 0.4));
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

    // Create device_events table for PM8000 event flags (dips/interrupts/etc.)
    await db.query(`
      CREATE TABLE IF NOT EXISTS device_events (
        id BIGSERIAL PRIMARY KEY,
        device_id VARCHAR(255) NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        parameter VARCHAR(255) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        prev_value NUMERIC,
        new_value NUMERIC,
        event_timestamp TIMESTAMPTZ NOT NULL,
        description TEXT
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_device_events_device_time
      ON device_events(device_id, event_timestamp DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_device_events_device_param_time
      ON device_events(device_id, parameter, event_timestamp DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_device_events_event_type
      ON device_events(event_type)
    `);

    // Create patches table for patch management
    await db.query(`
      CREATE TABLE IF NOT EXISTS patches (
        id SERIAL PRIMARY KEY,
        patch_id VARCHAR(255) UNIQUE NOT NULL,
        version VARCHAR(50) NOT NULL,
        description TEXT,
        target VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        patch_data JSONB NOT NULL
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_patches_patch_id ON patches(patch_id)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_patches_created_at ON patches(created_at DESC)
    `);

    // Create patch_applications table to track patch applications
    await db.query(`
      CREATE TABLE IF NOT EXISTS patch_applications (
        id SERIAL PRIMARY KEY,
        patch_id VARCHAR(255) REFERENCES patches(patch_id) ON DELETE CASCADE,
        target VARCHAR(20) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        applied_by VARCHAR(255),
        status VARCHAR(20) DEFAULT 'success',
        error_message TEXT
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_patch_applications_patch_id ON patch_applications(patch_id)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_patch_applications_applied_at ON patch_applications(applied_at DESC)
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
    // Check if admin user already exists
    const existingAdmin = await db.query(
      'SELECT id FROM users WHERE id = $1 OR email = $2',
      ['admin-1', 'admin@energy.local']
    );
    
    if (existingAdmin.rows.length > 0) {
      console.log('Default admin user already exists, skipping creation');
      return;
    }
    
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    await db.query(`
      INSERT INTO users (id, email, password_hash, role)
      VALUES ('admin-1', 'admin@energy.local', $1, 'admin')
      ON CONFLICT (id) DO NOTHING
    `, [passwordHash]);
    
    console.log('Default admin user created (email: admin@energy.local, password: admin123)');
  } catch (error: any) {
    // If it's a constraint violation, the user already exists - that's fine
    if (error?.code === '23505' || error?.message?.includes('duplicate key')) {
      console.log('Default admin user already exists');
    } else {
      console.error('Error creating default admin:', error?.message || error);
      // Don't throw - this is not critical
    }
  }
}

/**
 * Get all device IDs from the devices table
 */
export async function getAllDeviceIds(): Promise<string[]> {
  const result = await db.query('SELECT id FROM devices');
  return result.rows.map(row => row.id);
}

