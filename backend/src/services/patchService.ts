import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/connection.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PatchFile {
  path: string;
  operation: 'add' | 'modify' | 'delete';
  changes?: Array<{
    type: 'replace' | 'insert' | 'delete';
    search?: string;
    replace?: string;
    content?: string;
    lineStart?: number;
    lineEnd?: number;
  }>;
  content?: string;
}

export interface Patch {
  metadata: {
    version: string;
    patchId: string;
    description: string;
    target: 'backend' | 'frontend' | 'both';
    createdAt: string;
    requiresVersion: string;
    author: string;
  };
  files: PatchFile[];
  dependencies?: {
    npm?: {
      add?: string[];
      remove?: string[];
    };
  };
  rollback?: {
    patchId: string;
    instructions: string;
  };
}

/**
 * Generate a patch from file changes
 */
export async function generatePatch(
  description: string,
  target: 'backend' | 'frontend' | 'both',
  files: PatchFile[],
  author: string = 'System Admin'
): Promise<Patch> {
  // Get current version from package.json
  const packagePath = target === 'backend' 
    ? path.join(__dirname, '../../package.json')
    : path.join(__dirname, '../../../package.json');
  
  const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf-8'));
  const currentVersion = packageJson.version;
  
  // Generate patch ID
  const patchId = `patch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const patch: Patch = {
    metadata: {
      version: incrementVersion(currentVersion),
      patchId,
      description,
      target,
      createdAt: new Date().toISOString(),
      requiresVersion: currentVersion,
      author
    },
    files
  };
  
  // Save patch to database and file system
  await savePatch(patch);
  
  return patch;
}

/**
 * Apply a backend patch
 */
export async function applyBackendPatch(patchFilePath: string, appliedBy: string = 'system'): Promise<{ success: boolean; message: string; requiresRestart?: boolean }> {
  try {
    const patchContent = await fs.readFile(patchFilePath, 'utf-8');
    const patch: Patch = JSON.parse(patchContent);
    
    // Validate patch
    if (patch.metadata.target !== 'backend' && patch.metadata.target !== 'both') {
      return { success: false, message: 'Patch is not for backend' };
    }
    
    // Check if patch was already applied
    const existing = await db.query(
      'SELECT id FROM patch_applications WHERE patch_id = $1 AND target = $2 AND status = $3',
      [patch.metadata.patchId, 'backend', 'success']
    );
    
    if (existing.rows.length > 0) {
      return { success: false, message: 'Patch has already been applied' };
    }
    
    // Backup files before applying
    const backups: string[] = [];
    for (const file of patch.files) {
      if (file.operation !== 'add') {
        const filePath = path.join(__dirname, '../../', file.path);
        try {
          const backupPath = `${filePath}.backup.${Date.now()}`;
          await fs.copyFile(filePath, backupPath);
          backups.push(backupPath);
        } catch (e: any) {
          // File might not exist, that's okay for delete operations
          if (file.operation !== 'delete') {
            console.warn(`Could not backup ${filePath}:`, e.message);
          }
        }
      }
    }
    
    // Apply each file change
    for (const file of patch.files) {
      const filePath = path.join(__dirname, '../../', file.path);
      
      try {
        if (file.operation === 'delete') {
          await fs.unlink(filePath);
          console.log(`[Patch] Deleted file: ${file.path}`);
        } else if (file.operation === 'add') {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, file.content || '', 'utf-8');
          console.log(`[Patch] Added file: ${file.path}`);
        } else if (file.operation === 'modify') {
          let content = await fs.readFile(filePath, 'utf-8');
          
          for (const change of file.changes || []) {
            if (change.type === 'replace' && change.search && change.replace) {
              if (!content.includes(change.search)) {
                console.warn(`[Patch] Search string not found in ${file.path}, skipping replace`);
                continue;
              }
              content = content.replace(change.search, change.replace);
            } else if (change.type === 'insert' && change.content !== undefined && change.lineStart) {
              const lines = content.split('\n');
              lines.splice(change.lineStart - 1, 0, change.content);
              content = lines.join('\n');
            } else if (change.type === 'delete' && change.lineStart && change.lineEnd) {
              const lines = content.split('\n');
              lines.splice(change.lineStart - 1, change.lineEnd - change.lineStart + 1);
              content = lines.join('\n');
            }
          }
          
          await fs.writeFile(filePath, content, 'utf-8');
          console.log(`[Patch] Modified file: ${file.path}`);
        }
      } catch (error: any) {
        // Rollback backups on error
        for (const backup of backups) {
          try {
            const original = backup.replace(/\.backup\.\d+$/, '');
            await fs.copyFile(backup, original);
            await fs.unlink(backup);
          } catch (e) {
            console.error(`Failed to rollback ${backup}:`, e);
          }
        }
        throw new Error(`Failed to apply patch to ${file.path}: ${error.message}`);
      }
    }
    
    // Apply dependencies
    if (patch.dependencies?.npm) {
      const backendDir = path.join(__dirname, '../../');
      if (patch.dependencies.npm.add && patch.dependencies.npm.add.length > 0) {
        const packages = patch.dependencies.npm.add.join(' ');
        await execAsync(`npm install ${packages}`, { cwd: backendDir });
        console.log(`[Patch] Installed npm packages: ${packages}`);
      }
      if (patch.dependencies.npm.remove && patch.dependencies.npm.remove.length > 0) {
        const packages = patch.dependencies.npm.remove.join(' ');
        await execAsync(`npm uninstall ${packages}`, { cwd: backendDir });
        console.log(`[Patch] Removed npm packages: ${packages}`);
      }
    }
    
    // Record patch application
    await recordPatchApplication(patch.metadata.patchId, 'backend', appliedBy, 'success');
    
    // Clean up backups after successful application
    for (const backup of backups) {
      try {
        await fs.unlink(backup);
      } catch (e) {
        console.warn(`Could not remove backup ${backup}:`, e);
      }
    }
    
    return { success: true, message: 'Patch applied successfully', requiresRestart: true };
  } catch (error: any) {
    // Record failed application
    try {
      const patchContent = await fs.readFile(patchFilePath, 'utf-8');
      const patch: Patch = JSON.parse(patchContent);
      await recordPatchApplication(patch.metadata.patchId, 'backend', appliedBy, 'failed', error.message);
    } catch (e) {
      // Ignore errors in recording
    }
    return { success: false, message: error.message || 'Failed to apply patch' };
  }
}

/**
 * Save patch to database and file system
 */
async function savePatch(patch: Patch): Promise<void> {
  // Save to database
  await db.query(
    `INSERT INTO patches (patch_id, version, description, target, created_at, patch_data)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (patch_id) DO UPDATE
     SET version = EXCLUDED.version,
         description = EXCLUDED.description,
         target = EXCLUDED.target,
         patch_data = EXCLUDED.patch_data`,
    [
      patch.metadata.patchId,
      patch.metadata.version,
      patch.metadata.description,
      patch.metadata.target,
      patch.metadata.createdAt,
      JSON.stringify(patch)
    ]
  );
  
  // Save to file system
  const patchesDir = path.join(__dirname, '../../patches');
  await fs.mkdir(patchesDir, { recursive: true });
  await fs.writeFile(
    path.join(patchesDir, `${patch.metadata.patchId}.json`),
    JSON.stringify(patch, null, 2),
    'utf-8'
  );
  
  console.log(`[Patch] Saved patch ${patch.metadata.patchId} to database and file system`);
}

/**
 * Record patch application
 */
async function recordPatchApplication(
  patchId: string,
  target: string,
  appliedBy: string,
  status: 'success' | 'failed' = 'success',
  errorMessage?: string
): Promise<void> {
  await db.query(
    `INSERT INTO patch_applications (patch_id, target, applied_at, applied_by, status, error_message)
     VALUES ($1, $2, NOW(), $3, $4, $5)`,
    [patchId, target, appliedBy, status, errorMessage || null]
  );
}

/**
 * Get patch history
 */
export async function getPatchHistory(): Promise<any[]> {
  const result = await db.query(
    `SELECT 
      p.id,
      p.patch_id,
      p.version,
      p.description,
      p.target,
      p.created_at,
      COUNT(pa.id) FILTER (WHERE pa.status = 'success') as success_count,
      COUNT(pa.id) FILTER (WHERE pa.status = 'failed') as failed_count,
      MAX(pa.applied_at) FILTER (WHERE pa.status = 'success') as last_applied
     FROM patches p
     LEFT JOIN patch_applications pa ON p.patch_id = pa.patch_id
     GROUP BY p.id, p.patch_id, p.version, p.description, p.target, p.created_at
     ORDER BY p.created_at DESC`
  );
  return result.rows;
}

/**
 * Get patch file by ID
 */
export async function getPatchFile(patchId: string): Promise<Patch | null> {
  const result = await db.query(
    'SELECT patch_data FROM patches WHERE patch_id = $1',
    [patchId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0].patch_data as Patch;
}

/**
 * Increment version number
 */
function incrementVersion(version: string): string {
  const parts = version.split('.');
  if (parts.length === 3) {
    const patch = parseInt(parts[2]) + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }
  return version;
}

