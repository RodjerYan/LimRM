
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    getFullCoordsCache, 
    getAddressFromCache, 
    appendToCache, 
    deleteAddressFromCache, 
    updateAddressInCache, 
    updateCacheCoords,
    getSnapshot,
    saveSnapshot
} from '../lib/sheets-helper.js';

export const config = {
    maxDuration: 60,
    api: {
        bodyParser: {
            sizeLimit: '4.5mb',
        },
    },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const action = req.query.action as string;

    if (req.method === 'GET') {
        if (action === 'get-full-cache' || !action) {
            try {
                const cacheData = await getFullCoordsCache();
                res.setHeader('Cache-Control', 'no-store');
                return res.status(200).json(cacheData);
            } catch (error) {
                return res.status(500).json({ error: 'Cache failed', details: (error as Error).message });
            }
        }

        if (action === 'get-cached-address') {
            try {
                const { rmName, address } = req.query;
                if (!rmName || !address) return res.status(400).json({ error: 'Missing params' });
                const cachedAddress = await getAddressFromCache(rmName as string, address as string);
                if (cachedAddress) return res.status(200).json(cachedAddress);
                return res.status(404).json({ error: 'Not found' });
            } catch (error) {
                return res.status(500).json({ error: 'Fetch failed', details: (error as Error).message });
            }
        }

        if (action === 'get-snapshot') {
            try {
                const snapshot = await getSnapshot();
                if (!snapshot) return res.status(404).json({ message: 'No snapshot' });
                res.setHeader('Cache-Control', 's-maxage=60');
                return res.json(snapshot);
            } catch (error) {
                return res.status(500).json({ error: (error as Error).message });
            }
        }
    }

    if (req.method === 'POST') {
        if (action === 'add-to-cache') {
            try {
                const { rmName, rows } = req.body;
                const formattedRows = rows.map((r: any) => [r.address, r.lat ?? '', r.lon ?? '']);
                await appendToCache(rmName, formattedRows);
                return res.status(200).json({ success: true });
            } catch (error) {
                return res.status(500).json({ error: 'Add failed' });
            }
        }

        if (action === 'update-address') {
            try {
                const { rmName, oldAddress, newAddress, comment } = req.body;
                await updateAddressInCache(rmName, oldAddress, newAddress, comment);
                return res.status(200).json({ success: true });
            } catch (error) {
                return res.status(500).json({ error: 'Update failed' });
            }
        }

        if (action === 'update-coords') {
            try {
                const { rmName, updates } = req.body;
                await updateCacheCoords(rmName, updates);
                return res.status(200).json({ success: true });
            } catch (error) {
                return res.status(500).json({ error: 'Update failed' });
            }
        }

        if (action === 'delete-address') {
            try {
                const { rmName, address } = req.body;
                await deleteAddressFromCache(rmName, address);
                return res.status(200).json({ success: true });
            } catch (error) {
                return res.status(500).json({ error: 'Delete failed' });
            }
        }

        if (action === 'save-snapshot') {
            try {
                await saveSnapshot(req.body);
                return res.json({ success: true });
            } catch (error) {
                return res.status(500).json({ error: (error as Error).message });
            }
        }
    }

    return res.status(400).json({ error: 'Unknown action' });
}
