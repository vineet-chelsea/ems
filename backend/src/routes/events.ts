import express from 'express';
import { db } from '../db/connection.js';
import { authenticateToken, checkDevicePermission, AuthRequest } from '../middleware/auth.js';
import { initializeSchema } from '../db/schema.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Helper to ensure device_events table exists
async function ensureDeviceEventsTable(): Promise<void> {
  try {
    const check = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'device_events'
      )
    `);
    
    if (!check.rows[0]?.exists) {
      console.log('[Events API] device_events table does not exist, initializing schema...');
      await initializeSchema();
    }
  } catch (error: any) {
    console.error('[Events API] Error ensuring device_events table exists:', error.message || error);
    // Try to initialize schema as fallback
    try {
      await initializeSchema();
    } catch (e) {
      console.error('[Events API] Failed to initialize schema:', e);
    }
  }
}

// Get events for a device within a time range
// Query params:
//  - startTime (ISO)
//  - endTime (ISO)
//  - type (optional, e.g. "dip")
//  - parameter (optional, e.g. "V1-Dip A1")
router.get('/:deviceId', async (req: AuthRequest, res) => {
  try {
    await ensureDeviceEventsTable();
    
    const deviceId = req.params.deviceId;
    const { startTime, endTime, type, parameter } = req.query as Record<string, string | undefined>;

    const effectiveEnd = endTime ? new Date(endTime) : new Date();
    const effectiveStart = startTime
      ? new Date(startTime)
      : new Date(effectiveEnd.getTime() - 24 * 60 * 60 * 1000); // default last 24h

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/773308c4-f8d6-49f7-8e8c-bcfa7cdf7678',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H7',location:'events.ts:/events',message:'events fetch start',data:{deviceId,startTime:effectiveStart.toISOString(),endTime:effectiveEnd.toISOString(),type,parameter,user:req.userId,role:req.userRole},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const hasPermission = await checkDevicePermission(
      req.userId!,
      req.userRole!,
      deviceId
    );
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied to this device' });
    }

    // Build query with optional filters
    // Note: If only parameter is provided (no type), return all event_types for that parameter
    // This allows UI to get all frequency events (high/low) when querying parameter=Frequency
    const conditions: string[] = ['device_id = $1', 'event_timestamp >= $2', 'event_timestamp <= $3'];
    const values: any[] = [deviceId, effectiveStart, effectiveEnd];
    let paramCount = 4;

    if (type) {
      conditions.push(`event_type = $${paramCount++}`);
      values.push(type);
    }
    if (parameter) {
      // Case-insensitive parameter matching to handle any case variations
      conditions.push(`LOWER(TRIM(parameter)) = LOWER(TRIM($${paramCount++}))`);
      values.push(parameter);
    }

    let query = `
      SELECT id, device_id as "deviceId", parameter, event_type as "eventType",
             prev_value as "prevValue", new_value as "newValue",
             event_timestamp as "eventTimestamp", 
             description
      FROM device_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY event_timestamp DESC
      LIMIT 200
    `;

    let result = await db.query(query, values);
    
    console.log(`[Events API] Query for device ${deviceId}:`, {
      conditions: conditions.join(' AND '),
      values,
      resultCount: result.rows.length,
      sample: result.rows.slice(0, 3).map(r => ({ parameter: r.parameter, eventType: r.eventType, timestamp: r.eventTimestamp }))
    });

    // If filtered query returns 0 results, fallback to broader query
    // If parameter was provided, keep parameter filter but remove type filter
    // This allows UI to see all event types for a parameter (e.g., both frequency_high and frequency_low)
    if (result.rows.length === 0 && (type || parameter)) {
      const fallbackConditions = ['device_id = $1', 'event_timestamp >= $2', 'event_timestamp <= $3'];
      const fallbackValues = [deviceId, effectiveStart, effectiveEnd];
      let fallbackParamCount = 4;
      
      // If parameter was provided, keep it in fallback (remove type filter only)
      // Use case-insensitive matching like the main query
      if (parameter) {
        fallbackConditions.push(`LOWER(TRIM(parameter)) = LOWER(TRIM($${fallbackParamCount++}))`);
        fallbackValues.push(parameter);
      }
      
      query = `
        SELECT id, device_id as "deviceId", parameter, event_type as "eventType",
               prev_value as "prevValue", new_value as "newValue",
               event_timestamp as "eventTimestamp", 
               description
        FROM device_events
        WHERE ${fallbackConditions.join(' AND ')}
        ORDER BY event_timestamp DESC
        LIMIT 200
      `;
      result = await db.query(query, fallbackValues);
      
      console.log(`[Events API] Fallback query for device ${deviceId}:`, {
        fallbackConditions: fallbackConditions.join(' AND '),
        fallbackValues,
        resultCount: result.rows.length,
        sample: result.rows.slice(0, 3).map(r => ({ parameter: r.parameter, eventType: r.eventType, timestamp: r.eventTimestamp }))
      });
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/773308c4-f8d6-49f7-8e8c-bcfa7cdf7678',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H7',location:'events.ts:/events',message:'events fallback result',data:{deviceId,count:result.rows.length,requestedType:type,requestedParameter:parameter,fallbackConditions:fallbackConditions.join(' AND ')},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }

    // #region agent log
    const sample = result.rows.slice(0, 5).map(r => ({
      parameter: r.parameter,
      eventType: r.eventType,
      eventTimestamp: r.eventTimestamp,
    }));
    const minTs = result.rows.length ? result.rows[0].eventTimestamp : null;
    const maxTs = result.rows.length ? result.rows[result.rows.length - 1].eventTimestamp : null;
    fetch('http://127.0.0.1:7242/ingest/773308c4-f8d6-49f7-8e8c-bcfa7cdf7678',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H7',location:'events.ts:/events',message:'events fetch result',data:{deviceId,count:result.rows.length,sample,minTs,maxTs,conditions:conditions.join(' AND ')},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    res.json({ deviceId, count: result.rows.length, events: result.rows });
  } catch (error) {
    console.error('Error fetching device events:', error);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/773308c4-f8d6-49f7-8e8c-bcfa7cdf7678',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H7',location:'events.ts:/events',message:'events fetch error',data:{deviceId:req.params.deviceId,error:String(error)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    res.status(500).json({ error: 'Failed to fetch device events' });
  }
});

// Get event summary grouped by event_type for a device
// Query params:
//  - startTime (ISO, optional, defaults to 24h ago)
//  - endTime (ISO, optional, defaults to now)
router.get('/:deviceId/summary', async (req: AuthRequest, res) => {
  try {
    await ensureDeviceEventsTable();
    
    const deviceId = req.params.deviceId;
    const { startTime, endTime } = req.query as Record<string, string | undefined>;

    const effectiveEnd = endTime ? new Date(endTime) : new Date();
    const effectiveStart = startTime
      ? new Date(startTime)
      : new Date(effectiveEnd.getTime() - 24 * 60 * 60 * 1000); // default last 24h

    const hasPermission = await checkDevicePermission(
      req.userId!,
      req.userRole!,
      deviceId
    );
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied to this device' });
    }

    // Group events by event_type and get counts + recent timestamps
    const summaryQuery = `
      SELECT 
        event_type as "eventType",
        parameter,
        COUNT(*) as count,
        MAX(event_timestamp) as "lastOccurrence",
        ARRAY_AGG(event_timestamp ORDER BY event_timestamp DESC) 
          FILTER (WHERE event_timestamp IS NOT NULL) as timestamps
      FROM device_events
      WHERE device_id = $1 
        AND event_timestamp >= $2 
        AND event_timestamp <= $3
      GROUP BY event_type, parameter
      ORDER BY "lastOccurrence" DESC
    `;

    const result = await db.query(summaryQuery, [deviceId, effectiveStart, effectiveEnd]);

    // Transform to match UI expectations (group by event_type, aggregate parameters)
    const summary: Record<string, any> = {};
    for (const row of result.rows) {
      const eventType = row.eventType;
      if (!summary[eventType]) {
        summary[eventType] = {
          eventType,
          count: 0,
          lastOccurrence: null,
          parameters: [],
          timestamps: [],
        };
      }
      summary[eventType].count += parseInt(row.count, 10);
      if (!summary[eventType].lastOccurrence || row.lastOccurrence > summary[eventType].lastOccurrence) {
        summary[eventType].lastOccurrence = row.lastOccurrence;
      }
      summary[eventType].parameters.push({
        parameter: row.parameter,
        count: parseInt(row.count, 10),
      });
      // Merge timestamps (keep unique, sorted desc)
      const existing = new Set(summary[eventType].timestamps.map((t: Date | string) => {
        const d = t instanceof Date ? t : new Date(t);
        return d.toISOString();
      }));
      for (const ts of row.timestamps || []) {
        const tsDate = ts instanceof Date ? ts : new Date(ts);
        const tsStr = tsDate.toISOString();
        if (!existing.has(tsStr)) {
          summary[eventType].timestamps.push(tsDate);
          existing.add(tsStr);
        }
      }
    }

    // Sort timestamps desc for each event type
    for (const key in summary) {
      summary[key].timestamps.sort((a: Date, b: Date) => b.getTime() - a.getTime());
    }

    res.json({
      deviceId,
      startTime: effectiveStart.toISOString(),
      endTime: effectiveEnd.toISOString(),
      summary: Object.values(summary),
    });
  } catch (error) {
    console.error('Error fetching event summary:', error);
    res.status(500).json({ error: 'Failed to fetch event summary' });
  }
});

// Debug endpoint to check all events for a device (no filters)
router.get('/:deviceId/debug', async (req: AuthRequest, res) => {
  try {
    await ensureDeviceEventsTable();
    
    const deviceId = req.params.deviceId;
    
    const hasPermission = await checkDevicePermission(
      req.userId!,
      req.userRole!,
      deviceId
    );
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied to this device' });
    }

    // Get all events for this device (last 24 hours, no filters)
    const allEvents = await db.query(
      `
      SELECT id, device_id as "deviceId", parameter, event_type as "eventType",
             prev_value as "prevValue", new_value as "newValue",
             event_timestamp as "eventTimestamp", 
             description
      FROM device_events
      WHERE device_id = $1 
        AND event_timestamp >= NOW() - INTERVAL '24 hours'
      ORDER BY event_timestamp DESC
      LIMIT 100
      `,
      [deviceId]
    );

    // Also check total count
    const totalCount = await db.query(
      `SELECT COUNT(*) as count FROM device_events WHERE device_id = $1`,
      [deviceId]
    );

    console.log(`[Events Debug] Device ${deviceId}:`, {
      totalEvents: totalCount.rows[0].count,
      recentEvents24h: allEvents.rows.length,
      events: allEvents.rows.map(r => ({
        id: r.id,
        parameter: r.parameter,
        eventType: r.eventType,
        newValue: r.newValue,
        timestamp: r.eventTimestamp,
        description: r.description
      }))
    });

    res.json({
      deviceId,
      totalEvents: parseInt(totalCount.rows[0].count, 10),
      recentEvents24h: allEvents.rows.length,
      events: allEvents.rows
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch debug info' });
  }
});

export { router as eventRoutes };


