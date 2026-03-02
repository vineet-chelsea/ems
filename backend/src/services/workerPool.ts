/**
 * Worker Pool for Python Script Execution
 * 
 * Manages concurrent execution of Python scripts with configurable worker limits
 * to prevent system overload while maintaining high throughput.
 */

import { promisify } from 'util';
import { exec } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig } from '../config/performance.config.js';

const execAsync = promisify(exec);
const config = loadConfig();

interface WorkerTask {
  id: string;
  script: string;
  timeoutMs: number;
  timedOut: boolean;
  resolve: (value: any) => void;
  reject: (error: any) => void;
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

      const task: WorkerTask = {
        id: taskId,
        script,
        timeoutMs: timeout,
        timedOut: false,
        resolve: (value) => {
          this.totalExecuted++;
          resolve(value);
        },
        reject: (error) => {
          this.totalFailed++;
          reject(error);
        },
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

    let executionTimeout: NodeJS.Timeout | null = null;

    try {
      executionTimeout = setTimeout(() => {
        task.timedOut = true;
        task.reject(new Error(`Worker task ${task.id} timed out after ${task.timeoutMs}ms`));
      }, task.timeoutMs);

      const result = await this.runPythonScript(task.script, task.timeoutMs);

      if (!task.timedOut) {
        task.resolve(result);
      }
    } catch (error) {
      if (!task.timedOut) {
        task.reject(error);
      }
    } finally {
      if (executionTimeout) clearTimeout(executionTimeout);
      this.activeWorkers--;
      this.processQueue(); // Process next task
    }
  }

  private async runPythonScript(script: string, timeoutMs: number): Promise<any> {
    // Write script to temporary file to avoid command-line length limits (ENAMETOOLONG)
    // This is especially important on Windows where command-line arguments have strict length limits
    const tempFile = join(tmpdir(), `modbus_script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.py`);
    
    try {
      // Write script to temporary file
      writeFileSync(tempFile, script, 'utf8');
      
      // Use python instead of python3 for Windows compatibility
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      const { stdout, stderr } = await execAsync(
        `${pythonCmd} "${tempFile}"`,
        { 
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          timeout: timeoutMs 
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
          const parsed = JSON.parse(output);
          // Check if this is an error response from Python script
          if (parsed.error) {
            // Return error object with error_type for proper handling
            return parsed;
          }
          return parsed;
        } catch (parseError) {
          // If not JSON, try to clean NaN/Infinity and retry
          const cleanedOutput = output.replace(/:\s*NaN\s*/g, ': null').replace(/:\s*-?Infinity\s*/g, ': null');
          try {
            const parsed = JSON.parse(cleanedOutput);
            if (parsed.error) {
              return parsed;
            }
            return parsed;
          } catch (retryError) {
            // If still not JSON, check stderr for error JSON
            if (stderr) {
              try {
                // Try to find JSON error in stderr
                const stderrLines = stderr.split('\n');
                for (const line of stderrLines) {
                  if (line.trim().startsWith('{') && line.includes('error')) {
                    const parsed = JSON.parse(line.trim());
                    if (parsed.error) {
                      return parsed;
                    }
                  }
                }
              } catch (e) {
                // Ignore stderr parsing errors
              }
            }
            // If still not JSON, return as string or empty object
            console.warn('Python output is not valid JSON:', output.substring(0, 200));
            return {};
          }
        }
      }
      return {};
    } catch (error: any) {
      // If Python script printed JSON error before exiting, try to parse it
      if (error.stdout) {
        try {
          const output = error.stdout.trim();
          if (output) {
            const parsed = JSON.parse(output);
            if (parsed.error) {
              // Return error object with error_type for proper handling
              const errorObj = new Error(parsed.error);
              if (parsed.error_type) {
                (errorObj as any).error_type = parsed.error_type;
              }
              throw errorObj;
            }
          }
        } catch (parseError) {
          // If parsing fails, continue with original error handling
        }
      }
      
      // Include stderr in error message for debugging Python syntax/runtime errors
      let errorMessage = error.message || String(error);
      if (error.stderr) {
        const stderrLines = error.stderr.split('\n').filter((line: string) => 
          line.trim() && !line.includes('DEBUG:') && !line.includes('INFO:')
        );
        if (stderrLines.length > 0) {
          errorMessage += `\nPython stderr: ${stderrLines.join('; ').substring(0, 1000)}`;
        }
      }
      if (error.stdout) {
        errorMessage += `\nPython stdout: ${error.stdout.substring(0, 500)}`;
      }
      
      if (error.code === 'ETIMEDOUT') {
        throw new Error(`Python script execution timed out after ${timeoutMs}ms`);
      }
      if (error.code === 'ENAMETOOLONG') {
        throw new Error(`Python script execution failed: Command line too long. This should not happen with file-based execution.`);
      }
      throw new Error(`Python script execution failed: ${errorMessage}`);
    } finally {
      // Clean up temporary file
      try {
        if (existsSync(tempFile)) {
          unlinkSync(tempFile);
        }
      } catch (cleanupError) {
        // Ignore cleanup errors, but log a warning
        console.warn(`Failed to cleanup temporary Python script file: ${tempFile}`);
      }
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

