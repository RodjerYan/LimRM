import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    getFullCoordsCache, 
    appendToCache, 
    updateCacheCoords, 
    updateAddressInCache, 
    deleteAddressFromCache, 
    getAddressFromCache 
} from '../lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { op } = req.query;

    try {
        // --- GET Operations ---
        if (req.method === 'GET') {
            if (op === 'get-full') {
                const cacheData = await getFullCoordsCache();
                // Disable caching to ensure immediate synchronization
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                return res.status(200).json(cacheData);
            }
            
            if (op === 'get-one') {
                const { rmName, address } = req.query;
                if (!rmName || typeof rmName !== 'string' || !address || typeof address !== 'string') {
                    return res.status(400).json({ error: 'Query parameters rmName (string) and address (string) are required.' });
                }
                const cachedAddress = await getAddressFromCache(rmName, address);
                if (cachedAddress) {
                    res.setHeader('Cache-Control', 'no-cache');
                    return res.status(200).json(cachedAddress);
                } else {
                    return res.status(404).json({ error: 'Address not found in the cache.' });
                }
            }

            return res.status(400).json({ error: `Unknown GET operation: ${op}` });
        }

        // --- POST Operations ---
        if (req.method === 'POST') {
            if (op === 'add') {
                const { rmName, rows } = req.body;
                if (!rmName || typeof rmName !== 'string' || !Array.isArray(rows)) {
                    return res.status(400).json({ error: 'A valid rmName (string) and an array of rows are required.' });
                }
                // Format rows: [address, lat, lon]
                const formattedRows = rows.map(row => [row.address, row.lat ?? '', row.lon ?? '']);
                await appendToCache(rmName, formattedRows);
                return res.status(200).json({ success: true, message: `Appended rows to sheet for ${rmName}.` });
            }
            
            if (op === 'update-coords') {
                const { rmName, updates } = req.body;
                if (!rmName || typeof rmName !== 'string' || !Array.isArray(updates) || updates.length === 0) {
                    return res.status(400).json({ error: 'A valid rmName and a non-empty array of updates are required.' });
                }
                await updateCacheCoords(rmName, updates);
                return res.status(200).json({ success: true, message: `Updated coordinates for ${rmName}.` });
            }

            if (op === 'update-address') {
                const { rmName, oldAddress, newAddress } = req.body;
                if (!rmName || typeof rmName !== 'string' || typeof oldAddress !== 'string' || typeof newAddress !== 'string' || !newAddress.trim()) {
                    return res.status(400).json({ error: 'Valid rmName, oldAddress, and newAddress are required.' });
                }
                await updateAddressInCache(rmName, oldAddress, newAddress);
                return res.status(200).json({ success: true, message: `Address updated successfully for ${rmName}.` });
            }

            if (op === 'delete') {
                const { rmName, address } = req.body;
                if (!rmName || typeof rmName !== 'string' || !address || typeof address !== 'string') {
                    return res.status(400).json({ error: 'Valid rmName and address are required.' });
                }
                await deleteAddressFromCache(rmName, address);
                return res.status(200).json({ success: true, message: `Address deleted successfully for ${rmName}.` });
            }

            return res.status(400).json({ error: `Unknown POST operation: ${op}` });
        }

        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error(`Error in cache-ops/${op}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: `Operation failed`, details: errorMessage });
    }
}
