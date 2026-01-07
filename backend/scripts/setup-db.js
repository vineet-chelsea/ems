import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find the PowerShell script
const psScript = join(__dirname, 'setup-database-with-password.ps1');

if (!existsSync(psScript)) {
  console.error(`ERROR: Setup script not found at: ${psScript}`);
  process.exit(1);
}

try {
  console.log('Running database setup script...\n');
  execSync(
    `powershell -ExecutionPolicy Bypass -File "${psScript}"`,
    { stdio: 'inherit' }
  );
} catch (error) {
  console.error('Database setup failed:', error.message);
  process.exit(1);
}

