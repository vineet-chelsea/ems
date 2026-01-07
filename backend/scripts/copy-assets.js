import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcConfigDir = path.join(__dirname, '../src/config');
const distConfigDir = path.join(__dirname, '../dist/config');

// Ensure dist/config directory exists
if (!fs.existsSync(distConfigDir)) {
  fs.mkdirSync(distConfigDir, { recursive: true });
  console.log('Created dist/config directory');
}

// Check if src/config exists
if (!fs.existsSync(srcConfigDir)) {
  console.error(`ERROR: Source config directory not found: ${srcConfigDir}`);
  process.exit(1);
}

// Copy all JSON files from src/config to dist/config
const files = fs.readdirSync(srcConfigDir);
const jsonFiles = files.filter(f => f.endsWith('.json'));

if (jsonFiles.length === 0) {
  console.error('ERROR: No JSON files found in src/config!');
  process.exit(1);
}

console.log('Copying JSON mapping files...');
let copied = 0;
let errors = 0;

jsonFiles.forEach(file => {
  const srcPath = path.join(srcConfigDir, file);
  const distPath = path.join(distConfigDir, file);
  try {
    fs.copyFileSync(srcPath, distPath);
    const size = (fs.statSync(distPath).size / 1024).toFixed(2);
    console.log(`  ✓ Copied ${file} (${size} KB)`);
    copied++;
  } catch (error) {
    console.error(`  ✗ Failed to copy ${file}:`, error.message);
    errors++;
  }
});

if (errors > 0) {
  console.error(`\n✗ Failed to copy ${errors} file(s)`);
  process.exit(1);
}

console.log(`\n✓ Successfully copied ${copied} JSON file(s) to dist/config`);

