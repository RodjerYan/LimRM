
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

// Updated IDs based on user input
const FOLDER_ID = '1bNcjQp-BhPtgf5azbI5gkkx__eMthCfX'; // Snapshot Folder
const DELTA_FOLDER_ID = '19SNRc4HNKNs35sP7GeYeFj2UPTtWru5P'; // Savepoint (Delta) Folder
const SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'];

async function getDriveClient() {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY missing');
    
    let credentials;
    try {
        const cleanedKey = serviceAccountKey.trim();
        credentials = JSON.parse(cleanedKey);
        // CRITICAL FIX: Sanitize private_key to handle escaped newlines
        if (credentials.private_key) {
            credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        }
    } catch (error) {
        throw new Error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY');
    }

    const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
    return google.drive({ version: 'v3', auth });
}

async function getSortedFiles(drive: any, folderId: string = FOLDER_ID, fileType: 'snapshot' | 'savepoints' | 'all' = 'all') {
    const q = `'${folderId}' in parents and trashed = false`;
    const res = await drive.files.list({ 
        q, 
        fields: "files(id, name, mimeType, size)", 
        supportsAllDrives: true, 
        includeItemsFromAllDrives: true,
        pageSize: 1000 
    });
    const allFiles = res.data.files || [];
    const filteredFiles = allFiles.filter((f: any) => {
        if (!f.name || f.mimeType === 'application/vnd.google-apps.folder') return false;
        const lowerName = f.name.toLowerCase();
        if (fileType === 'all') return lowerName.includes('snapshot') || lowerName.includes('savepoints');
        return lowerName.includes(fileType);
    });
    const sortKey = (f: any) => {
        const name = f.name.toLowerCase();
        if (name === 'snapshot.json' || name.includes('system_analytics_snapshot')) return -1;
        const match = name.match(/\d+/);
        return match ? parseInt(match[0], 10) : 9999;
    };
    return filteredFiles.sort((a: any, b: any) => sortKey(a) - sortKey(b)).map((f: any) => ({ id: f.id, name: f.name, size: f.size ? parseInt(f.size, 10) : 0 }));
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    const iterator = items.entries();
    const workers = Array(concurrency).fill(iterator).map(async (iter) => {
        for (const [index, item] of iter) {
            results[index] = await fn(item);
        }
    });
    await Promise.all(workers);
    return results;
}

export default async function handler(req: Request) {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') as string;
    const chunkIndexStr = url.searchParams.get('chunkIndex');
    const chunkIndex = chunkIndexStr ? parseInt(chunkIndexStr, 10) : -1;

    try {
        const drive = await getDriveClient();

        if (req.method === 'POST') {
            const body = await req.json().catch(() => ({}));
            
            if (action === 'save-delta') {
                const deltaItem = body;
                if (!deltaItem) return new Response(JSON.stringify({ error: 'Missing delta payload' }), { status: 400 });

                const savepointsFiles = await getSortedFiles(drive, DELTA_FOLDER_ID, 'savepoints');
                let targetFile = null;
                let fileContent = { deltas: [] as any[] };
                let nextIndex = 1;

                if (savepointsFiles.length > 0) {
                    const lastFile = savepointsFiles[savepointsFiles.length - 1];
                    const match = lastFile.name.match(/savepoints(\d+)\.json/i);
                    const currentIndex = match ? parseInt(match[1], 10) : 1;
                    nextIndex = currentIndex;
                    const fileSize = lastFile.size;
                    
                    if (fileSize > 100 * 1024) {
                        nextIndex = currentIndex + 1;
                        targetFile = null;
                    } else {
                        try {
                            const fileRes = await drive.files.get({ fileId: lastFile.id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
                            const contentStr = Buffer.from(fileRes.data as any).toString('utf-8');
                            targetFile = lastFile;
                            try { fileContent = JSON.parse(contentStr); } catch (e) { }
                        } catch (e) {
                            nextIndex = currentIndex + 1;
                            targetFile = null; 
                        }
                    }
                }

                if (!fileContent.deltas) fileContent.deltas = [];
                fileContent.deltas.push(deltaItem);
                
                const newContentStr = JSON.stringify(fileContent);
                const fileName = `savepoints${nextIndex}.json`;

                if (targetFile) {
                    await drive.files.update({
                        fileId: targetFile.id,
                        media: { mimeType: 'application/json', body: newContentStr },
                        supportsAllDrives: true
                    });
                    return new Response(JSON.stringify({ status: 'appended', file: fileName }));
                } else {
                    await drive.files.create({
                        requestBody: {
                            name: fileName,
                            parents: [DELTA_FOLDER_ID],
                            mimeType: 'application/json'
                        },
                        media: { mimeType: 'application/json', body: newContentStr },
                        supportsAllDrives: true
                    });
                    return new Response(JSON.stringify({ status: 'created', file: fileName }));
                }
            }

            if (action === 'clear-deltas') {
                const savepointsFiles = await getSortedFiles(drive, DELTA_FOLDER_ID, 'savepoints');
                await mapConcurrent(savepointsFiles, 5, async (f: any) => 
                    drive.files.delete({ fileId: f.id }).catch((e: any) => console.error(`Failed to delete delta ${f.id}`, e))
                );
                return new Response(JSON.stringify({ status: 'deltas_cleared', count: savepointsFiles.length }));
            }

            if (action === 'save-chunk') {
                let targetFileId = url.searchParams.get('targetFileId');
                const content = typeof body === 'string' ? body : (body.chunk || JSON.stringify(body));

                if (!targetFileId) {
                    const sortedFiles = await getSortedFiles(drive, FOLDER_ID, 'snapshot');
                    if (sortedFiles[chunkIndex + 1]) {
                        targetFileId = sortedFiles[chunkIndex + 1].id;
                    }
                }

                if (targetFileId) {
                    await drive.files.update({ 
                        fileId: targetFileId, 
                        media: { mimeType: 'application/json', body: content }, 
                        supportsAllDrives: true 
                    });
                    return new Response(JSON.stringify({ status: 'saved', fileId: targetFileId }));
                } else {
                    if (chunkIndex === -1) return new Response(JSON.stringify({ error: 'Chunk index required' }), { status: 400 });
                    const fileName = `snapshot_chunk_${chunkIndex}.json`;
                    const createRes = await drive.files.create({
                        requestBody: {
                            name: fileName,
                            parents: [FOLDER_ID],
                            mimeType: 'application/json'
                        },
                        media: { mimeType: 'application/json', body: content },
                        supportsAllDrives: true
                    });
                    return new Response(JSON.stringify({ status: 'created', fileId: createRes.data.id }));
                }
            }
            if (action === 'save-meta') {
                const sortedFiles = await getSortedFiles(drive, FOLDER_ID, 'snapshot');
                let metaFileId = sortedFiles[0]?.id;
                const content = JSON.stringify(body);

                if (metaFileId) {
                    await drive.files.update({ 
                        fileId: metaFileId, 
                        media: { mimeType: 'application/json', body: content }, 
                        supportsAllDrives: true 
                    });
                    return new Response(JSON.stringify({ status: 'meta_saved', fileId: metaFileId }));
                } else {
                    const createRes = await drive.files.create({
                        requestBody: { name: 'system_analytics_snapshot_meta.json', parents: [FOLDER_ID], mimeType: 'application/json' },
                        media: { mimeType: 'application/json', body: content },
                        supportsAllDrives: true
                    });
                    return new Response(JSON.stringify({ status: 'meta_created', fileId: createRes.data.id }));
                }
            }
            
            if (action === 'cleanup-chunks') {
                const keepCount = parseInt(url.searchParams.get('keepCount') || '', 10);
                if (!isNaN(keepCount)) {
                    const sortedFiles = await getSortedFiles(drive, FOLDER_ID, 'snapshot');
                    const filesToDelete = sortedFiles.slice(1).filter((f: any) => {
                         const match = f.name.match(/\d+/);
                         const idx = match ? parseInt(match[0], 10) : -1;
                         return idx >= keepCount;
                    });
                    await mapConcurrent(filesToDelete, 5, async (f: any) => 
                        drive.files.delete({ fileId: f.id }).catch((e: any) => console.error(`Failed to delete ${f.id}`, e))
                    );
                    return new Response(JSON.stringify({ status: 'cleanup_done', deleted: filesToDelete.length }));
                }
                return new Response(JSON.stringify({ error: 'Invalid keepCount' }), { status: 400 });
            }

            if (action === 'add-to-cache') { const { rmName, rows } = body; await appendToCache(rmName, rows.map((r: any) => [r.address, r.lat||'', r.lon||''])); return new Response(JSON.stringify({success:true})); }
            
            if (action === 'update-address') { 
                if (!body.rmName) return new Response(JSON.stringify({ error: 'RM Name is missing' }), { status: 400 });
                const result = await updateAddressInCache(body.rmName, body.oldAddress, body.newAddress, body.comment, body.lat, body.lon, body.skipHistory); 
                return new Response(JSON.stringify(result)); 
            }
            
            if (action === 'update-coords') { await updateCacheCoords(body.rmName, body.updates); return new Response(JSON.stringify({success:true})); }
            if (action === 'delete-address') { await deleteAddressFromCache(body.rmName, body.address); return new Response(JSON.stringify({success:true})); }
        }

        if (req.method === 'GET') {
            if (action === 'get-deltas') {
                const savepointsFiles = await getSortedFiles(drive, DELTA_FOLDER_ID, 'savepoints');
                const filesToProcess = savepointsFiles.filter((f: any) => f.size > 0);
                
                const downloadFn = async (file: any) => {
                    return drive.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' })
                        .then(res => {
                            try {
                                const content = JSON.parse(Buffer.from(res.data as any).toString('utf-8'));
                                return Array.isArray(content.deltas) ? content.deltas : [];
                            } catch (e) { return []; }
                        })
                        .catch(e => { return []; });
                };

                const results = await mapConcurrent(filesToProcess, 8, downloadFn);
                const allDeltas = results.flat();
                return new Response(JSON.stringify(allDeltas));
            }

            if (action === 'get-snapshot-meta') {
                const sortedFiles = await getSortedFiles(drive, FOLDER_ID, 'snapshot');
                if (sortedFiles.length === 0) return new Response(JSON.stringify({ versionHash: 'none' }));
                if (sortedFiles[0].id === FOLDER_ID) return new Response(JSON.stringify({ versionHash: 'none', error: 'Misconfiguration' }));
                
                try {
                    const response = await drive.files.get({ fileId: sortedFiles[0].id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
                    const content = JSON.parse(Buffer.from(response.data as any).toString('utf-8'));
                    content.chunkCount = Math.max(0, sortedFiles.length - 1);
                    return new Response(JSON.stringify(content));
                } catch (e: any) {
                    return new Response(JSON.stringify({ versionHash: 'none', error: e.message }));
                }
            }
            if (action === 'get-snapshot-list') {
                const sortedFiles = await getSortedFiles(drive, FOLDER_ID, 'snapshot');
                const relevantFiles = sortedFiles.filter((f: any, index: number) => {
                    if (index === 0) return true; 
                    return f.size > 2048; 
                });
                return new Response(JSON.stringify(relevantFiles));
            }
            if (action === 'get-file-content') {
                const fileId = url.searchParams.get('fileId');
                if (!fileId) return new Response('File ID required', { status: 400 });
                const file = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
                
                // Return as stream
                return new Response(file.data as any);
            }

            if (action === 'get-full-cache' || !action) return new Response(JSON.stringify(await getFullCoordsCache()));
            if (action === 'get-cached-address') {
                const rmName = url.searchParams.get('rmName');
                const address = url.searchParams.get('address');
                if (!rmName || !address) return new Response(JSON.stringify({ error: 'Missing rmName or address' }), { status: 400 });
                const cached = await getAddressFromCache(rmName, address);
                return new Response(JSON.stringify(cached || null));
            }
        }
        
        return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
    } catch (error: any) {
        console.error("API Error:", error);
        if (action === 'get-snapshot-meta') return new Response(JSON.stringify({ versionHash: 'none' }));
        return new Response(JSON.stringify({ error: error.message, details: error.stack }), { status: 500 });
    }
}
