
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
    try {
        // List ALL files in folder
        const q = `'${FOLDER_ID}' in parents and trashed = false`;
        const res = await drive.files.list({ 
            q, 
            fields: "files(id, name, mimeType, version)", // Request version
            supportsAllDrives: true, 
            includeItemsFromAllDrives: true,
            pageSize: 1000 
        });
        
        const allFiles = res.data.files || [];
        const filteredFiles = allFiles.filter((f: any) => 
            f.name && f.name.toLowerCase().includes('snapshot') && 
            f.mimeType !== 'application/vnd.google-apps.folder'
        );

        const sortKey = (f: any) => {
            const name = f.name.toLowerCase();
            if (name === 'snapshot.json' || name.includes('system_analytics_snapshot')) return -1;
            const match = name.match(/\d+/);
            return match ? parseInt(match[0], 10) : 9999;
        };

        return filteredFiles.sort((a: any, b: any) => sortKey(a) - sortKey(b)).map((f: any) => ({ 
            id: f.id, 
            name: f.name,
            version: f.version 
        }));
    } catch (e) {
        console.error("Error listing files:", e);
        return [];
    }
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
                let targetFileId = req.query.targetFileId as string;
                const content = typeof body === 'string' ? body : (body.chunk || JSON.stringify(body));

                if (!targetFileId) {
                    const sortedFiles = await getSortedFiles(drive);
                    if (sortedFiles[chunkIndex + 1]) {
                        targetFileId = sortedFiles[chunkIndex + 1].id;
                    }
                }

                if (targetFileId) {
                    const updateRes = await drive.files.update({ 
                        fileId: targetFileId, 
                        media: { mimeType: 'application/json', body: content }, 
                        fields: 'id, version',
                        supportsAllDrives: true 
                    });
                    return res.status(200).json({ status: 'saved', fileId: targetFileId, version: updateRes.data.version });
                } else {
                    if (chunkIndex === -1) {
                        return res.status(400).json({ error: 'Chunk index required for creating new file' });
                    }
                    const fileName = `snapshot_chunk_${chunkIndex}.json`;
                    const createRes = await drive.files.create({
                        requestBody: {
                            name: fileName,
                            parents: [FOLDER_ID],
                            mimeType: 'application/json'
                        },
                        media: {
                            mimeType: 'application/json',
                            body: content
                        },
                        fields: 'id, version',
                        supportsAllDrives: true
                    });
                    return res.status(200).json({ status: 'created', fileId: createRes.data.id, version: createRes.data.version });
                }
            }
            if (action === 'save-meta') {
                const sortedFiles = await getSortedFiles(drive);
                let metaFileId = sortedFiles[0]?.id;
                const content = JSON.stringify(body);

                if (metaFileId) {
                    const updateRes = await drive.files.update({ 
                        fileId: metaFileId, 
                        media: { mimeType: 'application/json', body: content }, 
                        fields: 'id, version',
                        supportsAllDrives: true 
                    });
                    return res.status(200).json({ status: 'meta_saved', fileId: metaFileId, version: updateRes.data.version });
                } else {
                    const createRes = await drive.files.create({
                        requestBody: {
                            name: 'system_analytics_snapshot_meta.json',
                            parents: [FOLDER_ID],
                            mimeType: 'application/json'
                        },
                        media: { mimeType: 'application/json', body: content },
                        fields: 'id, version',
                        supportsAllDrives: true
                    });
                    return res.status(200).json({ status: 'meta_created', fileId: createRes.data.id, version: createRes.data.version });
                }
            }
            
            // Legacy/Other Operations
            if (action === 'cleanup-chunks') {
                const keepCount = parseInt(req.query.keepCount as string, 10);
                if (!isNaN(keepCount)) {
                    const sortedFiles = await getSortedFiles(drive);
                    const filesToDelete = sortedFiles.slice(1).filter((f: any) => {
                         const match = f.name.match(/\d+/);
                         const idx = match ? parseInt(match[0], 10) : -1;
                         return idx >= keepCount;
                    });
                    await Promise.all(filesToDelete.map((f: any) => 
                        drive.files.delete({ fileId: f.id }).catch((e: any) => console.error(`Failed to delete ${f.id}`, e))
                    ));
                    return res.status(200).json({ status: 'cleanup_done', deleted: filesToDelete.length });
                }
                return res.status(400).json({ error: 'Invalid keepCount' });
            }
            if (action === 'add-to-cache') { const { rmName, rows } = body; await appendToCache(rmName, rows.map((r: any) => [r.address, r.lat||'', r.lon||''])); return res.json({success:true}); }
            if (action === 'update-address') { 
                if (!body.rmName) return res.status(400).json({ error: 'RM Name is missing' });
                const result = await updateAddressInCache(body.rmName, body.oldAddress, body.newAddress, body.comment, body.lat, body.lon); 
                return res.json(result); 
            }
            if (action === 'update-coords') { await updateCacheCoords(body.rmName, body.updates); return res.json({success:true}); }
            if (action === 'delete-address') { await deleteAddressFromCache(body.rmName, body.address); return res.json({success:true}); }
        }

        if (req.method === 'GET') {
            if (action === 'get-snapshot-meta') {
                const sortedFiles = await getSortedFiles(drive);
                if (sortedFiles.length === 0) return res.json({ versionHash: 'none' });
                try {
                    const response = await drive.files.get({ fileId: sortedFiles[0].id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
                    const content = JSON.parse(Buffer.from(response.data as any).toString('utf-8'));
                    content.chunkCount = Math.max(0, sortedFiles.length - 1);
                    // Add version to meta response for client tracking
                    content.versionHash = sortedFiles[0].version || content.versionHash;
                    return res.json(content);
                } catch (e: any) {
                    return res.json({ versionHash: 'none', error: e.message });
                }
            }
            if (action === 'get-snapshot-list') {
                const sortedFiles = await getSortedFiles(drive);
                if (sortedFiles.length === 0) return res.json([]);
                try {
                    // Return all chunk files (skipping meta at index 0)
                    const chunkFiles = sortedFiles.slice(1);
                    return res.json(chunkFiles);
                } catch (e) {
                    return res.json([]);
                }
            }
            if (action === 'get-file-content') {
                const fileId = String(req.query.fileId);
                const file = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
                file.data.pipe(res);
                return;
            }
            if (action === 'get-full-cache' || !action) return res.json(await getFullCoordsCache());
            if (action === 'get-cached-address') {
                const { rmName, address } = req.query;
                if (!rmName || !address) return res.status(400).json({ error: 'Missing rmName or address' });
                const cached = await getAddressFromCache(rmName as string, address as string);
                return cached ? res.json(cached) : res.status(404).json({ error: 'Not found' });
            }
        }
        
        return res.status(400).json({ error: 'Invalid action' });
    } catch (error: any) {
        console.error("API Error:", error);
        if (action === 'get-snapshot-meta') return res.status(200).json({ versionHash: 'none' });
        return res.status(500).json({ error: error.message, details: error.stack });
    }
}
