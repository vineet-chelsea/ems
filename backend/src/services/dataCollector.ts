import { db } from '../db/connection.js';
import { getDeviceTableName, cleanupOrphanedTables } from '../db/tableManager.js';
import { initializeSchema } from '../db/schema.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import pm8000Mappings from '../config/pm8000_mappings.json';
import micrologic6eMappings from '../config/micrologic6e_mappings.json';
import em6400Mappings from '../config/em6400_mappings.json';
import pm5320Mappings from '../config/pm5320_mappings.json';
import { loadConfig } from '../config/performance.config.js';
import { workerPool } from './workerPool.js';
import { convertToHypertable } from '../db/connection.js';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const config = loadConfig();

/**
 * Data Collector Service
 * Polls Modbus devices and inserts data into the database
 */

interface Device {
  id: string;
  name: string;
  type: string;
  ipAddress: string;
  slaveAddress: number;
  status: string;
  parameterMappings?: Record<string, string>;
}

interface RegisterMapping {
  parameter: string;
  address: number;
  dataType: string;
  description?: string;
  unit?: string;
  length?: number;
  bit?: number;
  validIfBit?: number;
  validIfValue?: number;
}

// Track last cleanup signature per device so we can re-clean if mappings change
const cleanedColumnsSignatureForDevice = new Map<string, string>();

// Track last seen dip counters in-memory (per process)
const lastDipCounters = new Map<string, Map<string, number>>();
// Track last seen swell counters in-memory (per process)
const lastSwellCounters = new Map<string, Map<string, number>>();
const lastThresholdStates = new Map<string, Map<string, boolean>>();
const lastSuccessfulSampleAt = new Map<string, Date>();
const em6400RunningMax = new Map<string, Record<string, number>>();
const lastPm5320Counters = new Map<string, Map<string, number>>();
const lastEm6400Counters = new Map<string, Map<string, number>>();
const maintenanceDayMs = 24 * 60 * 60 * 1000;
let schemaInitialized = false;

async function ensureSchemaInitialized(): Promise<void> {
  if (schemaInitialized) return;
  try {
    await initializeSchema();
    schemaInitialized = true;
    console.log('[DataCollector] Schema initialized successfully');
  } catch (error: any) {
    console.error('[DataCollector] Error initializing schema:', error.message || error);
    // Don't set schemaInitialized = true on error, so we can retry
    throw error;
  }
}

async function ensureDeviceEventsTableExists(): Promise<void> {
  try {
    // Check if table exists
    const check = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'device_events'
      )
    `);
    
    if (!check.rows[0]?.exists) {
      console.log('[DataCollector] device_events table does not exist, creating it...');
      try {
        await ensureSchemaInitialized();
      } catch (schemaError: any) {
        console.error('[DataCollector] Error initializing schema:', schemaError.message || schemaError);
        // Continue to explicit table creation as fallback
      }
      
      // Double-check after initialization
      const checkAgain = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'device_events'
        )
      `);
      
      if (!checkAgain.rows[0]?.exists) {
        // Explicitly create the table as fallback
        console.log('[DataCollector] Creating device_events table explicitly...');
        try {
          // First ensure devices table exists (required for foreign key)
          const devicesCheck = await db.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name = 'devices'
            )
          `);
          
          if (!devicesCheck.rows[0]?.exists) {
            console.log('[DataCollector] devices table does not exist, initializing schema first...');
            await ensureSchemaInitialized();
          }
          
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
          
          // Create indexes
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
          
          console.log('[DataCollector] device_events table created explicitly');
        } catch (createError: any) {
          console.error('[DataCollector] Error creating device_events table:', createError.message || createError);
          throw new Error(`Failed to create device_events table: ${createError.message || createError}`);
        }
      } else {
        console.log('[DataCollector] device_events table created successfully via schema initialization');
      }
    }
  } catch (error: any) {
    console.error('[DataCollector] Error ensuring device_events table exists:', error.message || error);
    throw error; // Re-throw to prevent silent failures
  }
}


async function deviceExists(deviceId: string): Promise<boolean> {
  const res = await db.query('SELECT 1 FROM devices WHERE id = $1', [deviceId]);
  return (res.rowCount || 0) > 0;
}

async function cleanupOrphanedArtifacts(): Promise<void> {
  try {
    // Ensure device_events table exists
    await ensureDeviceEventsTableExists();
    // Drop orphaned per-device tables
    await cleanupOrphanedTables();
    // Delete events whose device no longer exists
    await db.query(`
      DELETE FROM device_events de
      WHERE NOT EXISTS (SELECT 1 FROM devices d WHERE d.id = de.device_id)
    `);
  } catch (err: any) {
    console.warn('Maintenance: cleanupOrphanedArtifacts failed:', err.message || err);
  }
}

async function recordInterruptionIfAny(device: Device, sampleTime: Date): Promise<void> {
  await ensureDeviceEventsTableExists();
  const prev = lastSuccessfulSampleAt.get(device.id);
  // Always update baseline first/last
  lastSuccessfulSampleAt.set(device.id, sampleTime);
  if (!prev) return;

  const gapMs = sampleTime.getTime() - prev.getTime();
  const gapThresholdMs = 30_000; // align with /data/:deviceId/events summary logic
  if (gapMs <= gapThresholdMs) return;

  const gapSeconds = Math.round(gapMs / 1000);
  await db.query(
    `
    INSERT INTO device_events (device_id, parameter, event_type, prev_value, new_value, event_timestamp, description)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      device.id,
      'Interruptions',
      'interruption',
      null,
      gapSeconds,
      sampleTime,
      `Interruption detected (gap ${gapSeconds}s)`,
    ]
  );
}

function isPm8000DipCounterParam(param: string): boolean {
  // e.g. "V1-Dip A1", "V2-Dip X5"
  return /^V[123]-Dip [ABCDX][1-5]$/.test(param);
}

function dipDescription(param: string): string {
  // param format: V{phase}-Dip {band}{bucket}
  const match = param.match(/^(V[123])-Dip ([ABCDX])([1-5])$/);
  if (!match) return 'Voltage dip event';
  const phase = match[1]; // V1/V2/V3
  const band = match[2];
  const bucket = match[3];

  const durationText: Record<string, string> = {
    '1': 'less than 0.02 sec',
    '2': '0.2 < t ≤ 0.5 sec',
    '3': '0.5 < t ≤ 1 sec',
    '4': '1 < t ≤ 5 sec',
    '5': '5 < t ≤ 60 sec',
  };

  const bandText: Record<string, string> = {
    'A': 'between 80-90%',
    'B': 'between 70-80%',
    'C': 'between 40-70%',
    'D': 'between 5-40%',
    'X': 'less than 5%',
  };

  return `Dip for ${durationText[bucket]} in ${phase} ${bandText[band]}`;
}

function isPm8000SwellCounterParam(param: string): boolean {
  // e.g. "V-Swell S1", "V-Swell T2", "V-Swell S3", "V-Swell T4"
  return /^V-Swell [ST][1-4]$/.test(param);
}

function swellDescription(param: string): string {
  // param format: V-Swell {type}{level}
  // type: S (> 120%) or T (110-120%)
  // level: 1 (< 0.5s), 2 (0.5-5s), 3 (5-60s), 4 (> 60s)
  const match = param.match(/^V-Swell ([ST])([1-4])$/);
  if (!match) return 'Voltage swell event';
  
  const type = match[1]; // S or T
  const level = match[2]; // 1, 2, 3, or 4

  const durationText: Record<string, string> = {
    '1': 'less than 0.5s',
    '2': 'between 0.5s and 5s',
    '3': 'between 5s and 60s',
    '4': 'more than 60s',
  };

  const voltageText: Record<string, string> = {
    'S': 'Residual Voltage > 120%',
    'T': 'Residual Voltage 110% to 120%',
  };

  return `V-Swell ${type}${level}: ${voltageText[type]} for ${durationText[level]}`;
}

async function recordPm8000DipEvents(
  device: Device,
  data: Record<string, number | string>,
  eventTimestamp: Date
): Promise<void> {
  if (device.type !== 'PM8000') return;

  let deviceMap = lastDipCounters.get(device.id);
  if (!deviceMap) {
    deviceMap = new Map<string, number>();
    lastDipCounters.set(device.id, deviceMap);
  }

  for (const [key, val] of Object.entries(data)) {
    if (!isPm8000DipCounterParam(key)) continue;
    if (typeof val !== 'number' || !isFinite(val)) continue;

    const prev = deviceMap.get(key);
    const next = val;

    // baseline if first time seeing this counter
    if (prev === undefined) {
      deviceMap.set(key, next);
      continue;
    }

    // Create 1 event per change, ignore transition to 0
    if (next !== prev && next !== 0) {
      await db.query(
        `
        INSERT INTO device_events (device_id, parameter, event_type, prev_value, new_value, event_timestamp, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [device.id, key, 'dip', prev, next, eventTimestamp, dipDescription(key)]
      );
    }

    // Always update baseline (including when it becomes 0)
    deviceMap.set(key, next);
  }
}

async function recordPm8000SwellEvents(
  device: Device,
  data: Record<string, number | string>,
  eventTimestamp: Date
): Promise<void> {
  if (device.type !== 'PM8000') return;

  try {
    await ensureDeviceEventsTableExists();
  } catch (e: any) {
    console.error(`[PM8000][${device.id}] Failed to ensure device_events table:`, e.message);
    return;
  }

  let deviceMap = lastSwellCounters.get(device.id);
  if (!deviceMap) {
    deviceMap = new Map<string, number>();
    lastSwellCounters.set(device.id, deviceMap);
  }

  for (const [key, val] of Object.entries(data)) {
    if (!isPm8000SwellCounterParam(key)) continue;
    if (typeof val !== 'number' || !isFinite(val)) continue;

    const prev = deviceMap.get(key);
    const next = val;

    // baseline if first time seeing this counter
    if (prev === undefined) {
      deviceMap.set(key, next);
      continue;
    }

    // Create 1 event per change, ignore transition to 0
    if (next !== prev && next !== 0) {
      // Determine event type based on swell category
      const eventType = key.toLowerCase().replace('v-swell ', 'voltage_swell_');
      
      await db.query(
        `
        INSERT INTO device_events (device_id, parameter, event_type, prev_value, new_value, event_timestamp, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [device.id, key, eventType, prev, next, eventTimestamp, swellDescription(key)]
      );
    }

    // Always update baseline (including when it becomes 0)
    deviceMap.set(key, next);
  }
}

function isCrestFactorParam(param: string): boolean {
  return /^(Crest Factor [ABC])$/.test(param);
}

function isKFactorParam(param: string): boolean {
  return /^(K-Factor [ABCN])$/.test(param);
}

function isPowerFactorTotalParam(param: string): boolean {
  return param === 'Power Factor Total';
}

// Helper functions for PM8000 event detection (still needed)
function isFrequencyParam(param: string): boolean {
  return param === 'Frequency';
}

function isThdCurrentParam(param: string): boolean {
  return /^(THD Current [ABCN])$/.test(param);
}

function isThdVoltageParam(param: string): boolean {
  return /^(THD Voltage [ABC]-N)$/.test(param);
}

function isPhaseVoltageToNeutralParam(param: string): boolean {
  return /^(Voltage [ABC]-N)$/.test(param);
}

/**
 * Fresh implementation of Micrologic 6E alarm detection
 * Edge-triggered: Only inserts events when transitioning INTO alarm state (not while already in alarm)
 */
async function recordMicrologic6eAlarms(
  device: Device,
  data: Record<string, number | string>,
  eventTimestamp: Date
): Promise<void> {
  try {
    await ensureDeviceEventsTableExists();
  } catch (e: any) {
    console.error(`[Micrologic6E][${device.id}] Failed to ensure device_events table:`, e.message);
    return;
  }

  if (device.type !== 'MICROLOGIC_6E') return;

  // Get or create state map for this device to track alarm states
  let stateMap = lastThresholdStates.get(device.id);
  if (!stateMap) {
    stateMap = new Map<string, boolean>();
    lastThresholdStates.set(device.id, stateMap);
  }

  // Helper to insert alarm event with retry (only called on edge transitions)
  const insertAlarm = async (
    alarmCode: string,
    parameter: string,
    description: string,
    value: number | string
  ): Promise<void> => {
    try {
      const result = await db.query(
        `INSERT INTO device_events (device_id, parameter, event_type, prev_value, new_value, event_timestamp, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [device.id, parameter, alarmCode, null, value, eventTimestamp, description]
      );
      console.log(`[Micrologic6E][${device.id}] ✓ INSERTED: ${alarmCode} - ${parameter} = ${value} (ID: ${result.rows[0].id})`);
    } catch (e: any) {
      if (e.message?.includes('does not exist') || e.code === '42P01') {
        console.log(`[Micrologic6E][${device.id}] Table missing, retrying...`);
        await ensureDeviceEventsTableExists();
        await db.query(
          `INSERT INTO device_events (device_id, parameter, event_type, prev_value, new_value, event_timestamp, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [device.id, parameter, alarmCode, null, value, eventTimestamp, description]
        );
        console.log(`[Micrologic6E][${device.id}] ✓ INSERTED (retry): ${alarmCode} - ${parameter} = ${value}`);
      } else {
        console.error(`[Micrologic6E][${device.id}] ✗ FAILED to insert ${alarmCode}:`, e.message || e);
      }
    }
  };

  // 1. BREAKER TRIP: Check TRIP parameter (bit from address 32000) - edge-triggered: 0 -> 1
  const tripValue = data['TRIP'];
  if (tripValue !== undefined) {
    const isTripped = tripValue === 1 || tripValue === '1' || (typeof tripValue === 'string' && tripValue === 'true');
    const wasTripped = stateMap.get('trip:TRIP') ?? false;
    
    if (!wasTripped && isTripped) {
      // Transition from not tripped to tripped - insert event
      await insertAlarm('breaker_trip', 'TRIP', 'Breaker TRIP detected', tripValue);
    }
    stateMap.set('trip:TRIP', isTripped);
  }

  // 2. FREQUENCY: Check Frequency parameter - edge-triggered
  const freqValue = data['Frequency'];
  if (freqValue !== undefined && typeof freqValue === 'number' && isFinite(freqValue)) {
    const isLow = freqValue < 49.5;
    const isHigh = freqValue > 50.2;
    const wasLow = stateMap.get('freq_low:Frequency') ?? false;
    const wasHigh = stateMap.get('freq_high:Frequency') ?? false;
    
    // Only insert if transitioning INTO alarm state
      if (!wasLow && isLow) {
      await insertAlarm('frequency_low', 'Frequency', `Frequency low: ${freqValue.toFixed(2)} Hz (< 49.5 Hz)`, freqValue);
      }
      if (!wasHigh && isHigh) {
      await insertAlarm('frequency_high', 'Frequency', `Frequency high: ${freqValue.toFixed(2)} Hz (> 50.2 Hz)`, freqValue);
    }
    
    stateMap.set('freq_low:Frequency', isLow);
    stateMap.set('freq_high:Frequency', isHigh);
  }

  // 3. POWER FACTOR: Check PF1, PF2, PF3 - edge-triggered
  // Alarm triggers when PF is outside [0.9, 1] for positive values OR outside [-0.9, -1] for negative values
  for (const pfParam of ['PF1', 'PF2', 'PF3']) {
    const pfValue = data[pfParam];
    if (pfValue !== undefined && typeof pfValue === 'number' && isFinite(pfValue)) {
      // Check if PF is outside acceptable range
      // Positive PF: should be in [0.9, 1]
      // Negative PF: should be in [-0.9, -1]
      const isOutOfRange = (pfValue >= 0 && (pfValue < 0.9 || pfValue > 1)) ||
                          (pfValue < 0 && (pfValue > -0.9 || pfValue < -1));
      const wasOutOfRange = stateMap.get(`pf_low:${pfParam}`) ?? false;
      
      // Only insert if transitioning INTO alarm state
      if (!wasOutOfRange && isOutOfRange) {
        const range = pfValue >= 0 ? '[0.9, 1]' : '[-0.9, -1]';
        await insertAlarm('pf_low', pfParam, `${pfParam} out of range: ${pfValue.toFixed(3)} (outside ${range})`, pfValue);
      }
      
      stateMap.set(`pf_low:${pfParam}`, isOutOfRange);
    }
  }

  // 4. THD VOLTAGE: Check THD-V1, THD-V2, THD-V3 - edge-triggered
  for (const thdVParam of ['THD-V1', 'THD-V2', 'THD-V3']) {
    const thdVValue = data[thdVParam];
    if (thdVValue !== undefined && typeof thdVValue === 'number' && isFinite(thdVValue)) {
      const isHigh = thdVValue > 1;
      const wasHigh = stateMap.get(`thd_v_high:${thdVParam}`) ?? false;
      
      // Only insert if transitioning INTO alarm state
      if (!wasHigh && isHigh) {
        await insertAlarm('thd_voltage_high', thdVParam, `${thdVParam} high: ${thdVValue.toFixed(3)} (> 1)`, thdVValue);
      }
      
      stateMap.set(`thd_v_high:${thdVParam}`, isHigh);
    }
  }

  // 5. THD CURRENT: Check THD-I1, THD-I2, THD-I3 - edge-triggered
  for (const thdIParam of ['THD-I1', 'THD-I2', 'THD-I3']) {
    const thdIValue = data[thdIParam];
    if (thdIValue !== undefined && typeof thdIValue === 'number' && isFinite(thdIValue)) {
      const isHigh = thdIValue > 1;
      const wasHigh = stateMap.get(`thd_i_high:${thdIParam}`) ?? false;
      
      // Only insert if transitioning INTO alarm state
      if (!wasHigh && isHigh) {
        await insertAlarm('thd_current_high', thdIParam, `${thdIParam} high: ${thdIValue.toFixed(3)} (> 1)`, thdIValue);
      }
      
      stateMap.set(`thd_i_high:${thdIParam}`, isHigh);
    }
  }
}

/**
 * Load PM5320 counter values from database (maximum values from last 12 months)
 * Similar to EM6400 counter loading - retains counter state across backend restarts
 */
async function loadPm5320CountersFromDatabase(deviceId: string): Promise<Map<string, number>> {
  const counterMap = new Map<string, number>();
  
  try {
    const tableName = getDeviceTableName(deviceId);
    
    // PM5320 counter-based alarm variables
    const counterBasedAlarms = [
      'Under Frequency',
      'Over Frequency',
      'Phase Loss',
      'Meter Diagnostic',
      'Meter Reset',
      'Phase Reversal',
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
      'Over Voltage Unbalance',
      'Over Voltage Total Harmonic Distortion',
    ];
    
    // Check if table exists
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )
    `, [tableName]);
    
    if (!tableExists.rows[0]?.exists) {
      console.log(`[PM5320][${deviceId}] Table ${tableName} does not exist yet, counters will initialize from current values`);
      return counterMap;
    }
    
    // Get maximum value for each counter variable from the last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    for (const alarmParam of counterBasedAlarms) {
      const colName = sanitizeColumnName(alarmParam);
      const quotedColName = `"${colName}"`;
      
      try {
        // Check if column exists
        const colExists = await db.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'public'
            AND table_name = $1
            AND column_name = $2
        `, [tableName, colName]);
        
        if (colExists.rows.length > 0) {
          // Get maximum value from last 12 months
          const result = await db.query(`
            SELECT MAX(${quotedColName}) as max_value
            FROM ${tableName}
            WHERE timestamp >= $1
              AND ${quotedColName} IS NOT NULL
          `, [twelveMonthsAgo]);
          
          if (result.rows[0]?.max_value !== null && result.rows[0]?.max_value !== undefined) {
            const maxValue = Number(result.rows[0].max_value);
            if (isFinite(maxValue) && maxValue >= 0) {
              counterMap.set(alarmParam, maxValue);
              console.log(`[PM5320][${deviceId}] Loaded counter ${alarmParam} = ${maxValue} from database (last 12 months)`);
            }
          }
        }
      } catch (e: any) {
        // Column might not exist or other error - skip this counter
        console.warn(`[PM5320][${deviceId}] Could not load counter ${alarmParam}:`, e.message);
      }
    }
    
    console.log(`[PM5320][${deviceId}] Loaded ${counterMap.size} counter values from database`);
  } catch (e: any) {
    console.error(`[PM5320][${deviceId}] Error loading counters from database:`, e.message);
  }
  
  return counterMap;
}

/**
 * PM5320 alarm detection - counter-based events
 * Detects when counter values increase (edge-triggered on increment)
 */
async function recordPm5320Alarms(
  device: Device,
  data: Record<string, number | string>,
  eventTimestamp: Date
): Promise<void> {
  try {
    await ensureDeviceEventsTableExists();
  } catch (e: any) {
    console.error(`[PM5320][${device.id}] Failed to ensure device_events table:`, e.message);
    return;
  }

  if (device.type !== 'PM5320') return;

  // Get or create counter map for this device to track previous counter values
  let counterMap = lastPm5320Counters.get(device.id);
  if (!counterMap) {
    // On first run after restart, load historical counter values from database
    console.log(`[PM5320][${device.id}] Loading counter values from database...`);
    counterMap = await loadPm5320CountersFromDatabase(device.id);
    lastPm5320Counters.set(device.id, counterMap);
  }

  // Helper to insert alarm event with retry
  const insertAlarm = async (
    alarmCode: string,
    parameter: string,
    description: string,
    value: number | string
  ): Promise<void> => {
    try {
      const result = await db.query(
        `INSERT INTO device_events (device_id, parameter, event_type, prev_value, new_value, event_timestamp, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [device.id, parameter, alarmCode, null, value, eventTimestamp, description]
      );
      console.log(`[PM5320][${device.id}] ✓ INSERTED: ${alarmCode} - ${parameter} = ${value} (ID: ${result.rows[0].id})`);
    } catch (e: any) {
      if (e.message?.includes('does not exist') || e.code === '42P01') {
        console.log(`[PM5320][${device.id}] Table missing, retrying...`);
        await ensureDeviceEventsTableExists();
        await db.query(
          `INSERT INTO device_events (device_id, parameter, event_type, prev_value, new_value, event_timestamp, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [device.id, parameter, alarmCode, null, value, eventTimestamp, description]
        );
        console.log(`[PM5320][${device.id}] ✓ INSERTED (retry): ${alarmCode} - ${parameter} = ${value}`);
      } else {
        console.error(`[PM5320][${device.id}] ✗ FAILED to insert ${alarmCode}:`, e.message || e);
      }
    }
  };

  // 1. UNDER FREQUENCY: Detect when counter increases (skip if value decreases)
  const underFreqValue = data['Under Frequency'];
  if (underFreqValue !== undefined && typeof underFreqValue === 'number' && isFinite(underFreqValue)) {
    const prevValue = counterMap.get('Under Frequency') ?? 0;
    // Only trigger if value increased, skip if it decreased or stayed same
    if (underFreqValue > prevValue) {
      const increment = underFreqValue - prevValue;
      await insertAlarm(
        'under_frequency',
        'Under Frequency',
        `Under Frequency event detected (counter: ${prevValue} -> ${underFreqValue}, increment: ${increment})`,
        underFreqValue
      );
    }
    counterMap.set('Under Frequency', underFreqValue);
  }

  // 2. OVER FREQUENCY: Detect when counter increases (skip if value decreases)
  const overFreqValue = data['Over Frequency'];
  if (overFreqValue !== undefined && typeof overFreqValue === 'number' && isFinite(overFreqValue)) {
    const prevValue = counterMap.get('Over Frequency') ?? 0;
    // Only trigger if value increased, skip if it decreased or stayed same
    if (overFreqValue > prevValue) {
      const increment = overFreqValue - prevValue;
      await insertAlarm(
        'over_frequency',
        'Over Frequency',
        `Over Frequency event detected (counter: ${prevValue} -> ${overFreqValue}, increment: ${increment})`,
        overFreqValue
      );
    }
    counterMap.set('Over Frequency', overFreqValue);
  }

  // 3. PHASE LOSS: Detect when counter increases (skip if value decreases)
  const phaseLossValue = data['Phase Loss'];
  if (phaseLossValue !== undefined && typeof phaseLossValue === 'number' && isFinite(phaseLossValue)) {
    const prevValue = counterMap.get('Phase Loss') ?? 0;
    // Only trigger if value increased, skip if it decreased or stayed same
    if (phaseLossValue > prevValue) {
      const increment = phaseLossValue - prevValue;
      await insertAlarm(
        'phase_loss',
        'Phase Loss',
        `Phase Loss event detected (counter: ${prevValue} -> ${phaseLossValue}, increment: ${increment})`,
        phaseLossValue
      );
    }
    counterMap.set('Phase Loss', phaseLossValue);
  }

  // 4. METER DIAGNOSTIC: Detect when counter increases (skip if value decreases)
  const meterDiagValue = data['Meter Diagnostic'];
  if (meterDiagValue !== undefined && typeof meterDiagValue === 'number' && isFinite(meterDiagValue)) {
    const prevValue = counterMap.get('Meter Diagnostic') ?? 0;
    // Only trigger if value increased, skip if it decreased or stayed same
    if (meterDiagValue > prevValue) {
      const increment = meterDiagValue - prevValue;
      await insertAlarm(
        'meter_diagnostic',
        'Meter Diagnostic',
        `Meter Diagnostic event detected (counter: ${prevValue} -> ${meterDiagValue}, increment: ${increment})`,
        meterDiagValue
      );
    }
    counterMap.set('Meter Diagnostic', meterDiagValue);
  }

  // 5. METER RESET: Detect when counter increases (skip if value decreases)
  const meterResetValue = data['Meter Reset'];
  if (meterResetValue !== undefined && typeof meterResetValue === 'number' && isFinite(meterResetValue)) {
    const prevValue = counterMap.get('Meter Reset') ?? 0;
    // Only trigger if value increased, skip if it decreased or stayed same
    if (meterResetValue > prevValue) {
      const increment = meterResetValue - prevValue;
      await insertAlarm(
        'meter_reset',
        'Meter Reset',
        `Meter Reset event detected (counter: ${prevValue} -> ${meterResetValue}, increment: ${increment})`,
        meterResetValue
      );
    }
    counterMap.set('Meter Reset', meterResetValue);
  }

  // 6. PHASE REVERSAL: Detect when counter increases (skip if value decreases)
  const phaseRevValue = data['Phase Reversal'];
  if (phaseRevValue !== undefined && typeof phaseRevValue === 'number' && isFinite(phaseRevValue)) {
    const prevValue = counterMap.get('Phase Reversal') ?? 0;
    // Only trigger if value increased, skip if it decreased or stayed same
    if (phaseRevValue > prevValue) {
      const increment = phaseRevValue - prevValue;
      await insertAlarm(
        'phase_reversal',
        'Phase Reversal',
        `Phase Reversal event detected (counter: ${prevValue} -> ${phaseRevValue}, increment: ${increment})`,
        phaseRevValue
      );
    }
    counterMap.set('Phase Reversal', phaseRevValue);
  }

  // 7. OVER CURRENT, PHASE: Detect when counter increases (skip if value decreases)
  const overCurrentPhaseValue = data['Over Current, Phase'];
  if (overCurrentPhaseValue !== undefined && typeof overCurrentPhaseValue === 'number' && isFinite(overCurrentPhaseValue)) {
    const prevValue = counterMap.get('Over Current, Phase') ?? 0;
    if (overCurrentPhaseValue > prevValue) {
      const increment = overCurrentPhaseValue - prevValue;
      await insertAlarm(
        'over_current_phase',
        'Over Current, Phase',
        `Over Current, Phase event detected (counter: ${prevValue} -> ${overCurrentPhaseValue}, increment: ${increment})`,
        overCurrentPhaseValue
      );
    }
    counterMap.set('Over Current, Phase', overCurrentPhaseValue);
  }

  // 8. UNDER CURRENT, PHASE: Detect when counter increases (skip if value decreases)
  const underCurrentPhaseValue = data['Under Current, Phase'];
  if (underCurrentPhaseValue !== undefined && typeof underCurrentPhaseValue === 'number' && isFinite(underCurrentPhaseValue)) {
    const prevValue = counterMap.get('Under Current, Phase') ?? 0;
    if (underCurrentPhaseValue > prevValue) {
      const increment = underCurrentPhaseValue - prevValue;
      await insertAlarm(
        'under_current_phase',
        'Under Current, Phase',
        `Under Current, Phase event detected (counter: ${prevValue} -> ${underCurrentPhaseValue}, increment: ${increment})`,
        underCurrentPhaseValue
      );
    }
    counterMap.set('Under Current, Phase', underCurrentPhaseValue);
  }

  // 9. OVER CURRENT, NEUTRAL: Detect when counter increases (skip if value decreases)
  const overCurrentNeutralValue = data['Over Current, Neutral'];
  if (overCurrentNeutralValue !== undefined && typeof overCurrentNeutralValue === 'number' && isFinite(overCurrentNeutralValue)) {
    const prevValue = counterMap.get('Over Current, Neutral') ?? 0;
    if (overCurrentNeutralValue > prevValue) {
      const increment = overCurrentNeutralValue - prevValue;
      await insertAlarm(
        'over_current_neutral',
        'Over Current, Neutral',
        `Over Current, Neutral event detected (counter: ${prevValue} -> ${overCurrentNeutralValue}, increment: ${increment})`,
        overCurrentNeutralValue
      );
    }
    counterMap.set('Over Current, Neutral', overCurrentNeutralValue);
  }

  // 10. OVER CURRENT, GROUND: Detect when counter increases (skip if value decreases)
  const overCurrentGroundValue = data['Over Current, Ground'];
  if (overCurrentGroundValue !== undefined && typeof overCurrentGroundValue === 'number' && isFinite(overCurrentGroundValue)) {
    const prevValue = counterMap.get('Over Current, Ground') ?? 0;
    if (overCurrentGroundValue > prevValue) {
      const increment = overCurrentGroundValue - prevValue;
      await insertAlarm(
        'over_current_ground',
        'Over Current, Ground',
        `Over Current, Ground event detected (counter: ${prevValue} -> ${overCurrentGroundValue}, increment: ${increment})`,
        overCurrentGroundValue
      );
    }
    counterMap.set('Over Current, Ground', overCurrentGroundValue);
  }

  // 11. OVER VOLTAGE, L-L: Detect when counter increases (skip if value decreases)
  const overVoltageLLValue = data['Over Voltage, L-L'];
  if (overVoltageLLValue !== undefined && typeof overVoltageLLValue === 'number' && isFinite(overVoltageLLValue)) {
    const prevValue = counterMap.get('Over Voltage, L-L') ?? 0;
    if (overVoltageLLValue > prevValue) {
      const increment = overVoltageLLValue - prevValue;
      await insertAlarm(
        'over_voltage_ll',
        'Over Voltage, L-L',
        `Over Voltage, L-L event detected (counter: ${prevValue} -> ${overVoltageLLValue}, increment: ${increment})`,
        overVoltageLLValue
      );
    }
    counterMap.set('Over Voltage, L-L', overVoltageLLValue);
  }

  // 12. UNDER VOLTAGE, L-L: Detect when counter increases (skip if value decreases)
  const underVoltageLLValue = data['Under Voltage, L-L'];
  if (underVoltageLLValue !== undefined && typeof underVoltageLLValue === 'number' && isFinite(underVoltageLLValue)) {
    const prevValue = counterMap.get('Under Voltage, L-L') ?? 0;
    if (underVoltageLLValue > prevValue) {
      const increment = underVoltageLLValue - prevValue;
      await insertAlarm(
        'under_voltage_ll',
        'Under Voltage, L-L',
        `Under Voltage, L-L event detected (counter: ${prevValue} -> ${underVoltageLLValue}, increment: ${increment})`,
        underVoltageLLValue
      );
    }
    counterMap.set('Under Voltage, L-L', underVoltageLLValue);
  }

  // 13. OVER VOLTAGE, L-N: Detect when counter increases (skip if value decreases)
  const overVoltageLNValue = data['Over Voltage, L-N'];
  if (overVoltageLNValue !== undefined && typeof overVoltageLNValue === 'number' && isFinite(overVoltageLNValue)) {
    const prevValue = counterMap.get('Over Voltage, L-N') ?? 0;
    if (overVoltageLNValue > prevValue) {
      const increment = overVoltageLNValue - prevValue;
      await insertAlarm(
        'over_voltage_ln',
        'Over Voltage, L-N',
        `Over Voltage, L-N event detected (counter: ${prevValue} -> ${overVoltageLNValue}, increment: ${increment})`,
        overVoltageLNValue
      );
    }
    counterMap.set('Over Voltage, L-N', overVoltageLNValue);
  }

  // 14. UNDER VOLTAGE, L-N: Detect when counter increases (skip if value decreases)
  const underVoltageLNValue = data['Under Voltage, L-N'];
  if (underVoltageLNValue !== undefined && typeof underVoltageLNValue === 'number' && isFinite(underVoltageLNValue)) {
    const prevValue = counterMap.get('Under Voltage, L-N') ?? 0;
    if (underVoltageLNValue > prevValue) {
      const increment = underVoltageLNValue - prevValue;
      await insertAlarm(
        'under_voltage_ln',
        'Under Voltage, L-N',
        `Under Voltage, L-N event detected (counter: ${prevValue} -> ${underVoltageLNValue}, increment: ${increment})`,
        underVoltageLNValue
      );
    }
    counterMap.set('Under Voltage, L-N', underVoltageLNValue);
  }

  // 15. OVER POWER, ACTIVE: Detect when counter increases (skip if value decreases)
  const overPowerActiveValue = data['Over Power, Active'];
  if (overPowerActiveValue !== undefined && typeof overPowerActiveValue === 'number' && isFinite(overPowerActiveValue)) {
    const prevValue = counterMap.get('Over Power, Active') ?? 0;
    if (overPowerActiveValue > prevValue) {
      const increment = overPowerActiveValue - prevValue;
      await insertAlarm(
        'over_power_active',
        'Over Power, Active',
        `Over Power, Active event detected (counter: ${prevValue} -> ${overPowerActiveValue}, increment: ${increment})`,
        overPowerActiveValue
      );
    }
    counterMap.set('Over Power, Active', overPowerActiveValue);
  }

  // 16. OVER POWER, REACTIVE: Detect when counter increases (skip if value decreases)
  const overPowerReactiveValue = data['Over Power, Reactive'];
  if (overPowerReactiveValue !== undefined && typeof overPowerReactiveValue === 'number' && isFinite(overPowerReactiveValue)) {
    const prevValue = counterMap.get('Over Power, Reactive') ?? 0;
    if (overPowerReactiveValue > prevValue) {
      const increment = overPowerReactiveValue - prevValue;
      await insertAlarm(
        'over_power_reactive',
        'Over Power, Reactive',
        `Over Power, Reactive event detected (counter: ${prevValue} -> ${overPowerReactiveValue}, increment: ${increment})`,
        overPowerReactiveValue
      );
    }
    counterMap.set('Over Power, Reactive', overPowerReactiveValue);
  }

  // 17. OVER POWER, APPARENT: Detect when counter increases (skip if value decreases)
  const overPowerApparentValue = data['Over Power, Apparent'];
  if (overPowerApparentValue !== undefined && typeof overPowerApparentValue === 'number' && isFinite(overPowerApparentValue)) {
    const prevValue = counterMap.get('Over Power, Apparent') ?? 0;
    if (overPowerApparentValue > prevValue) {
      const increment = overPowerApparentValue - prevValue;
      await insertAlarm(
        'over_power_apparent',
        'Over Power, Apparent',
        `Over Power, Apparent event detected (counter: ${prevValue} -> ${overPowerApparentValue}, increment: ${increment})`,
        overPowerApparentValue
      );
    }
    counterMap.set('Over Power, Apparent', overPowerApparentValue);
  }

  // 18. LEAD POWER FACTOR, TRUE: Detect when counter increases (skip if value decreases)
  const leadPFTrueValue = data['Lead Power Factor, True'];
  if (leadPFTrueValue !== undefined && typeof leadPFTrueValue === 'number' && isFinite(leadPFTrueValue)) {
    const prevValue = counterMap.get('Lead Power Factor, True') ?? 0;
    if (leadPFTrueValue > prevValue) {
      const increment = leadPFTrueValue - prevValue;
      await insertAlarm(
        'lead_pf_true',
        'Lead Power Factor, True',
        `Lead Power Factor, True event detected (counter: ${prevValue} -> ${leadPFTrueValue}, increment: ${increment})`,
        leadPFTrueValue
      );
    }
    counterMap.set('Lead Power Factor, True', leadPFTrueValue);
  }

  // 19. LAG POWER FACTOR, TRUE: Detect when counter increases (skip if value decreases)
  const lagPFTrueValue = data['Lag Power Factor, True'];
  if (lagPFTrueValue !== undefined && typeof lagPFTrueValue === 'number' && isFinite(lagPFTrueValue)) {
    const prevValue = counterMap.get('Lag Power Factor, True') ?? 0;
    if (lagPFTrueValue > prevValue) {
      const increment = lagPFTrueValue - prevValue;
      await insertAlarm(
        'lag_pf_true',
        'Lag Power Factor, True',
        `Lag Power Factor, True event detected (counter: ${prevValue} -> ${lagPFTrueValue}, increment: ${increment})`,
        lagPFTrueValue
      );
    }
    counterMap.set('Lag Power Factor, True', lagPFTrueValue);
  }

  // 20. LEAD POWER FACTOR, DISPLACEMENT: Detect when counter increases (skip if value decreases)
  const leadPFDisplacementValue = data['Lead Power Factor, Displacement'];
  if (leadPFDisplacementValue !== undefined && typeof leadPFDisplacementValue === 'number' && isFinite(leadPFDisplacementValue)) {
    const prevValue = counterMap.get('Lead Power Factor, Displacement') ?? 0;
    if (leadPFDisplacementValue > prevValue) {
      const increment = leadPFDisplacementValue - prevValue;
      await insertAlarm(
        'lead_pf_displacement',
        'Lead Power Factor, Displacement',
        `Lead Power Factor, Displacement event detected (counter: ${prevValue} -> ${leadPFDisplacementValue}, increment: ${increment})`,
        leadPFDisplacementValue
      );
    }
    counterMap.set('Lead Power Factor, Displacement', leadPFDisplacementValue);
  }

  // 21. LAG POWER FACTOR, DISPLACEMENT: Detect when counter increases (skip if value decreases)
  const lagPFDisplacementValue = data['Lag Power Factor, Displacement'];
  if (lagPFDisplacementValue !== undefined && typeof lagPFDisplacementValue === 'number' && isFinite(lagPFDisplacementValue)) {
    const prevValue = counterMap.get('Lag Power Factor, Displacement') ?? 0;
    if (lagPFDisplacementValue > prevValue) {
      const increment = lagPFDisplacementValue - prevValue;
      await insertAlarm(
        'lag_pf_displacement',
        'Lag Power Factor, Displacement',
        `Lag Power Factor, Displacement event detected (counter: ${prevValue} -> ${lagPFDisplacementValue}, increment: ${increment})`,
        lagPFDisplacementValue
      );
    }
    counterMap.set('Lag Power Factor, Displacement', lagPFDisplacementValue);
  }

  // 22. OVER DEMAND, ACTIVE POWER, PRESENT: Detect when counter increases (skip if value decreases)
  const overDemandActivePresentValue = data['Over Demand, Active Power, Present'];
  if (overDemandActivePresentValue !== undefined && typeof overDemandActivePresentValue === 'number' && isFinite(overDemandActivePresentValue)) {
    const prevValue = counterMap.get('Over Demand, Active Power, Present') ?? 0;
    if (overDemandActivePresentValue > prevValue) {
      const increment = overDemandActivePresentValue - prevValue;
      await insertAlarm(
        'over_demand_active_present',
        'Over Demand, Active Power, Present',
        `Over Demand, Active Power, Present event detected (counter: ${prevValue} -> ${overDemandActivePresentValue}, increment: ${increment})`,
        overDemandActivePresentValue
      );
    }
    counterMap.set('Over Demand, Active Power, Present', overDemandActivePresentValue);
  }

  // 23. OVER DEMAND, ACTIVE POWER, LAST: Detect when counter increases (skip if value decreases)
  const overDemandActiveLastValue = data['Over Demand, Active Power, Last'];
  if (overDemandActiveLastValue !== undefined && typeof overDemandActiveLastValue === 'number' && isFinite(overDemandActiveLastValue)) {
    const prevValue = counterMap.get('Over Demand, Active Power, Last') ?? 0;
    if (overDemandActiveLastValue > prevValue) {
      const increment = overDemandActiveLastValue - prevValue;
      await insertAlarm(
        'over_demand_active_last',
        'Over Demand, Active Power, Last',
        `Over Demand, Active Power, Last event detected (counter: ${prevValue} -> ${overDemandActiveLastValue}, increment: ${increment})`,
        overDemandActiveLastValue
      );
    }
    counterMap.set('Over Demand, Active Power, Last', overDemandActiveLastValue);
  }

  // 24. OVER DEMAND, ACTIVE POWER, PREDICTED: Detect when counter increases (skip if value decreases)
  const overDemandActivePredictedValue = data['Over Demand, Active Power, Predicted'];
  if (overDemandActivePredictedValue !== undefined && typeof overDemandActivePredictedValue === 'number' && isFinite(overDemandActivePredictedValue)) {
    const prevValue = counterMap.get('Over Demand, Active Power, Predicted') ?? 0;
    if (overDemandActivePredictedValue > prevValue) {
      const increment = overDemandActivePredictedValue - prevValue;
      await insertAlarm(
        'over_demand_active_predicted',
        'Over Demand, Active Power, Predicted',
        `Over Demand, Active Power, Predicted event detected (counter: ${prevValue} -> ${overDemandActivePredictedValue}, increment: ${increment})`,
        overDemandActivePredictedValue
      );
    }
    counterMap.set('Over Demand, Active Power, Predicted', overDemandActivePredictedValue);
  }

  // 25. OVER DEMAND, REACTIVE POWER, PRESENT: Detect when counter increases (skip if value decreases)
  const overDemandReactivePresentValue = data['Over Demand, Reactive Power, Present'];
  if (overDemandReactivePresentValue !== undefined && typeof overDemandReactivePresentValue === 'number' && isFinite(overDemandReactivePresentValue)) {
    const prevValue = counterMap.get('Over Demand, Reactive Power, Present') ?? 0;
    if (overDemandReactivePresentValue > prevValue) {
      const increment = overDemandReactivePresentValue - prevValue;
      await insertAlarm(
        'over_demand_reactive_present',
        'Over Demand, Reactive Power, Present',
        `Over Demand, Reactive Power, Present event detected (counter: ${prevValue} -> ${overDemandReactivePresentValue}, increment: ${increment})`,
        overDemandReactivePresentValue
      );
    }
    counterMap.set('Over Demand, Reactive Power, Present', overDemandReactivePresentValue);
  }

  // 26. OVER DEMAND, REACTIVE POWER, LAST: Detect when counter increases (skip if value decreases)
  const overDemandReactiveLastValue = data['Over Demand, Reactive Power, Last'];
  if (overDemandReactiveLastValue !== undefined && typeof overDemandReactiveLastValue === 'number' && isFinite(overDemandReactiveLastValue)) {
    const prevValue = counterMap.get('Over Demand, Reactive Power, Last') ?? 0;
    if (overDemandReactiveLastValue > prevValue) {
      const increment = overDemandReactiveLastValue - prevValue;
      await insertAlarm(
        'over_demand_reactive_last',
        'Over Demand, Reactive Power, Last',
        `Over Demand, Reactive Power, Last event detected (counter: ${prevValue} -> ${overDemandReactiveLastValue}, increment: ${increment})`,
        overDemandReactiveLastValue
      );
    }
    counterMap.set('Over Demand, Reactive Power, Last', overDemandReactiveLastValue);
  }

  // 27. OVER DEMAND, REACTIVE POWER, PREDICTED: Detect when counter increases (skip if value decreases)
  const overDemandReactivePredictedValue = data['Over Demand, Reactive Power, Predicted'];
  if (overDemandReactivePredictedValue !== undefined && typeof overDemandReactivePredictedValue === 'number' && isFinite(overDemandReactivePredictedValue)) {
    const prevValue = counterMap.get('Over Demand, Reactive Power, Predicted') ?? 0;
    if (overDemandReactivePredictedValue > prevValue) {
      const increment = overDemandReactivePredictedValue - prevValue;
      await insertAlarm(
        'over_demand_reactive_predicted',
        'Over Demand, Reactive Power, Predicted',
        `Over Demand, Reactive Power, Predicted event detected (counter: ${prevValue} -> ${overDemandReactivePredictedValue}, increment: ${increment})`,
        overDemandReactivePredictedValue
      );
    }
    counterMap.set('Over Demand, Reactive Power, Predicted', overDemandReactivePredictedValue);
  }

  // 28. OVER DEMAND, APPARENT POWER, PRESENT: Detect when counter increases (skip if value decreases)
  const overDemandApparentPresentValue = data['Over Demand, Apparent Power, Present'];
  if (overDemandApparentPresentValue !== undefined && typeof overDemandApparentPresentValue === 'number' && isFinite(overDemandApparentPresentValue)) {
    const prevValue = counterMap.get('Over Demand, Apparent Power, Present') ?? 0;
    if (overDemandApparentPresentValue > prevValue) {
      const increment = overDemandApparentPresentValue - prevValue;
      await insertAlarm(
        'over_demand_apparent_present',
        'Over Demand, Apparent Power, Present',
        `Over Demand, Apparent Power, Present event detected (counter: ${prevValue} -> ${overDemandApparentPresentValue}, increment: ${increment})`,
        overDemandApparentPresentValue
      );
    }
    counterMap.set('Over Demand, Apparent Power, Present', overDemandApparentPresentValue);
  }

  // 29. OVER DEMAND, APPARENT POWER, LAST: Detect when counter increases (skip if value decreases)
  const overDemandApparentLastValue = data['Over Demand, Apparent Power, Last'];
  if (overDemandApparentLastValue !== undefined && typeof overDemandApparentLastValue === 'number' && isFinite(overDemandApparentLastValue)) {
    const prevValue = counterMap.get('Over Demand, Apparent Power, Last') ?? 0;
    if (overDemandApparentLastValue > prevValue) {
      const increment = overDemandApparentLastValue - prevValue;
      await insertAlarm(
        'over_demand_apparent_last',
        'Over Demand, Apparent Power, Last',
        `Over Demand, Apparent Power, Last event detected (counter: ${prevValue} -> ${overDemandApparentLastValue}, increment: ${increment})`,
        overDemandApparentLastValue
      );
    }
    counterMap.set('Over Demand, Apparent Power, Last', overDemandApparentLastValue);
  }

  // 30. OVER DEMAND, APPARENT POWER, PREDICTED: Detect when counter increases (skip if value decreases)
  const overDemandApparentPredictedValue = data['Over Demand, Apparent Power, Predicted'];
  if (overDemandApparentPredictedValue !== undefined && typeof overDemandApparentPredictedValue === 'number' && isFinite(overDemandApparentPredictedValue)) {
    const prevValue = counterMap.get('Over Demand, Apparent Power, Predicted') ?? 0;
    if (overDemandApparentPredictedValue > prevValue) {
      const increment = overDemandApparentPredictedValue - prevValue;
      await insertAlarm(
        'over_demand_apparent_predicted',
        'Over Demand, Apparent Power, Predicted',
        `Over Demand, Apparent Power, Predicted event detected (counter: ${prevValue} -> ${overDemandApparentPredictedValue}, increment: ${increment})`,
        overDemandApparentPredictedValue
      );
    }
    counterMap.set('Over Demand, Apparent Power, Predicted', overDemandApparentPredictedValue);
  }

  // 31. OVER VOLTAGE UNBALANCE: Detect when counter increases (skip if value decreases)
  const overVoltageUnbalanceValue = data['Over Voltage Unbalance'];
  if (overVoltageUnbalanceValue !== undefined && typeof overVoltageUnbalanceValue === 'number' && isFinite(overVoltageUnbalanceValue)) {
    const prevValue = counterMap.get('Over Voltage Unbalance') ?? 0;
    if (overVoltageUnbalanceValue > prevValue) {
      const increment = overVoltageUnbalanceValue - prevValue;
      await insertAlarm(
        'over_voltage_unbalance',
        'Over Voltage Unbalance',
        `Over Voltage Unbalance event detected (counter: ${prevValue} -> ${overVoltageUnbalanceValue}, increment: ${increment})`,
        overVoltageUnbalanceValue
      );
    }
    counterMap.set('Over Voltage Unbalance', overVoltageUnbalanceValue);
  }

  // 32. OVER VOLTAGE TOTAL HARMONIC DISTORTION: Detect when counter increases (skip if value decreases)
  const overVoltageTHDValue = data['Over Voltage Total Harmonic Distortion'];
  if (overVoltageTHDValue !== undefined && typeof overVoltageTHDValue === 'number' && isFinite(overVoltageTHDValue)) {
    const prevValue = counterMap.get('Over Voltage Total Harmonic Distortion') ?? 0;
    if (overVoltageTHDValue > prevValue) {
      const increment = overVoltageTHDValue - prevValue;
      await insertAlarm(
        'over_voltage_thd',
        'Over Voltage Total Harmonic Distortion',
        `Over Voltage Total Harmonic Distortion event detected (counter: ${prevValue} -> ${overVoltageTHDValue}, increment: ${increment})`,
        overVoltageTHDValue
      );
    }
    counterMap.set('Over Voltage Total Harmonic Distortion', overVoltageTHDValue);
  }

  // THD CURRENT THRESHOLD EVENTS: Edge-triggered when THD Current exceeds 20% (similar to Micrologic 6E)
  // Get or create state map for threshold-based events (separate from counter-based events)
  let stateMap = lastThresholdStates.get(device.id);
  if (!stateMap) {
    stateMap = new Map<string, boolean>();
    lastThresholdStates.set(device.id, stateMap);
  }

  // THD Current threshold: 20% (values are stored as percentages: 10.5 = 10.5%, 20.0 = 20%)
  const thdCurrentThreshold = 20.0;

  // 33. THD CURRENT A: Detect when value exceeds 20% (edge-triggered)
  const thdCurrentAValue = data['THD Current A'];
  if (thdCurrentAValue !== undefined && typeof thdCurrentAValue === 'number' && isFinite(thdCurrentAValue)) {
    const isHigh = thdCurrentAValue > thdCurrentThreshold;
    const wasHigh = stateMap.get('thd_current_high:THD Current A') ?? false;
    
    // Only insert if transitioning INTO alarm state
      if (!wasHigh && isHigh) {
      await insertAlarm(
        'thd_current_high',
        'THD Current A',
        `THD Current A high: ${thdCurrentAValue.toFixed(2)}% (> 20%)`,
        thdCurrentAValue
      );
    }
    
    stateMap.set('thd_current_high:THD Current A', isHigh);
  }

  // 34. THD CURRENT B: Detect when value exceeds 20% (edge-triggered)
  const thdCurrentBValue = data['THD Current B'];
  if (thdCurrentBValue !== undefined && typeof thdCurrentBValue === 'number' && isFinite(thdCurrentBValue)) {
    const isHigh = thdCurrentBValue > thdCurrentThreshold;
    const wasHigh = stateMap.get('thd_current_high:THD Current B') ?? false;
    
    // Only insert if transitioning INTO alarm state
      if (!wasHigh && isHigh) {
      await insertAlarm(
        'thd_current_high',
        'THD Current B',
        `THD Current B high: ${thdCurrentBValue.toFixed(2)}% (> 20%)`,
        thdCurrentBValue
      );
    }
    
    stateMap.set('thd_current_high:THD Current B', isHigh);
  }

  // 35. THD CURRENT C: Detect when value exceeds 20% (edge-triggered)
  const thdCurrentCValue = data['THD Current C'];
  if (thdCurrentCValue !== undefined && typeof thdCurrentCValue === 'number' && isFinite(thdCurrentCValue)) {
    const isHigh = thdCurrentCValue > thdCurrentThreshold;
    const wasHigh = stateMap.get('thd_current_high:THD Current C') ?? false;
    
    // Only insert if transitioning INTO alarm state
      if (!wasHigh && isHigh) {
      await insertAlarm(
        'thd_current_high',
        'THD Current C',
        `THD Current C high: ${thdCurrentCValue.toFixed(2)}% (> 20%)`,
        thdCurrentCValue
      );
    }
    
    stateMap.set('thd_current_high:THD Current C', isHigh);
  }
}

function isEm6400ThdVoltageParam(param: string): boolean {
  return /^(THD Voltage (A-B|B-C|C-A|L-L|A-N|B-N|C-N|L-N))$/.test(param);
}

function isEm6400ThdCurrentParam(param: string): boolean {
  return /^(THD Current (A|B|C|N|G))$/.test(param);
}

/**
 * EM6400 alarm detection - counter-based events
 * Detects when counter values increase (edge-triggered on increment)
 * Similar to PM5320 counter-based event detection
 */
/**
 * Load EM6400 counter values from database (maximum values from last 12 months)
 * This ensures counters continue from correct historical values after backend restart
 */
async function loadEm6400CountersFromDatabase(deviceId: string): Promise<Map<string, number>> {
  const counterMap = new Map<string, number>();
  
  try {
    const tableName = getDeviceTableName(deviceId);
    
    // Counter-based alarm variables
    const counterBasedAlarms = [
      'Over Frequency Alarm',
      'Under Frequency Alarm',
      'PF Total Low',
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
      'OverVoltage Alarm',
      'UnderVoltage Alarm',
      'Phase A loss',
      'Phase B loss',
      'Phase C loss',
      'Current Imbalance Alarm',
    ];
    
    // Check if table exists
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )
    `, [tableName]);
    
    if (!tableExists.rows[0]?.exists) {
      console.log(`[EM6400][${deviceId}] Table ${tableName} does not exist yet, counters will initialize from current values`);
      return counterMap;
    }
    
    // Get maximum value for each counter variable from the last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    for (const alarmParam of counterBasedAlarms) {
      const colName = sanitizeColumnName(alarmParam);
      const quotedColName = `"${colName}"`;
      
      try {
        // Check if column exists
        const colExists = await db.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'public'
            AND table_name = $1
            AND column_name = $2
        `, [tableName, colName]);
        
        if (colExists.rows.length > 0) {
          // Get maximum value from last 12 months
          const result = await db.query(`
            SELECT MAX(${quotedColName}) as max_value
            FROM ${tableName}
            WHERE timestamp >= $1
              AND ${quotedColName} IS NOT NULL
          `, [twelveMonthsAgo]);
          
          if (result.rows[0]?.max_value !== null && result.rows[0]?.max_value !== undefined) {
            const maxValue = Number(result.rows[0].max_value);
            if (isFinite(maxValue) && maxValue >= 0) {
              counterMap.set(alarmParam, maxValue);
              console.log(`[EM6400][${deviceId}] Loaded counter ${alarmParam} = ${maxValue} from database (last 12 months)`);
            }
          }
        }
      } catch (e: any) {
        // Column might not exist or other error - skip this counter
        console.warn(`[EM6400][${deviceId}] Could not load counter ${alarmParam}:`, e.message);
      }
    }
    
    console.log(`[EM6400][${deviceId}] Loaded ${counterMap.size} counter values from database`);
  } catch (e: any) {
    console.error(`[EM6400][${deviceId}] Error loading counters from database:`, e.message);
  }
  
  return counterMap;
}

async function recordEm6400ThresholdEvents(
  device: Device,
  data: Record<string, number | string>,
  eventTimestamp: Date,
  previousCounters?: Map<string, number>
): Promise<void> {
  if (device.type !== 'EM6400') return;

  try {
    await ensureDeviceEventsTableExists();
  } catch (e: any) {
    console.error(`[EM6400][${device.id}] Failed to ensure device_events table:`, e.message);
    return;
  }

  // Get or create counter map for this device to track previous counter values
  let counterMap = lastEm6400Counters.get(device.id);
  if (!counterMap) {
    // On first run after restart, load historical counter values from database
    console.log(`[EM6400][${device.id}] Loading counter values from database...`);
    counterMap = await loadEm6400CountersFromDatabase(device.id);
    lastEm6400Counters.set(device.id, counterMap);
  }

  // Use previous counters passed from caller (captured BEFORE augmentEm6400ComputedFields ran)
  // If not provided, fall back to current counter map values (less accurate but better than nothing)
  const previousCountersToUse = previousCounters || new Map<string, number>();
  if (!previousCounters) {
    // Fallback: capture from counter map (but these may already be updated)
    for (const alarmParam of [
      'Over Frequency Alarm',
      'Under Frequency Alarm',
      'PF Total Low',
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
      'OverVoltage Alarm',
      'UnderVoltage Alarm',
      'Phase A loss',
      'Phase B loss',
      'Phase C loss',
      'Current Imbalance Alarm',
    ]) {
      previousCountersToUse.set(alarmParam, counterMap.get(alarmParam) ?? 0);
    }
  }

  // Helper to insert alarm event with retry
  const insertAlarm = async (
    alarmCode: string,
    parameter: string,
    description: string,
    value: number
  ): Promise<void> => {
    try {
      const result = await db.query(
          `INSERT INTO device_events (device_id, parameter, event_type, prev_value, new_value, event_timestamp, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [device.id, parameter, alarmCode, null, value, eventTimestamp, description]
      );
      console.log(`[EM6400][${device.id}] ✓ INSERTED: ${alarmCode} - ${parameter} = ${value} (ID: ${result.rows[0].id})`);
    } catch (e: any) {
      if (e.message?.includes('does not exist') || e.code === '42P01') {
        console.log(`[EM6400][${device.id}] Table missing, retrying...`);
        await ensureDeviceEventsTableExists();
        await db.query(
          `INSERT INTO device_events (device_id, parameter, event_type, prev_value, new_value, event_timestamp, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [device.id, parameter, alarmCode, null, value, eventTimestamp, description]
        );
        console.log(`[EM6400][${device.id}] ✓ INSERTED (retry): ${alarmCode} - ${parameter} = ${value}`);
      } else {
        console.error(`[EM6400][${device.id}] ✗ FAILED to insert ${alarmCode}:`, e.message || e);
      }
    }
  };

  // Counter-based alarm variables - detect when counter increases
  const counterBasedAlarms = [
    'Over Frequency Alarm',
    'Under Frequency Alarm',
    'PF Total Low',
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
    'OverVoltage Alarm',
    'UnderVoltage Alarm',
    'Phase A loss',
    'Phase B loss',
    'Phase C loss',
    'Current Imbalance Alarm',
  ];

  // Get state map to check if condition just transitioned (to avoid duplicates with augmentEm6400ComputedFields)
  let stateMap = lastThresholdStates.get(device.id);
  if (!stateMap) {
    stateMap = new Map<string, boolean>();
    lastThresholdStates.set(device.id, stateMap);
  }

  for (const alarmParam of counterBasedAlarms) {
    const alarmValue = data[alarmParam];
    if (alarmValue !== undefined && typeof alarmValue === 'number' && isFinite(alarmValue)) {
      // Use the PREVIOUS value captured BEFORE augmentEm6400ComputedFields ran
      // This was passed as a parameter to ensure we have the correct old values
      const prevValue = previousCountersToUse.get(alarmParam) ?? 0;
      
      console.log(`[EM6400][${device.id}] Checking ${alarmParam}: prevValue=${prevValue} (from before augmentEm6400ComputedFields), alarmValue=${alarmValue} (from data after augmentEm6400ComputedFields)`);
      
      // On first run after restart, initialize without triggering event
      if (!counterMap.has(alarmParam)) {
        const loadedValue = prevValue;
        const maxValue = Math.max(loadedValue, alarmValue);
        counterMap.set(alarmParam, maxValue);
        console.log(`[EM6400][${device.id}] Initialized counter ${alarmParam} = ${maxValue} (loaded: ${loadedValue}, current: ${alarmValue})`);
      continue;
    }

      // Only trigger if value increased
      // augmentEm6400ComputedFields already increments the counter when condition transitions from false to true
      // So if the counter increased, it means a transition occurred - insert the event
      if (alarmValue > prevValue) {
        const increment = alarmValue - prevValue;
        const eventType = alarmParam.toLowerCase()
          .replace(/\s+/g, '_')
          .replace(/[^a-z0-9_]/g, '');
        
        console.log(`[EM6400][${device.id}] ✓ Counter increased for ${alarmParam}: ${prevValue} -> ${alarmValue}, inserting event`);
        
        await insertAlarm(
          eventType,
          alarmParam,
          `${alarmParam} event detected (counter: ${prevValue} -> ${alarmValue}, increment: ${increment})`,
          alarmValue
        );
      } else {
        console.log(`[EM6400][${device.id}] Counter did not increase for ${alarmParam}: ${prevValue} -> ${alarmValue}`);
      }
      // Update counter map with new value
      counterMap.set(alarmParam, alarmValue);
    }
  }
}

function num(data: Record<string, number | string>, key: string): number | undefined {
  const v = data[key];
  if (typeof v !== 'number' || !isFinite(v)) return undefined;
  return v;
}

function setFlag(data: Record<string, number | string>, key: string, active: boolean): void {
  data[key] = active ? 1 : 0;
}

function updateRunningMax(deviceId: string, key: string, value: number): number {
  let m = em6400RunningMax.get(deviceId);
  if (!m) {
    m = {};
    em6400RunningMax.set(deviceId, m);
  }
  const prev = m[key];
  const next = prev === undefined ? value : Math.max(prev, value);
  m[key] = next;
  return next;
}

function augmentEm6400ComputedFields(device: Device, data: Record<string, number | string>): void {
  if (device.type !== 'EM6400') return;

  const freq = num(data, 'Frequency');
  const pfTotal = num(data, 'Power Factor Total');

  const thdVKeys = [
    'THD Voltage A-B',
    'THD Voltage B-C',
    'THD Voltage C-A',
    'THD Voltage L-L',
    'THD Voltage A-N',
    'THD Voltage B-N',
    'THD Voltage C-N',
    'THD Voltage L-N',
  ];
  const thdIKeys = ['THD Current A', 'THD Current B', 'THD Current C', 'THD Current N', 'THD Current G'];

  // Get or create counter map and state map for this device
  let counterMap = lastEm6400Counters.get(device.id);
  if (!counterMap) {
    counterMap = new Map<string, number>();
    lastEm6400Counters.set(device.id, counterMap);
  }
  
  // Use lastThresholdStates to track previous condition states for transitions
  let stateMap = lastThresholdStates.get(device.id);
  if (!stateMap) {
    stateMap = new Map<string, boolean>();
    lastThresholdStates.set(device.id, stateMap);
  }

  // Helper to update counter - increments when condition transitions from false to true
  const updateCounterValue = (key: string, condition: boolean): number => {
    const prevValue = counterMap.get(key) ?? 0;
    const prevCondition = stateMap.get(`em_counter_state:${key}`) ?? false;
    
    let newValue = prevValue;
    // Only increment when transitioning from false to true
    if (condition && !prevCondition) {
      newValue = prevValue + 1;
    }
    
    counterMap.set(key, newValue);
    stateMap.set(`em_counter_state:${key}`, condition);
    return newValue;
  };

  // 1) Frequency alarms - counter increments when condition is met
  if (freq !== undefined) {
    data['Over Frequency Alarm'] = updateCounterValue('Over Frequency Alarm', freq > 50.2);
    data['Under Frequency Alarm'] = updateCounterValue('Under Frequency Alarm', freq < 49.5);
  }

  // 2) PF Total alarm - counter increments when abs(PF) is NOT in [0.9, 1.1]
  if (pfTotal !== undefined) {
    const absPF = Math.abs(pfTotal);
    data['PF Total Low'] = updateCounterValue('PF Total Low', absPF < 0.9 || absPF > 1.1);
  }

  // 3) THD Voltage alarms (> 8%) - counter increments when threshold exceeded
  for (const k of thdVKeys) {
    const v = num(data, k);
    if (v === undefined) continue;
    data[`${k} High`] = updateCounterValue(`${k} High`, v > 8);
  }

  // 4) THD Current alarms (> 20%) - counter increments when threshold exceeded
  for (const k of thdIKeys) {
    const v = num(data, k);
    if (v === undefined) continue;
    data[`${k} High`] = updateCounterValue(`${k} High`, v > 20);
  }

  // 5/6) Over/Under voltage alarms relative to nominal - counter increments when condition is met
  const nominalV = num(data, 'Nominal Voltage');
  const vLnAvg = num(data, 'Voltage L-N Avg');
  if (nominalV !== undefined && vLnAvg !== undefined) {
    data['OverVoltage Alarm'] = updateCounterValue('OverVoltage Alarm', vLnAvg > nominalV * 1.08);
    data['UnderVoltage Alarm'] = updateCounterValue('UnderVoltage Alarm', vLnAvg < nominalV * 0.92);
  }

  // 7/8/9) Phase loss when phase-to-neutral voltage is 0 - counter increments when phase is lost
  const vAN = num(data, 'Voltage A-N');
  const vBN = num(data, 'Voltage B-N');
  const vCN = num(data, 'Voltage C-N');
  if (vAN !== undefined) data['Phase A loss'] = updateCounterValue('Phase A loss', vAN === 0);
  if (vBN !== undefined) data['Phase B loss'] = updateCounterValue('Phase B loss', vBN === 0);
  if (vCN !== undefined) data['Phase C loss'] = updateCounterValue('Phase C loss', vCN === 0);

  // 10) Current imbalance alarm (> 20% deviation) - counter increments when condition is met
  const iA = num(data, 'Current A');
  const iB = num(data, 'Current B');
  const iC = num(data, 'Current C');
  if (iA !== undefined && iB !== undefined && iC !== undefined) {
    const avg = (iA + iB + iC) / 3;
    const unbalance = avg > 0 ? Math.max(Math.abs(iA - avg), Math.abs(iB - avg), Math.abs(iC - avg)) / avg : 0;
    data['Current Imbalance Alarm'] = updateCounterValue('Current Imbalance Alarm', unbalance > 0.2);
  }

  // Running maxes (stored as numeric columns for UI)
  if (iA !== undefined) data['Max Current A'] = updateRunningMax(device.id, 'Max Current A', iA);
  if (iB !== undefined) data['Max Current B'] = updateRunningMax(device.id, 'Max Current B', iB);
  if (iC !== undefined) data['Max Current C'] = updateRunningMax(device.id, 'Max Current C', iC);
  if (vAN !== undefined) data['Max Voltage A-N'] = updateRunningMax(device.id, 'Max Voltage A-N', vAN);
  if (vBN !== undefined) data['Max Voltage B-N'] = updateRunningMax(device.id, 'Max Voltage B-N', vBN);
  if (vCN !== undefined) data['Max Voltage C-N'] = updateRunningMax(device.id, 'Max Voltage C-N', vCN);
  if (vLnAvg !== undefined) data['Max Voltage L-N Avg'] = updateRunningMax(device.id, 'Max Voltage L-N Avg', vLnAvg);
}

async function recordPm8000ThresholdEvents(
  device: Device,
  data: Record<string, number | string>,
  eventTimestamp: Date
): Promise<void> {
  if (device.type !== 'PM8000') return;

  let stateMap = lastThresholdStates.get(device.id);
  if (!stateMap) {
    stateMap = new Map<string, boolean>();
    lastThresholdStates.set(device.id, stateMap);
  }

  for (const [key, val] of Object.entries(data)) {
    if (typeof val !== 'number' || !isFinite(val)) continue;

    // Crest Factor High: trigger when crossing from <= 1.7 to > 1.7
    if (isCrestFactorParam(key)) {
      const wasHigh = stateMap.get(`crest_high:${key}`) ?? false;
      const isHigh = val > 1.7;
      if (!wasHigh && isHigh) {
        await db.query(
          `
          INSERT INTO device_events (device_id, parameter, event_type, prev_value, new_value, event_timestamp, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [device.id, key, 'crest_factor_high', null, val, eventTimestamp, `${key} exceeded 1.7`]
        );
      }
      stateMap.set(`crest_high:${key}`, isHigh);
      continue;
    }

    // K-Factor Low: trigger when crossing from >= 1.2 to < 1.2
    if (isKFactorParam(key)) {
      const wasLow = stateMap.get(`k_low:${key}`) ?? false;
      const isLow = val < 1.2;
      if (!wasLow && isLow) {
        await db.query(
          `
          INSERT INTO device_events (device_id, parameter, event_type, prev_value, new_value, event_timestamp, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [device.id, key, 'k_factor_low', null, val, eventTimestamp, `Low K-Factor corrective action required (${key} < 1.2)`]
        );
      }
      stateMap.set(`k_low:${key}`, isLow);
      continue;
    }

    // Power Factor Total out of range: abs(PF) not between 0.9 and 1.1
    if (isPowerFactorTotalParam(key)) {
      const absVal = Math.abs(val);
      const wasOutOfRange = stateMap.get(`pf_total_low:${key}`) ?? false;
      const isOutOfRange = absVal < 0.9 || absVal > 1.1;

      if (!wasOutOfRange && isOutOfRange) {
        const description = absVal < 0.9 
          ? `Low PF, correction required • Capacitor Banks required (abs(PF Total) = ${absVal.toFixed(3)} < 0.9)`
          : `Excessive compensation (abs(PF Total) = ${absVal.toFixed(3)} > 1.1)`;
        
        await db.query(
          `
          INSERT INTO device_events (device_id, parameter, event_type, prev_value, new_value, event_timestamp, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [device.id, key, 'pf_total_low', null, val, eventTimestamp, description]
        );
      }
      stateMap.set(`pf_total_low:${key}`, isOutOfRange);
      continue;
    }

    // Frequency out of range: <49.5 or >50.2
    if (isFrequencyParam(key)) {
      const wasLow = stateMap.get(`freq_low:${key}`) ?? false;
      const wasHigh = stateMap.get(`freq_high:${key}`) ?? false;
      const isLow = val < 49.5;
      const isHigh = val > 50.2;

      if (!wasLow && isLow) {
        await db.query(
          `
          INSERT INTO device_events (device_id, parameter, event_type, prev_value, new_value, event_timestamp, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [device.id, key, 'frequency_low', null, val, eventTimestamp, 'Frequency dropped below 49.5 Hz']
        );
      }
      if (!wasHigh && isHigh) {
        await db.query(
          `
          INSERT INTO device_events (device_id, parameter, event_type, prev_value, new_value, event_timestamp, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [device.id, key, 'frequency_high', null, val, eventTimestamp, 'Frequency rose above 50.2 Hz']
        );
      }
      stateMap.set(`freq_low:${key}`, isLow);
      stateMap.set(`freq_high:${key}`, isHigh);
      continue;
    }

    // THD Current high: > 20%
    if (isThdCurrentParam(key)) {
      const wasHigh = stateMap.get(`thd_current_high:${key}`) ?? false;
      const isHigh = val > 20;
      if (!wasHigh && isHigh) {
        await db.query(
          `
          INSERT INTO device_events (device_id, parameter, event_type, prev_value, new_value, event_timestamp, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [device.id, key, 'thd_current_high', null, val, eventTimestamp, `High current distortion (${key} > 20%)`]
        );
      }
      stateMap.set(`thd_current_high:${key}`, isHigh);
      continue;
    }

    // THD Voltage high: > 6%
    if (isThdVoltageParam(key)) {
      const wasHigh = stateMap.get(`thd_voltage_high:${key}`) ?? false;
      const isHigh = val > 6;
      if (!wasHigh && isHigh) {
        await db.query(
          `
          INSERT INTO device_events (device_id, parameter, event_type, prev_value, new_value, event_timestamp, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [device.id, key, 'thd_voltage_high', null, val, eventTimestamp, `High voltage distortion (${key} > 6%)`]
        );
      }
      stateMap.set(`thd_voltage_high:${key}`, isHigh);
      continue;
    }

    // Phase loss: Voltage X-N < 10V (crossing from >=10 to <10)
    if (isPhaseVoltageToNeutralParam(key)) {
      const wasLost = stateMap.get(`phase_lost:${key}`) ?? false;
      const isLost = val < 10;
      if (!wasLost && isLost) {
        const phase = key.includes('A') ? 'Phase A' : key.includes('B') ? 'Phase B' : 'Phase C';
        await db.query(
          `
          INSERT INTO device_events (device_id, parameter, event_type, prev_value, new_value, event_timestamp, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [device.id, key, 'phase_loss', null, val, eventTimestamp, `${phase} lost (${key} < 10V)`]
        );
      }
      stateMap.set(`phase_lost:${key}`, isLost);
      continue;
    }
  }
}

/**
 * Get default device configuration by type (from deviceConfigs)
 */
async function getDefaultDeviceConfig(deviceType: string): Promise<any> {
  // Use the same configs as deviceConfigs route
  const defaultConfigs: Record<string, any> = {
    PM5320: {
      deviceType: 'PM5320',
      registerMappings: (pm5320Mappings as any[]).map((m: any) => ({
        parameter: m.parameter,
        address: m.address,
        dataType: m.dataType,
        description: m.description || '',
      })),
    },
    PM5330: {
      deviceType: 'PM5330',
      registerMappings: [
        { parameter: 'V1', address: 40001, dataType: 'FLOAT32', description: 'Voltage L1-N (V)' },
        { parameter: 'V2', address: 40003, dataType: 'FLOAT32', description: 'Voltage L2-N (V)' },
        { parameter: 'V3', address: 40005, dataType: 'FLOAT32', description: 'Voltage L3-N (V)' },
        { parameter: 'I1', address: 40015, dataType: 'FLOAT32', description: 'Current L1 (A)' },
        { parameter: 'I2', address: 40017, dataType: 'FLOAT32', description: 'Current L2 (A)' },
        { parameter: 'I3', address: 40019, dataType: 'FLOAT32', description: 'Current L3 (A)' },
        { parameter: 'Ptotal', address: 40037, dataType: 'FLOAT32', description: 'Total Active Power (kW)' },
        { parameter: 'PFavg', address: 40042, dataType: '4Q_FP_PF', description: 'Average Power Factor' },
      ],
    },
    PM8000: {
      deviceType: 'PM8000',
      registerMappings: (pm8000Mappings as any[]).map((m: any) => ({
        parameter: m.parameter,
        address: m.address,
        dataType: m.dataType,
        description: m.description || '',
      })),
    },
    MICROLOGIC_6E: {
      deviceType: 'MICROLOGIC_6E',
      registerMappings: (micrologic6eMappings as any[]).map((m: any) => ({
        parameter: m.parameter,
        address: m.address,
        dataType: m.dataType,
        description: m.description || '',
        unit: m.unit || '',
        length: m.length || undefined,
        bit: m.bit ?? undefined,
        validIfBit: m.validIfBit ?? undefined,
        validIfValue: m.validIfValue ?? undefined,
        wordOrder: m.wordOrder ?? undefined,
      })),
    },
    EM6400: {
      deviceType: 'EM6400',
      registerMappings: (em6400Mappings as any[]).map((m: any) => ({
        parameter: m.parameter,
        address: m.address,
        dataType: m.dataType,
        description: m.description || '',
        unit: m.unit || '',
        length: m.length || undefined,
        bit: m.bit ?? undefined,
        validIfBit: m.validIfBit ?? undefined,
        validIfValue: m.validIfValue ?? undefined,
        wordOrder: m.wordOrder ?? undefined,
      })),
    },
  };

  return defaultConfigs[deviceType] || {
    deviceType,
    registerMappings: [],
  };
}

/**
 * Convert parameterMappings (legacy format: {param: "40001"}) to registerMappings format
 */
function convertParameterMappingsToRegisterMappings(
  parameterMappings: Record<string, string>,
  defaultConfig: any
): RegisterMapping[] {
  const registerMappings: RegisterMapping[] = [];
  const defaultMappings = new Map(
    (defaultConfig.registerMappings || []).map((m: RegisterMapping) => [m.parameter, m])
  );

  for (const [parameter, addressStr] of Object.entries(parameterMappings)) {
    const address = parseInt(addressStr);
    if (isNaN(address)) continue;

    // Try to get data type from default config, otherwise infer
    const defaultMapping = defaultMappings.get(parameter) as RegisterMapping | undefined;
    let dataType = defaultMapping?.dataType || 'FLOAT32';

    // Infer data type from parameter name if not found
    if (!defaultMapping) {
      if (parameter.startsWith('PF') || parameter.includes('PowerFactor')) {
        dataType = '4Q_FP_PF';
      } else if (parameter.includes('energy') || parameter.includes('Energy')) {
        dataType = 'INT32U';
      } else {
        dataType = 'FLOAT32';
      }
    }

    registerMappings.push({
      parameter,
      address,
      dataType: dataType as string,
      description: defaultMapping?.description || `${parameter} (register ${address})`,
    });
  }

  return registerMappings;
}

/**
 * Get device-specific register mappings
 * Priority: 1. Custom parameterMappings from device, 2. Default config for device type
 */
async function getDeviceRegisterMappings(device: Device): Promise<RegisterMapping[]> {
  // Get default config for device type
  const defaultConfig = await getDefaultDeviceConfig(device.type);

  // If device has custom parameterMappings, use those
  if (device.parameterMappings && Object.keys(device.parameterMappings).length > 0) {
    console.log(`Using custom parameterMappings for device ${device.id} (${device.name})`);
    return convertParameterMappingsToRegisterMappings(device.parameterMappings, defaultConfig);
  }

  // Otherwise, use default registerMappings for device type
  console.log(`Using default registerMappings for device ${device.id} (${device.name}, type: ${device.type})`);
  return defaultConfig.registerMappings || [];
}

/**
 * Read data from Modbus device using Python script
 */
async function readModbusData(
  ipAddress: string,
  slaveAddress: number,
  registerMappings: RegisterMapping[]
): Promise<Record<string, number | string>> {
  // Create a temporary Python script to read all registers
  const scriptContent = `
import sys
import json
from pymodbus.client import ModbusTcpClient
import struct

def read_regs(client, address, count, device_id):
    """Read holding registers from Modbus device
    address: register address from Excel (used as-is for pymodbus 3.11)
    count: number of registers to read
    device_id: Modbus device/slave ID (always 255)
    """
    try:
        r = client.read_holding_registers(
            address=address,
            count=count,
            device_id=device_id
        )
        if r.isError():
            print(f"ERROR: Modbus read failed at address {address}: {r}", file=sys.stderr)
            return None
        if not hasattr(r, 'registers') or r.registers is None:
            print(f"ERROR: No registers returned at address {address}", file=sys.stderr)
            return None
        print(f"DEBUG: Read {len(r.registers)} register(s) at address {address}: {r.registers}", file=sys.stderr)
        return r.registers
    except Exception as e:
        print(f"ERROR: Exception reading address {address}: {e}", file=sys.stderr)
        return None

def normalize_word_order(regs, word_order):
    """Apply word order for 2-register values: 'AB' (default) or 'BA' (swap)."""
    if not regs:
        return regs
    if word_order == 'BA' and len(regs) >= 2:
        return [regs[1], regs[0]] + list(regs[2:])
    return regs

def decode_float32(regs, word_order='AB'):
    """IEEE 754 Float32 (2 registers, Big-Endian)"""
    import math
    if not regs or len(regs) < 2:
        print(f"ERROR: decode_float32 requires 2 registers, got {len(regs) if regs else 0}", file=sys.stderr)
        return None
    try:
        regs = normalize_word_order(regs, word_order)
        print(f"DEBUG: Decoding float32 from registers: {regs} (wordOrder={word_order})", file=sys.stderr)
        raw = struct.pack(">HH", regs[0], regs[1])
        value = struct.unpack(">f", raw)[0]
        # Check for NaN or Infinity (not valid in JSON)
        if math.isnan(value) or math.isinf(value):
            print(f"ERROR: Decoded NaN/Infinity value from registers {regs}", file=sys.stderr)
            return None
        print(f"DEBUG: Decoded float32 value: {value}", file=sys.stderr)
        return value
    except Exception as e:
        print(f"ERROR: Failed to decode float32 from registers {regs}: {e}", file=sys.stderr)
        return None

def decode_int32u(regs, word_order='AB'):
    """Unsigned 32-bit integer (2 registers, Big-Endian)"""
    if not regs or len(regs) < 2:
        return None
    regs = normalize_word_order(regs, word_order)
    return (regs[0] << 16) | regs[1]

def decode_int16u(reg):
    """Unsigned 16-bit integer (1 register)"""
    if reg is None:
        return None
    return reg

def decode_int16u_bit(reg, bit_index, address=None):
    """Extract bit from unsigned 16-bit register.
    
    For address 32000: Uses standard notation (bit 0 = LSB, bit 15 = MSB)
    For address 32006 and others: Uses MSB-first notation (bit_index 0 = MSB, bit_index 15 = LSB)
    
    Returns 0 or 1."""
    if reg is None:
        return None
    try:
        b = int(bit_index)
    except Exception:
        return None
    if b < 0 or b > 15:
        return None
    
    # Address 32000 uses standard notation (direct extraction)
    if address == 32000:
        bit_pos = b
    else:
        # Other addresses use MSB-first: bit_index 0 = MSB (bit 15 in standard), bit_index 15 = LSB (bit 0 in standard)
        bit_pos = 15 - b
    
    result = (int(reg) >> bit_pos) & 1
    return result

def decode_int64u(regs, word_order='AB'):
    """Unsigned 64-bit integer (4 registers, Big-Endian)"""
    if not regs or len(regs) < 4:
        return None
    if word_order == 'BA' and len(regs) >= 4:
        # Swap 16-bit words within the 32-bit halves: [w1,w2,w3,w4] -> [w2,w1,w4,w3]
        regs = [regs[1], regs[0], regs[3], regs[2]]
    return (regs[0] << 48) | (regs[1] << 32) | (regs[2] << 16) | regs[3]

def decode_int64s(regs, word_order='AB'):
    """Signed 64-bit integer (4 registers, Big-Endian)"""
    v = decode_int64u(regs, word_order)
    if v is None:
        return None
    if v & (1 << 63):
        v = v - (1 << 64)
    return v

def decode_4q_fp_pf(regs, word_order='AB'):
    """4Q_FP_PF: Read as FLOAT32 (2 registers, Big-Endian)"""
    import math
    if not regs or len(regs) < 2:
        return None
    try:
        regs = normalize_word_order(regs, word_order)
        raw = struct.pack(">HH", regs[0], regs[1])
        value = struct.unpack(">f", raw)[0]
        # Check for NaN or Infinity (not valid in JSON)
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    except Exception:
        return None

def decode_utf8(regs):
    """UTF8 string from registers"""
    if not regs:
        return None
    # Convert registers to bytes
    bytes_data = b''
    for reg in regs:
        bytes_data += struct.pack('>H', reg)
    # Remove null bytes and decode
    # Use bytes([0]) instead of b'\\x00' to avoid null byte in source code
    string_value = bytes_data.split(bytes([0]))[0].decode('utf-8', errors='ignore').strip()
    return string_value if string_value else None

def decode_iec870_datetime(words):
    """Decode IEC 870-5-4 (CP56Time2a) 4-word timestamp.
    words = [w1, w2, w3, w4]
    Returns ISO datetime string or None
    """
    from datetime import datetime
    if not words or len(words) < 4:
        return None
    
    w1, w2, w3, w4 = words[0], words[1], words[2], words[3]
    
    # ---- WORD 1: YEAR ----
    year = w1 & 0x7F      # lower 7 bits (0–127)
    year += 2000          # IEC format usually offsets from year 2000
    
    # ---- WORD 2: DATE ----
    day     = w2 & 0x1F                       # bits 0–4 (1–31)
    weekday = (w2 >> 5) & 0x07                # bits 5–7 (1–7)
    month   = (w2 >> 8) & 0x0F                # bits 8–11 (1–12)
    
    # ---- WORD 3: TIME ----
    minute  = w3 & 0x3F                       # bits 0–5
    sync_quality = (w3 >> 7) & 0x01 == 1      # bit 7
    hour    = (w3 >> 8) & 0x1F                # bits 8–12
    dst     = (w3 >> 15) & 0x01 == 1          # bit 15
    
    # ---- WORD 4: MILLISECONDS ----
    millisecond = w4 & 0xFFFF                 # 0–59999
    
    # ---- Construct datetime ----
    try:
        dt = datetime(year, month, day, hour, minute, millisecond // 1000,
                      (millisecond % 1000) * 1000)
        # Return as ISO format string for JSON serialization
        return dt.isoformat()
    except ValueError:
        return None

def read_float32(client, address, device_id, word_order='AB'):
    regs = read_regs(client, address, 2, device_id)
    return decode_float32(regs, word_order) if regs else None

def read_int32u(client, address, device_id, word_order='AB'):
    regs = read_regs(client, address, 2, device_id)
    return decode_int32u(regs, word_order) if regs else None

def read_int16u(client, address, device_id):
    regs = read_regs(client, address, 1, device_id)
    if regs and len(regs) > 0:
        return decode_int16u(regs[0])
    return None

def read_int16u_bit(client, address, bit_index, device_id):
    regs = read_regs(client, address, 1, device_id)
    if regs and len(regs) > 0:
        return decode_int16u_bit(regs[0], bit_index)
    return None

def read_int64u(client, address, device_id, word_order='AB'):
    regs = read_regs(client, address, 4, device_id)
    return decode_int64u(regs, word_order) if regs else None

def read_int64s(client, address, device_id, word_order='AB'):
    regs = read_regs(client, address, 4, device_id)
    return decode_int64s(regs, word_order) if regs else None

def read_4q_fp_pf(client, address, device_id, word_order='AB'):
    regs = read_regs(client, address, 2, device_id)
    return decode_4q_fp_pf(regs, word_order) if regs else None

def read_utf8(client, address, device_id):
    regs = read_regs(client, address, 20, device_id)
    return decode_utf8(regs) if regs else None

def read_iec870_datetime(client, address, device_id):
    regs = read_regs(client, address, 4, device_id)
    return decode_iec870_datetime(regs) if regs else None

def read_register(client, address, data_type, device_id, word_order='AB'):
    """Read a single register value"""
    if data_type == 'FLOAT32':
        return read_float32(client, address, device_id, word_order)
    elif data_type == 'INT32U':
        return read_int32u(client, address, device_id, word_order)
    elif data_type == 'INT64U':
        return read_int64u(client, address, device_id, word_order)
    elif data_type == 'INT64':
        return read_int64s(client, address, device_id, word_order)
    elif data_type == '4Q_FP_PF':
        return read_4q_fp_pf(client, address, device_id, word_order)
    elif data_type == 'INT16U':
        return read_int16u(client, address, device_id)
    elif data_type == 'INT16U_BIT':
        # bit index is passed as optional argv[4] for per-mapping calls; see mapping loop below
        return None
    elif data_type == 'UTF8':
        return read_utf8(client, address, device_id)
    elif data_type == 'IEC870_DATETIME' or data_type == 'DATETIME':
        return read_iec870_datetime(client, address, device_id)
    else:
        return None

# Parse arguments
ip_address = sys.argv[1]
device_id = int(sys.argv[2])
mappings_file = sys.argv[3]

# Read mappings from JSON file (to avoid command line length limits)
with open(mappings_file, 'r') as f:
    mappings = json.load(f)

# Connect to Modbus device
client = ModbusTcpClient(host=ip_address, port=502)
if not client.connect():
    print(json.dumps({"error": "Failed to connect to Modbus device"}))
    sys.exit(1)

# Read all registers - skip parameters that are not available
results = {}
errors = []
import math

for mapping in mappings:
    param = mapping['parameter']
    address = mapping['address']
    data_type = mapping['dataType']
    bit_index = mapping.get('bit', None)
    valid_if_bit = mapping.get('validIfBit', None)
    valid_if_value = mapping.get('validIfValue', None)
    word_order = mapping.get('wordOrder', 'AB')
    
    try:
        # Computed fields are not read from Modbus; backend fills them later
        if data_type == 'COMPUTED':
            continue
        # Handle bitfield extraction from INT16U words
        if data_type == 'INT16U_BIT':
            if bit_index is None:
                value = None
            else:
                regs = read_regs(client, address, 1, device_id)
                if regs and len(regs) > 0:
                    reg = regs[0]
                    # Optional gating rule: only return bit value if validity condition matches
                    if valid_if_bit is not None and valid_if_value is not None:
                        valid_bit_val = decode_int16u_bit(reg, valid_if_bit, address)
                        # Debug logging for validity check
                        if address == 32006:
                            print(f"DEBUG validity check: param={param}, reg={reg}, validIfBit={valid_if_bit}, validBitVal={valid_bit_val}, expected={valid_if_value}", file=sys.stderr)
                        if valid_bit_val is None or int(valid_bit_val) != int(valid_if_value):
                            value = None
                        else:
                            value = decode_int16u_bit(reg, bit_index, address)
                    else:
                        value = decode_int16u_bit(reg, bit_index, address)
                else:
                    value = None
        else:
            value = read_register(client, address, data_type, device_id, word_order)
        if value is not None:
            # Check for NaN or Infinity values (not valid in JSON)
            if isinstance(value, float):
                if math.isnan(value) or math.isinf(value):
                    # Skip NaN/Infinity values - not valid JSON
                    print(f"DEBUG: Skipping {param} (addr: {address}, type: {data_type}) - NaN/Infinity value", file=sys.stderr)
                    errors.append(f"{param} (addr: {address}, type: {data_type}): NaN/Infinity value")
                    continue
            # Add valid value to results
            results[param] = value
        else:
            # Parameter not available - skip silently (only log to stderr for debugging)
            print(f"DEBUG: Skipping {param} (addr: {address}, type: {data_type}) - not available", file=sys.stderr)
            errors.append(f"{param} (addr: {address}, type: {data_type}): Not available")
    except Exception as e:
        # Exception occurred - skip this parameter and continue
        print(f"DEBUG: Skipping {param} (addr: {address}, type: {data_type}) - exception: {e}", file=sys.stderr)
        errors.append(f"{param} (addr: {address}, type: {data_type}): {e}")
        continue

# Log summary of skipped parameters (only if there are many)
if len(errors) > 0:
    print(f"INFO: Skipped {len(errors)} parameter(s) that were not available from device", file=sys.stderr)
    if len(errors) <= 5:
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
    else:
        print(f"  (showing first 5 of {len(errors)} skipped parameters)", file=sys.stderr)
        for err in errors[:5]:
            print(f"  - {err}", file=sys.stderr)

client.close()

# Output results as JSON (only successful reads)
# Always output valid JSON, even if empty (no parameters were available)
print(json.dumps(results))
`;

  // Embed mappings in script to avoid file I/O
  const fullScript = scriptContent.replace(
    '# Parse arguments\nip_address = sys.argv[1]\ndevice_id = int(sys.argv[2])\nmappings_file = sys.argv[3]\n\n# Read mappings from JSON file (to avoid command line length limits)\nwith open(mappings_file, \'r\') as f:\n    mappings = json.load(f)',
    `# Parse arguments and load mappings\nip_address = ${JSON.stringify(ipAddress)}\ndevice_id = ${slaveAddress || 1}\nmappings = ${JSON.stringify(registerMappings)}`
  );

  try {
    // Execute Python script using worker pool
    console.log(`[Modbus] Attempting to read from ${ipAddress}:${502} (device_id: ${slaveAddress || 1}), ${registerMappings.length} registers`);
    
    const result = await workerPool.execute(fullScript);

    if (!result || typeof result !== 'object') {
      throw new Error('Python script returned invalid output');
    }
    
    if (result.error) {
      throw new Error(result.error);
    }

    // Filter out NaN/Infinity; schema-aware clamping happens at DB insert time.
    const cleanedResult: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(result)) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'number') {
        if (isNaN(value) || !isFinite(value)) continue;
        cleanedResult[key] = value;
        continue;
      }
      cleanedResult[key] = value as string;
    }

    console.log(`[Modbus] Successfully read ${Object.keys(cleanedResult).length} parameters from ${ipAddress}`);
    return cleanedResult;
  } catch (error: any) {
    console.error(`[Modbus] Error reading from ${ipAddress}:`, error.message || error);
    throw error;
  }
}

/**
 * Sanitize column name for PostgreSQL
 * Replaces spaces, special characters, and reserved words with underscores
 */
function sanitizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')  // Replace any non-alphanumeric (except underscore) with underscore
    .replace(/_+/g, '_')           // Replace multiple underscores with single underscore
    .replace(/^_|_$/g, '');        // Remove leading/trailing underscores
}

/**
 * Build list of allowed column names from register mappings
 * Applies same sanitization & duplicate suffixing as insertDataPoint
 */
function isStringType(dataType: string): boolean {
  return dataType === 'UTF8';
}

function isDateTimeType(dataType: string): boolean {
  return dataType === 'DATETIME' || dataType === 'IEC870_DATETIME';
}

/**
 * Build list of allowed column names from register mappings
 * Applies same sanitization & duplicate suffixing as insertDataPoint
 */
function getAllowedColumns(registerMappings: RegisterMapping[]): string[] {
  const allowed: string[] = [];
  const seen = new Set<string>(['timestamp', 'id']);

  for (const mapping of registerMappings) {
    const original = mapping.parameter.toLowerCase();
    const base = sanitizeColumnName(original);
    let unique = base;
    let suffix = 1;
    while (seen.has(unique)) {
      unique = `${base}_${suffix}`;
      suffix++;
    }
    seen.add(unique);
    allowed.push(unique);
  }

  return allowed;
}

/**
 * Drop columns from a device table that are not in the allowed set
 */
async function cleanupUnusedColumns(tableName: string, allowedColumns: string[]): Promise<void> {
  try {
    const allowedSet = new Set(allowedColumns.map(sanitizeColumnName));
    const res = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name NOT IN ('id', 'timestamp')
    `, [tableName]);

    const toDrop = res.rows
      .map((r: any) => r.column_name)
      .filter((col: string) => !allowedSet.has(col));

    if (toDrop.length === 0) return;

    for (const col of toDrop) {
      const quoted = quoteIdentifier(col);
      try {
        await db.query(`ALTER TABLE ${tableName} DROP COLUMN IF EXISTS ${quoted}`);
        console.log(`[DB] Dropped unused column ${col} from ${tableName}`);
      } catch (dropErr: any) {
        console.warn(`[DB] Could not drop column ${col} from ${tableName}: ${dropErr.message}`);
      }
    }
  } catch (err: any) {
    console.warn(`[DB] Cleanup unused columns failed for ${tableName}: ${err.message}`);
  }
}

/**
 * Quote identifier for PostgreSQL (for use in SQL queries)
 */
function quoteIdentifier(name: string): string {
  // Use double quotes to allow any identifier, but sanitize first for safety
  const sanitized = sanitizeColumnName(name);
  return `"${sanitized}"`;
}

/**
 * Ensure column exists in device table with appropriate data type
 */
async function ensureColumnExists(tableName: string, columnName: string, isString: boolean, isDateTime: boolean = false): Promise<void> {
  try {
    // Sanitize column name for PostgreSQL
    const sanitizedColumnName = sanitizeColumnName(columnName);
    const quotedColumnName = quoteIdentifier(sanitizedColumnName);
    
    // Check if column exists
    const checkColumn = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1 AND column_name = $2
    `, [tableName, sanitizedColumnName]);

    if (checkColumn.rows.length === 0) {
      // Column doesn't exist, create it
      let dataType: string;
      if (isDateTime) {
        dataType = 'TIMESTAMP';
      } else {
        dataType = isString ? 'TEXT' : 'NUMERIC(15, 3)';
      }
      await db.query(`
        ALTER TABLE ${tableName} 
        ADD COLUMN ${quotedColumnName} ${dataType}
      `);
      console.log(`[DB] Added column ${sanitizedColumnName} (${dataType}) to ${tableName}`);
    } else {
      // Column exists, check if we need to change type
      const existingType = checkColumn.rows[0].data_type;
      if (isDateTime && existingType !== 'timestamp' && existingType !== 'timestamp without time zone') {
        // Need to convert to TIMESTAMP
        // If column is NUMERIC, we can't directly cast - need to drop and recreate
        try {
          if (existingType === 'numeric' || existingType.startsWith('numeric')) {
            // Drop the column and recreate as TIMESTAMP (old numeric data is incompatible)
            await db.query(`
              ALTER TABLE ${tableName} 
              DROP COLUMN ${quotedColumnName}
            `);
            await db.query(`
              ALTER TABLE ${tableName} 
              ADD COLUMN ${quotedColumnName} TIMESTAMP
            `);
            console.log(`[DB] Dropped and recreated column ${sanitizedColumnName} as TIMESTAMP in ${tableName} (was ${existingType})`);
          } else {
            // For other types (like text), try direct conversion
          await db.query(`
            ALTER TABLE ${tableName} 
            ALTER COLUMN ${quotedColumnName} TYPE TIMESTAMP USING ${quotedColumnName}::TIMESTAMP
          `);
          console.log(`[DB] Converted column ${sanitizedColumnName} to TIMESTAMP in ${tableName}`);
          }
        } catch (e: any) {
          console.warn(`[DB] Could not convert column ${sanitizedColumnName} to TIMESTAMP: ${e.message}`);
          // If conversion fails, try dropping and recreating
          try {
            await db.query(`
              ALTER TABLE ${tableName} 
              DROP COLUMN IF EXISTS ${quotedColumnName}
            `);
            await db.query(`
              ALTER TABLE ${tableName} 
              ADD COLUMN ${quotedColumnName} TIMESTAMP
            `);
            console.log(`[DB] Dropped and recreated column ${sanitizedColumnName} as TIMESTAMP in ${tableName} (fallback)`);
          } catch (fallbackError: any) {
            console.error(`[DB] Failed to drop and recreate column ${sanitizedColumnName}: ${fallbackError.message}`);
          }
        }
      } else if (isString && existingType === 'numeric') {
        // Need to convert NUMERIC column to TEXT
        await db.query(`
          ALTER TABLE ${tableName} 
          ALTER COLUMN ${quotedColumnName} TYPE TEXT USING ${quotedColumnName}::TEXT
        `);
        console.log(`[DB] Converted column ${sanitizedColumnName} from NUMERIC to TEXT in ${tableName}`);
      } else if (!isString && !isDateTime && existingType === 'text') {
        // Can't safely convert TEXT to NUMERIC, leave as is
        console.warn(`[DB] Column ${sanitizedColumnName} in ${tableName} is TEXT but numeric value provided - skipping conversion`);
      }
    }
  } catch (error: any) {
    // Log but don't throw - column might already exist or have constraints
    if (!error.message?.includes('already exists') && !error.message?.includes('duplicate')) {
      console.warn(`[DB] Could not ensure column ${columnName} in ${tableName}:`, error.message);
    }
  }
}

// Cache column numeric specs per table to clamp correctly
const columnSpecCache = new Map<string, Record<string, { precision: number | null; scale: number | null }>>();

async function loadColumnSpecs(tableName: string): Promise<Record<string, { precision: number | null; scale: number | null }>> {
  if (columnSpecCache.has(tableName)) {
    return columnSpecCache.get(tableName)!;
  }
  const res = await db.query(
    `SELECT column_name, numeric_precision, numeric_scale FROM information_schema.columns WHERE table_name = $1`,
    [tableName]
  );
  const specs: Record<string, { precision: number | null; scale: number | null }> = {};
  for (const row of res.rows) {
    specs[row.column_name] = {
      precision: row.numeric_precision,
      scale: row.numeric_scale,
    };
  }
  columnSpecCache.set(tableName, specs);
  return specs;
}

function clampNumberToColumnSpec(
  value: number,
  columnName: string,
  specs: Record<string, { precision: number | null; scale: number | null }>,
  defaultMax = 9_000_000
): number {
  const spec = specs[columnName];
  let maxAbs = defaultMax;
  let scale = 3;
  if (spec && spec.precision && spec.scale !== null && spec.scale !== undefined) {
    const intDigits = spec.precision - spec.scale;
    maxAbs = Math.pow(10, intDigits) - Math.pow(10, -spec.scale);
    scale = spec.scale;
  }
  const factor = Math.pow(10, scale);
  let safeVal = value;
  if (!Number.isFinite(safeVal)) return 0;
  if (Math.abs(safeVal) > maxAbs) {
    console.warn(`[DB] Clamping ${columnName}: ${safeVal} -> ${Math.sign(safeVal) * maxAbs} (maxAbs by schema)`);
    safeVal = Math.sign(safeVal) * maxAbs;
  }
  safeVal = Math.round(safeVal * factor) / factor;
  return safeVal;
}

// Batch insert queue
interface PendingInsert {
  deviceId: string;
  data: Record<string, number | string>;
  timestamp: Date;
}

const insertQueue: PendingInsert[] = [];
let insertBatchTimeout: NodeJS.Timeout | null = null;
let isFlushing = false;

// Metrics tracking
interface CollectionMetrics {
  totalCollections: number;
  successfulCollections: number;
  failedCollections: number;
  averageCollectionTime: number;
  averageDbInsertTime: number;
  queueDepth: number;
  lastCollectionTime: number;
  devicesPerSecond: number;
}

const metrics: CollectionMetrics = {
  totalCollections: 0,
  successfulCollections: 0,
  failedCollections: 0,
  averageCollectionTime: 0,
  averageDbInsertTime: 0,
  queueDepth: 0,
  lastCollectionTime: 0,
  devicesPerSecond: 0,
};

// Batch insert flush function
async function flushInsertQueue(): Promise<void> {
  if (insertQueue.length === 0 || isFlushing) return;

  isFlushing = true;
  const startTime = Date.now();
  const batch = insertQueue.splice(0, config.batch.insertBatchSize);
  
  try {
    // Group by device table
    const byTable = new Map<string, PendingInsert[]>();
    for (const item of batch) {
      const tableName = getDeviceTableName(item.deviceId);
      if (!byTable.has(tableName)) {
        byTable.set(tableName, []);
      }
      byTable.get(tableName)!.push(item);
    }

    // Process each table's batch
    await Promise.allSettled(
      Array.from(byTable.entries()).map(async ([tableName, items]) => {
        if (items.length === 0) return;

        const columnSpecs = await loadColumnSpecs(tableName);
        const allRows: Array<{ columns: string[]; values: any[] }> = [];
        const allColumns = new Set<string>(['timestamp']);

        // Process each item to build rows
        for (const item of items) {
          const columns: string[] = ['timestamp'];
          const values: any[] = [item.timestamp];
          const seenColumns = new Set<string>(['timestamp']);

          for (const [key, value] of Object.entries(item.data)) {
            if ((typeof value === 'number' && !isNaN(value) && isFinite(value)) || 
                (typeof value === 'string' && value.length > 0)) {
              const originalColumnName = key.toLowerCase();
              let columnName = sanitizeColumnName(originalColumnName);
              
              let uniqueColumnName = columnName;
              let suffix = 1;
              while (seenColumns.has(uniqueColumnName)) {
                uniqueColumnName = `${columnName}_${suffix}`;
                suffix++;
              }
              seenColumns.add(uniqueColumnName);
              allColumns.add(uniqueColumnName);
              
              const isString = typeof value === 'string';
              let isDateTime = false;
              let dbValue: any = value;
              
              if (isString) {
                const isoDateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
                if (isoDateTimeRegex.test(value)) {
                  isDateTime = true;
                  dbValue = new Date(value);
                }
              }
              
              // Ensure column exists
              await ensureColumnExists(tableName, uniqueColumnName, isString && !isDateTime, isDateTime);

              if (isDateTime) {
                const verifyColumn = await db.query(`
                  SELECT data_type 
                  FROM information_schema.columns 
                  WHERE table_name = $1 AND column_name = $2
                `, [tableName, sanitizeColumnName(uniqueColumnName)]);
                
                if (verifyColumn.rows.length > 0) {
                  const actualType = verifyColumn.rows[0].data_type;
                  if (actualType !== 'timestamp' && actualType !== 'timestamp without time zone') {
                    continue;
                  }
                }
              }

              if (!isString && !isDateTime && typeof dbValue === 'number') {
                const colNameForSpec = sanitizeColumnName(uniqueColumnName);
                dbValue = clampNumberToColumnSpec(dbValue, colNameForSpec, columnSpecs);
              }
              
              columns.push(quoteIdentifier(uniqueColumnName));
              values.push(dbValue);
            }
          }

          if (columns.length > 1) {
            allRows.push({ columns, values });
          }
        }

        if (allRows.length === 0) return;

        // Build multi-row INSERT using first row's columns as template
        // All rows should have same columns (we'll pad missing ones with NULL)
        const colList = Array.from(allColumns);
        const placeholders: string[] = [];
        const flatValues: any[] = [];
        let paramCount = 1;

        for (const row of allRows) {
          const rowPlaceholders: string[] = [];
          const rowValues: any[] = [];
          
          for (const col of colList) {
            const colIndex = row.columns.indexOf(quoteIdentifier(col));
            if (colIndex >= 0) {
              rowPlaceholders.push(`$${paramCount++}`);
              rowValues.push(row.values[colIndex]);
            } else {
              rowPlaceholders.push(`$${paramCount++}`);
              rowValues.push(null);
            }
          }
          
          placeholders.push(`(${rowPlaceholders.join(', ')})`);
          flatValues.push(...rowValues);
        }

        const query = `
          INSERT INTO ${tableName} (${colList.map(c => quoteIdentifier(c)).join(', ')})
          VALUES ${placeholders.join(', ')}
          ON CONFLICT DO NOTHING
        `;

        await db.query(query, flatValues);
      })
    );

    const insertTime = Date.now() - startTime;
    metrics.averageDbInsertTime = (metrics.averageDbInsertTime * 0.9) + (insertTime * 0.1);
  } catch (error) {
    console.error('Batch insert error:', error);
    // Re-queue failed items
    insertQueue.unshift(...batch);
  } finally {
    isFlushing = false;
    metrics.queueDepth = insertQueue.length;

    // Schedule next flush if queue has items
    if (insertQueue.length > 0) {
      scheduleInsertFlush();
    }
  }
}

function scheduleInsertFlush(): void {
  if (insertBatchTimeout) return;
  
  insertBatchTimeout = setTimeout(() => {
    insertBatchTimeout = null;
    flushInsertQueue();
  }, 50); // Flush every 50ms or when batch is full
}

/**
 * Queue data point for batch insert
 */
async function insertDataPoint(deviceId: string, data: Record<string, number | string>): Promise<void> {
  insertQueue.push({
    deviceId,
    data,
    timestamp: new Date(),
  });

  metrics.queueDepth = insertQueue.length;

  // Flush if batch is full
  if (insertQueue.length >= config.batch.insertBatchSize) {
    await flushInsertQueue();
  } else {
    scheduleInsertFlush();
  }
}

/**
 * Collect data from a single device
 */
async function collectDeviceData(device: Device): Promise<boolean> {
  const startTime = Date.now();
  try {
    // Skip immediately if device has been deleted after scheduling
    if (!(await deviceExists(device.id))) {
      console.warn(`[Device ${device.id}] Skipping collection because device no longer exists`);
      return false;
    }

    // Get device-specific register mappings
    const registerMappings = await getDeviceRegisterMappings(device);

    // Cleanup columns when mappings change (per process) to remove stray/old columns
    const tableName = getDeviceTableName(device.id);
    const allowedColumns = getAllowedColumns(registerMappings);
    const signature = allowedColumns.join('|');
    const prevSig = cleanedColumnsSignatureForDevice.get(device.id);
    if (prevSig !== signature) {
      await cleanupUnusedColumns(tableName, allowedColumns);
      cleanedColumnsSignatureForDevice.set(device.id, signature);
    }
    // Ensure all mapped columns exist up front (before any successful read),
    // so parameter endpoints never 404 due to missing columns.
    for (const col of allowedColumns) {
      await ensureColumnExists(
        tableName,
        col,
        false, // most are numeric; string types handled below
        false
      );
    }
    // Re-run with data-type-aware creation to cover UTF8/DATETIME
    for (const mapping of registerMappings) {
      if (mapping.dataType === 'COMPUTED') continue;
      const colName = sanitizeColumnName(mapping.parameter);
      await ensureColumnExists(
        tableName,
        colName,
        isStringType(mapping.dataType),
        isDateTimeType(mapping.dataType)
      );
    }

    if (registerMappings.length === 0) {
      console.warn(`No register mappings found for device ${device.id} (type: ${device.type})`);
      // Mark as offline if no mappings
      await db.query(
        'UPDATE devices SET status = $1 WHERE id = $2',
        ['offline', device.id]
      );
      return false;
    }

    console.log(`[Device ${device.id}] Reading from ${device.ipAddress} with ${registerMappings.length} register mappings`);
    
    // Read data from Modbus device
    const data = await readModbusData(
      device.ipAddress,
      device.slaveAddress || 1,
      registerMappings
    );

    // Use a single timestamp for this cycle (for both data row and events)
    const sampleTime = new Date();

    // Interruption event (gap-based, for all device types)
    await recordInterruptionIfAny(device, sampleTime);

    if (Object.keys(data).length === 0) {
      console.warn(`[Device ${device.id}] No valid data read from device ${device.name} at ${device.ipAddress}`);
      console.warn(`[Device ${device.id}] Connection was successful but all parameters were unavailable/invalid`);
      // Don't mark as offline - connection was successful, just no valid data
      // This is still considered a successful collection attempt
      await db.query(
        'UPDATE devices SET last_seen = $1, status = $2 WHERE id = $3',
        [sampleTime, 'online', device.id]
      );
      return true; // Return true because connection was successful
    }

    // PM8000: record events (does not affect raw stored values)
    await recordPm8000DipEvents(device, data, sampleTime);
    await recordPm8000SwellEvents(device, data, sampleTime);
    await recordPm8000ThresholdEvents(device, data, sampleTime);

    // Micrologic 6E: record events (does not affect raw stored values)
    await recordMicrologic6eAlarms(device, data, sampleTime);

    // PM5320: record events (counter-based alarms)
    await recordPm5320Alarms(device, data, sampleTime);

    // EM6400: Capture previous counter values BEFORE augmentEm6400ComputedFields updates them
    // This is critical for detecting counter increases
    const previousEm6400Counters = new Map<string, number>();
    if (device.type === 'EM6400') {
      const counterMap = lastEm6400Counters.get(device.id);
      if (counterMap) {
        for (const alarmParam of [
          'Over Frequency Alarm',
          'Under Frequency Alarm',
          'PF Total Low',
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
          'OverVoltage Alarm',
          'UnderVoltage Alarm',
          'Phase A loss',
          'Phase B loss',
          'Phase C loss',
          'Current Imbalance Alarm',
        ]) {
          previousEm6400Counters.set(alarmParam, counterMap.get(alarmParam) ?? 0);
        }
      }
    }

    // EM6400: computed fields (alarms + running max values) written into the data row
    augmentEm6400ComputedFields(device, data);

    // EM6400: edge-triggered event records for chart markers
    // Pass previous counters so we can detect increases
    await recordEm6400ThresholdEvents(device, data, sampleTime, previousEm6400Counters);

    // Ensure hypertable conversion for TimescaleDB
    const tableName = getDeviceTableName(device.id);
    await convertToHypertable(tableName);

    // Insert data into database (queued for batch insert)
    await insertDataPoint(device.id, data);

    // Update device last_seen timestamp and set status to online
    await db.query(
      'UPDATE devices SET last_seen = $1, status = $2 WHERE id = $3',
      [sampleTime, 'online', device.id]
    );

    const collectionTime = Date.now() - startTime;
    metrics.totalCollections++;
    metrics.successfulCollections++;
    metrics.averageCollectionTime = (metrics.averageCollectionTime * 0.9) + (collectionTime * 0.1);

    console.log(`✓ Collected data from device ${device.name} (${device.id}): ${Object.keys(data).length} parameters`);
    return true;
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    console.error(`✗ [Device ${device.id}] Failed to collect data from ${device.name} (${device.ipAddress}):`, errorMsg);
    
    // Log more details about the error
    if (error.stdout) {
      console.error(`  [Device ${device.id}] Python stdout:`, error.stdout.substring(0, 500));
    }
    if (error.stderr) {
      console.error(`  [Device ${device.id}] Python stderr:`, error.stderr.substring(0, 500));
    }
    
    // Update device status to offline if connection fails
    if (errorMsg.includes('Failed to connect') || errorMsg.includes('timeout') || errorMsg.includes('ECONNREFUSED')) {
      await db.query(
        'UPDATE devices SET status = $1 WHERE id = $2',
        ['offline', device.id]
      );
    }
    
    metrics.totalCollections++;
    metrics.failedCollections++;
    
    return false;
  }
}

/**
 * Collect data from all online devices
 */
export async function collectAllDevicesData(): Promise<void> {
  const cycleStart = Date.now();
  try {
    // Ensure schema exists before any reads/inserts (idempotent)
    await ensureSchemaInitialized();

    // Get all devices with prioritization: Micrologic first, then by status
    const result = await db.query(`
      SELECT 
        id,
        name,
        type,
        ip_address as "ipAddress",
        slave_address as "slaveAddress",
        status,
        parameter_mappings as "parameterMappings",
        last_seen as "lastSeen"
      FROM devices
      ORDER BY 
        CASE status 
          WHEN 'online' THEN 1 
          WHEN 'connecting' THEN 2 
          WHEN 'offline' THEN 3 
          ELSE 4 
        END,
        CASE type
          WHEN 'MICROLOGIC_6E' THEN 1
          ELSE 2
        END,
        name ASC
    `);

    // Parse parameterMappings JSON if present
    const allDevices: Device[] = result.rows.map((row: any) => ({
      ...row,
      parameterMappings: row.parameterMappings 
        ? (typeof row.parameterMappings === 'string' 
            ? JSON.parse(row.parameterMappings) 
            : row.parameterMappings)
        : undefined,
    }));

    // Separate by priority: Critical (Micrologic online), Normal (other online/connecting), Offline
    const criticalDevices = allDevices.filter(d => 
      (d.status === 'online' || d.status === 'connecting') && d.type === 'MICROLOGIC_6E'
    );
    const normalDevices = allDevices.filter(d => 
      (d.status === 'online' || d.status === 'connecting') && d.type !== 'MICROLOGIC_6E'
    );
    const offlineDevices = allDevices.filter(d => d.status === 'offline');

    // Process in batches
    const processBatch = async (devices: Device[]) => {
      const batches = [];
      for (let i = 0; i < devices.length; i += config.batch.deviceBatchSize) {
        batches.push(devices.slice(i, i + config.batch.deviceBatchSize));
      }

      for (const batch of batches) {
        await Promise.allSettled(
          batch.map(device => collectDeviceData(device))
        );
      }
    };

    // Collect critical devices first (Micrologic 6E)
    if (criticalDevices.length > 0) {
      await processBatch(criticalDevices);
    }

    // Then normal devices
    if (normalDevices.length > 0) {
      await processBatch(normalDevices);
    }

    // Handle offline devices
    if (offlineDevices.length > 0) {
      await Promise.allSettled(
        offlineDevices.map(device =>
          db.query('UPDATE devices SET status = $1 WHERE id = $2', ['connecting', device.id])
        )
      );
      await processBatch(offlineDevices.map(d => ({ ...d, status: 'connecting' })));
    }

    // Flush any remaining inserts
    await flushInsertQueue();

    const cycleTime = Date.now() - cycleStart;
    metrics.lastCollectionTime = cycleTime;
    const totalDevices = allDevices.length;
    if (totalDevices > 0) {
      metrics.devicesPerSecond = totalDevices / (cycleTime / 1000);
    }

    console.log(`Data collection complete: ${totalDevices} devices in ${cycleTime}ms (${metrics.devicesPerSecond.toFixed(2)} devices/sec)`);
  } catch (error) {
    console.error('Error in collectAllDevicesData:', error);
  }
}

/**
 * Start periodic data collection
 */
let collectionInterval: NodeJS.Timeout | null = null;
let metricsInterval: NodeJS.Timeout | null = null;

export function startDataCollection(intervalSeconds?: number): void {
  if (collectionInterval) {
    console.log('Data collection already running');
    return;
  }

  const interval = intervalSeconds ?? config.sampling.defaultInterval;
  console.log(`Starting data collection service (interval: ${interval}s)`);

  // Initialize schema then collect immediately
  ensureSchemaInitialized()
    .then(() => collectAllDevicesData())
    .catch((e) => console.error('Error initializing schema before collection:', e));

  // Then collect periodically
  collectionInterval = setInterval(() => {
    collectAllDevicesData();
  }, interval * 1000);

  // Start daily maintenance (cleanup + reconnect attempts)
  startMaintenanceTasks();
  
  // Start metrics logging
  startMetricsLogging();
}

function startMetricsLogging(): void {
  if (!config.monitoring.enabled) return;
  
  if (metricsInterval) {
    clearInterval(metricsInterval);
  }
  
  metricsInterval = setInterval(() => {
    const stats = {
      ...metrics,
      workerPool: workerPool.getStats(),
      queueDepth: insertQueue.length,
    };
    console.log('[Metrics]', JSON.stringify(stats, null, 2));
  }, config.monitoring.logInterval * 1000);
}

export function getMetrics(): CollectionMetrics {
  return { ...metrics };
}

export function stopDataCollection(): void {
  if (collectionInterval) {
    clearInterval(collectionInterval);
    collectionInterval = null;
    console.log('Data collection stopped');
  }
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
  // Flush any remaining inserts
  flushInsertQueue().catch(err => console.error('Error flushing inserts on shutdown:', err));
}

/**
 * Maintenance: daily reconnect attempts and orphan cleanup
 */
let maintenanceInterval: NodeJS.Timeout | null = null;

async function reconnectOfflineDevices(): Promise<void> {
  try {
    const res = await db.query(`
      SELECT 
        id,
        name,
        type,
        ip_address as "ipAddress",
        slave_address as "slaveAddress",
        status,
        parameter_mappings as "parameterMappings"
      FROM devices
      WHERE status = 'offline'
      ORDER BY name ASC
    `);

    if (res.rowCount === 0) {
      console.log('Maintenance: no offline devices to reconnect');
      return;
    }

    const devices: Device[] = res.rows.map((row: any) => ({
      ...row,
      parameterMappings: row.parameterMappings
        ? (typeof row.parameterMappings === 'string'
            ? JSON.parse(row.parameterMappings)
            : row.parameterMappings)
        : undefined,
    }));

    console.log(`Maintenance: attempting reconnect for ${devices.length} offline device(s)`);

    // Mark as connecting and try collection (in parallel to avoid long serial waits)
    await Promise.allSettled(
      devices.map(async (device) => {
        await db.query('UPDATE devices SET status = $1 WHERE id = $2', ['connecting', device.id]);
        const ok = await collectDeviceData(device);
        if (!ok) {
          await db.query('UPDATE devices SET status = $1 WHERE id = $2', ['offline', device.id]);
        }
      })
    );
  } catch (err: any) {
    console.warn('Maintenance: reconnectOfflineDevices failed:', err.message || err);
  }
}

async function runDailyMaintenance(): Promise<void> {
  await cleanupOrphanedArtifacts();
  await reconnectOfflineDevices();
}

export function startMaintenanceTasks(): void {
  if (maintenanceInterval) return;
  // Run once at startup, after ensuring schema
  ensureSchemaInitialized()
    .then(() => runDailyMaintenance())
    .catch((e) => console.error('Error initializing schema before maintenance:', e));
  // Then run daily
  maintenanceInterval = setInterval(() => {
    ensureSchemaInitialized()
      .then(() => runDailyMaintenance())
      .catch((e) => console.error('Error initializing schema before maintenance:', e));
  }, maintenanceDayMs);
}

export function stopMaintenanceTasks(): void {
  if (maintenanceInterval) {
    clearInterval(maintenanceInterval);
    maintenanceInterval = null;
  }
}

