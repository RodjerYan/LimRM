
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    getFullCoordsCache, 
    getAddressFromCache, 
    appendToCache, 
    deleteAddressFromCache, 
    updateAddressInCache, 
    updateCacheCoords,
    getSnapshot,
    saveSnapshot,
    initResumableSnapshotUpload
} from './_lib/sheets';

export const config = {
    maxDuration: 60,
    api: {
        bodyParser: false,
    },
};

async function getRawBody(req: VercelRequest): Promise<Buffer> {
    const buffers = [];
    for await (const chunk of req) {
        buffers.push(chunk);
    }
    return Buffer.concat(buffers);
}

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
        if (action === 'init-snapshot-upload') {
            try {
                const result = await initResumableSnapshotUpload();
                return res.json(result);
            } catch (error) {
                console.error("Init upload error:", error);
                return res.status(500).json({ error: (error as Error).message });
            }
        }

        let body: any;
        try {
            const raw = await getRawBody(req);
            if (raw.length > 0) body = JSON.parse(raw.toString('utf8'));
        } catch (e) {
            return res.status(400).json({ error: 'Invalid JSON body' });
        }

        if (action === 'add-to-cache') {
            try {
                const { rmName, rows } = body;
                const formattedRows = rows.map((r: any) => [r.address, r.lat ?? '', r.lon ?? '']);
                await appendToCache(rmName, formattedRows);
                return res.status(200).json({ success: true });
            } catch (error) {
                return res.status(500).json({ error: 'Add failed' });
            }
        }

        if (action === 'update-address') {
            try {
                const { rmName, oldAddress, newAddress, comment } = body;
                await updateAddressInCache(rmName, oldAddress, newAddress, comment);
                return res.status(200).json({ success: true });
            } catch (error) {
                return res.status(500).json({ error: 'Update failed' });
            }
        }

        if (action === 'update-coords') {
            try {
                const { rmName, updates } = body;
                await updateCacheCoords(rmName, updates);
                return res.status(200).json({ success: true });
            } catch (error) {
                return res.status(500).json({ error: 'Update failed' });
            }
        }

        if (action === 'delete-address') {
            try {
                const { rmName, address } = body;
                await deleteAddressFromCache(rmName, address);
                return res.status(200).json({ success: true });
            } catch (error) {
                return res.status(500).json({ error: 'Delete failed' });
            }
        }

        if (action === 'save-snapshot') {
            try {
                await saveSnapshot(body);
                return res.json({ success: true });
            } catch (error) {
                console.error("Snapshot save error:", error);
                return res.status(500).json({ error: (error as Error).message });
            }
        }
    }

    return res.status(400).json({ error: 'Unknown action' });
}
