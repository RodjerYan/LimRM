
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    getFullCoordsCache, 
    getAddressFromCache, 
    appendToCache, 
    updateCacheCoords, 
    updateAddressInCache, 
    deleteAddressFromCache 
} from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const action = req.query.action as string;

    try {
        // GET Actions
        if (req.method === 'GET') {
            if (action === 'full-cache') {
                const cache = await getFullCoordsCache();
                res.setHeader('Cache-Control', 'no-store');
                return res.status(200).json(cache);
            }
            if (action === 'get-address') {
                const { rmName, address } = req.query;
                const result = await getAddressFromCache(rmName as string, address as string);
                return result ? res.status(200).json(result) : res.status(404).end();
            }
        }

        // POST Actions
        if (req.method === 'POST') {
            const { rmName, rows, updates, oldAddress, newAddress, comment, address } = req.body;

            if (action === 'add-to-cache') {
                const formatted = rows.map((r: any) => [r.address, r.lat ?? '', r.lon ?? '']);
                await appendToCache(rmName, formatted);
                return res.status(200).json({ success: true });
            }
            if (action === 'update-coords') {
                await updateCacheCoords(rmName, updates);
                return res.status(200).json({ success: true });
            }
            if (action === 'update-address') {
                await updateAddressInCache(rmName, oldAddress, newAddress, comment);
                return res.status(200).json({ success: true });
            }
            if (action === 'delete-address') {
                await deleteAddressFromCache(rmName, address);
                return res.status(200).json({ success: true });
            }
        }

        return res.status(400).json({ error: 'Invalid action or method' });
    } catch (e: any) {
        console.error('Registry API error:', e);
        return res.status(500).json({ error: e.message });
    }
}
