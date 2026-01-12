
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
    initSnapshot,
    appendSnapshot,
    getGoogleDriveClient
} from './_lib/sheets.js';

export const config = {
    maxDuration: 60,
    api: {
        bodyParser: false,
    },
};

const SNAPSHOT_FILENAME = 'system_analytics_snapshot_v1.json';
const ROOT_FOLDERS: Record<string, string> = {
    '2025': '1uJX1deU3Xo29cGeaUsepvMdmDosCN-7u',
};

async function getRawBody(req: VercelRequest): Promise<Buffer> {
    const buffers = [];
    for await (const chunk of req) {
        buffers.push(chunk);
    }
    return Buffer.concat(buffers);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // FIX: Используем stale-while-revalidate.
    // s-maxage=10: Vercel считает данные свежими 10 секунд.
    // stale-while-revalidate=59: В течение 59 секунд Vercel может отдать старые данные, 
    // но в фоне запустит обновление. Это спасает от лимитов Google API.
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=59');

    const action = req.query.action as string;

    if (req.method === 'GET') {
        if (action === 'get-full-cache' || !action) {
            try {
                const cacheData = await getFullCoordsCache();
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
                return res.json(snapshot);
            } catch (error) {
                return res.status(500).json({ error: (error as Error).message });
            }
        }

        // NEW: Lightweight check for snapshot version
        if (action === 'get-snapshot-meta') {
            try {
                const drive = await getGoogleDriveClient();
                const folderId = ROOT_FOLDERS['2025'];
                const listRes = await drive.files.list({
                    q: `name = '${SNAPSHOT_FILENAME}' and '${folderId}' in parents and trashed = false`,
                    fields: 'files(id, modifiedTime, size)',
                    pageSize: 1
                });
                
                const file = listRes.data.files?.[0];
                if (!file) return res.status(200).json({ version: 'none' });

                return res.status(200).json({
                    id: file.id,
                    modifiedTime: file.modifiedTime,
                    size: file.size,
                    versionHash: `${file.modifiedTime}_${file.size}`
                });
            } catch (error) {
                console.error("Snapshot meta check failed:", error);
                // Return 'none' instead of 500 to allow fallback logic in frontend
                return res.status(200).json({ version: 'none', error: (error as Error).message });
            }
        }
    }

    if (req.method === 'POST') {
        let body: any;
        
        if (action === 'init-snapshot') {
            try {
                await initSnapshot();
                return res.json({ success: true, message: 'Snapshot initialized (cleared)' });
            } catch (error) {
                console.error("Snapshot init error:", error);
                return res.status(500).json({ error: (error as Error).message });
            }
        }

        try {
            const raw = await getRawBody(req);
            if (raw.length > 0) body = JSON.parse(raw.toString('utf8'));
        } catch (e) {
            return res.status(400).json({ error: 'Invalid JSON body' });
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

        if (action === 'append-snapshot') {
            try {
                const { chunk } = body;
                if (!chunk) return res.status(400).json({ error: 'Missing chunk data' });
                await appendSnapshot(chunk);
                return res.json({ success: true });
            } catch (error) {
                console.error("Snapshot append error:", error);
                return res.status(500).json({ error: (error as Error).message });
            }
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
    }

    return res.status(400).json({ error: 'Unknown action' });
}
