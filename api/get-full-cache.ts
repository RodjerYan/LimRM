
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { Buffer } from 'buffer';
import { 
    getFullCoordsCache, 
    getAddressFromCache, 
    appendToCache, 
    deleteAddressFromCache, 
    updateAddressInCache, 
    updateCacheCoords 
} from './_lib/sheets.js';

export const config = { maxDuration: 60, api: { bodyParser: false } };

// FIXED: Correct Folder ID from the URL provided by user
const FOLDER_ID = '1bNcjQp-BhPtgf5azbI5gkkx__eMthCfX';

// CRITICAL FIX: Changed scope from 'drive.file' to 'drive' (full access)
const SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'];

async function getRawBody(req: VercelRequest): Promise<any> {
    const buffers = [];
    for await (const chunk of req) { buffers.push(chunk); }
    const data = Buffer.concat(buffers).toString('utf8');
    try { return JSON.parse(data); } catch (e) { return { chunk: data }; }
}

async function getDriveClient() {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY missing');
    const credentials = JSON.parse(serviceAccountKey);
    if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
    return google.drive({ version: 'v3', auth });
}

async function getSortedFiles(drive: any) {
    // 1. Log Auth Info
    try {
        const authInfo = await drive.about.get({ fields: 'user' });
        console.log(`[AUTH] Bot email: ${authInfo.data.user.emailAddress}`);
    } catch (e) {
        console.log("[AUTH] Failed to get bot email");
    }

    // 2. List ALL files in folder (avoiding 'name contains' filter to bypass index lag)
    const q = `'${FOLDER_ID}' in parents and trashed = false`;
    
    const res = await drive.files.list({ 
        q, 
        fields: "files(id, name, mimeType)", 
        supportsAllDrives: true, 
        includeItemsFromAllDrives: true,
        pageSize: 1000 
    });
    
    const allFiles = res.data.files || [];
    console.log(`[DEBUG] Total objects in folder: ${allFiles.length}`);

    // 3. Filter in memory
    const filteredFiles = allFiles.filter((f: any) => 
        f.name && f.name.toLowerCase().includes('snapshot') && 
        f.mimeType !== 'application/vnd.google-apps.folder'
    );

    console.log(`[FILTER] Snapshot files found: ${filteredFiles.length}`);

    const sortKey = (f: any) => {
        const name = f.name.toLowerCase();
        if (name === 'snapshot.json' || name.includes('system_analytics_snapshot')) return -1;
        const match = name.match(/\d+/);
        return match ? parseInt(match[0], 10) : 9999;
    };

    // Return objects with id and name instead of just ID strings
    return filteredFiles.sort((a: any, b: any) => sortKey(a) - sortKey(b)).map((f: any) => ({ id: f.id, name: f.name }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=5');
    const action = req.query.action as string;
    const chunkIndex = req.query.chunkIndex ? parseInt(req.query.chunkIndex as string, 10) : -1;

    try {
        const drive = await getDriveClient();

        if (req.method === 'POST') {
            const body = await getRawBody(req);
            
            // Snapshot Operations
            if (action === 'save-chunk') {
                const sortedFiles = await getSortedFiles(drive);
                if (sortedFiles[chunkIndex + 1]) {
                    const content = typeof body === 'string' ? body : (body.chunk || JSON.stringify(body));
                    await drive.files.update({ 
                        fileId: sortedFiles[chunkIndex + 1].id, 
                        media: { mimeType: 'application/json', body: content }, 
                        supportsAllDrives: true 
                    });
                    return res.status(200).json({ status: 'saved' });
                }
                return res.status(404).json({ error: 'Chunk file slot not found.' });
            }
            if (action === 'save-meta') {
                const sortedFiles = await getSortedFiles(drive);
                if (sortedFiles[0]) {
                    await drive.files.update({ 
                        fileId: sortedFiles[0].id, 
                        media: { mimeType: 'application/json', body: JSON.stringify(body) }, 
                        supportsAllDrives: true 
                    });
                    return res.status(200).json({ status: 'meta_saved' });
                }
                return res.status(404).json({ error: 'Meta file slot not found.' });
            }

            // Legacy Cache Operations
            if (action === 'add-to-cache') { const { rmName, rows } = body; await appendToCache(rmName, rows.map((r: any) => [r.address, r.lat||'', r.lon||''])); return res.json({success:true}); }
            if (action === 'update-address') { 
                // Enhanced update: allows updating address, comment, and coords in one atomic operation
                await updateAddressInCache(body.rmName, body.oldAddress, body.newAddress, body.comment, body.lat, body.lon); 
                return res.json({success:true}); 
            }
            if (action === 'update-coords') { await updateCacheCoords(body.rmName, body.updates); return res.json({success:true}); }
            if (action === 'delete-address') { await deleteAddressFromCache(body.rmName, body.address); return res.json({success:true}); }
        }

        if (req.method === 'GET') {
            // Snapshot Operations
            if (action === 'get-snapshot-meta') {
                const sortedFiles = await getSortedFiles(drive);
                if (sortedFiles.length === 0) return res.json({ versionHash: 'none' });
                if (sortedFiles[0].id === FOLDER_ID) return res.json({ versionHash: 'none', error: 'Misconfiguration' });
                
                try {
                    console.log(`[get-snapshot-meta] Downloading meta ID: ${sortedFiles[0].id}`);
                    const response = await drive.files.get({ fileId: sortedFiles[0].id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
                    const content = JSON.parse(Buffer.from(response.data as any).toString('utf-8'));
                    
                    // Auto-correct chunkCount
                    const actualChunksFound = Math.max(0, sortedFiles.length - 1);
                    content.chunkCount = actualChunksFound;
                    
                    return res.json(content);
                } catch (e: any) {
                    console.error("Meta download error:", e.message);
                    return res.json({ versionHash: 'none', error: e.message });
                }
            }
            if (action === 'get-snapshot-list') {
                const sortedFiles = await getSortedFiles(drive);
                if (sortedFiles.length === 0) return res.json([]);

                try {
                    const metaRes = await drive.files.get({ fileId: sortedFiles[0].id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
                    const meta = JSON.parse(Buffer.from(metaRes.data as any).toString('utf-8'));
                    const activeChunkCount = meta.chunkCount || (sortedFiles.length - 1);
                    
                    // Get specifically required chunks
                    const chunkFiles = sortedFiles.slice(1, activeChunkCount + 1);
                    // Now returning full objects with {id, name} so frontend can sort
                    return res.json(chunkFiles);
                } catch (e) {
                    // Fallback
                    const chunkFiles = sortedFiles.slice(1);
                    return res.json(chunkFiles);
                }
            }
            if (action === 'get-file-content') {
                const fileId = String(req.query.fileId);
                const file = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
                file.data.pipe(res);
                return;
            }

            // Legacy Cache Operations
            if (action === 'get-full-cache' || !action) return res.json(await getFullCoordsCache());
            if (action === 'get-cached-address') {
                const { rmName, address } = req.query;
                const cached = await getAddressFromCache(rmName as string, address as string);
                return cached ? res.json(cached) : res.status(404).json({ error: 'Not found' });
            }
        }
        
        return res.status(400).json({ error: 'Invalid action' });
    } catch (error: any) {
        console.error("API Error:", error);
        if (action === 'get-snapshot-meta') return res.status(200).json({ versionHash: 'none' });
        return res.status(500).json({ error: error.message });
    }
}
