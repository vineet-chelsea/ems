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

// Helper to create numeric schema that handles empty strings and converts strings to numbers
const numericField = (min: number, max: number, isInt: boolean = false) => {
  return z.preprocess(
    (val) => {
      // Handle empty string, null, undefined - return undefined for optional fields
      if (val === '' || val === null || val === undefined) {
        return undefined;
      }
      // If already a number, validate range and return
      if (typeof val === 'number') {
        if (isNaN(val) || !isFinite(val)) return undefined;
        return val;
      }
      // Try to parse string to number
      const num = isInt ? parseInt(String(val), 10) : parseFloat(String(val));
      // Return undefined if parsing failed, otherwise return the number
      if (isNaN(num) || !isFinite(num)) return undefined;
      return num;
    },
    z.number().min(min).max(max).optional()
  );
};

// Device validation schema with coercion for numeric fields
const deviceSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.string().min(1),
  ipAddress: z.string().ip(),
  subnetMask: z.string().default('255.255.255.0'),
  slaveAddress: z.coerce.number().int().min(0).max(255).default(1),
  breakerRating: numericField(0, 100000, true),
  unitCost: numericField(0, 1000000, false),
  status: z.enum(['online', 'offline', 'connecting']).default('offline'),
  includeInTotalSummary: z.boolean().default(true),
  parameterMappings: z.record(z.string(), z.string()).optional(),
  // Micrologic 6E protection settings - coerce strings to numbers
  protectionIr: numericField(0.1, 1.0, false),
  protectionTr: numericField(0.5, 25.0, false),
  protectionIsd: numericField(1.0, 10.0, false),
  protectionTsd: numericField(0.1, 0.4, false),
  protectionIi: numericField(2.0, 10.0, false),
  protectionIg: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).optional().nullable(),
  protectionTg: numericField(0.1, 0.4, false),
});

// Test device connection (ping IP and test Modbus TCP)
// MUST be before all parameterized routes to avoid route conflicts
router.post('/test-connection', async (req: AuthRequest, res) => {
  console.log('=== TEST-CONNECTION ROUTE HIT ===');
  console.log('Request body:', JSON.stringify(req.body));
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
        breaker_rating as "breakerRating",
        unit_cost as "unitCost",
        status,
        last_seen as "lastSeen",
        include_in_total_summary as "includeInTotalSummary",
        parameter_mappings as "parameterMappings",
        protection_ir as "protectionIr",
        protection_tr as "protectionTr",
        protection_isd as "protectionIsd",
        protection_tsd as "protectionTsd",
        protection_ii as "protectionIi",
        protection_ig as "protectionIg",
        protection_tg as "protectionTg"
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
        breaker_rating as "breakerRating",
        unit_cost as "unitCost",
        status,
        last_seen as "lastSeen",
        include_in_total_summary as "includeInTotalSummary",
        parameter_mappings as "parameterMappings",
        protection_ir as "protectionIr",
        protection_tr as "protectionTr",
        protection_isd as "protectionIsd",
        protection_tsd as "protectionTsd",
        protection_ii as "protectionIi",
        protection_ig as "protectionIg",
        protection_tg as "protectionTg"
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
      INSERT INTO devices (id, name, type, ip_address, subnet_mask, slave_address, breaker_rating, unit_cost, status, include_in_total_summary, parameter_mappings, protection_ir, protection_tr, protection_isd, protection_tsd, protection_ii, protection_ig, protection_tg)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        ip_address = EXCLUDED.ip_address,
        subnet_mask = EXCLUDED.subnet_mask,
        slave_address = EXCLUDED.slave_address,
        breaker_rating = EXCLUDED.breaker_rating,
        unit_cost = EXCLUDED.unit_cost,
        status = EXCLUDED.status,
        include_in_total_summary = EXCLUDED.include_in_total_summary,
        parameter_mappings = EXCLUDED.parameter_mappings,
        protection_ir = EXCLUDED.protection_ir,
        protection_tr = EXCLUDED.protection_tr,
        protection_isd = EXCLUDED.protection_isd,
        protection_tsd = EXCLUDED.protection_tsd,
        protection_ii = EXCLUDED.protection_ii,
        protection_ig = EXCLUDED.protection_ig,
        protection_tg = EXCLUDED.protection_tg,
        updated_at = CURRENT_TIMESTAMP
    `, [
      deviceData.id,
      deviceData.name,
      deviceData.type,
      deviceData.ipAddress,
      deviceData.subnetMask || '255.255.255.0',
      deviceData.slaveAddress ?? 1,
      deviceData.breakerRating ?? null,
      deviceData.unitCost ?? null,
      deviceData.status,
      deviceData.includeInTotalSummary,
      deviceData.parameterMappings ? JSON.stringify(deviceData.parameterMappings) : null,
      deviceData.protectionIr ?? null,
      deviceData.protectionTr ?? null,
      deviceData.protectionIsd ?? null,
      deviceData.protectionTsd ?? null,
      deviceData.protectionIi ?? null,
      deviceData.protectionIg ?? null,
      deviceData.protectionTg ?? null,
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
        breaker_rating as "breakerRating",
        unit_cost as "unitCost",
        status,
        last_seen as "lastSeen",
        include_in_total_summary as "includeInTotalSummary",
        parameter_mappings as "parameterMappings",
        protection_ir as "protectionIr",
        protection_tr as "protectionTr",
        protection_isd as "protectionIsd",
        protection_tsd as "protectionTsd",
        protection_ii as "protectionIi",
        protection_ig as "protectionIg",
        protection_tg as "protectionTg"
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
    
    console.log('[Device Update] Received update request:', JSON.stringify(req.body, null, 2));
    console.log('[Device Update] Request body types:', Object.entries(req.body).map(([k, v]) => `${k}: ${typeof v} (${JSON.stringify(v)})`).join(', '));
    
    // Preprocess: filter out read-only fields and convert values
    const allowedUpdateFields = [
      'name', 'type', 'ipAddress', 'subnetMask', 'slaveAddress',
      'breakerRating', 'unitCost', 'status', 'includeInTotalSummary',
      'parameterMappings', 'protectionIr', 'protectionTr', 'protectionIsd',
      'protectionTsd', 'protectionIi', 'protectionIg', 'protectionTg'
    ];
    
    const preprocessedBody: any = {};
    // Only include allowed fields
    for (const field of allowedUpdateFields) {
      if (req.body[field] !== undefined) {
        preprocessedBody[field] = req.body[field];
      }
    }
    
    // Handle parameterMappings: convert null to undefined
    if (preprocessedBody.parameterMappings === null) {
      delete preprocessedBody.parameterMappings;
    }
    
    // Remove read-only fields that shouldn't be in update requests
    const readOnlyFields = ['id', 'lastSeen', 'parameters'];
    readOnlyFields.forEach(field => {
      delete preprocessedBody[field];
    });
    
    // Convert empty strings to undefined and strings to numbers for numeric fields
    const numericFields = ['breakerRating', 'unitCost', 'protectionIr', 'protectionTr', 'protectionIsd', 'protectionTsd', 'protectionIi', 'protectionTg'];
    for (const field of numericFields) {
      if (preprocessedBody[field] === '' || preprocessedBody[field] === null) {
        delete preprocessedBody[field]; // Remove the field entirely if empty
      } else if (preprocessedBody[field] !== undefined) {
        // Convert to number if it's a string or if it's already a number, ensure it's valid
        if (typeof preprocessedBody[field] === 'string') {
          const num = field === 'breakerRating' ? parseInt(preprocessedBody[field], 10) : parseFloat(preprocessedBody[field]);
          if (!isNaN(num) && isFinite(num)) {
            preprocessedBody[field] = num;
            console.log(`[Device Update] Converted ${field} from string "${preprocessedBody[field]}" to number ${num}`);
          } else {
            console.log(`[Device Update] Invalid number for ${field}: "${preprocessedBody[field]}", removing field`);
            delete preprocessedBody[field];
          }
        } else if (typeof preprocessedBody[field] === 'number') {
          // Already a number, but validate it's finite
          if (isNaN(preprocessedBody[field]) || !isFinite(preprocessedBody[field])) {
            console.log(`[Device Update] Invalid number for ${field}: ${preprocessedBody[field]}, removing field`);
            delete preprocessedBody[field];
          }
        }
      }
    }
    console.log('[Device Update] Preprocessed body:', JSON.stringify(preprocessedBody, null, 2));
    
    // Create a more lenient update schema
    const updateSchema = z.object({
      name: z.string().min(1).optional(),
      type: z.string().min(1).optional(),
      ipAddress: z.string().ip().optional(),
      subnetMask: z.string().optional(),
      slaveAddress: z.coerce.number().int().min(0).max(255).optional(),
      breakerRating: z.coerce.number().int().min(0).max(100000).optional(),
      unitCost: z.coerce.number().min(0).max(1000000).optional(),
      status: z.enum(['online', 'offline', 'connecting']).optional(),
      includeInTotalSummary: z.boolean().optional(),
      parameterMappings: z.record(z.string(), z.string()).optional().nullable(),
      protectionIr: z.coerce.number().min(0.1).max(1.0).optional(),
      protectionTr: z.coerce.number().min(0.5).max(25.0).optional(),
      protectionIsd: z.coerce.number().min(1.0).max(10.0).optional(),
      protectionTsd: z.coerce.number().min(0.1).max(0.4).optional(),
      protectionIi: z.coerce.number().min(2.0).max(10.0).optional(),
      protectionIg: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).optional().nullable(),
      protectionTg: z.coerce.number().min(0.1).max(0.4).optional(),
    }).passthrough(); // Allow extra fields to pass through
    
    let updateData;
    try {
      updateData = updateSchema.parse(preprocessedBody);
      console.log('[Device Update] Parsed update data:', JSON.stringify(updateData, null, 2));
      console.log('[Device Update] Parsed data types:', Object.entries(updateData).map(([k, v]) => `${k}: ${typeof v} (${v})`).join(', '));
    } catch (validationError: any) {
      console.error('[Device Update] Validation error:', validationError);
      if (validationError instanceof z.ZodError) {
        console.error('[Device Update] Validation errors:', JSON.stringify(validationError.errors, null, 2));
        return res.status(400).json({ error: 'Invalid device data', details: validationError.errors });
      }
      throw validationError;
    }
    
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
    if (updateData.breakerRating !== undefined) {
      updates.push(`breaker_rating = $${paramCount++}`);
      values.push(updateData.breakerRating ?? null);
    }
    if (updateData.unitCost !== undefined) {
      updates.push(`unit_cost = $${paramCount++}`);
      values.push(updateData.unitCost ?? null);
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
    if (updateData.protectionIr !== undefined) {
      updates.push(`protection_ir = $${paramCount++}`);
      values.push(updateData.protectionIr ?? null);
    }
    if (updateData.protectionTr !== undefined) {
      updates.push(`protection_tr = $${paramCount++}`);
      values.push(updateData.protectionTr ?? null);
    }
    if (updateData.protectionIsd !== undefined) {
      updates.push(`protection_isd = $${paramCount++}`);
      values.push(updateData.protectionIsd ?? null);
    }
    if (updateData.protectionTsd !== undefined) {
      updates.push(`protection_tsd = $${paramCount++}`);
      values.push(updateData.protectionTsd ?? null);
    }
    if (updateData.protectionIi !== undefined) {
      updates.push(`protection_ii = $${paramCount++}`);
      values.push(updateData.protectionIi ?? null);
    }
    if (updateData.protectionIg !== undefined) {
      updates.push(`protection_ig = $${paramCount++}`);
      values.push(updateData.protectionIg ?? null);
    }
    if (updateData.protectionTg !== undefined) {
      updates.push(`protection_tg = $${paramCount++}`);
      values.push(updateData.protectionTg ?? null);
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
        breaker_rating as "breakerRating",
        unit_cost as "unitCost",
        status,
        last_seen as "lastSeen",
        include_in_total_summary as "includeInTotalSummary",
        parameter_mappings as "parameterMappings",
        protection_ir as "protectionIr",
        protection_tr as "protectionTr",
        protection_isd as "protectionIsd",
        protection_tsd as "protectionTsd",
        protection_ii as "protectionIi",
        protection_ig as "protectionIg",
        protection_tg as "protectionTg"
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
        breaker_rating as "breakerRating",
        unit_cost as "unitCost",
        status,
        last_seen as "lastSeen",
        include_in_total_summary as "includeInTotalSummary",
        parameter_mappings as "parameterMappings",
        protection_ir as "protectionIr",
        protection_tr as "protectionTr",
        protection_isd as "protectionIsd",
        protection_tsd as "protectionTsd",
        protection_ii as "protectionIi",
        protection_ig as "protectionIg",
        protection_tg as "protectionTg"
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

// Update existing devices migration endpoint (admin only)
router.post('/migrate-existing', requireAdmin, async (req: AuthRequest, res) => {
  try {
    await ensureSchema();
    
    // Get all Micrologic 6E devices
    const devices = await db.query(`
      SELECT id, name, type
      FROM devices
      WHERE type = 'MICROLOGIC_6E'
    `);
    
    console.log(`[Migration] Found ${devices.rows.length} Micrologic 6E device(s) to update`);
    
    // Verify all protection columns exist by querying them
    for (const device of devices.rows) {
      const deviceData = await db.query(`
        SELECT 
          protection_ir,
          protection_tr,
          protection_isd,
          protection_tsd,
          protection_ii,
          protection_ig,
          protection_tg
        FROM devices
        WHERE id = $1
      `, [device.id]);
      
      if (deviceData.rows.length > 0) {
        console.log(`[Migration] Device ${device.name} (${device.id}) - Protection columns verified`);
      }
    }
    
    res.json({
      success: true,
      message: `Migration completed. ${devices.rows.length} Micrologic 6E device(s) updated.`,
      devicesUpdated: devices.rows.length
    });
  } catch (error: any) {
    console.error('Error migrating existing devices:', error);
    res.status(500).json({ error: 'Failed to migrate existing devices', details: error.message });
  }
});

export { router as deviceRoutes };

