
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    getFullCoordsCache, 
    getAddressFromCache, 
    appendToCache, 
    deleteAddressFromCache, 
    updateAddressInCache, 
    updateCacheCoords 
} from './lib/sheets.js';

// HACK: This function now handles ALL cache operations to bypass Vercel function limits.
export default async function handler(req: VercelRequest, res: VercelResponse) {
    const action = req.query.action as string;

    // --- GET ACTIONS ---
    if (req.method === 'GET') {
        
        // 1. Get Full Cache
        if (action === 'get-full-cache' || !action) {
            try {
                const cacheData = await getFullCoordsCache();
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
                return res.status(200).json(cacheData);
            } catch (error) {
                console.error('Error getting full cache:', error);
                return res.status(500).json({ error: 'Failed to retrieve cache', details: (error as Error).message });
            }
        }

        // 2. Get Single Cached Address
        if (action === 'get-cached-address') {
            try {
                const { rmName, address } = req.query;
                if (!rmName || !address) return res.status(400).json({ error: 'Missing params' });
                
                const cachedAddress = await getAddressFromCache(rmName as string, address as string);
                res.setHeader('Cache-Control', 'no-cache');
                
                if (cachedAddress) return res.status(200).json(cachedAddress);
                return res.status(404).json({ error: 'Address not found' });
            } catch (error) {
                console.error('Error getting single address:', error);
                return res.status(500).json({ error: 'Failed to retrieve address', details: (error as Error).message });
            }
        }
    }

    // --- POST ACTIONS ---
    if (req.method === 'POST') {
        
        // 3. Add To Cache
        if (action === 'add-to-cache') {
            try {
                const { rmName, rows } = req.body;
                if (!rmName || !Array.isArray(rows)) return res.status(400).json({ error: 'Invalid body' });
                
                const formattedRows = rows.map(row => [row.address, row.lat ?? '', row.lon ?? '']);
                await appendToCache(rmName, formattedRows);
                return res.status(200).json({ success: true });
            } catch (error) {
                console.error('Error adding to cache:', error);
                return res.status(500).json({ error: 'Add failed', details: (error as Error).message });
            }
        }

        // 4. Update Address (Rename/Comment)
        if (action === 'update-address') {
            try {
                const { rmName, oldAddress, newAddress, comment } = req.body;
                if (!rmName || !oldAddress || !newAddress) return res.status(400).json({ error: 'Invalid body' });
                
                await updateAddressInCache(rmName, oldAddress, newAddress, comment);
                return res.status(200).json({ success: true });
            } catch (error) {
                console.error('Error updating address:', error);
                return res.status(500).json({ error: 'Update failed', details: (error as Error).message });
            }
        }

        // 5. Update Coordinates
        if (action === 'update-coords') {
            try {
                const { rmName, updates } = req.body;
                if (!rmName || !Array.isArray(updates)) return res.status(400).json({ error: 'Invalid body' });
                
                await updateCacheCoords(rmName, updates);
                return res.status(200).json({ success: true });
            } catch (error) {
                console.error('Error updating coords:', error);
                return res.status(500).json({ error: 'Coord update failed', details: (error as Error).message });
            }
        }

        // 6. Delete Address
        if (action === 'delete-address') {
            try {
                const { rmName, address } = req.body;
                if (!rmName || !address) return res.status(400).json({ error: 'Invalid body' });
                
                await deleteAddressFromCache(rmName, address);
                return res.status(200).json({ success: true });
            } catch (error) {
                console.error('Error deleting address:', error);
                return res.status(500).json({ error: 'Delete failed', details: (error as Error).message });
            }
        }
    }

    return res.status(400).json({ error: 'Unknown action or method' });
}
