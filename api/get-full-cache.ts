
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

const FOLDER_ID = '1TTdZZC-BVcQtUGgmeJwlP8GvZt23SR_N';
const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/spreadsheets'];

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
    const q = `'${FOLDER_ID}' in parents and name contains 'snapshot' and trashed = false`;
    const res = await drive.files.list({ 
        q, 
        fields: "files(id, name)", 
        supportsAllDrives: true, 
        includeItemsFromAllDrives: true 
    });
    
    const files = res.data.files || [];
    const sortKey = (f: any) => {
        const name = f.name.toLowerCase();
        if (name === 'snapshot.json') return 0;
        const num = name.replace(/[^0-9]/g, '');
        return num ? parseInt(num, 10) : 999;
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
                if (sortedIds[chunkIndex + 1]) {
                    await drive.files.update({ fileId: sortedIds[chunkIndex + 1], media: { mimeType: 'application/json', body: body.chunk }, supportsAllDrives: true });
                    return res.status(200).json({ status: 'saved' });
                }
                return res.status(404).json({ error: 'Chunk file not found' });
            }
            if (action === 'save-meta') {
                const sortedIds = await getSortedFiles(drive);
                if (sortedIds[0]) {
                    await drive.files.update({ fileId: sortedIds[0], media: { mimeType: 'application/json', body: JSON.stringify(body) }, supportsAllDrives: true });
                    return res.status(200).json({ status: 'meta_saved' });
                }
                return res.status(404).json({ error: 'Meta file not found' });
            }

            // Legacy Cache Operations (Preserved for functionality)
            if (action === 'add-to-cache') { const { rmName, rows } = body; await appendToCache(rmName, rows.map((r: any) => [r.address, r.lat||'', r.lon||''])); return res.json({success:true}); }
            if (action === 'update-address') { await updateAddressInCache(body.rmName, body.oldAddress, body.newAddress, body.comment); return res.json({success:true}); }
            if (action === 'update-coords') { await updateCacheCoords(body.rmName, body.updates); return res.json({success:true}); }
            if (action === 'delete-address') { await deleteAddressFromCache(body.rmName, body.address); return res.json({success:true}); }
        }

        if (req.method === 'GET') {
            // Snapshot Operations
            if (action === 'get-snapshot-meta') {
                const sortedIds = await getSortedFiles(drive);
                if (sortedIds.length === 0) return res.json({ versionHash: 'none' });
                const file = await drive.files.get({ fileId: sortedIds[0], alt: 'media', supportsAllDrives: true });
                const content = typeof file.data === 'string' ? JSON.parse(file.data) : file.data;
                return res.json(content);
            }
            if (action === 'get-snapshot-list') {
                const sortedIds = await getSortedFiles(drive);
                if (sortedIds.length === 0) return res.json([]);
                const metaFile = await drive.files.get({ fileId: sortedIds[0], alt: 'media', supportsAllDrives: true });
                const meta = typeof metaFile.data === 'string' ? JSON.parse(metaFile.data) : metaFile.data;
                if (meta && meta.chunkCount) {
                    return res.json(sortedIds.slice(1, meta.chunkCount + 1).map((id: string) => ({ id })));
                }
                return res.json([]);
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
