import sharp from 'sharp';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildDir = path.join(__dirname, '..', 'build');
const faviconPath = path.join(__dirname, '..', 'public', 'favicon.ico');
const pngPath = path.join(buildDir, 'icon-source.png');

// Ensure build directory exists
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

console.log('Converting ICO to PNG...');
// Convert ICO to PNG (1024x1024 for best quality)
sharp(faviconPath)
  .resize(1024, 1024, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  })
  .png()
  .toFile(pngPath)
  .then(() => {
    console.log('PNG created successfully!');
    console.log('Generating platform-specific icons...');
    
    // Use electron-icon-builder to generate all formats
    try {
      execSync(`npx electron-icon-builder --input="${pngPath}" --output="${buildDir}"`, {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });
      console.log('Icons generated successfully!');
      console.log(`Icons are in: ${buildDir}`);
    } catch (error) {
      console.error('Error generating icons:', error.message);
      // Fallback: just copy the PNG as icon.png for Linux
      const linuxIconPath = path.join(buildDir, 'icon.png');
      fs.copyFileSync(pngPath, linuxIconPath);
      console.log('Created fallback icon.png for Linux');
    }
  })
  .catch((error) => {
    console.error('Error converting ICO to PNG:', error.message);
    console.log('Trying alternative approach...');
    
    // Fallback: try to use the ICO directly and create a simple PNG
    try {
      // Copy ICO as Windows icon
      const icoPath = path.join(buildDir, 'icon.ico');
      fs.copyFileSync(faviconPath, icoPath);
      console.log('Copied icon.ico for Windows');
      
      // Create a simple PNG placeholder (we'll need to handle this differently)
      console.log('Note: You may need to manually create icon.png and icon.icns');
      console.log('You can use online tools like:');
      console.log('  - https://convertio.co/ico-png/');
      console.log('  - https://cloudconvert.com/ico-to-png');
    } catch (err) {
      console.error('Fallback also failed:', err.message);
    }
  });

