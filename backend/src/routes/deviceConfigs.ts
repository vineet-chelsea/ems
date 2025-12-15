import express from 'express';
import { db } from '../db/connection.js';
import { z } from 'zod';

const router = express.Router();

// Device configuration validation schema
const deviceConfigSchema = z.object({
  deviceType: z.string().min(1),
  parameterMappings: z.record(z.string(), z.string()),
  defaultSubnetMask: z.string().optional(),
});

// Get device configuration by type
router.get('/:deviceType', async (req, res) => {
  try {
    const { deviceType } = req.params;
    
    // PM5320 standard configuration with register mappings and data types
    const defaultConfigs: Record<string, any> = {
      PM5320: {
        deviceType: 'PM5320',
        defaultSubnetMask: '255.255.255.0',
        defaultSlaveAddress: 1,
        registerMappings: [
          { parameter: 'V1', address: 40001, dataType: 'FLOAT32', description: 'Voltage L1-N (V)' },
          { parameter: 'V2', address: 40003, dataType: 'FLOAT32', description: 'Voltage L2-N (V)' },
          { parameter: 'V3', address: 40005, dataType: 'FLOAT32', description: 'Voltage L3-N (V)' },
          { parameter: 'VR', address: 40007, dataType: 'FLOAT32', description: 'Voltage R-N (V)' },
          { parameter: 'VY', address: 40009, dataType: 'FLOAT32', description: 'Voltage Y-N (V)' },
          { parameter: 'VB', address: 40011, dataType: 'FLOAT32', description: 'Voltage B-N (V)' },
          { parameter: 'Vavg', address: 40013, dataType: 'FLOAT32', description: 'Average Voltage (V)' },
          { parameter: 'I1', address: 40015, dataType: 'FLOAT32', description: 'Current L1 (A)' },
          { parameter: 'I2', address: 40017, dataType: 'FLOAT32', description: 'Current L2 (A)' },
          { parameter: 'I3', address: 40019, dataType: 'FLOAT32', description: 'Current L3 (A)' },
          { parameter: 'IR', address: 40021, dataType: 'FLOAT32', description: 'Current R (A)' },
          { parameter: 'IY', address: 40023, dataType: 'FLOAT32', description: 'Current Y (A)' },
          { parameter: 'IB', address: 40025, dataType: 'FLOAT32', description: 'Current B (A)' },
          { parameter: 'Iavg', address: 40027, dataType: 'FLOAT32', description: 'Average Current (A)' },
          { parameter: 'Ipeak', address: 40029, dataType: 'FLOAT32', description: 'Peak Current (A)' },
          { parameter: 'P1', address: 40031, dataType: 'FLOAT32', description: 'Active Power L1 (kW)' },
          { parameter: 'P2', address: 40033, dataType: 'FLOAT32', description: 'Active Power L2 (kW)' },
          { parameter: 'P3', address: 40035, dataType: 'FLOAT32', description: 'Active Power L3 (kW)' },
          { parameter: 'Ptotal', address: 40037, dataType: 'FLOAT32', description: 'Total Active Power (kW)' },
          { parameter: 'PF1', address: 40039, dataType: '4Q_FP_PF', description: 'Power Factor L1' },
          { parameter: 'PF2', address: 40040, dataType: '4Q_FP_PF', description: 'Power Factor L2' },
          { parameter: 'PF3', address: 40041, dataType: '4Q_FP_PF', description: 'Power Factor L3' },
          { parameter: 'PFavg', address: 40042, dataType: '4Q_FP_PF', description: 'Average Power Factor' },
          { parameter: 'frequency', address: 40043, dataType: 'FLOAT32', description: 'Frequency (Hz)' },
          { parameter: 'energy_active', address: 40045, dataType: 'INT32U', description: 'Active Energy (Wh)' },
          { parameter: 'energy_reactive', address: 40047, dataType: 'INT32U', description: 'Reactive Energy (VARh)' },
          { parameter: 'V', address: 40049, dataType: 'FLOAT32', description: 'Voltage (V)' },
          { parameter: 'I', address: 40051, dataType: 'FLOAT32', description: 'Current (A)' },
        ],
        // Legacy parameterMappings for backward compatibility
        parameterMappings: {
          V1: '40001',
          V2: '40003',
          V3: '40005',
          I1: '40015',
          I2: '40017',
          I3: '40019',
          P1: '40031',
          P2: '40033',
          P3: '40035',
          Ptotal: '40037',
          PF1: '40039',
          PF2: '40040',
          PF3: '40041',
          PFavg: '40042',
          frequency: '40043',
        },
      },
      PM5330: {
        deviceType: 'PM5330',
        defaultSubnetMask: '255.255.255.0',
        defaultSlaveAddress: 1,
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
        parameterMappings: {
          V1: '40001',
          V2: '40003',
          V3: '40005',
          I1: '40015',
          I2: '40017',
          I3: '40019',
          Ptotal: '40037',
          PFavg: '40042',
        },
      },
    };

    const config = defaultConfigs[deviceType] || {
      deviceType,
      defaultSubnetMask: '255.255.255.0',
      defaultSlaveAddress: 1,
      registerMappings: [],
      parameterMappings: {},
    };

    res.json(config);
  } catch (error) {
    console.error('Error fetching device configuration:', error);
    res.status(500).json({ error: 'Failed to fetch device configuration' });
  }
});

// Get all device types
router.get('/', async (req, res) => {
  try {
    const deviceTypes = ['PM5320', 'PM5330', 'PM5350', 'Custom'];
    res.json({ deviceTypes });
  } catch (error) {
    console.error('Error fetching device types:', error);
    res.status(500).json({ error: 'Failed to fetch device types' });
  }
});

// Save device configuration (for future use - storing custom configurations)
router.post('/', async (req, res) => {
  try {
    const configData = deviceConfigSchema.parse(req.body);
    
    // In a real implementation, save to database
    // For now, just return success
    res.status(201).json({
      message: 'Device configuration saved',
      config: configData,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid configuration data', details: error.errors });
    }
    console.error('Error saving device configuration:', error);
    res.status(500).json({ error: 'Failed to save device configuration' });
  }
});

export { router as deviceConfigRoutes };

