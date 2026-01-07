import express from 'express';
import { db } from '../db/connection.js';
import { getDeviceTableName } from '../db/tableManager.js';
import { authenticateToken, checkDevicePermission, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { sendDataPoint } from '../services/kafka.js';
import { collectAllDevicesData } from '../services/dataCollector.js';
import { gpuProcessor } from '../services/gpuProcessor.js';
import { z } from 'zod';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Helper function to convert lowercase column names to camelCase
function convertToCamelCase(key: string): string {
  const mapping: Record<string, string> = {
    vr: 'VR', vy: 'VY', vb: 'VB',
    v1: 'V1', v2: 'V2', v3: 'V3',
    v: 'V', vavg: 'Vavg', vpeak: 'Vpeak',
    ir: 'IR', iy: 'IY', ib: 'IB',
    i1: 'I1', i2: 'I2', i3: 'I3',
    i: 'I', iavg: 'Iavg', ipeak: 'Ipeak',
    p1: 'P1', p2: 'P2', p3: 'P3', ptotal: 'Ptotal',
    q1: 'Q1', q2: 'Q2', q3: 'Q3', qtotal: 'Qtotal',
    s1: 'S1', s2: 'S2', s3: 'S3', stotal: 'Stotal',
    pf1: 'PF1', pf2: 'PF2', pf3: 'PF3', pfavg: 'PFavg', pf: 'PF',
    frequency: 'frequency',
    energy_active: 'energy_active',
    energy_reactive: 'energy_reactive',
    energy_apparent: 'energy_apparent',
    thd_v1: 'THD_V1', thd_v2: 'THD_V2', thd_v3: 'THD_V3',
    thd_i1: 'THD_I1', thd_i2: 'THD_I2', thd_i3: 'THD_I3',
    thd_v: 'THD_V', thd_i: 'THD_I',
    temperature: 'temperature',
    humidity: 'humidity',
  };
  
  return mapping[key] || key;
}

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
    
    // Convert lowercase column names to camelCase for frontend compatibility
    const camelCaseData = result.rows.map(row => {
      const camelRow: any = {
        id: row.id,
        timestamp: row.timestamp,
      };
      
      // Map all columns (PostgreSQL returns lowercase)
      Object.keys(row).forEach(key => {
        if (key !== 'id' && key !== 'timestamp') {
          // Convert to camelCase based on known mappings
          const camelKey = convertToCamelCase(key);
          camelRow[camelKey] = row[key];
          // Also keep lowercase version for backward compatibility
          camelRow[key] = row[key];
        }
      });
      
      return camelRow;
    });
    
    res.json({
      deviceId,
      count: camelCaseData.length,
      data: camelCaseData
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
    
    // Check if table exists
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )
    `, [tableName]);
    
    if (!tableExists.rows[0].exists) {
      console.warn(`Table ${tableName} does not exist for device ${deviceId}`);
      return res.status(404).json({ error: 'Device data table not found. Device may need initialization.' });
    }
    
    const result = await db.query(`
      SELECT * FROM ${tableName}
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      // Log for debugging - this is normal for new devices
      console.log(`No data points found for device ${deviceId} in table ${tableName}`);
      return res.status(404).json({ error: 'No data points found' });
    }
    
    // Get device type to retrieve register mappings for parameter name mapping
    const deviceResult = await db.query('SELECT type FROM devices WHERE id = $1', [deviceId]);
    let parameterNameMap: Record<string, string> = {};
    
    // Helper function to sanitize column name (same as in dataCollector)
    function sanitizeColumnName(name: string): string {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
    }
    
    if (deviceResult.rows.length > 0) {
      const deviceType = deviceResult.rows[0].type;
      // Get register mappings from device configs
      try {
        // Use the dataCollector's getDefaultDeviceConfig function
        const dataCollectorModule = await import('../services/dataCollector.js');
        // Access the internal function - it's not exported, so we'll use a workaround
        // Instead, we'll make an internal API call or use the device configs route handler
        
        // Make internal request to device configs endpoint (same server)
        const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
        try {
          const configResponse = await fetch(`${baseUrl}/api/device-configs/${deviceType}`, {
            headers: {
              'Content-Type': 'application/json'
            }
          });
          if (configResponse.ok) {
            const config = await configResponse.json() as { registerMappings?: Array<{ parameter: string }> };
            if (config.registerMappings && Array.isArray(config.registerMappings)) {
              // Create mapping from sanitized column name to original parameter name
              config.registerMappings.forEach((mapping) => {
                const originalName = mapping.parameter.toLowerCase();
                const sanitized = sanitizeColumnName(originalName);
                parameterNameMap[sanitized] = mapping.parameter;
                
                // Also handle potential duplicates with suffixes
                for (let i = 1; i <= 10; i++) {
                  parameterNameMap[`${sanitized}_${i}`] = mapping.parameter;
                }
              });
            }
          }
        } catch (fetchError) {
          // If fetch fails (server not ready), continue without mapping
          // The frontend will handle matching with sanitized names
          console.warn(`Could not fetch device config (server may not be ready):`, fetchError);
        }
      } catch (error) {
        console.warn(`Could not load register mappings for device ${deviceId}:`, error);
      }
    }
    
    // PostgreSQL returns column names in lowercase, map back to original parameter names
    const row = result.rows[0];
    const responseRow: any = {
      id: row.id,
      timestamp: row.timestamp,
    };
    
    // Map all columns - use original parameter name if available, otherwise use sanitized name
    Object.keys(row).forEach(key => {
      if (key !== 'id' && key !== 'timestamp') {
        const value = row[key];
        // Try to find original parameter name
        const originalName = parameterNameMap[key] || key;
        
        // Store with original parameter name (for frontend matching)
        responseRow[originalName] = value;
        
        // Also keep sanitized name for backward compatibility
        responseRow[key] = value;
        
        // Convert to camelCase for additional compatibility
        const camelKey = convertToCamelCase(key);
        if (camelKey !== key && camelKey !== originalName) {
          responseRow[camelKey] = value;
        }
      }
    });
    
    res.json(responseRow);
  } catch (error) {
    console.error('Error fetching latest data point:', error);
    res.status(500).json({ error: 'Failed to fetch latest data point' });
  }
});

// Get time-series data for a specific parameter
router.get('/:deviceId/parameter/:parameterName', async (req: AuthRequest, res) => {
  try {
    const deviceId = req.params.deviceId;
    const parameterName = decodeURIComponent(req.params.parameterName); // Decode URL-encoded parameter name
    
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
    
    // Check if device exists and get device type
    const deviceCheck = await db.query('SELECT id, type FROM devices WHERE id = $1', [deviceId]);
    if (deviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    const deviceType = deviceCheck.rows[0].type;
    
    // Parse query parameters
    const startTime = req.query.startTime as string;
    const endTime = req.query.endTime as string;
    const limit = parseInt(req.query.limit as string) || 100; // Default to 100 points for charts
    const offset = parseInt(req.query.offset as string) || 0;
    
    // Helper function to sanitize column name (same as in dataCollector)
    const sanitizeColumnName = (name: string): string => {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
    };
    
    // Get device config to map parameter name to database column name
    let actualColumnName: string | null = null;
    let reverseParameterMap: Record<string, string> = {}; // Maps original param name -> sanitized column name
    
    console.log(`[Parameter Time-Series] Fetching data for parameter: "${parameterName}" (device: ${deviceId}, type: ${deviceType})`);
    
    try {
      const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
      const configResponse = await fetch(`${baseUrl}/api/device-configs/${deviceType}`, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (configResponse.ok) {
        const config = await configResponse.json() as { registerMappings?: Array<{ parameter: string }> };
        if (config.registerMappings && Array.isArray(config.registerMappings)) {
          // Build reverse map: original parameter name -> sanitized column name
          config.registerMappings.forEach((mapping) => {
            const originalName = mapping.parameter;
            const sanitized = sanitizeColumnName(originalName);
            reverseParameterMap[originalName.toLowerCase()] = sanitized;
            reverseParameterMap[originalName] = sanitized;
            
            // Also handle potential duplicates with suffixes
            for (let i = 1; i <= 10; i++) {
              reverseParameterMap[`${originalName.toLowerCase()}_${i}`] = `${sanitized}_${i}`;
            }
          });
          
          // Try to find the column name from the parameter name
          const paramNameLower = parameterName.toLowerCase();
          if (reverseParameterMap[paramNameLower] || reverseParameterMap[parameterName]) {
            actualColumnName = reverseParameterMap[paramNameLower] || reverseParameterMap[parameterName];
            console.log(`[Parameter Time-Series] Mapped parameter "${parameterName}" to column "${actualColumnName}"`);
          } else {
            console.log(`[Parameter Time-Series] Parameter "${parameterName}" not found in config mappings, will try direct sanitization`);
          }
        }
      }
    } catch (error) {
      console.warn('Could not fetch device config for parameter mapping:', error);
    }
    
    // If we couldn't map from config, try sanitizing the parameter name directly
    if (!actualColumnName) {
      actualColumnName = sanitizeColumnName(parameterName);
    }
    
    // First, get all available columns to help with debugging
    const allAvailableColumns = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = $1 
      AND column_name NOT IN ('id', 'timestamp')
      AND data_type IN ('double precision', 'integer', 'smallint', 'bigint', 'numeric', 'real')
      ORDER BY column_name
    `, [tableName]);
    
    console.log(`[Parameter Time-Series] Available numeric columns in table "${tableName}":`, 
      allAvailableColumns.rows.map((r: any) => `${r.column_name} (${r.data_type})`).slice(0, 20));
    
    // First, check if the parameter name is already a valid column name (case-insensitive)
    const allColumnsCheck = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = $1 
      AND LOWER(column_name) = LOWER($2)
      LIMIT 1
    `, [tableName, parameterName]);
    
    let foundColumnName = actualColumnName;
    
    if (allColumnsCheck.rows.length > 0) {
      // Parameter name matches a column directly (case-insensitive)
      foundColumnName = allColumnsCheck.rows[0].column_name;
      console.log(`[Parameter Time-Series] Parameter name "${parameterName}" directly matches column "${foundColumnName}"`);
    } else {
      // Check if column exists, try exact match first, then with suffixes
      const columnCheck = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = $1 
        AND column_name = $2
      `, [tableName, actualColumnName]);
      
      if (columnCheck.rows.length > 0) {
        foundColumnName = columnCheck.rows[0].column_name;
      } else {
        // Try to find similar column names (handle duplicates with _1, _2, etc.)
        const similarColumns = await db.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = $1 
          AND column_name LIKE $2
          ORDER BY column_name
          LIMIT 1
        `, [tableName, `${actualColumnName}%`]);
        
        if (similarColumns.rows.length > 0) {
          foundColumnName = similarColumns.rows[0].column_name;
        } else {
          // Last resort: try to find any column that matches (case-insensitive search)
          const allColumns = await db.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = $1 
            AND column_name NOT IN ('id', 'timestamp')
            AND data_type IN ('double precision', 'integer', 'smallint', 'bigint', 'numeric', 'real')
          `, [tableName]);
          
          // Try to find a match by comparing sanitized names
          for (const col of allColumns.rows) {
            const colName = col.column_name;
            const sanitizedColName = sanitizeColumnName(colName);
            if (sanitizedColName === actualColumnName || colName === actualColumnName ||
                sanitizedColName === sanitizeColumnName(parameterName) ||
                colName.toLowerCase() === parameterName.toLowerCase()) {
              foundColumnName = colName;
              console.log(`[Parameter Time-Series] Matched "${parameterName}" to column "${foundColumnName}" via fuzzy matching`);
              break;
            }
          }
          
          if (foundColumnName === actualColumnName && allColumns.rows.length > 0) {
            // Still not found - return error with helpful message
            console.error(`[Parameter Time-Series] Parameter "${parameterName}" (sanitized: "${actualColumnName}") not found. Available columns:`, 
              allColumns.rows.map((r: any) => r.column_name).slice(0, 10));
            return res.status(404).json({ 
              error: `Parameter "${parameterName}" not found in device data`,
              availableColumns: allColumns.rows.map((r: any) => r.column_name).slice(0, 20)
            });
          }
        }
      }
    }
    
    // Verify the column actually exists before querying
    const columnVerify = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = $1 
      AND column_name = $2
    `, [tableName, foundColumnName]);
    
    if (columnVerify.rows.length === 0) {
      console.error(`[Parameter Time-Series] Column "${foundColumnName}" does not exist in table "${tableName}"`);
      return res.status(404).json({ 
        error: `Column "${foundColumnName}" not found in device data table`,
        parameterName,
        attemptedColumnName: foundColumnName,
        availableColumns: allAvailableColumns.rows.map((r: any) => r.column_name).slice(0, 20)
      });
    }
    
    // Check column statistics to see if it has data
    const columnStats = await db.query(`
      SELECT 
        COUNT(*) as total_rows,
        COUNT(${foundColumnName}) as non_null_count,
        MIN(${foundColumnName}) as min_value,
        MAX(${foundColumnName}) as max_value
      FROM ${tableName}
    `);
    
    const stats = columnStats.rows[0];
    console.log(`[Parameter Time-Series] Column "${foundColumnName}" statistics:`, {
      totalRows: stats.total_rows,
      nonNullCount: stats.non_null_count,
      minValue: stats.min_value,
      maxValue: stats.max_value
    });

    // Count actual data points in the requested time range
    let actualCountInRange = 0;
    if (startTime && endTime) {
      const countQuery = `
        SELECT COUNT(*) as count
        FROM ${tableName}
        WHERE timestamp >= $1 AND timestamp <= $2
          AND ${foundColumnName} IS NOT NULL
      `;
      const countResult = await db.query(countQuery, [new Date(startTime), new Date(endTime)]);
      actualCountInRange = parseInt(countResult.rows[0]?.count || '0', 10);
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/773308c4-f8d6-49f7-8e8c-bcfa7cdf7678',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4',location:'data.ts:getParameterTimeSeries',message:'database count check',data:{parameterName,foundColumnName,requestedLimit:limit,actualCountInRange,totalRows:stats.total_rows,nonNullCount:stats.non_null_count,startTime,endTime},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    
    // Build query using the found column name.
    // Goal: fixed N points spread across requested window (startTime/endTime).
    // We do index-friendly sampling by generating N target timestamps and picking nearest samples.
    // For reports: if actual data count is less than requested limit, fetch all actual points instead of downsampling
    const shouldUseDownsample = Boolean(startTime && endTime && limit && limit > 0);
    // Disable downsampling if we have fewer actual points than the requested limit (common for reports)
    const useDownsample = shouldUseDownsample && actualCountInRange > 0 && actualCountInRange > limit;
    let query = '';
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;
    
    // Only include non-null values if the column has non-null data
    if (stats.non_null_count > 0) {
      conditions.push(`${foundColumnName} IS NOT NULL`);
    } else {
      console.warn(`[Parameter Time-Series] Column "${foundColumnName}" has no non-null values! All ${stats.total_rows} rows are null.`);
    }
    
    if (startTime) {
      conditions.push(`timestamp >= $${paramCount++}`);
      values.push(new Date(startTime));
    }
    
    if (endTime) {
      conditions.push(`timestamp <= $${paramCount++}`);
      values.push(new Date(endTime));
    }

    if (useDownsample) {
      // Replace query with downsampled sampling across [startTime, endTime]
      const n = Math.max(2, limit); // Use the requested limit directly
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/773308c4-f8d6-49f7-8e8c-bcfa7cdf7678',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'post-fix',hypothesisId:'H1',location:'data.ts:getParameterTimeSeries',message:'downsampling activated',data:{requestedLimit:limit,actualN:n,actualCountInRange,startTime,endTime,useDownsample},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      const baseCond = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      query = `
        WITH bounds AS (
          SELECT $1::timestamptz AS start_ts, $2::timestamptz AS end_ts, $3::int AS n
        ),
        targets AS (
          SELECT
            (start_ts + (end_ts - start_ts) * (i::double precision / (n - 1))) AS target_ts,
            i
          FROM bounds, generate_series(0, (SELECT n - 1 FROM bounds)) AS i
        ),
        samples AS (
          SELECT
            COALESCE(a.timestamp, b.timestamp) AS timestamp,
            COALESCE(a.value, b.value) AS value,
            t.i
          FROM targets t
          LEFT JOIN LATERAL (
            SELECT timestamp, ${foundColumnName}::double precision AS value
            FROM ${tableName}
            ${baseCond}
              AND timestamp >= t.target_ts
            ORDER BY timestamp ASC
            LIMIT 1
          ) a ON TRUE
          LEFT JOIN LATERAL (
            SELECT timestamp, ${foundColumnName}::double precision AS value
            FROM ${tableName}
            ${baseCond}
              AND timestamp <= t.target_ts
            ORDER BY timestamp DESC
            LIMIT 1
          ) b ON TRUE
        )
        SELECT timestamp, value
        FROM samples
        WHERE timestamp IS NOT NULL
        ORDER BY timestamp ASC
      `;
      // overwrite values for this query
      values.length = 0;
      values.push(new Date(startTime!), new Date(endTime!), n);
    } else {
      // Fetch all actual data points (no downsampling)
      // If we have actualCountInRange, use it to set a reasonable limit, otherwise use requested limit
      const effectiveLimit = actualCountInRange > 0 ? Math.min(actualCountInRange, limit || 10000) : (limit || 1000);
      query = `SELECT timestamp, value FROM (
        SELECT timestamp, ${foundColumnName}::double precision as value FROM ${tableName}`;
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      query += ` ORDER BY timestamp ASC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
      values.push(effectiveLimit, offset);
      query += `) t ORDER BY timestamp ASC`;
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/773308c4-f8d6-49f7-8e8c-bcfa7cdf7678',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'post-fix',hypothesisId:'H4',location:'data.ts:getParameterTimeSeries',message:'no downsampling - fetching all actual points',data:{parameterName,actualCountInRange,requestedLimit:limit,effectiveLimit,useDownsample},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }
    
    console.log(`[Parameter Time-Series] Querying column "${foundColumnName}" with query: ${query}`);
    console.log(`[Parameter Time-Series] Query values:`, values);
    
    const result = await db.query(query, values);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/773308c4-f8d6-49f7-8e8c-bcfa7cdf7678',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'post-fix',hypothesisId:'H4',location:'data.ts:getParameterTimeSeries',message:'query result',data:{rowCount:result.rows.length,requestedLimit:limit,actualCountInRange,useDownsample,parameterName,downsampleN:useDownsample?Math.max(2,Math.min(limit,500)):null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    
    // Debug: Check if values are actually null
    const resultNullCount = result.rows.filter((r: any) => r.value === null || r.value === undefined).length;
    console.log(`[Parameter Time-Series] Query returned ${result.rows.length} rows, ${resultNullCount} are null`);
    
    // If all values are null but column stats show non-null data, the column name might be wrong
    if (resultNullCount === result.rows.length && result.rows.length > 0 && stats.non_null_count > 0) {
      console.error(`[Parameter Time-Series] CRITICAL: Query returned all nulls but column stats show ${stats.non_null_count} non-null values!`);
      console.error(`[Parameter Time-Series] Parameter: "${parameterName}", Column used: "${foundColumnName}"`);
      
      // Query the latest row to see what columns actually have values
      const latestRowQuery = `SELECT * FROM ${tableName} ORDER BY timestamp DESC LIMIT 1`;
      const latestRow = await db.query(latestRowQuery);
      if (latestRow.rows.length > 0) {
        const row = latestRow.rows[0];
        const columnsWithValues = Object.keys(row).filter(key => {
          const val = row[key];
          return key !== 'id' && key !== 'timestamp' && val !== null && val !== undefined && typeof val === 'number';
        });
        console.error(`[Parameter Time-Series] Columns with actual numeric values in latest row:`, columnsWithValues);
        console.error(`[Parameter Time-Series] Value of "${foundColumnName}" in latest row:`, row[foundColumnName]);
      }
    }
    
    // If we got no results but column has data, try without the IS NOT NULL filter
    if (result.rows.length === 0 && stats.non_null_count > 0) {
      console.warn(`[Parameter Time-Series] Query with IS NOT NULL returned 0 rows, but column has ${columnStats.rows[0].non_null_count} non-null values. Trying without filter...`);
      
      // Try query without IS NOT NULL filter
      // If downsampling is enabled, reuse the same sampling strategy but without the IS NOT NULL condition.
      let queryWithoutFilter = '';
      const valuesWithoutFilter: any[] = [];
      const canDownsample = Boolean(startTime && endTime && limit && limit > 0);
      if (canDownsample) {
        const n = Math.max(2, limit); // Use the requested limit directly
        queryWithoutFilter = `
          WITH bounds AS (
            SELECT $1::timestamptz AS start_ts, $2::timestamptz AS end_ts, $3::int AS n
          ),
          targets AS (
            SELECT
              (start_ts + (end_ts - start_ts) * (i::double precision / (n - 1))) AS target_ts,
              i
            FROM bounds, generate_series(0, (SELECT n - 1 FROM bounds)) AS i
          ),
          samples AS (
            SELECT
              COALESCE(a.timestamp, b.timestamp) AS timestamp,
              COALESCE(a.value, b.value) AS value,
              t.i
            FROM targets t
            LEFT JOIN LATERAL (
              SELECT timestamp, ${foundColumnName}::double precision AS value
              FROM ${tableName}
              WHERE timestamp >= $1 AND timestamp <= $2
                AND timestamp >= t.target_ts
              ORDER BY timestamp ASC
              LIMIT 1
            ) a ON TRUE
            LEFT JOIN LATERAL (
              SELECT timestamp, ${foundColumnName}::double precision AS value
              FROM ${tableName}
              WHERE timestamp >= $1 AND timestamp <= $2
                AND timestamp <= t.target_ts
              ORDER BY timestamp DESC
              LIMIT 1
            ) b ON TRUE
          )
          SELECT timestamp, value
          FROM samples
          WHERE timestamp IS NOT NULL
          ORDER BY timestamp ASC
        `;
        valuesWithoutFilter.push(new Date(startTime!), new Date(endTime!), n);
      } else {
        // Fallback to latest points
        queryWithoutFilter = `SELECT timestamp, value FROM (
          SELECT timestamp, ${foundColumnName}::double precision as value FROM ${tableName}`;
        const conditionsWithoutFilter: string[] = [];
        let paramCountWithoutFilter = 1;
        if (startTime) {
          conditionsWithoutFilter.push(`timestamp >= $${paramCountWithoutFilter++}`);
          valuesWithoutFilter.push(new Date(startTime));
        }
        if (endTime) {
          conditionsWithoutFilter.push(`timestamp <= $${paramCountWithoutFilter++}`);
          valuesWithoutFilter.push(new Date(endTime));
        }
        if (conditionsWithoutFilter.length > 0) {
          queryWithoutFilter += ` WHERE ${conditionsWithoutFilter.join(' AND ')}`;
        }
        queryWithoutFilter += ` ORDER BY timestamp DESC LIMIT $${paramCountWithoutFilter++} OFFSET $${paramCountWithoutFilter++}`;
        valuesWithoutFilter.push(limit, offset);
        queryWithoutFilter += `) t ORDER BY timestamp ASC`;
      }
      
      const resultWithoutFilter = await db.query(queryWithoutFilter, valuesWithoutFilter);
      console.log(`[Parameter Time-Series] Query without IS NOT NULL returned ${resultWithoutFilter.rows.length} rows`);
      
      if (resultWithoutFilter.rows.length > 0) {
        // Use the result without filter, but filter nulls in the response
        const filteredRows = resultWithoutFilter.rows.filter((r: any) => r.value !== null && r.value !== undefined);
        console.log(`[Parameter Time-Series] After filtering nulls: ${filteredRows.length} rows`);
        
        return res.json({
          deviceId,
          parameterName,
          columnName: foundColumnName,
          count: filteredRows.length,
          data: filteredRows.map((row: any) => ({
            timestamp: row.timestamp,
            value: row.value
          }))
        });
      }
    }
    
    // If all values are null but column stats show non-null data, the column name might be wrong
    if (resultNullCount === result.rows.length && result.rows.length > 0 && stats.non_null_count > 0) {
      console.error(`[Parameter Time-Series] CRITICAL: Query returned all nulls but column stats show ${stats.non_null_count} non-null values!`);
      console.error(`[Parameter Time-Series] This suggests the wrong column is being queried.`);
      console.error(`[Parameter Time-Series] Parameter name: "${parameterName}", Column used: "${foundColumnName}"`);
      
      // Try to find the correct column by checking all columns with data
      const columnsWithData = await db.query(`
        SELECT column_name, COUNT(*) as row_count, COUNT(${foundColumnName}) as non_null_count
        FROM information_schema.columns c
        CROSS JOIN ${tableName} t
        WHERE c.table_schema = 'public' 
        AND c.table_name = $1
        AND c.column_name NOT IN ('id', 'timestamp')
        AND c.data_type IN ('double precision', 'integer', 'smallint', 'bigint', 'numeric', 'real')
        GROUP BY column_name
        HAVING COUNT(*) > 0
        ORDER BY non_null_count DESC
        LIMIT 10
      `, [tableName]);
      
      console.error(`[Parameter Time-Series] Columns that might have data:`, columnsWithData.rows);
      
      // Try querying a sample of the actual data to see what columns have values
      const sampleDataQuery = `SELECT * FROM ${tableName} ORDER BY timestamp DESC LIMIT 1`;
      const sampleData = await db.query(sampleDataQuery);
      if (sampleData.rows.length > 0) {
        const sampleRow = sampleData.rows[0];
        const columnsWithValues = Object.keys(sampleRow).filter(key => {
          const val = sampleRow[key];
          return key !== 'id' && key !== 'timestamp' && val !== null && val !== undefined && typeof val === 'number';
        });
        console.error(`[Parameter Time-Series] Columns with actual values in latest row:`, columnsWithValues);
      }
    }
    
    res.json({
      deviceId,
      parameterName,
      columnName: foundColumnName,
      count: result.rows.length,
      data: result.rows.map(row => ({
        timestamp: row.timestamp,
        value: row.value
      }))
    });
  } catch (error) {
    console.error('Error fetching parameter time-series data:', error);
    res.status(500).json({ error: 'Failed to fetch parameter time-series data' });
  }
});

// Get available parameters (columns) for a device from database
router.get('/:deviceId/parameters', async (req: AuthRequest, res) => {
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
    const deviceCheck = await db.query('SELECT id, type FROM devices WHERE id = $1', [deviceId]);
    if (deviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    const deviceType = deviceCheck.rows[0].type;
    
    // Check if table exists
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )
    `, [tableName]);
    
    if (!tableExists.rows[0].exists) {
      // Table doesn't exist yet - return empty array
      return res.json({ parameters: [] });
    }
    
    // Get column information from the device table
    const columnsResult = await db.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = $1
        AND column_name NOT IN ('id', 'timestamp')
      ORDER BY ordinal_position
    `, [tableName]);
    
    // Get device config to map column names back to original parameter names
    let parameterNameMap: Record<string, string> = {};
    try {
      const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
      const configResponse = await fetch(`${baseUrl}/api/device-configs/${deviceType}`);
      if (configResponse.ok) {
        const config = await configResponse.json() as { registerMappings?: Array<{ parameter: string }> };
        if (config.registerMappings && Array.isArray(config.registerMappings)) {
          function sanitizeColumnName(name: string): string {
            return name
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, '_')
              .replace(/_+/g, '_')
              .replace(/^_|_$/g, '');
          }
          
          config.registerMappings.forEach((mapping) => {
            const originalName = mapping.parameter.toLowerCase();
            const sanitized = sanitizeColumnName(originalName);
            parameterNameMap[sanitized] = mapping.parameter;
            for (let i = 1; i <= 10; i++) {
              parameterNameMap[`${sanitized}_${i}`] = mapping.parameter;
            }
          });
        }
      }
    } catch (error) {
      // Continue without mapping - will use column names as-is
    }
    
    // Map columns to parameters, using original names when available
    const parameters = columnsResult.rows
      .filter((row: any) => {
        // Only include numeric columns (exclude text/string columns)
        const dataType = (row.data_type || '').toLowerCase();
        return dataType === 'double precision' || 
               dataType === 'real' || 
               dataType === 'numeric' ||
               dataType === 'integer' ||
               dataType === 'bigint' ||
               dataType === 'smallint';
      })
      .filter((row: any) => {
        // Hide "unknown" columns (usually leftovers from prior mappings) for non-Custom devices.
        // For Custom devices, we still show all numeric columns so users can explore.
        if (deviceType === 'Custom') return true;
        if (!parameterNameMap || Object.keys(parameterNameMap).length === 0) return true;
        return parameterNameMap[row.column_name] !== undefined;
      })
      .map((row: any) => {
        const columnName = row.column_name;
        const originalName = parameterNameMap[columnName] || columnName;
        return {
          key: originalName,
          columnName: columnName, // Keep sanitized name for data lookup
          dataType: row.data_type
        };
      });
    
    res.json({ parameters });
  } catch (error) {
    console.error('Error fetching device parameters:', error);
    res.status(500).json({ error: 'Failed to fetch device parameters' });
  }
});

// Event summary for a device over an interval
router.get('/:deviceId/events', async (req: AuthRequest, res) => {
  try {
    const deviceId = req.params.deviceId;
    const hasPermission = await checkDevicePermission(req.userId!, req.userRole!, deviceId);
    if (!hasPermission) return res.status(403).json({ error: 'Access denied to this device' });

    const startTime = req.query.startTime ? new Date(String(req.query.startTime)) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const endTime = req.query.endTime ? new Date(String(req.query.endTime)) : new Date();
    const limit = Math.min(parseInt(String(req.query.limit || '30')), 200);

    const tableName = getDeviceTableName(deviceId);
    const sanitize = (name: string) => name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

    const eventDefs = [
      'Over Current, Phase',
      'Under Current, Phase',
      'Over Current, Neutral',
      'Over Current, Ground',
      'Over Voltage, L-L',
      'Under Voltage, L-L',
      'Over Voltage, L-N',
      'Under Voltage, L-N',
      'Over Power, Active',
      'Over Power, Reactive',
      'Over Power, Apparent',
      'Lead Power Factor, True',
      'Lag Power Factor, True',
      'Lead Power Factor, Displacement',
      'Lag Power Factor, Displacement',
      'Over Demand, Active Power, Present',
      'Over Demand, Active Power, Last',
      'Over Demand, Active Power, Predicted',
      'Over Demand, Reactive Power, Present',
      'Over Demand, Reactive Power, Last',
      'Over Demand, Reactive Power, Predicted',
      'Over Demand, Apparent Power, Present',
      'Over Demand, Apparent Power, Last',
      'Over Demand, Apparent Power, Predicted',
      'Over Frequency',
      'Under Frequency',
      'Over Voltage Unbalance',
      'Over Voltage Total Harmonic Distortion',
      'Phase Loss',

      // EM6400 computed alarm columns (created by dataCollector)
      'Over Frequency Alarm',
      'Under Frequency Alarm',
      'PF Total Low',
      'PF Total High',
      'OverVoltage Alarm',
      'UnderVoltage Alarm',
      'Phase A loss',
      'Phase B loss',
      'Phase C loss',
      'Current Imbalance Alarm',
      'THD Voltage A-B High',
      'THD Voltage B-C High',
      'THD Voltage C-A High',
      'THD Voltage L-L High',
      'THD Voltage A-N High',
      'THD Voltage B-N High',
      'THD Voltage C-N High',
      'THD Voltage L-N High',
      'THD Current A High',
      'THD Current B High',
      'THD Current C High',
      'THD Current N High',
      'THD Current G High',
    ];

    const events: any[] = [];

    for (const label of eventDefs) {
      const column = sanitize(label);
      try {
        const exists = await db.query(
          `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
          [tableName, column],
        );
        if (exists.rows.length === 0) {
          continue; // skip unmapped columns
        }

        const countRes = await db.query(
          `SELECT COUNT(*) AS cnt FROM ${tableName} WHERE ${column} IS NOT NULL AND ${column} <> 0 AND timestamp BETWEEN $1 AND $2`,
          [startTime, endTime],
        );
        const cnt = parseInt(countRes.rows[0].cnt, 10) || 0;
        if (cnt === 0) {
          continue; // skip if no events in range
        }
        const tsRes = await db.query(
          `SELECT timestamp FROM ${tableName} WHERE ${column} IS NOT NULL AND ${column} <> 0 AND timestamp BETWEEN $1 AND $2 ORDER BY timestamp DESC LIMIT $3`,
          [startTime, endTime, limit],
        );
        events.push({
          label,
          column,
          count: cnt,
          timestamps: tsRes.rows.map((r: any) => r.timestamp),
        });
      } catch (err) {
        console.warn(`Event query failed for ${label}:`, (err as any).message);
      }
    }

    // Interruptions derived from gaps > 30s
    const gapThresholdMs = 30_000;
    const tsAll = await db.query(
      `SELECT timestamp FROM ${tableName} WHERE timestamp BETWEEN $1 AND $2 ORDER BY timestamp ASC`,
      [startTime, endTime],
    );
    let interruptions = 0;
    const gapStarts: string[] = [];
    for (let i = 1; i < tsAll.rows.length; i++) {
      const prev = new Date(tsAll.rows[i - 1].timestamp).getTime();
      const curr = new Date(tsAll.rows[i].timestamp).getTime();
      if (curr - prev > gapThresholdMs) {
        interruptions += 1;
        gapStarts.push(new Date(curr).toISOString());
      }
    }
    const interruptionTimestamps = gapStarts.slice(-limit).reverse();

    // Add interruptions as a computed event
    if (interruptions > 0) {
      events.push({
        label: 'Interruptions',
        column: 'interruptions',
        count: interruptions,
        timestamps: interruptionTimestamps,
      });
    }

    // Computed event: High iTHD (all THD currents > 20%) episodes counted by runs
    try {
      const thdCols = [
        sanitize('THD Current A'),
        sanitize('THD Current B'),
        sanitize('THD Current C'),
        sanitize('THD Current N'),
        sanitize('THD Current G'),
      ];
      // Ensure all columns exist
      const colCheck = await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name = ANY($2)`,
        [tableName, thdCols]
      );
      if (colCheck.rows.length === thdCols.length) {
        const selectCols = thdCols.map(c => `"${c}"`).join(', ');
        const thdRes = await db.query(
          `SELECT timestamp, ${selectCols} FROM ${tableName}
           WHERE ${thdCols.map(c => `"${c}" > 20`).join(' AND ')}
             AND timestamp BETWEEN $1 AND $2
           ORDER BY timestamp ASC`,
          [startTime, endTime]
        );

        // Count episodes (runs) where all THD currents >20%
        let episodes = 0;
        const episodeStarts: string[] = [];
        let inRun = false;
        let lastTs: number | null = null;
        for (const row of thdRes.rows) {
          const tsNum = new Date(row.timestamp).getTime();
          if (!inRun) {
            // start of a new run
            inRun = true;
            episodes += 1;
            episodeStarts.push(row.timestamp);
          } else if (lastTs !== null && tsNum - lastTs > gapThresholdMs) {
            // gap -> new episode
            episodes += 1;
            episodeStarts.push(row.timestamp);
          }
          lastTs = tsNum;
        }

        if (episodes > 0) {
          const tsLimited = episodeStarts.slice(-limit).reverse();
          events.push({
            label: 'High iTHD',
            column: 'high_ithd',
            count: episodes,
            timestamps: tsLimited,
          });
        }
      }
    } catch (err) {
      console.warn('Failed to compute High iTHD:', (err as any).message);
    }

    res.json({
      deviceId,
      startTime,
      endTime,
      events,
      interruptions: {
        count: interruptions,
        timestamps: interruptionTimestamps,
      },
    });
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
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

// Helper function to calculate spatial sampling interval for large datasets
function calculateSpatialSamplingInterval(
  startTime: Date,
  endTime: Date,
  estimatedRows: number,
  maxMemoryMB: number
): number {
  const timeRangeMs = endTime.getTime() - startTime.getTime();
  const timeRangeHours = timeRangeMs / (1000 * 60 * 60);
  
  // Estimate memory: ~1KB per row
  const estimatedMemoryMB = estimatedRows / 1024;
  
  if (estimatedMemoryMB > maxMemoryMB) {
    // Calculate sampling interval to fit in memory
    const targetRows = maxMemoryMB * 1024;
    const samplingRatio = estimatedRows / targetRows;
    const baseInterval = timeRangeMs / estimatedRows; // ms between samples
    return Math.ceil(baseInterval * samplingRatio);
  }
  
  return 0; // No sampling needed
}

// Power Quality and Analysis Report for Micrologic 6E
router.get('/:deviceId/power-quality-report', async (req: AuthRequest, res) => {
  try {
    const deviceId = req.params.deviceId;
    const { startTime, endTime } = req.query as Record<string, string | undefined>;

    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'startTime and endTime are required' });
    }

    const hasPermission = await checkDevicePermission(
      req.userId!,
      req.userRole!,
      deviceId
    );
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied to this device' });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    const tableName = getDeviceTableName(deviceId);
    
    // Load performance config for memory management
    const { loadConfig } = await import('../config/performance.config.js');
    const config = loadConfig();

    // Get device info including unit_cost
    const deviceResult = await db.query(
      `SELECT name, type, COALESCE(unit_cost, 0)::numeric as unit_cost FROM devices WHERE id = $1`,
      [deviceId]
    );
    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    const device = deviceResult.rows[0];
    const deviceType = device.type;
    // Ensure unitCost is always a number (PostgreSQL NUMERIC can be returned as string)
    // Parse it explicitly and handle null/undefined
    let unitCost = 0;
    if (device.unit_cost != null) {
      const parsed = parseFloat(String(device.unit_cost));
      unitCost = isNaN(parsed) ? 0 : parsed;
    }
    console.log(`[PowerQualityReport] Device ${deviceId} unit_cost from DB: ${device.unit_cost} (type: ${typeof device.unit_cost}), parsed: ${unitCost}`);

    // Helper function to convert parameter name to column name (matches dataCollector sanitizeColumnName logic)
    // This matches the logic in dataCollector.ts: sanitizeColumnName function
    const toColumnName = (param: string): string => {
      return param
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')  // Replace any non-alphanumeric (except underscore) with underscore
        .replace(/_+/g, '_')           // Replace multiple underscores with single underscore
        .replace(/^_|_$/g, '');        // Remove leading/trailing underscores
    };
    
    // Note: Column names in database are lowercase with underscores
    // Examples: "kW_Total" -> "kw_total", "V_L-N_AVG" -> "v_l_n_avg", "S_Dmd_Peak" -> "s_dmd_peak"

    // Device-specific parameter mappings
    const getEnergyParams = (type: string): { 
      Wh: string; 
      Varh: string; 
      kVAh: string; 
      WhDiff?: string;
      VarhDiff?: string;
      kVAhDiff?: string;
      needsDivision: boolean;
      units?: { Wh: string; Varh: string; kVAh: string; WhDiff?: string; VarhDiff?: string; kVAhDiff?: string };
    } => {
      switch (type) {
        case 'MICROLOGIC_6E':
          return {
            Wh: 'Wh',
            Varh: 'Varh',
            kVAh: 'kVAh',
            needsDivision: true, // Micrologic 6E stores in Wh/Varh/kVAh, need to divide by 1000
            units: { Wh: 'kWh', Varh: 'kVARh', kVAh: 'kVAh' },
          };
        case 'PM8000':
          return {
            Wh: 'Active Energy Delivered + Received',
            Varh: 'Reactive Energy Delivered + Received',
            kVAh: 'Apparent Energy Delivered + Received',
            WhDiff: 'Active Energy Delivered- Received', // Note: JSON has no space around minus
            VarhDiff: 'Reactive Energy Delivered - Received',
            kVAhDiff: 'Apparent Energy Delivered - Received',
            needsDivision: false, // Already in kWh/kVARh/kVAh
            units: { Wh: 'kWh', Varh: 'kVARh', kVAh: 'kVAh', WhDiff: 'kWh', VarhDiff: 'kVARh', kVAhDiff: 'kVAh' },
          };
        case 'PM5320':
          return {
            Wh: 'Active Energy Delivered- Received', // Note: JSON has no space around minus
            Varh: 'Reactive Energy Delivered - Received',
            kVAh: 'Apparent Energy Delivered - Received',
            needsDivision: false, // Already in kWh/kVARh/kVAh
            units: { Wh: 'kWh', Varh: 'kVARh', kVAh: 'kVAh' },
          };
        case 'EM6400':
          return {
            Wh: 'Active Energy Delivered- Received', // Note: JSON has no space around minus
            Varh: 'Reactive Energy Delivered - Received',
            kVAh: 'Apparent Energy Delivered - Received',
            needsDivision: false, // Already in kWh/kVARh/kVAh
            units: { Wh: 'kWh', Varh: 'kVARh', kVAh: 'kVAh' },
          };
        default:
          // Fallback to Micrologic 6E format
          return {
            Wh: 'Wh',
            Varh: 'Varh',
            kVAh: 'kVAh',
            needsDivision: true,
            units: { Wh: 'kWh', Varh: 'kVARh', kVAh: 'kVAh' },
          };
      }
    };

    const getMaxMinParams = (type: string, existingColumns: Set<string>): Array<{ param: string; unit: string; conversion?: (val: number) => number }> => {
      // Helper to check if parameter exists in database
      const paramExists = (param: string): boolean => {
        const colName = toColumnName(param);
        return existingColumns.has(colName);
      };

      // Base parameter lists for each device type
      let baseParams: Array<{ param: string; unit: string; conversion?: (val: number) => number }> = [];
      
      switch (type) {
        case 'MICROLOGIC_6E':
          baseParams = [
            { param: 'kW_Total', unit: 'W' }, // Already in W, no conversion
            { param: 'Frequency', unit: 'Hz' },
            { param: 'V_L-N_AVG', unit: 'V' },
            { param: 'V_L-L_AVG', unit: 'V' },
            { param: 'I_AVG', unit: 'A' },
            { param: 'S_Dmd_Peak', unit: 'VA' },
          ];
          break;
        case 'PM8000':
          baseParams = [
            { param: 'Active Power Total', unit: 'W' }, // Already in W, no conversion
            { param: 'Frequency', unit: 'Hz' },
            { param: 'Voltage L-N Avg', unit: 'V' },
            { param: 'Voltage L-L Avg', unit: 'V' },
            { param: 'Current Avg', unit: 'A' },
            { param: 'Apparent Power Total', unit: 'VA' }, // Already in VA, no conversion
          ];
          break;
        case 'PM5320':
          baseParams = [
            { param: 'Active Power Total', unit: 'W', conversion: (v) => v * 1000 }, // kW to W
            { param: 'Frequency', unit: 'Hz' },
            { param: 'Voltage L-N Avg', unit: 'V' },
            { param: 'Voltage L-L Avg', unit: 'V' },
            { param: 'Current Avg', unit: 'A' },
            { param: 'Apparent Power Total', unit: 'VA', conversion: (v) => v * 1000 }, // kVA to VA (fallback if Over Demand doesn't exist)
          ];
          // Try Over Demand first, fallback to Apparent Power Total
          if (paramExists('Over Demand, Apparent Power, Last')) {
            baseParams[5] = { param: 'Over Demand, Apparent Power, Last', unit: 'VA' };
          }
          break;
        case 'EM6400':
          baseParams = [
            { param: 'Active Power Total', unit: 'W', conversion: (v) => v * 1000 }, // kW to W
            { param: 'Frequency', unit: 'Hz' },
            { param: 'Voltage L-N Avg', unit: 'V' },
            { param: 'Voltage L-L Avg', unit: 'V' },
            { param: 'Current Avg', unit: 'A' },
            { param: 'Apparent Power Total', unit: 'VA', conversion: (v) => v * 1000 }, // kVA to VA
          ];
          break;
        default:
          // Fallback to Micrologic 6E format
          baseParams = [
            { param: 'kW_Total', unit: 'W', conversion: (v) => v * 1000 },
            { param: 'Frequency', unit: 'Hz' },
            { param: 'V_L-N_AVG', unit: 'V' },
            { param: 'V_L-L_AVG', unit: 'V' },
            { param: 'I_AVG', unit: 'A' },
            { param: 'S_Dmd_Peak', unit: 'VA' },
          ];
      }

      // Filter to only include parameters that actually exist in the database
      return baseParams.filter(p => paramExists(p.param));
    };

    // First, check what columns actually exist in the table
    const columnsResult = await db.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'public' AND table_name = $1 
       ORDER BY column_name`,
      [tableName]
    );
    const existingColumns = new Set(columnsResult.rows.map((r: any) => r.column_name));
    console.log(`[PowerQualityReport] Device ${deviceId} (${deviceType}) table ${tableName} has ${existingColumns.size} columns`);
    console.log(`[PowerQualityReport] Sample columns:`, Array.from(existingColumns).slice(0, 20).join(', '));
    
    // Estimate row count for memory management
    const countResult = await db.query(
      `SELECT COUNT(*) as count FROM ${tableName} WHERE timestamp >= $1 AND timestamp <= $2`,
      [start, end]
    );
    const rowCount = parseInt(countResult.rows[0]?.count || '0');
    const samplingInterval = calculateSpatialSamplingInterval(
      start,
      end,
      rowCount,
      config.memory.maxReportMemoryMB
    );
    
    if (samplingInterval > 0 && rowCount > config.memory.spatialSamplingThreshold) {
      console.log(`[PowerQualityReport] Large dataset detected: ${rowCount} rows. Using spatial sampling with ${samplingInterval}ms interval`);
    }

    // Get energy parameters based on device type
    const energyParamMap = getEnergyParams(deviceType);
    const energyParams = [
      { key: 'Wh', param: energyParamMap.Wh },
      { key: 'Varh', param: energyParamMap.Varh },
      { key: 'kVAh', param: energyParamMap.kVAh },
    ];
    
    // Add PM8000 specific "Delivered - Received" parameters
    if (energyParamMap.WhDiff) {
      energyParams.push({ key: 'WhDiff', param: energyParamMap.WhDiff });
    }
    if (energyParamMap.VarhDiff) {
      energyParams.push({ key: 'VarhDiff', param: energyParamMap.VarhDiff });
    }
    if (energyParamMap.kVAhDiff) {
      energyParams.push({ key: 'kVAhDiff', param: energyParamMap.kVAhDiff });
    }
    const energyData: Record<string, { start: number | null; end: number | null }> = {};
    
    for (const { key, param } of energyParams) {
      const colName = toColumnName(param);
      console.log(`[PowerQualityReport] Looking for column "${colName}" for parameter "${param}" (key: ${key})`);
      
      if (!existingColumns.has(colName)) {
        console.warn(`[PowerQualityReport] Column "${colName}" does not exist in table ${tableName}`);
        energyData[key] = { start: null, end: null };
        continue;
      }

      try {
        const firstQuery = `
          SELECT "${colName}", timestamp
          FROM ${tableName}
          WHERE timestamp >= $1 AND timestamp <= $2 AND "${colName}" IS NOT NULL
          ORDER BY timestamp ASC
          LIMIT 1
        `;
        const lastQuery = `
          SELECT "${colName}", timestamp
          FROM ${tableName}
          WHERE timestamp >= $1 AND timestamp <= $2 AND "${colName}" IS NOT NULL
          ORDER BY timestamp DESC
          LIMIT 1
        `;
        
        const firstResult = await db.query(firstQuery, [start, end]);
        const lastResult = await db.query(lastQuery, [start, end]);
        
        const startVal = firstResult.rows[0]?.[colName];
        const endVal = lastResult.rows[0]?.[colName];
        
        // Convert to number if it's a string
        const startNum = startVal !== null && startVal !== undefined 
          ? (typeof startVal === 'string' ? parseFloat(startVal) : Number(startVal))
          : null;
        const endNum = endVal !== null && endVal !== undefined
          ? (typeof endVal === 'string' ? parseFloat(endVal) : Number(endVal))
          : null;
        
        console.log(`[PowerQualityReport] ${key} (${param}, ${colName}): start=${startVal} (${typeof startVal}) -> ${startNum}, end=${endVal} (${typeof endVal}) -> ${endNum}`);
        
        energyData[key] = {
          start: (startNum !== null && !isNaN(startNum) && isFinite(startNum)) ? startNum : null,
          end: (endNum !== null && !isNaN(endNum) && isFinite(endNum)) ? endNum : null
        };
      } catch (err: any) {
        console.error(`[PowerQualityReport] Error querying ${key} (${param}, ${colName}):`, err.message);
        energyData[key] = { start: null, end: null };
      }
    }

    // Convert raw values to proper units based on device type
    // Micrologic 6E: divide by 1000 (Wh -> kWh, Varh -> kVArh, kVAh -> kVAh)
    // PM8000/PM5320/EM6400: already in kWh/kVARh/kVAh, no division needed
    const energyDataConverted: Record<string, { start: number | null; end: number | null }> = {};
    
    // Process all energy parameters (Wh, Varh, kVAh, and optionally WhDiff, VarhDiff, kVAhDiff)
    for (const key of ['Wh', 'Varh', 'kVAh', 'WhDiff', 'VarhDiff', 'kVAhDiff'] as const) {
      if (energyData[key]) {
        energyDataConverted[key] = {
          start: energyData[key].start !== null 
            ? (energyParamMap.needsDivision ? energyData[key].start! / 1000 : energyData[key].start!)
            : null,
          end: energyData[key].end !== null 
            ? (energyParamMap.needsDivision ? energyData[key].end! / 1000 : energyData[key].end!)
            : null,
        };
      }
    }
    
    console.log(`[PowerQualityReport] Energy data before calculation:`, energyData);
    console.log(`[PowerQualityReport] Energy data converted (divided by 1000):`, energyDataConverted);
    
    // Calculate differences from converted values
    const energyDiff: Record<string, number | null> = {};
    
    for (const key of ['Wh', 'Varh', 'kVAh', 'WhDiff', 'VarhDiff', 'kVAhDiff'] as const) {
      if (energyDataConverted[key]) {
        energyDiff[key] = energyDataConverted[key].end !== null && energyDataConverted[key].start !== null 
          ? (energyDataConverted[key].end! - energyDataConverted[key].start!)
          : null;
      }
    }
    
    console.log(`[PowerQualityReport] Energy differences:`, energyDiff);

    // Calculate energy charges
    const energyCharges = energyDiff.kVAh !== null && unitCost > 0
      ? energyDiff.kVAh * unitCost
      : null;
    
    console.log(`[PowerQualityReport] Energy charges: ${energyCharges} (kVAh diff: ${energyDiff.kVAh}, unit cost: ${unitCost})`);

    // Get max/min values for specified parameters based on device type
    const maxMinParams = getMaxMinParams(deviceType, existingColumns);
    const maxMinData: Record<string, { max: number | null; min: number | null; maxTime: string | null; minTime: string | null; unit: string }> = {};

    // Use GPU acceleration for large datasets if enabled
    const useGPU = config.gpu.enabled && config.gpu.useForReports && rowCount >= config.gpu.minRowsForGPU;
    
    if (useGPU && maxMinParams.length > 0) {
      console.log(`[PowerQualityReport] Using GPU acceleration for ${maxMinParams.length} parameters (${rowCount} rows)`);
      
      try {
        // Fetch all data for parameters in parallel using GPU
        const dataDict: Record<string, number[]> = {};
        const paramMap: Record<string, { unit: string; conversion?: (val: number) => number }> = {};
        
        for (const { param, unit, conversion } of maxMinParams) {
          const colName = toColumnName(param);
          if (!existingColumns.has(colName)) continue;
          
          paramMap[colName] = { unit, conversion };
          
          // Fetch all values for this parameter
          const query = `
            SELECT "${colName}", timestamp
            FROM ${tableName}
            WHERE timestamp >= $1 AND timestamp <= $2 AND "${colName}" IS NOT NULL
            ORDER BY timestamp
          `;
          
          const result = await db.query(query, [start, end]);
          const values = result.rows
            .map((r: any) => {
              const val = r[colName];
              return val !== null && val !== undefined 
                ? (typeof val === 'string' ? parseFloat(val) : Number(val))
                : null;
            })
            .filter((v: any) => v !== null && isFinite(v)) as number[];
          
          if (values.length > 0) {
            dataDict[colName] = values;
          }
        }
        
        // Calculate statistics using GPU
        if (Object.keys(dataDict).length > 0) {
          const gpuStats = await gpuProcessor.calculateMultipleStatistics(dataDict);
          
          // Also get timestamps for max/min
          for (const { param, unit, conversion } of maxMinParams) {
            const colName = toColumnName(param);
            if (!gpuStats[colName]) continue;
            
            const stats = gpuStats[colName];
            let maxNum = stats.max;
            let minNum = stats.min;
            
            // Apply conversion if provided
            if (conversion && paramMap[colName].conversion) {
              if (maxNum !== null) maxNum = conversion(maxNum);
              if (minNum !== null) minNum = conversion(minNum);
            }
            
            // Get timestamps for max/min (still need to query for these)
            const maxTimeQuery = `
              SELECT timestamp FROM ${tableName}
              WHERE timestamp >= $1 AND timestamp <= $2 AND "${colName}" IS NOT NULL
              ORDER BY "${colName}" DESC LIMIT 1
            `;
            const minTimeQuery = `
              SELECT timestamp FROM ${tableName}
              WHERE timestamp >= $1 AND timestamp <= $2 AND "${colName}" IS NOT NULL
              ORDER BY "${colName}" ASC LIMIT 1
            `;
            
            const [maxTimeResult, minTimeResult] = await Promise.all([
              db.query(maxTimeQuery, [start, end]),
              db.query(minTimeQuery, [start, end])
            ]);
            
            maxMinData[param] = {
              max: maxNum,
              min: minNum,
              maxTime: maxTimeResult.rows[0]?.timestamp || null,
              minTime: minTimeResult.rows[0]?.timestamp || null,
              unit,
            };
          }
        }
      } catch (gpuError: any) {
        console.warn(`[PowerQualityReport] GPU acceleration failed, falling back to CPU:`, gpuError.message);
        // Fall through to CPU calculation below
      }
    }
    
    // CPU fallback or if GPU not used
    if (Object.keys(maxMinData).length < maxMinParams.length) {
      for (const { param, unit, conversion } of maxMinParams) {
        if (maxMinData[param]) continue; // Already calculated with GPU
        
        const colName = toColumnName(param);
        
        if (!existingColumns.has(colName)) {
          console.warn(`[PowerQualityReport] Column "${colName}" does not exist for parameter "${param}"`);
          maxMinData[param] = { max: null, min: null, maxTime: null, minTime: null, unit };
          continue;
        }

        try {
          const query = `
            SELECT 
              MAX("${colName}") as max_val,
              MIN("${colName}") as min_val,
              (SELECT timestamp FROM ${tableName} 
               WHERE timestamp >= $1 AND timestamp <= $2 AND "${colName}" IS NOT NULL 
               ORDER BY "${colName}" DESC LIMIT 1) as max_time,
              (SELECT timestamp FROM ${tableName} 
               WHERE timestamp >= $1 AND timestamp <= $2 AND "${colName}" IS NOT NULL 
               ORDER BY "${colName}" ASC LIMIT 1) as min_time
            FROM ${tableName}
            WHERE timestamp >= $1 AND timestamp <= $2 AND "${colName}" IS NOT NULL
          `;
          
          const result = await db.query(query, [start, end]);
          if (result.rows[0]) {
            const maxVal = result.rows[0].max_val;
            const minVal = result.rows[0].min_val;
            
            // Convert to number if needed
            let maxNum = maxVal !== null && maxVal !== undefined
              ? (typeof maxVal === 'string' ? parseFloat(maxVal) : Number(maxVal))
              : null;
            let minNum = minVal !== null && minVal !== undefined
              ? (typeof minVal === 'string' ? parseFloat(minVal) : Number(minVal))
              : null;
            
            // Apply conversion if provided (e.g., kW to W, kVA to VA)
            if (conversion) {
              if (maxNum !== null && !isNaN(maxNum) && isFinite(maxNum)) {
                maxNum = conversion(maxNum);
              }
              if (minNum !== null && !isNaN(minNum) && isFinite(minNum)) {
                minNum = conversion(minNum);
              }
            }
            
            maxMinData[param] = {
              max: (maxNum !== null && !isNaN(maxNum) && isFinite(maxNum)) ? maxNum : null,
              min: (minNum !== null && !isNaN(minNum) && isFinite(minNum)) ? minNum : null,
              maxTime: result.rows[0].max_time,
              minTime: result.rows[0].min_time,
              unit,
            };
            console.log(`[PowerQualityReport] ${param} (${colName}): max=${maxVal} -> ${maxMinData[param].max} ${unit}, min=${minVal} -> ${maxMinData[param].min} ${unit}`);
          } else {
            maxMinData[param] = { max: null, min: null, maxTime: null, minTime: null, unit };
          }
        } catch (err: any) {
          console.error(`[PowerQualityReport] Error querying max/min for ${param} (${colName}):`, err.message);
          maxMinData[param] = { max: null, min: null, maxTime: null, minTime: null, unit };
        }
      }
    }

    // Get events from device_events table
    const eventsQuery = `
      SELECT 
        parameter,
        event_type,
        event_timestamp,
        description,
        new_value
      FROM device_events
      WHERE device_id = $1 
        AND event_timestamp >= $2 
        AND event_timestamp <= $3
      ORDER BY event_timestamp DESC
    `;
    const eventsResult = await db.query(eventsQuery, [deviceId, start, end]);

    res.json({
      deviceName: device.name,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      energyData: {
        Wh: energyDataConverted.Wh,
        Varh: energyDataConverted.Varh,
        kVAh: energyDataConverted.kVAh,
        ...(energyDataConverted.WhDiff && { WhDiff: energyDataConverted.WhDiff }),
        ...(energyDataConverted.VarhDiff && { VarhDiff: energyDataConverted.VarhDiff }),
        ...(energyDataConverted.kVAhDiff && { kVAhDiff: energyDataConverted.kVAhDiff }),
        differences: energyDiff,
        energyCharges,
        unitCost: Number(unitCost), // Ensure it's sent as a number, not string
        units: energyParamMap.units || { Wh: 'kWh', Varh: 'kVARh', kVAh: 'kVAh' },
      },
      maxMinData,
      events: eventsResult.rows,
    });
  } catch (error: any) {
    console.error('Error generating power quality report:', error);
    res.status(500).json({ error: 'Failed to generate power quality report', details: error.message });
  }
});

// Manually trigger data collection (admin only)
router.post('/collect', requireAdmin, async (req: AuthRequest, res) => {
  try {
    console.log('Manual data collection triggered by admin');
    // Run collection asynchronously (don't wait for it)
    collectAllDevicesData().catch(err => {
      console.error('Error in manual data collection:', err);
    });
    
    res.json({ 
      message: 'Data collection started',
      note: 'Collection runs in background. Check logs for results.'
    });
  } catch (error: any) {
    console.error('Error triggering data collection:', error);
    res.status(500).json({ error: 'Failed to trigger data collection' });
  }
});

export { router as dataRoutes };

