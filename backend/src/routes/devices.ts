import express from 'express';
import { db } from '../db/connection.js';
import { initializeSchema } from '../db/schema.js';
import { createDeviceTable, deleteDeviceTable } from '../db/tableManager.js';
import { authenticateToken, requireAdmin, checkDevicePermission, AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Initialize schema on first request
let schemaInitialized = false;
async function ensureSchema() {
  if (!schemaInitialized) {
    await initializeSchema();
    schemaInitialized = true;
  }
}

// Device validation schema
const deviceSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.string().min(1),
  ipAddress: z.string().ip(),
  subnetMask: z.string().default('255.255.255.0'),
  slaveAddress: z.number().int().min(0).max(255).default(1),
  status: z.enum(['online', 'offline', 'connecting']).default('offline'),
  includeInTotalSummary: z.boolean().default(true),
  parameterMappings: z.record(z.string(), z.string()).optional(),
});

// Get all devices (filtered by user permissions)
router.get('/', async (req: AuthRequest, res) => {
  try {
    await ensureSchema();
    
    let query = `
      SELECT 
        id,
        name,
        type,
        ip_address as "ipAddress",
        subnet_mask as "subnetMask",
        slave_address as "slaveAddress",
        status,
        last_seen as "lastSeen",
        include_in_total_summary as "includeInTotalSummary",
        parameter_mappings as "parameterMappings"
      FROM devices
    `;
    
    const params: any[] = [];
    
    // If user is not admin, filter by permissions
    if (req.userRole !== 'admin') {
      query += `
        WHERE id IN (
          SELECT device_id FROM user_device_permissions WHERE user_id = $1
        )
      `;
      params.push(req.userId);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// Test device connection (ping IP and test Modbus TCP)
// MUST be before /:id route to avoid route conflicts
router.post('/test-connection', async (req: AuthRequest, res) => {
  try {
    console.log('Test connection endpoint called:', req.body);
    const { ipAddress, slaveAddress = 1 } = req.body;

    if (!ipAddress) {
      return res.status(400).json({ error: 'IP address is required' });
    }

    // Test Modbus TCP connection (port 502) using socket
    const net = await import('net');
    const modbusTest = (): Promise<boolean> => {
      return new Promise((resolve) => {
        const socket = new net.Socket();
        const timeout = setTimeout(() => {
          socket.destroy();
          resolve(false);
        }, 3000);

        socket.connect(502, ipAddress, () => {
          clearTimeout(timeout);
          socket.destroy();
          resolve(true);
        });

        socket.on('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      });
    };

    const modbusSuccess = await modbusTest();

    if (modbusSuccess) {
      return res.json({
        success: true,
        message: `Successfully connected to ${ipAddress} (Slave ID: ${slaveAddress})`,
        pingSuccess: true,
        modbusSuccess: true,
      });
    } else {
      return res.json({
        success: false,
        error: `Cannot connect to Modbus device at ${ipAddress}:502. Device may be offline, unreachable, or Modbus TCP port is closed.`,
        pingSuccess: false,
        modbusSuccess: false,
      });
    }
  } catch (error: any) {
    console.error('Error testing connection:', error);
    res.status(500).json({
      error: error.message || 'Failed to test connection',
      success: false,
    });
  }
});

// Get device by ID (check permissions)
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    await ensureSchema();
    
    // Check permissions
    const hasPermission = await checkDevicePermission(
      req.userId!,
      req.userRole!,
      req.params.id
    );
    
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied to this device' });
    }
    
    const result = await db.query(`
      SELECT 
        id,
        name,
        type,
        ip_address as "ipAddress",
        subnet_mask as "subnetMask",
        slave_address as "slaveAddress",
        status,
        last_seen as "lastSeen",
        include_in_total_summary as "includeInTotalSummary",
        parameter_mappings as "parameterMappings"
      FROM devices
      WHERE id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching device:', error);
    res.status(500).json({ error: 'Failed to fetch device' });
  }
});

// Create new device (admin only)
router.post('/', requireAdmin, async (req: AuthRequest, res) => {
  try {
    await ensureSchema();
    
    const deviceData = deviceSchema.parse(req.body);
    
    // Insert device
    await db.query(`
      INSERT INTO devices (id, name, type, ip_address, subnet_mask, slave_address, status, include_in_total_summary, parameter_mappings)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        ip_address = EXCLUDED.ip_address,
        subnet_mask = EXCLUDED.subnet_mask,
        slave_address = EXCLUDED.slave_address,
        status = EXCLUDED.status,
        include_in_total_summary = EXCLUDED.include_in_total_summary,
        parameter_mappings = EXCLUDED.parameter_mappings,
        updated_at = CURRENT_TIMESTAMP
    `, [
      deviceData.id,
      deviceData.name,
      deviceData.type,
      deviceData.ipAddress,
      deviceData.subnetMask || '255.255.255.0',
      deviceData.slaveAddress ?? 1,
      deviceData.status,
      deviceData.includeInTotalSummary,
      deviceData.parameterMappings ? JSON.stringify(deviceData.parameterMappings) : null
    ]);
    
    // Create table for this device
    await createDeviceTable(deviceData.id);
    
    // Fetch and return the created device
    const result = await db.query(`
      SELECT 
        id,
        name,
        type,
        ip_address as "ipAddress",
        subnet_mask as "subnetMask",
        slave_address as "slaveAddress",
        status,
        last_seen as "lastSeen",
        include_in_total_summary as "includeInTotalSummary",
        parameter_mappings as "parameterMappings"
      FROM devices
      WHERE id = $1
    `, [deviceData.id]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid device data', details: error.errors });
    }
    console.error('Error creating device:', error);
    res.status(500).json({ error: 'Failed to create device' });
  }
});

// Update device (admin only)
router.put('/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    await ensureSchema();
    
    const updateSchema = deviceSchema.partial().omit({ id: true });
    const updateData = updateSchema.parse(req.body);
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    if (updateData.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(updateData.name);
    }
    if (updateData.type !== undefined) {
      updates.push(`type = $${paramCount++}`);
      values.push(updateData.type);
    }
    if (updateData.ipAddress !== undefined) {
      updates.push(`ip_address = $${paramCount++}`);
      values.push(updateData.ipAddress);
    }
    if (updateData.subnetMask !== undefined) {
      updates.push(`subnet_mask = $${paramCount++}`);
      values.push(updateData.subnetMask || '255.255.255.0');
    }
    if (updateData.slaveAddress !== undefined) {
      updates.push(`slave_address = $${paramCount++}`);
      values.push(updateData.slaveAddress);
    }
    if (updateData.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(updateData.status);
    }
    if (updateData.includeInTotalSummary !== undefined) {
      updates.push(`include_in_total_summary = $${paramCount++}`);
      values.push(updateData.includeInTotalSummary);
    }
    if (updateData.parameterMappings !== undefined) {
      updates.push(`parameter_mappings = $${paramCount++}`);
      values.push(updateData.parameterMappings ? JSON.stringify(updateData.parameterMappings) : null);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.params.id);
    
    await db.query(`
      UPDATE devices
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
    `, values);
    
    // Fetch and return updated device
    const result = await db.query(`
      SELECT 
        id,
        name,
        type,
        ip_address as "ipAddress",
        subnet_mask as "subnetMask",
        slave_address as "slaveAddress",
        status,
        last_seen as "lastSeen",
        include_in_total_summary as "includeInTotalSummary",
        parameter_mappings as "parameterMappings"
      FROM devices
      WHERE id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid device data', details: error.errors });
    }
    console.error('Error updating device:', error);
    res.status(500).json({ error: 'Failed to update device' });
  }
});

// Delete device (admin only)
router.delete('/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    await ensureSchema();
    
    // Delete device table first
    await deleteDeviceTable(req.params.id);
    
    // Delete device record
    const result = await db.query('DELETE FROM devices WHERE id = $1 RETURNING id', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    res.json({ message: 'Device deleted successfully', id: req.params.id });
  } catch (error) {
    console.error('Error deleting device:', error);
    res.status(500).json({ error: 'Failed to delete device' });
  }
});

// Update device status
router.patch('/:id/status', async (req, res) => {
  try {
    await ensureSchema();
    
    const { status } = req.body;
    if (!['online', 'offline', 'connecting'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    await db.query(`
      UPDATE devices
      SET status = $1, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [status, req.params.id]);
    
    const result = await db.query(`
      SELECT 
        id,
        name,
        type,
        ip_address as "ipAddress",
        subnet_mask as "subnetMask",
        slave_address as "slaveAddress",
        status,
        last_seen as "lastSeen",
        include_in_total_summary as "includeInTotalSummary",
        parameter_mappings as "parameterMappings"
      FROM devices
      WHERE id = $1
    `, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating device status:', error);
    res.status(500).json({ error: 'Failed to update device status' });
  }
});

export { router as deviceRoutes };

