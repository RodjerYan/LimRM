
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
const FOLDER_ID = '1pZebU-HglA8mTSFizHnp87vNMUQ-70iZ';

// CRITICAL FIX: Changed scope from 'drive.file' (only files created by this app) 
// to 'drive' (full access) so it can see files created by the Python script or user manually.
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
    // CRITICAL FIX: Explicitly exclude folders (mimeType != 'application/vnd.google-apps.folder')
    // This prevents the API from returning the parent folder itself if its name contains 'snapshot',
    // which causes the "Only files with binary content can be downloaded" error.
    const q = `'${FOLDER_ID}' in parents and name contains 'snapshot' and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
    
    const res = await drive.files.list({ 
        q, 
        fields: "files(id, name, mimeType)", 
        supportsAllDrives: true, 
        includeItemsFromAllDrives: true,
        pageSize: 1000 
    });
    
    const files = res.data.files || [];
    
    // DEBUG LOG: Check Vercel logs to see how many files are actually visible
    console.log(`[getSortedFiles] Found ${files.length} valid files (excluding folders) in ${FOLDER_ID}`);
    
    const sortKey = (f: any) => {
        const name = f.name.toLowerCase();
        // Meta file (snapshot.json) must be first (index 0)
        if (name === 'snapshot.json' || name.includes('system_analytics_snapshot')) return -1;
        
        // Extract ANY number for sorting: snapshot1.json, snapshot_chunk_0.json...
        const match = name.match(/\d+/);
        return match ? parseInt(match[0], 10) : 9999;
    };
    return files.sort((a: any, b: any) => sortKey(a) - sortKey(b)).map((f: any) => f.id);
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
                const sortedIds = await getSortedFiles(drive);
                // Ensure we have a slot for this chunk
                if (sortedIds[chunkIndex + 1]) {
                    const content = typeof body === 'string' ? body : (body.chunk || JSON.stringify(body));
                    
                    await drive.files.update({ 
                        fileId: sortedIds[chunkIndex + 1], 
                        media: { mimeType: 'application/json', body: content }, 
                        supportsAllDrives: true 
                    });
                    return res.status(200).json({ status: 'saved' });
                }
                return res.status(404).json({ error: 'Chunk file not found. Ensure snapshot files exist in Drive folder.' });
            }
            if (action === 'save-meta') {
                const sortedIds = await getSortedFiles(drive);
                if (sortedIds[0]) {
                    await drive.files.update({ 
                        fileId: sortedIds[0], 
                        media: { mimeType: 'application/json', body: JSON.stringify(body) }, 
                        supportsAllDrives: true 
                    });
                    return res.status(200).json({ status: 'meta_saved' });
                }
                return res.status(404).json({ error: 'Meta file not found in Drive folder.' });
            }

            // Legacy Cache Operations
            if (action === 'add-to-cache') { const { rmName, rows } = body; await appendToCache(rmName, rows.map((r: any) => [r.address, r.lat||'', r.lon||''])); return res.json({success:true}); }
            if (action === 'update-address') { await updateAddressInCache(body.rmName, body.oldAddress, body.newAddress, body.comment); return res.json({success:true}); }
            if (action === 'update-coords') { await updateCacheCoords(body.rmName, body.updates); return res.json({success:true}); }
            if (action === 'delete-address') { await deleteAddressFromCache(body.rmName, body.address); return res.json({success:true}); }
        }

        if (req.method === 'GET') {
            // Snapshot Operations
            if (action === 'get-snapshot-meta') {
                const sortedIds = await getSortedFiles(drive);
                
                if (sortedIds.length === 0) {
                    console.log("Папка пуста или файлы не найдены (filtered by mimeType)");
                    return res.json({ versionHash: 'none' });
                }

                // Защита от системных ошибок
                if (sortedIds[0] === FOLDER_ID) {
                    return res.json({ versionHash: 'none', error: 'System misconfiguration: Folder ID matched as file.' });
                }
                
                try {
                    console.log(`[get-snapshot-meta] Attempting to download metadata file ID: ${sortedIds[0]}`);
                    
                    const response = await drive.files.get(
                        { fileId: sortedIds[0], alt: 'media', supportsAllDrives: true },
                        { responseType: 'arraybuffer' }
                    );

                    let content;
                    const strData = Buffer.from(response.data as any).toString('utf-8');
                    content = JSON.parse(strData);
                    
                    // Auto-correct chunkCount based on actual files found in folder
                    const actualChunksFound = Math.max(0, sortedIds.length - 1);
                    content.chunkCount = actualChunksFound;
                    
                    console.log(`[get-snapshot-meta] Success. Version: ${content.versionHash}, Chunks: ${actualChunksFound}`);
                    return res.json(content);
                } catch (e: any) {
                    console.error("Snapshot JSON download/parse error:", e.message);
                    return res.json({ 
                        versionHash: 'none', 
                        error: e.message,
                        debug_id: sortedIds[0] 
                    });
                }
            }
            if (action === 'get-snapshot-list') {
                const sortedIds = await getSortedFiles(drive);
                if (sortedIds.length === 0) return res.json([]);
                
                // Return all found snapshot files (excluding meta at index 0)
                const chunkFiles = sortedIds.slice(1);
                return res.json(chunkFiles.map((id: string) => ({ id })));
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
