import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFullCoordsCache, getAddressFromCache, appendToCache } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query; // GET params for read
    const bodyAction = req.body?.action; // POST params for write

    // Handle GET requests (Read)
    if (req.method === 'GET') {
        if (action === 'get-all') {
            try {
                const cacheData = await getFullCoordsCache();
                // Disable caching to ensure immediate updates are seen
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
                return res.status(200).json(cacheData);
            } catch (error) {
                console.error('Error fetching full cache:', error);
                return res.status(500).json({ error: 'Failed to fetch cache' });
            }
        }

        if (action === 'get-one') {
            const { rmName, address } = req.query;
            if (!rmName || typeof rmName !== 'string' || !address || typeof address !== 'string') {
                return res.status(400).json({ error: 'rmName and address required' });
            }
            try {
                const cachedAddress = await getAddressFromCache(rmName, address);
                res.setHeader('Cache-Control', 'no-cache');
                if (cachedAddress) return res.status(200).json(cachedAddress);
                return res.status(404).json({ error: 'Not found' });
            } catch (error) {
                console.error('Error fetching single address:', error);
                return res.status(500).json({ error: 'Failed to fetch address' });
            }
        }
        
        return res.status(400).json({ error: 'Invalid GET action' });
    }

    // Handle POST requests (Write)
    if (req.method === 'POST') {
        if (bodyAction === 'add') {
            const { rmName, rows } = req.body;
            if (!rmName || !Array.isArray(rows)) {
                return res.status(400).json({ error: 'Invalid parameters for add' });
            }
            try {
                // Default lat/lon to empty strings if missing
                const formattedRows = rows.map((row: any) => [row.address, row.lat ?? '', row.lon ?? '']);
                await appendToCache(rmName, formattedRows);
                return res.status(200).json({ success: true });
            } catch (error) {
                console.error('Error adding to cache:', error);
                return res.status(500).json({ error: 'Failed to add to cache' });
            }
        }
        return res.status(400).json({ error: 'Invalid POST action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}