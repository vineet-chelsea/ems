/**
 * Worker Pool for Python Script Execution
 * 
 * Manages concurrent execution of Python scripts with configurable worker limits
 * to prevent system overload while maintaining high throughput.
 */

import { promisify } from 'util';
import { exec } from 'child_process';
import { loadConfig } from '../config/performance.config.js';

const execAsync = promisify(exec);
const config = loadConfig();

interface WorkerTask {
  id: string;
  script: string;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timeout: NodeJS.Timeout;
}

class PythonWorkerPool {
  private queue: WorkerTask[] = [];
  private activeWorkers = 0;
  private maxWorkers: number;
  private totalExecuted = 0;
  private totalFailed = 0;

  constructor(maxWorkers: number = config.workers.maxWorkers) {
    this.maxWorkers = maxWorkers;
  }

  async execute(script: string, timeout: number = config.workers.workerTimeout): Promise<any> {
    return new Promise((resolve, reject) => {
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const timeoutHandle = setTimeout(() => {
        this.totalFailed++;
        reject(new Error(`Worker task ${taskId} timed out after ${timeout}ms`));
      }, timeout);

      const task: WorkerTask = {
        id: taskId,
        script,
        resolve: (value) => {
          clearTimeout(timeoutHandle);
          this.totalExecuted++;
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeoutHandle);
          this.totalFailed++;
          reject(error);
        },
        timeout: timeoutHandle,
      };

      this.queue.push(task);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.activeWorkers >= this.maxWorkers || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeWorkers++;
    
    try {
      const result = await this.runPythonScript(task.script);
      task.resolve(result);
    } catch (error) {
      task.reject(error);
    } finally {
      this.activeWorkers--;
      this.processQueue(); // Process next task
    }
  }

  private async runPythonScript(script: string): Promise<any> {
    // Script is already complete Python code with JSON output, just execute it
    try {
      // Use python instead of python3 for Windows compatibility
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const { stdout, stderr } = await execAsync(
        `${pythonCmd} -c ${JSON.stringify(script)}`,
        { 
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          timeout: config.workers.workerTimeout 
        }
      );

      // Only log non-debug stderr messages
      if (stderr && !stderr.includes('DEBUG:') && !stderr.includes('INFO:')) {
        const errorLines = stderr.split('\n').filter(line => 
          line.trim() && !line.includes('DEBUG:') && !line.includes('INFO:')
        );
        if (errorLines.length > 0) {
          console.warn('Python stderr:', errorLines.join('; ').substring(0, 500));
        }
      }

      // Parse JSON output
      const output = stdout.trim();
      if (output) {
        try {
          return JSON.parse(output);
        } catch (parseError) {
          // If not JSON, try to clean NaN/Infinity and retry
          const cleanedOutput = output.replace(/:\s*NaN\s*/g, ': null').replace(/:\s*-?Infinity\s*/g, ': null');
          try {
            return JSON.parse(cleanedOutput);
          } catch (retryError) {
            // If still not JSON, return as string or empty object
            console.warn('Python output is not valid JSON:', output.substring(0, 200));
            return {};
          }
        }
      }
      return {};
    } catch (error: any) {
      if (error.code === 'ETIMEDOUT') {
        throw new Error(`Python script execution timed out after ${config.workers.workerTimeout}ms`);
      }
      throw new Error(`Python script execution failed: ${error.message || error}`);
    }
  }

  getStats() {
    return {
      queueLength: this.queue.length,
      activeWorkers: this.activeWorkers,
      maxWorkers: this.maxWorkers,
      totalExecuted: this.totalExecuted,
      totalFailed: this.totalFailed,
    };
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

export const workerPool = new PythonWorkerPool();

