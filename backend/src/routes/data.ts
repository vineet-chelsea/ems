import express from 'express';
import { db } from '../db/connection.js';
import { getDeviceTableName } from '../db/tableManager.js';
import { authenticateToken, checkDevicePermission, AuthRequest } from '../middleware/auth.js';
import { sendDataPoint } from '../services/kafka.js';
import { z } from 'zod';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Data point validation schema
const dataPointSchema = z.object({
  timestamp: z.string().datetime().optional(),
  // Voltage
  VR: z.number().optional(),
  VY: z.number().optional(),
  VB: z.number().optional(),
  V1: z.number().optional(),
  V2: z.number().optional(),
  V3: z.number().optional(),
  V: z.number().optional(),
  Vavg: z.number().optional(),
  Vpeak: z.number().optional(),
  // Current
  IR: z.number().optional(),
  IY: z.number().optional(),
  IB: z.number().optional(),
  I1: z.number().optional(),
  I2: z.number().optional(),
  I3: z.number().optional(),
  I: z.number().optional(),
  Iavg: z.number().optional(),
  Ipeak: z.number().optional(),
  // Power
  P1: z.number().optional(),
  P2: z.number().optional(),
  P3: z.number().optional(),
  Ptotal: z.number().optional(),
  Q1: z.number().optional(),
  Q2: z.number().optional(),
  Q3: z.number().optional(),
  Qtotal: z.number().optional(),
  S1: z.number().optional(),
  S2: z.number().optional(),
  S3: z.number().optional(),
  Stotal: z.number().optional(),
  // Power Factor
  PF1: z.number().optional(),
  PF2: z.number().optional(),
  PF3: z.number().optional(),
  PFavg: z.number().optional(),
  PF: z.number().optional(),
  // Frequency
  frequency: z.number().optional(),
  // Energy
  energy_active: z.number().optional(),
  energy_reactive: z.number().optional(),
  energy_apparent: z.number().optional(),
  // Harmonics
  THD_V1: z.number().optional(),
  THD_V2: z.number().optional(),
  THD_V3: z.number().optional(),
  THD_I1: z.number().optional(),
  THD_I2: z.number().optional(),
  THD_I3: z.number().optional(),
  THD_V: z.number().optional(),
  THD_I: z.number().optional(),
  // Additional
  temperature: z.number().optional(),
  humidity: z.number().optional(),
});

// Insert data point for a device (check permissions)
router.post('/:deviceId', async (req: AuthRequest, res) => {
  try {
    const deviceId = req.params.deviceId;
    
    // Check permissions
    const hasPermission = await checkDevicePermission(
      req.userId!,
      req.userRole!,
      deviceId
    );
    
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied to this device' });
    }
    
    const tableName = getDeviceTableName(deviceId);
    
    // Check if device exists
    const deviceCheck = await db.query('SELECT id FROM devices WHERE id = $1', [deviceId]);
    if (deviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    const dataPoint = dataPointSchema.parse(req.body);
    
    // Build dynamic INSERT query
    const columns: string[] = [];
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramCount = 1;
    
    if (dataPoint.timestamp) {
      columns.push('timestamp');
      values.push(new Date(dataPoint.timestamp));
      placeholders.push(`$${paramCount++}`);
    }
    
    // Add all non-undefined values
    const dataFields = [
      'VR', 'VY', 'VB', 'V1', 'V2', 'V3', 'V', 'Vavg', 'Vpeak',
      'IR', 'IY', 'IB', 'I1', 'I2', 'I3', 'I', 'Iavg', 'Ipeak',
      'P1', 'P2', 'P3', 'Ptotal', 'Q1', 'Q2', 'Q3', 'Qtotal',
      'S1', 'S2', 'S3', 'Stotal',
      'PF1', 'PF2', 'PF3', 'PFavg', 'PF',
      'frequency',
      'energy_active', 'energy_reactive', 'energy_apparent',
      'THD_V1', 'THD_V2', 'THD_V3', 'THD_I1', 'THD_I2', 'THD_I3', 'THD_V', 'THD_I',
      'temperature', 'humidity'
    ];
    
    for (const field of dataFields) {
      if (dataPoint[field as keyof typeof dataPoint] !== undefined) {
        columns.push(field.toLowerCase());
        values.push(dataPoint[field as keyof typeof dataPoint]);
        placeholders.push(`$${paramCount++}`);
      }
    }
    
    if (columns.length === 0) {
      return res.status(400).json({ error: 'No data fields provided' });
    }
    
    const query = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING id, timestamp
    `;
    
    const result = await db.query(query, values);
    
    const insertedData = result.rows[0];
    
    // Send to Kafka for async processing (non-blocking)
    sendDataPoint(deviceId, dataPoint).catch(error => {
      console.error('Failed to send to Kafka (non-critical):', error);
    });
    
    res.status(201).json({
      id: insertedData.id,
      timestamp: insertedData.timestamp,
      message: 'Data point inserted successfully'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data point', details: error.errors });
    }
    console.error('Error inserting data point:', error);
    res.status(500).json({ error: 'Failed to insert data point' });
  }
});

// Get data points for a device
router.get('/:deviceId', async (req: AuthRequest, res) => {
  try {
    const deviceId = req.params.deviceId;
    
    // Check permissions
    const hasPermission = await checkDevicePermission(
      req.userId!,
      req.userRole!,
      deviceId
    );
    
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied to this device' });
    }
    const tableName = getDeviceTableName(deviceId);
    
    // Check if device exists
    const deviceCheck = await db.query('SELECT id FROM devices WHERE id = $1', [deviceId]);
    if (deviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // Parse query parameters
    const startTime = req.query.startTime as string;
    const endTime = req.query.endTime as string;
    const limit = parseInt(req.query.limit as string) || 1000;
    const offset = parseInt(req.query.offset as string) || 0;
    
    let query = `SELECT * FROM ${tableName}`;
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    if (startTime) {
      conditions.push(`timestamp >= $${paramCount++}`);
      values.push(new Date(startTime));
    }
    
    if (endTime) {
      conditions.push(`timestamp <= $${paramCount++}`);
      values.push(new Date(endTime));
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    query += ` ORDER BY timestamp DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    values.push(limit, offset);
    
    const result = await db.query(query, values);
    
    res.json({
      deviceId,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching data points:', error);
    res.status(500).json({ error: 'Failed to fetch data points' });
  }
});

// Get latest data point for a device
router.get('/:deviceId/latest', async (req: AuthRequest, res) => {
  try {
    const deviceId = req.params.deviceId;
    
    // Check permissions
    const hasPermission = await checkDevicePermission(
      req.userId!,
      req.userRole!,
      deviceId
    );
    
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied to this device' });
    }
    
    const tableName = getDeviceTableName(deviceId);
    
    // Check if device exists
    const deviceCheck = await db.query('SELECT id FROM devices WHERE id = $1', [deviceId]);
    if (deviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    const result = await db.query(`
      SELECT * FROM ${tableName}
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No data points found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching latest data point:', error);
    res.status(500).json({ error: 'Failed to fetch latest data point' });
  }
});

// Get aggregated statistics for a device
router.get('/:deviceId/stats', async (req: AuthRequest, res) => {
  try {
    const deviceId = req.params.deviceId;
    
    // Check permissions
    const hasPermission = await checkDevicePermission(
      req.userId!,
      req.userRole!,
      deviceId
    );
    
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied to this device' });
    }
    
    const tableName = getDeviceTableName(deviceId);
    
    // Check if device exists
    const deviceCheck = await db.query('SELECT id FROM devices WHERE id = $1', [deviceId]);
    if (deviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    const startTime = req.query.startTime as string;
    const endTime = req.query.endTime as string;
    
    let query = `
      SELECT 
        COUNT(*) as count,
        MIN(timestamp) as first_timestamp,
        MAX(timestamp) as last_timestamp,
        AVG(ptotal) as avg_power,
        MAX(ptotal) as max_power,
        MIN(ptotal) as min_power,
        AVG(pfavg) as avg_power_factor,
        AVG(frequency) as avg_frequency
      FROM ${tableName}
    `;
    
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    if (startTime) {
      conditions.push(`timestamp >= $${paramCount++}`);
      values.push(new Date(startTime));
    }
    
    if (endTime) {
      conditions.push(`timestamp <= $${paramCount++}`);
      values.push(new Date(endTime));
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    const result = await db.query(query, values);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export { router as dataRoutes };

