/**
 * GPU-Accelerated Data Processing Service
 * 
 * Provides GPU acceleration for statistics calculation and data aggregation
 * using Python/CuPy backend. Falls back to CPU if GPU is unavailable.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { loadConfig } from '../config/performance.config.js';

const execAsync = promisify(exec);
const config = loadConfig();

interface Statistics {
  min: number | null;
  max: number | null;
  avg: number | null;
  std: number | null;
  count: number;
  median: number | null;
  q25: number | null;
  q75: number | null;
}

interface GPUStatus {
  gpu_available: boolean;
  cupy_version?: string;
  cuda_version?: number;
}

class GPUProcessor {
  private gpuAvailable: boolean | null = null;
  private lastCheck: number = 0;
  private checkInterval = 60000; // Check every minute
  
  /**
   * Get the Python command to use (Python 3.11 for CuPy compatibility)
   */
  private getPythonCommand(): string {
    return process.platform === 'win32' ? 'py -3.11' : 'python3.11';
  }

  /**
   * Check if GPU is available
   */
  async checkGPUAvailability(): Promise<GPUStatus> {
    const now = Date.now();
    
    // Cache result for 1 minute
    if (this.gpuAvailable !== null && (now - this.lastCheck) < this.checkInterval) {
      return {
        gpu_available: this.gpuAvailable,
      };
    }

    try {
      const scriptPath = require('path').join(__dirname, '../../scripts/gpu_stats.py');
      const pythonCmd = this.getPythonCommand();
      const { stdout } = await execAsync(
        `${pythonCmd} "${scriptPath}" check`,
        { timeout: 5000 }
      );

      const result = JSON.parse(stdout.trim());
      this.gpuAvailable = result.gpu_available || false;
      this.lastCheck = now;

      return result;
    } catch (error: any) {
      console.warn('GPU check failed:', error.message);
      this.gpuAvailable = false;
      this.lastCheck = now;
      return { gpu_available: false };
    }
  }

  /**
   * Calculate statistics for a single array using GPU acceleration
   */
  async calculateStatistics(data: number[]): Promise<Statistics> {
    if (!data || data.length === 0) {
      return {
        min: null,
        max: null,
        avg: null,
        std: null,
        count: 0,
        median: null,
        q25: null,
        q75: null,
      };
    }

    try {
      const scriptPath = require('path').join(__dirname, '../../scripts/gpu_stats.py');
      const pythonCmd = this.getPythonCommand();
      const dataJson = JSON.stringify(data);
      
      const { stdout, stderr } = await execAsync(
        `${pythonCmd} "${scriptPath}" stats ${JSON.stringify(dataJson)}`,
        { 
          maxBuffer: 10 * 1024 * 1024,
          timeout: 30000 
        }
      );

      if (stderr && !stderr.includes('WARNING')) {
        console.warn('GPU stats stderr:', stderr);
      }

      const result = JSON.parse(stdout.trim());
      
      if (result.error) {
        throw new Error(result.error);
      }

      return result as Statistics;
    } catch (error: any) {
      console.error('GPU statistics calculation failed:', error.message);
      // Fallback to CPU calculation
      return this.calculateStatisticsCPU(data);
    }
  }

  /**
   * Calculate statistics for multiple arrays in parallel
   */
  async calculateMultipleStatistics(
    dataDict: Record<string, number[]>
  ): Promise<Record<string, Statistics>> {
    if (!dataDict || Object.keys(dataDict).length === 0) {
      return {};
    }

    try {
      const scriptPath = require('path').join(__dirname, '../../scripts/gpu_stats.py');
      const pythonCmd = this.getPythonCommand();
      const dataJson = JSON.stringify(dataDict);
      
      const { stdout, stderr } = await execAsync(
        `${pythonCmd} "${scriptPath}" multi_stats ${JSON.stringify(dataJson)}`,
        { 
          maxBuffer: 10 * 1024 * 1024,
          timeout: 60000 
        }
      );

      if (stderr && !stderr.includes('WARNING')) {
        console.warn('GPU multi-stats stderr:', stderr);
      }

      const result = JSON.parse(stdout.trim());
      
      if (result.error) {
        throw new Error(result.error);
      }

      return result as Record<string, Statistics>;
    } catch (error: any) {
      console.error('GPU multi-statistics calculation failed:', error.message);
      // Fallback to CPU calculation
      return this.calculateMultipleStatisticsCPU(dataDict);
    }
  }

  /**
   * Aggregate time-series data into buckets using GPU
   */
  async aggregateTimeSeries(
    timestamps: number[],
    values: number[],
    intervalSeconds: number
  ): Promise<Record<number, { min: number; max: number; avg: number; count: number }>> {
    if (!timestamps || !values || timestamps.length !== values.length) {
      return {};
    }

    try {
      const scriptPath = require('path').join(__dirname, '../../scripts/gpu_stats.py');
      const pythonCmd = this.getPythonCommand();
      const tsJson = JSON.stringify(timestamps);
      const valJson = JSON.stringify(values);
      
      const { stdout, stderr } = await execAsync(
        `${pythonCmd} "${scriptPath}" aggregate ${tsJson} ${valJson} ${intervalSeconds}`,
        { 
          maxBuffer: 10 * 1024 * 1024,
          timeout: 60000 
        }
      );

      if (stderr && !stderr.includes('WARNING')) {
        console.warn('GPU aggregation stderr:', stderr);
      }

      const result = JSON.parse(stdout.trim());
      
      if (result.error) {
        throw new Error(result.error);
      }

      return result;
    } catch (error: any) {
      console.error('GPU aggregation failed:', error.message);
      // Fallback to CPU calculation
      return this.aggregateTimeSeriesCPU(timestamps, values, intervalSeconds);
    }
  }

  /**
   * CPU fallback: Calculate statistics
   */
  private calculateStatisticsCPU(data: number[]): Statistics {
    const validData = data.filter(v => typeof v === 'number' && isFinite(v));
    
    if (validData.length === 0) {
      return {
        min: null,
        max: null,
        avg: null,
        std: null,
        count: 0,
        median: null,
        q25: null,
        q75: null,
      };
    }

    const sorted = [...validData].sort((a, b) => a - b);
    const sum = validData.reduce((a, b) => a + b, 0);
    const avg = sum / validData.length;
    const variance = validData.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / validData.length;
    const std = Math.sqrt(variance);

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg,
      std,
      count: validData.length,
      median: sorted[Math.floor(sorted.length / 2)],
      q25: sorted[Math.floor(sorted.length * 0.25)],
      q75: sorted[Math.floor(sorted.length * 0.75)],
    };
  }

  /**
   * CPU fallback: Calculate multiple statistics
   */
  private calculateMultipleStatisticsCPU(
    dataDict: Record<string, number[]>
  ): Record<string, Statistics> {
    const results: Record<string, Statistics> = {};
    
    for (const [key, data] of Object.entries(dataDict)) {
      results[key] = this.calculateStatisticsCPU(data);
    }
    
    return results;
  }

  /**
   * CPU fallback: Aggregate time-series
   */
  private aggregateTimeSeriesCPU(
    timestamps: number[],
    values: number[],
    intervalSeconds: number
  ): Record<number, { min: number; max: number; avg: number; count: number }> {
    const buckets: Record<number, number[]> = {};
    const minTime = Math.min(...timestamps);

    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      const val = values[i];
      
      if (!isFinite(val)) continue;
      
      const bucketIdx = Math.floor((ts - minTime) / intervalSeconds);
      const bucketStart = minTime + bucketIdx * intervalSeconds;
      
      if (!buckets[bucketStart]) {
        buckets[bucketStart] = [];
      }
      buckets[bucketStart].push(val);
    }

    const results: Record<number, { min: number; max: number; avg: number; count: number }> = {};
    
    for (const [bucketStart, bucketValues] of Object.entries(buckets)) {
      const stats = this.calculateStatisticsCPU(bucketValues);
      results[parseInt(bucketStart)] = {
        min: stats.min!,
        max: stats.max!,
        avg: stats.avg!,
        count: stats.count,
      };
    }

    return results;
  }
}

export const gpuProcessor = new GPUProcessor();

