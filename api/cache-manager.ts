
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appendToCache, updateCacheCoords, updateAddressInCache, deleteAddressFromCache } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { action, ...payload } = req.body;

        if (!action) {
            return res.status(400).json({ error: 'Action is required in body.' });
        }

        switch (action) {
            case 'add': {
                const { rmName, rows } = payload;
                if (!rmName || !Array.isArray(rows)) throw new Error('Invalid payload for add action');
                const formattedRows = rows.map((row: any) => [row.address, row.lat ?? '', row.lon ?? '']);
                await appendToCache(rmName, formattedRows);
                return res.status(200).json({ success: true, message: `Added ${rows.length} rows.` });
            }
            case 'update-coords': {
                const { rmName, updates } = payload;
                if (!rmName || !Array.isArray(updates)) throw new Error('Invalid payload for update-coords action');
                await updateCacheCoords(rmName, updates);
                return res.status(200).json({ success: true, message: `Updated coordinates for ${updates.length} items.` });
            }
            case 'update-address': {
                const { rmName, oldAddress, newAddress, comment } = payload;
                if (!rmName || !oldAddress || !newAddress) throw new Error('Invalid payload for update-address action');
                await updateAddressInCache(rmName, oldAddress, newAddress, comment);
                return res.status(200).json({ success: true, message: `Address updated.` });
            }
            case 'delete': {
                const { rmName, address } = payload;
                if (!rmName || !address) throw new Error('Invalid payload for delete action');
                await deleteAddressFromCache(rmName, address);
                return res.status(200).json({ success: true, message: `Address deleted.` });
            }
            default:
                return res.status(400).json({ error: `Unknown action: ${action}` });
        }

    } catch (error) {
        console.error(`Error in /api/cache-manager:`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'Cache operation failed', details: errorMessage });
    }
}
