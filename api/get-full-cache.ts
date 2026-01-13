
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    getFullCoordsCache, 
    getAddressFromCache, 
    appendToCache, 
    deleteAddressFromCache, 
    updateAddressInCache, 
    updateCacheCoords,
    getGoogleSheetsClient,
    getSnapshotMetaDrive,
    getSnapshotDrive,
    initSnapshotDrive,
    appendSnapshotDrive,
    saveSnapshotMetaDrive
} from './_lib/sheets.js';

export const config = {
    maxDuration: 60,
    api: { bodyParser: false },
};

async function getRawBody(req: VercelRequest): Promise<Buffer> {
    const buffers = [];
    for await (const chunk of req) { buffers.push(chunk); }
    return Buffer.concat(buffers);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=5');
    const action = req.query.action as string;

    try {
        // --- SECURITY CHECK FOR MUTATIONS ---
        if (req.method === 'POST') {
            const apiKey = req.headers['x-api-key'];
            if (process.env.API_SECRET_KEY && apiKey !== process.env.API_SECRET_KEY) {
                return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
            }
        }

        if (req.method === 'GET') {
            if (action === 'get-snapshot-meta') {
                const meta = await getSnapshotMetaDrive();
                return res.json(meta);
            }

            if (action === 'get-snapshot') {
                const snapshot = await getSnapshotDrive();
                if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
                return res.json({ data: snapshot });
            }
            
            if (action === 'get-full-cache' || !action) return res.json(await getFullCoordsCache());
            if (action === 'get-cached-address') {
                const { rmName, address } = req.query;
                const cached = await getAddressFromCache(rmName as string, address as string);
                return cached ? res.json(cached) : res.status(404).json({ error: 'Not found' });
            }
        }

        if (req.method === 'POST') {
            let body: any;
            try {
                const raw = await getRawBody(req);
                if (raw.length > 0) body = JSON.parse(raw.toString('utf8'));
            } catch (e) { }

            if (action === 'init-snapshot') {
                await initSnapshotDrive();
                return res.json({ success: true });
            }

            if (action === 'append-snapshot') {
                const { chunk, partIndex } = body; 
                if (!chunk) return res.status(400).json({ error: 'No chunk' });
                // We default partIndex to 0 if missing, but it should be provided by client
                const fileId = await appendSnapshotDrive(chunk, partIndex ?? 0);
                return res.json({ success: true, fileId });
            }

            if (action === 'save-meta') {
                await saveSnapshotMetaDrive(body);
                return res.json({ success: true });
            }

            if (action === 'add-to-cache') { const { rmName, rows } = body; await appendToCache(rmName, rows.map((r: any) => [r.address, r.lat||'', r.lon||''])); return res.json({success:true}); }
            if (action === 'update-address') { await updateAddressInCache(body.rmName, body.oldAddress, body.newAddress, body.comment); return res.json({success:true}); }
            if (action === 'update-coords') { await updateCacheCoords(body.rmName, body.updates); return res.json({success:true}); }
            if (action === 'delete-address') { await deleteAddressFromCache(body.rmName, body.address); return res.json({success:true}); }
        }

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: (error as Error).message });
    }
    return res.status(400).json({ error: 'Invalid action' });
}
