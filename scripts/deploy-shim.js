import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths relative to scripts/ folder
const distServerPath = path.join(__dirname, '../dist-server/index.js');
const distElectronDir = path.join(__dirname, '../dist-electron');
const distElectronPath = path.join(distElectronDir, 'main.js');

console.log('[Shim] Preparing to copy server build to Electron path...');

// Ensure dist-electron exists
if (!fs.existsSync(distElectronDir)) {
    console.log(`[Shim] Creating directory: ${distElectronDir}`);
    fs.mkdirSync(distElectronDir, { recursive: true });
}

// Copy file
if (fs.existsSync(distServerPath)) {
    fs.copyFileSync(distServerPath, distElectronPath);
    console.log(`[Shim] Success: Copied ${distServerPath} to ${distElectronPath}`);
    console.log('[Shim] Render should now successfully start the server using its cached command.');
} else {
    console.error(`[Shim] Error: Source file not found at ${distServerPath}`);
    process.exit(1);
}