import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load device mapping JSON file at runtime
 * Works in both development (src/) and production (dist/)
 */
function loadMappingFile(filename: string): any[] {
  // Try dist/config first (production - after build)
  let configPath = path.join(__dirname, '../../dist/config', filename);
  
  if (!fs.existsSync(configPath)) {
    // Try src/config (development - when running with tsx)
    configPath = path.join(__dirname, '../../src/config', filename);
  }
  
  if (!fs.existsSync(configPath)) {
    // Try relative to current file location (fallback)
    configPath = path.join(__dirname, '../config', filename);
  }
  
  if (!fs.existsSync(configPath)) {
    const error = new Error(
      `Mapping file not found: ${filename}\n` +
      `Tried paths:\n` +
      `  1. ${path.join(__dirname, '../../dist/config', filename)}\n` +
      `  2. ${path.join(__dirname, '../../src/config', filename)}\n` +
      `  3. ${path.join(__dirname, '../config', filename)}\n\n` +
      `Current __dirname: ${__dirname}\n` +
      `Make sure to run 'npm run build' to copy JSON files to dist/config/`
    );
    console.error(error.message);
    throw error;
  }
  
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    console.log(`✓ Loaded ${filename} from ${configPath}`);
    return parsed;
  } catch (error: any) {
    throw new Error(`Failed to parse ${filename}: ${error.message}`);
  }
}

// Load all mappings with error handling
let pm5320Mappings: any[] = [];
let pm8000Mappings: any[] = [];
let em6400Mappings: any[] = [];
let micrologic6eMappings: any[] = [];

try {
  pm5320Mappings = loadMappingFile('pm5320_mappings.json');
} catch (error: any) {
  console.error('WARNING: Failed to load pm5320_mappings.json:', error.message);
}

try {
  pm8000Mappings = loadMappingFile('pm8000_mappings.json');
} catch (error: any) {
  console.error('WARNING: Failed to load pm8000_mappings.json:', error.message);
}

try {
  em6400Mappings = loadMappingFile('em6400_mappings.json');
} catch (error: any) {
  console.error('WARNING: Failed to load em6400_mappings.json:', error.message);
}

try {
  micrologic6eMappings = loadMappingFile('micrologic6e_mappings.json');
} catch (error: any) {
  console.error('WARNING: Failed to load micrologic6e_mappings.json:', error.message);
}

export { pm5320Mappings, pm8000Mappings, em6400Mappings, micrologic6eMappings };

