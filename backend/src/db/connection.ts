import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'ems_db',
  user: process.env.DB_USER || 'ems_user',
  password: process.env.DB_PASSWORD || 'ems_password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased to 10 seconds
});

// Test connection with retry logic
export async function testConnection(retries = 10, delay = 2000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await db.query('SELECT 1');
      console.log('Database connection established');
      return;
    } catch (error) {
      if (i === retries - 1) {
        throw error;
      }
      console.log(`Database connection attempt ${i + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      // Exponential backoff: increase delay for each retry
      delay = Math.min(delay * 1.5, 10000);
    }
  }
}

// Test connection
db.on('connect', () => {
  console.log('Database connection established');
});

db.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

