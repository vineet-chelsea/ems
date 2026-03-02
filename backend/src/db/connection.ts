import pg from 'pg';
import dotenv from 'dotenv';
import { loadConfig } from '../config/performance.config.js';

dotenv.config();

const { Pool } = pg;
const config = loadConfig();

export const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '1234',
  max: config.database.poolSize,
  min: config.database.minConnections,
  idleTimeoutMillis: config.database.idleTimeout,
  connectionTimeoutMillis: config.database.connectionTimeout,
  // Additional optimizations
  statement_timeout: 10000, // 10 second query timeout
  query_timeout: 10000,
});

// Test connection with retry logic
export async function testConnection(retries = 15, delay = 3000): Promise<void> {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
  };
  
  console.log(`Attempting database connection to ${config.host}:${config.port}/${config.database} as ${config.user}...`);
  console.log('Waiting for PostgreSQL to be ready (this may take up to 45 seconds after system restart)...');
  
  for (let i = 0; i < retries; i++) {
    try {
      // Test basic connectivity first
      const result = await db.query('SELECT 1 as test');
      if (result.rows && result.rows[0]?.test === 1) {
        console.log('✓ Database connection established successfully');
        // Verify database is ready by checking if we can query system tables
        try {
          await db.query('SELECT COUNT(*) FROM pg_database WHERE datname = $1', [config.database]);
          console.log('✓ Database is ready and accessible');
        } catch (verifyError) {
          console.warn('⚠ Database connected but verification query failed:', verifyError);
        }
        // Initialize TimescaleDB after successful connection
        try {
          await initializeTimescaleDB();
        } catch (tsError) {
          console.warn('⚠ TimescaleDB initialization failed (non-critical):', tsError);
        }
        return;
      }
      throw new Error('Connection test query returned unexpected result');
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const errorCode = error?.code || 'UNKNOWN';
      
      // Provide helpful messages for common errors
      let helpfulMessage = '';
      if (errorCode === 'ECONNREFUSED' || errorCode === 'ENOTFOUND') {
        helpfulMessage = ' → PostgreSQL service may not be running. Please start PostgreSQL service.';
      } else if (errorCode === '28P01' || errorMessage.includes('password authentication failed')) {
        helpfulMessage = ' → Authentication failed. Check DB_USER and DB_PASSWORD environment variables.';
      } else if (errorCode === '3D000' || errorMessage.includes('does not exist')) {
        helpfulMessage = ' → Database does not exist. Please create the database first.';
      } else if (errorMessage.includes('timeout') || errorCode === 'ETIMEDOUT') {
        helpfulMessage = ' → Connection timeout. PostgreSQL may still be starting up.';
      }
      
      if (i === retries - 1) {
        console.error('✗ Database connection failed after all retries');
        console.error(`Error code: ${errorCode}`);
        console.error(`Error message: ${errorMessage}${helpfulMessage}`);
        console.error(`Connection config: ${config.host}:${config.port}/${config.database} (user: ${config.user})`);
        console.error('\nTroubleshooting steps:');
        console.error('1. Verify PostgreSQL service is running: Get-Service -Name "*postgresql*"');
        console.error('2. Check if PostgreSQL is listening on port 5432: netstat -ano | findstr :5432');
        console.error('3. Verify database exists: psql -U postgres -c "\\l" | findstr ems_db');
        console.error('4. Verify user exists: psql -U postgres -c "\\du" | findstr ems_user');
        throw error;
      }
      const attemptNum = i + 1;
      const totalWait = (retries * delay) / 1000;
      console.log(`Database connection attempt ${attemptNum}/${retries} failed (${errorCode}): ${errorMessage}${helpfulMessage}`);
      console.log(`Retrying in ${(delay / 1000).toFixed(1)}s... (${totalWait.toFixed(1)}s total wait time)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      // Exponential backoff: increase delay for each retry, but cap at 5 seconds
      delay = Math.min(delay * 1.2, 5000);
    }
  }
}

// Handle connection pool events
db.on('connect', async (client: any) => {
  console.log('New database client connected to pool');
  // Set timezone to IST (Indian Standard Time) for this connection
  try {
    await client.query("SET timezone = 'Asia/Kolkata'");
    // Also set the timezone in the session
    await client.query("SET SESSION timezone = 'Asia/Kolkata'");
    console.log('Database timezone set to IST (Asia/Kolkata)');
  } catch (err: any) {
    console.warn('Failed to set timezone to IST:', err.message || err);
  }
});

db.on('error', (err: any) => {
  console.error('Unexpected database error:', err);
  console.error('Error details:', {
    code: err?.code || 'UNKNOWN',
    message: err?.message || String(err),
    name: err?.name || 'Error'
  });
});

db.on('acquire', (client: any) => {
  // Client acquired from pool (silent - too verbose)
});

db.on('remove', (client: any) => {
  // Client removed from pool (silent - too verbose)
});

// Initialize TimescaleDB extension
export async function initializeTimescaleDB(): Promise<void> {
  try {
    // Check if TimescaleDB extension exists
    const extCheck = await db.query(`
      SELECT EXISTS(
        SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'
      ) as exists
    `);
    
    if (!extCheck.rows[0]?.exists) {
      console.log('Installing TimescaleDB extension...');
      await db.query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE');
      console.log('✓ TimescaleDB extension installed');
    } else {
      console.log('✓ TimescaleDB extension already installed');
    }
  } catch (error: any) {
    console.warn('TimescaleDB extension not available:', error.message);
    console.warn('Continuing without TimescaleDB (standard PostgreSQL mode)');
  }
}

// Convert regular table to hypertable (TimescaleDB)
export async function convertToHypertable(tableName: string, timeColumn: string = 'timestamp'): Promise<void> {
  try {
    // Check if already a hypertable
    const check = await db.query(`
      SELECT EXISTS(
        SELECT 1 FROM timescaledb_information.hypertables 
        WHERE hypertable_name = $1
      ) as is_hypertable
    `, [tableName]);
    
    if (!check.rows[0]?.is_hypertable) {
      await db.query(`
        SELECT create_hypertable($1, $2, 
          chunk_time_interval => INTERVAL '1 day',
          if_not_exists => TRUE
        )
      `, [tableName, timeColumn]);
      console.log(`✓ Converted ${tableName} to TimescaleDB hypertable`);
    }
  } catch (error: any) {
    // Not a critical error - table might not exist yet or TimescaleDB not available
    if (!error.message?.includes('does not exist') && !error.message?.includes('relation') && !error.message?.includes('timescaledb')) {
      // Only log if it's not a known non-critical error
      console.warn(`Could not convert ${tableName} to hypertable:`, error.message);
    }
  }
}

// Update testConnection to initialize TimescaleDB
// (We'll modify the existing function to call initializeTimescaleDB after successful connection)

