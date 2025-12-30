
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pathsToDelete = [
    // Legacy deprecated endpoint files
    'api/add-to-cache.ts',
    'api/delete-address.ts',
    'api/get-akb.ts',
    'api/get-cached-address.ts',
    'api/get-conflict-zones.ts',
    'api/get-okb-status.ts',
    'api/snapshot.ts',
    'api/update-address.ts',
    'api/update-coords.ts',
    'api/geocode.ts',
    // Folders 
    'api/_lib', // We can delete _lib safely as Vercel ignores underscore folders anyway
    'api/_data' 
];

// NOTE: 'api/lib' is intentionally NOT deleted to avoid "File not found" errors in Vercel.
// We handle 'api/lib/sheets.ts' by replacing its content with an empty export in the codebase.

console.log('--- CLEANUP STARTED ---');

pathsToDelete.forEach(item => {
    const fullPath = path.join(__dirname, item);
    
    if (fs.existsSync(fullPath)) {
        try {
            const stats = fs.statSync(fullPath);
            if (stats.isDirectory()) {
                fs.rmSync(fullPath, { recursive: true, force: true });
                console.log(`[DELETED DIR] ${item}`);
            } else {
                fs.unlinkSync(fullPath);
                console.log(`[DELETED FILE] ${item}`);
            }
        } catch (e) {
            console.error(`[ERROR] Failed to delete ${item}:`, e.message);
        }
    } else {
        console.log(`[SKIP] ${item} not found`);
    }
});

console.log('--- CLEANUP FINISHED ---');