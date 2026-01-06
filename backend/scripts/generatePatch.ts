import { generatePatch, PatchFile } from '../src/services/patchService.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * CLI tool to generate patches
 * Usage: tsx scripts/generatePatch.ts --description "Fix bug" --target backend --files file1.ts,file2.ts
 */

interface Args {
  description?: string;
  target?: 'backend' | 'frontend' | 'both';
  files?: string;
  author?: string;
}

function parseArgs(): Args {
  const args: Args = {};
  const argv = process.argv.slice(2);
  
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].substring(2);
      const value = argv[i + 1];
      if (key === 'description') args.description = value;
      if (key === 'target') args.target = value as 'backend' | 'frontend' | 'both';
      if (key === 'files') args.files = value;
      if (key === 'author') args.author = value;
      i++;
    }
  }
  
  return args;
}

async function readFileContent(filePath: string): Promise<string> {
  const fullPath = path.join(__dirname, '../', filePath);
  return await fs.readFile(fullPath, 'utf-8');
}

async function generatePatchFromFiles(
  description: string,
  target: 'backend' | 'frontend' | 'both',
  filePaths: string[],
  author: string = 'System Admin'
): Promise<void> {
  const patchFiles: PatchFile[] = [];
  
  for (const filePath of filePaths) {
    try {
      const content = await readFileContent(filePath);
      
      // For now, we'll create a simple "add" operation
      // In a real scenario, you'd compare with previous version
      patchFiles.push({
        path: filePath,
        operation: 'add',
        content: content
      });
      
      console.log(`Added file to patch: ${filePath}`);
    } catch (error: any) {
      console.error(`Error reading file ${filePath}:`, error.message);
    }
  }
  
  if (patchFiles.length === 0) {
    console.error('No valid files to include in patch');
    process.exit(1);
  }
  
  const patch = await generatePatch(description, target, patchFiles, author);
  
  console.log('\n✓ Patch generated successfully!');
  console.log(`Patch ID: ${patch.metadata.patchId}`);
  console.log(`Version: ${patch.metadata.version}`);
  console.log(`Description: ${patch.metadata.description}`);
  console.log(`Target: ${patch.metadata.target}`);
  console.log(`Files: ${patch.files.length}`);
  console.log(`\nPatch saved to: backend/patches/${patch.metadata.patchId}.json`);
}

async function main() {
  const args = parseArgs();
  
  if (!args.description || !args.target || !args.files) {
    console.error('Usage: tsx scripts/generatePatch.ts --description "Description" --target backend --files "file1.ts,file2.ts" [--author "Author Name"]');
    process.exit(1);
  }
  
  const filePaths = args.files.split(',').map(f => f.trim());
  
  await generatePatchFromFiles(
    args.description,
    args.target,
    filePaths,
    args.author
  );
}

main().catch(error => {
  console.error('Error generating patch:', error);
  process.exit(1);
});

