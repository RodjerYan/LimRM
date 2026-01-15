
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

export const config = {
    maxDuration: 60,
    api: { bodyParser: false }, 
};

// ID папки с чанками (Snapshot Folder)
const FOLDER_ID = '1TTdZZC-BVcQtUGgmeJwlP8GvZt23SR_N';
const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/spreadsheets'];

async function getRawBody(req: VercelRequest): Promise<any> {
    const buffers = [];
    for await (const chunk of req) { buffers.push(chunk); }
    const data = Buffer.concat(buffers).toString('utf8');
    try {
        return JSON.parse(data);
    } catch (e) {
        return { chunk: data };
    }
}

async function getDriveClient() {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is missing');
    const credentials = JSON.parse(serviceAccountKey);
    
    if (credentials.private_key) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
    const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
    return google.drive({ version: 'v3', auth });
}

// --- НОВАЯ ФУНКЦИЯ: АВТОМАТИЧЕСКИЙ ПОИСК И СОРТИРОВКА ФАЙЛОВ ---
async function getSortedFiles(drive: any) {
    const q = `'${FOLDER_ID}' in parents and name contains 'snapshot' and trashed = false`;
    const res = await drive.files.list({ q, fields: "files(id, name)", supportsAllDrives: true, includeItemsFromAllDrives: true });
    const files = res.data.files || [];

    const sortKey = (f: any) => {
        const name = f.name.toLowerCase();
        // Meta file is always first
        if (name === 'snapshot.json') return 0;
        // Extract number from snapshotX.json
        const match = name.match(/snapshot(\d+)\.json/);
        return match ? parseInt(match[1], 10) : 999;
    };

    return files.sort((a: any, b: any) => sortKey(a) - sortKey(b)).map((f: any) => f.id);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=5');
    
    const action = req.query.action as string;
    const chunkIndex = req.query.chunkIndex ? parseInt(req.query.chunkIndex as string, 10) : -1;

    try {
        const drive = await getDriveClient();
        
        // --- SNAPSHOT OPERATIONS (Dynamic File Discovery) ---
        if (action === 'save-chunk' || action === 'save-meta' || action === 'get-snapshot-meta' || action === 'get-snapshot-list') {
            const sortedIds = await getSortedFiles(drive);

            if (req.method === 'POST') {
                const body = await getRawBody(req);
                
                if (action === 'save-chunk') {
                    // Index 0 is meta, so chunk 0 is file index 1
                    const targetId = sortedIds[chunkIndex + 1];
                    if (!targetId) return res.status(400).json({ error: `File for chunk ${chunkIndex} not found in folder` });

                    await drive.files.update({
                        fileId: targetId,
                        media: { mimeType: 'application/json', body: body.chunk },
                        supportsAllDrives: true
                    });
                    return res.status(200).json({ status: 'saved', index: chunkIndex });
                }

                if (action === 'save-meta') {
                    const targetId = sortedIds[0]; // snapshot.json
                    if (!targetId) return res.status(400).json({ error: 'Meta file (snapshot.json) not found in folder' });

                    await drive.files.update({
                        fileId: targetId,
                        media: { mimeType: 'application/json', body: JSON.stringify(body) },
                        supportsAllDrives: true
                    });
                    return res.status(200).json({ status: 'meta_saved' });
                }
            }

            if (req.method === 'GET') {
                if (action === 'get-snapshot-meta') {
                    if (sortedIds.length === 0) return res.status(200).json({ versionHash: 'none' });
                    
                    const file = await drive.files.get({ fileId: sortedIds[0], alt: 'media', supportsAllDrives: true });
                    return res.status(200).json(file.data);
                }

                if (action === 'get-snapshot-list') {
                    if (sortedIds.length === 0) return res.status(200).json([]);

                    try {
                        const metaRes = await drive.files.get({ fileId: sortedIds[0], alt: 'media', supportsAllDrives: true });
                        const meta = metaRes.data as any;
                        
                        if (meta && typeof meta.chunkCount === 'number') {
                            const chunkIds = sortedIds.slice(1, meta.chunkCount + 1);
                            return res.status(200).json(chunkIds.map(id => ({ id })));
                        } else {
                            return res.status(200).json([]);
                        }
                    } catch (e) {
                        return res.status(200).json([]);
                    }
                }
            }
        }

        // --- FILE CONTENT PROXY ---
        if (action === 'get-file-content' && req.method === 'GET') {
            const { fileId } = req.query;
            if (!fileId) return res.status(400).json({ error: 'No fileId' });
            const file = await drive.files.get({ fileId: String(fileId), alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
            file.data.pipe(res);
            return;
        }

        // --- LEGACY CACHE OPERATIONS (Google Sheets) ---
        // Preserving these to ensure map editing functionality remains intact
        if (req.method === 'POST') {
            const body = await getRawBody(req);
            if (action === 'add-to-cache') { const { rmName, rows } = body; await appendToCache(rmName, rows.map((r: any) => [r.address, r.lat||'', r.lon||''])); return res.json({success:true}); }
            if (action === 'update-address') { await updateAddressInCache(body.rmName, body.oldAddress, body.newAddress, body.comment); return res.json({success:true}); }
            if (action === 'update-coords') { await updateCacheCoords(body.rmName, body.updates); return res.json({success:true}); }
            if (action === 'delete-address') { await deleteAddressFromCache(body.rmName, body.address); return res.json({success:true}); }
            if (action === 'init-snapshot') return res.status(200).json({ status: 'ready', folderId: FOLDER_ID });
        }

        if (req.method === 'GET') {
            if (action === 'get-full-cache' || !action) return res.json(await getFullCoordsCache());
            if (action === 'get-cached-address') {
                const { rmName, address } = req.query;
                const cached = await getAddressFromCache(rmName as string, address as string);
                return cached ? res.json(cached) : res.status(404).json({ error: 'Not found' });
            }
        }

        return res.status(400).json({ error: 'Invalid action or method' });
    } catch (error: any) {
        console.error("API Error:", error);
        if (action === 'get-snapshot-meta' && (error.message.includes('Unexpected end of JSON input') || error.code === 404)) {
             return res.status(200).json({ versionHash: 'none' });
        }
        return res.status(500).json({ error: error.message });
    }
}
