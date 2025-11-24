import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const filesToRemove = [
    'api/add-to-cache.ts',
    'api/geocode.ts',
    'api/get-cached-address.ts',
    'api/get-conflict-zones.ts',
    'api/get-full-cache.ts',
    'api/get-okb-status.ts',
    'api/get-okb.ts',
    'api/update-address.ts',
    'api/update-coords.ts',
    'api/delete-address.ts',
    'api/auth/login.ts',
    'api/auth/logout.ts',
    'api/auth/me.ts',
    'api/auth/register.ts',
    'api/auth/verify.ts',
];

console.log('--- Starting Vercel Function Cleanup ---');

filesToRemove.forEach(file => {
    const filePath = path.join(rootDir, file);
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            console.log(`Deleted redundant file: ${file}`);
        } catch (e) {
            console.error(`Error deleting ${file}:`, e);
        }
    }
});

const authDir = path.join(rootDir, 'api/auth');
if (fs.existsSync(authDir)) {
    try {
        // Only remove if empty or if we expect it to be empty
        const remaining = fs.readdirSync(authDir);
        if (remaining.length === 0) {
            fs.rmdirSync(authDir);
            console.log('Deleted empty directory: api/auth');
        } else {
            console.log(`Directory api/auth not empty, skipping removal. Remaining: ${remaining.join(', ')}`);
        }
    } catch (e) {
         console.error('Error removing api/auth dir:', e);
    }
}

console.log('--- Cleanup Complete ---');
