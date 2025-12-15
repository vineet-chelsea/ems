import express from 'express';
import cors from 'cors';
import { db } from './db/connection.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { deviceRoutes } from './routes/devices.js';
import { dataRoutes } from './routes/data.js';
import { deviceConfigRoutes } from './routes/deviceConfigs.js';
import { initializeSchema } from './db/schema.js';
import { cleanupOrphanedTables } from './db/tableManager.js';
import { initializeKafkaProducer, disconnectKafkaProducer, isKafkaEnabled } from './services/kafka.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/device-configs', deviceConfigRoutes);

// Initialize database and cleanup orphaned tables on startup
async function initialize() {
  try {
    // Test database connection with retry logic
    const { testConnection } = await import('./db/connection.js');
    await testConnection(10, 2000); // 10 retries, starting with 2 second delay
    
    // Initialize database schema (create devices table if it doesn't exist)
    await initializeSchema();
    console.log('Database schema initialized');
    
    // Initialize Kafka producer if enabled
    if (isKafkaEnabled()) {
      await initializeKafkaProducer();
      console.log('Kafka producer initialized');
    }
    
    // Cleanup orphaned tables (tables without corresponding devices)
    // This is non-critical, so errors are logged but don't prevent startup
    await cleanupOrphanedTables();
    
    app.listen(PORT, () => {
      console.log(`Backend API server running on port ${PORT}`);
      console.log(`Kafka: ${isKafkaEnabled() ? 'Enabled' : 'Disabled'}`);
    });
  } catch (error) {
    console.error('Failed to initialize:', error);
    process.exit(1);
  }
}

initialize();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await disconnectKafkaProducer();
  await db.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await disconnectKafkaProducer();
  await db.end();
  process.exit(0);
});

