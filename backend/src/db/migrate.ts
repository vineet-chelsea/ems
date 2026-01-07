import { initializeSchema } from './schema.js';
import { testConnection } from './connection.js';
import { db } from './connection.js';

/**
 * Database Migration Script
 * Initializes database schema and tests connection
 */
async function migrate() {
  try {
    console.log('Starting database migration...');
    
    // Test database connection first
    console.log('Testing database connection...');
    await testConnection(5, 2000); // 5 retries, 2 second delay
    
    // Initialize schema (creates tables, indexes, etc.)
    console.log('Initializing database schema...');
    await initializeSchema();
    
    console.log('✓ Database migration completed successfully');
    
    // Close database connection
    await db.end();
    process.exit(0);
  } catch (error: any) {
    console.error('✗ Database migration failed:', error.message || error);
    console.error('Error details:', error);
    process.exit(1);
  }
}

// Run migration
migrate();

