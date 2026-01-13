
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    getFullCoordsCache, 
    getAddressFromCache, 
    appendToCache, 
    deleteAddressFromCache, 
    updateAddressInCache, 
    updateCacheCoords,
    getGoogleSheetsClient,
    initSnapshotDrive,
    appendSnapshotDrive,
    saveSnapshotMetaDrive,
    getSnapshotDrive
} from './_lib/sheets.js';

// Allow larger payloads (20mb) and longer execution time (5 min) for the snapshot upload
export const config = {
    maxDuration: 300, 
    api: { bodyParser: { sizeLimit: '20mb' } },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=5');
    const action = req.query.action as string;

    try {
        if (req.method === 'GET') {
            if (action === 'get-snapshot-meta') {
                const meta = await import('./_lib/sheets.js').then(m => m.getSnapshotMetaDrive());
                return res.json(meta);
            }

            if (action === 'get-snapshot') {
                const data = await getSnapshotDrive();
                if (!data) return res.status(404).json({ error: 'Snapshot not found' });
                return res.json(data);
            }
            
            // --- Legacy GET methods ---
            if (action === 'get-full-cache' || !action) return res.json(await getFullCoordsCache());
            if (action === 'get-cached-address') {
                const { rmName, address } = req.query;
                const cached = await getAddressFromCache(rmName as string, address as string);
                return cached ? res.json(cached) : res.status(404).json({ error: 'Not found' });
            }
        }

        if (req.method === 'POST') {
            const body = req.body;

            // --- DRIVE SNAPSHOT UPLOAD (CHUNKED) ---
            
            if (action === 'init-snapshot') {
                await initSnapshotDrive();
                return res.json({ success: true });
            }

            if (action === 'append-snapshot') {
                const { chunk, partIndex } = body;
                if (!chunk || partIndex === undefined) return res.status(400).json({ error: 'Invalid chunk data' });
                const fileId = await appendSnapshotDrive(chunk, partIndex);
                return res.json({ success: true, fileId });
            }

            // Note: Saving meta (version hash) is usually done by the client calling a separate endpoint 
            // OR the last chunk could include it. But since we use useCloudSync, we'll likely save a final meta file.
            // Let's add an explicit endpoint for meta saving if needed, or rely on client to manage flow.
            // For now, let's assume the useCloudSync will upload a meta.json at the end.
            
            // Actually, `useCloudSync` logic implies we might need a `save-snapshot-meta` action.
            if (action === 'save-snapshot-meta') {
                 const { meta } = body;
                 await saveSnapshotMetaDrive(meta);
                 return res.json({ success: true });
            }


            // --- Legacy POST methods ---
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
