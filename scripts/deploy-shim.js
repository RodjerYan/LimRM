import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths relative to scripts/ folder
const distServerPath = path.join(__dirname, '../dist-server/index.js');
const distElectronDir = path.join(__dirname, '../dist-electron');
const distElectronPath = path.join(distElectronDir, 'main.js');

console.log('---------------------------------------------------------');
console.log('[Shim] DEPLOY PREPARATION START');
console.log(`[Shim] Source: ${distServerPath}`);
console.log(`[Shim] Target: ${distElectronPath}`);

// Ensure dist-electron exists
if (!fs.existsSync(distElectronDir)) {
    console.log(`[Shim] Creating directory: ${distElectronDir}`);
    fs.mkdirSync(distElectronDir, { recursive: true });
}

// Check source existence
if (!fs.existsSync(distServerPath)) {
    console.error(`[Shim] CRITICAL ERROR: Source file not found!`);
    console.error(`[Shim] Expected server build at: ${distServerPath}`);
    console.error(`[Shim] Make sure 'npm run build:server' executed successfully.`);
    process.exit(1);
}

// Copy file
try {
    fs.copyFileSync(distServerPath, distElectronPath);
    
    // Verify copy
    if (fs.existsSync(distElectronPath)) {
        const stats = fs.statSync(distElectronPath);
        console.log(`[Shim] SUCCESS: File copied. Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        
        if (stats.size > 5 * 1024 * 1024) {
             console.warn(`[Shim] WARNING: Server file size is large (${(stats.size / 1024 / 1024).toFixed(2)} MB). Check if --packages=external is applied.`);
        }
        
        console.log('[Shim] Render should now successfully start the server.');
    } else {
        throw new Error('Destination file does not exist after copy');
    }
} catch (e) {
    console.error(`[Shim] Copy failed:`, e);
    process.exit(1);
}
console.log('---------------------------------------------------------');
