
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

// Configuration via Environment Variables
const FOLDER_ID = process.env.GOOGLE_DRIVE_SNAPSHOT_FOLDER_ID || '1bNcjQp-BhPtgf5azbI5gkkx__eMthCfX';
const DELTA_FOLDER_ID = process.env.GOOGLE_DRIVE_DELTA_FOLDER_ID || '19SNRc4HNKNs35sP7GeYeFj2UPTtWru5P';

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

async function getSortedFiles(drive: any, folderId: string = FOLDER_ID, fileType: 'snapshot' | 'savepoints' | 'all' = 'all') {
    const q = `'${folderId}' in parents and trashed = false`;
    
    // Request 'size' field from Google Drive to enable filtering
    const res = await drive.files.list({ 
        q, 
        fields: "files(id, name, mimeType, size)", 
        supportsAllDrives: true, 
        includeItemsFromAllDrives: true,
        pageSize: 1000 
    });
    
    const allFiles = res.data.files || [];
    
    const filteredFiles = allFiles.filter((f: any) => {
        if (!f.name || f.mimeType === 'application/vnd.google-apps.folder') {
            return false;
        }
        
        const lowerName = f.name.toLowerCase();
        
        if (fileType === 'all') {
            return lowerName.includes('snapshot') || lowerName.includes('savepoints');
        }
        
        return lowerName.includes(fileType);
    });

    const sortKey = (f: any) => {
        const name = f.name.toLowerCase();
        if (name === 'snapshot.json' || name.includes('system_analytics_snapshot')) return -1;
        const match = name.match(/\d+/);
        return match ? parseInt(match[0], 10) : 9999;
    };

    return filteredFiles.sort((a: any, b: any) => sortKey(a) - sortKey(b)).map((f: any) => ({ 
        id: f.id, 
        name: f.name, 
        size: f.size ? parseInt(f.size, 10) : 0 
    }));
}

// Concurrency Limiter Helper
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=5');
    const action = req.query.action as string;
    const chunkIndex = req.query.chunkIndex ? parseInt(req.query.chunkIndex as string, 10) : -1;

    try {
        const drive = await getDriveClient();

        if (req.method === 'POST') {
            const body = await getRawBody(req);
            
            // --- Save Delta Logic ---
            if (action === 'save-delta') {
                const deltaItem = body; // Expecting { type: 'update'|'delete', key, payload... }
                if (!deltaItem) return res.status(400).json({ error: 'Missing delta payload' });

                // 1. Get existing savepoints files (Corrected to search only for savepoints)
                const savepointsFiles = await getSortedFiles(drive, DELTA_FOLDER_ID, 'savepoints');
                let targetFile = null;
                let fileContent = { deltas: [] as any[] };
                let nextIndex = 1;

                if (savepointsFiles.length > 0) {
                    const lastFile = savepointsFiles[savepointsFiles.length - 1];
                    const match = lastFile.name.match(/savepoints(\d+)\.json/i);
                    const currentIndex = match ? parseInt(match[1], 10) : 1;
                    nextIndex = currentIndex;

                    // Optimization: Check size metadata first to avoid downloading large files
                    const fileSize = lastFile.size;
                    
                    // Rule: If file > 100KB, rotate to next immediately without download
                    if (fileSize > 100 * 1024) {
                        nextIndex = currentIndex + 1;
                        targetFile = null; // Create new
                    } else {
                        // Download to append
                        try {
                            const fileRes = await drive.files.get({ fileId: lastFile.id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
                            const contentStr = Buffer.from(fileRes.data as any).toString('utf-8');
                            
                            targetFile = lastFile;
                            try { fileContent = JSON.parse(contentStr); } catch (e) { /* ignore corrupt, start fresh */ }
                        } catch (e) {
                            // Error reading? Start new file.
                            nextIndex = currentIndex + 1;
                            targetFile = null; 
                        }
                    }
                }

                // 2. Append Delta
                if (!fileContent.deltas) fileContent.deltas = [];
                fileContent.deltas.push(deltaItem);
                
                const newContentStr = JSON.stringify(fileContent);
                const fileName = `savepoints${nextIndex}.json`;

                // 3. Write Back
                if (targetFile) {
                    await drive.files.update({
                        fileId: targetFile.id,
                        media: { mimeType: 'application/json', body: newContentStr },
                        supportsAllDrives: true
                    });
                    return res.json({ status: 'appended', file: fileName });
                } else {
                    const createRes = await drive.files.create({
                        requestBody: {
                            name: fileName,
                            parents: [DELTA_FOLDER_ID],
                            mimeType: 'application/json'
                        },
                        media: { mimeType: 'application/json', body: newContentStr },
                        supportsAllDrives: true
                    });
                    return res.json({ status: 'created', file: fileName });
                }
            }

            // --- SQUASH: Clear Deltas ---
            if (action === 'clear-deltas') {
                // Corrected to search only for savepoints
                const savepointsFiles = await getSortedFiles(drive, DELTA_FOLDER_ID, 'savepoints');
                console.log(`[SQUASH] Deleting ${savepointsFiles.length} delta files...`);
                
                // Delete all savepoints files (with concurrency limit for safety)
                await mapConcurrent(savepointsFiles, 5, async (f: any) => 
                    drive.files.delete({ fileId: f.id }).catch((e: any) => console.error(`Failed to delete delta ${f.id}`, e))
                );
                
                return res.json({ status: 'deltas_cleared', count: savepointsFiles.length });
            }

            // Snapshot Operations
            if (action === 'save-chunk') {
                let targetFileId = req.query.targetFileId as string;
                const content = typeof body === 'string' ? body : (body.chunk || JSON.stringify(body));

                // Fallback to legacy index-based search if ID not provided
                if (!targetFileId) {
                    // Corrected to search only for snapshots
                    const sortedFiles = await getSortedFiles(drive, FOLDER_ID, 'snapshot');
                    // sortedFiles[0] is meta, so index + 1
                    if (sortedFiles[chunkIndex + 1]) {
                        targetFileId = sortedFiles[chunkIndex + 1].id;
                    }
                }

                if (targetFileId) {
                    // UPDATE existing file
                    await drive.files.update({ 
                        fileId: targetFileId, 
                        media: { mimeType: 'application/json', body: content }, 
                        supportsAllDrives: true 
                    });
                    return res.status(200).json({ status: 'saved', fileId: targetFileId });
                } else {
                    // CREATE new file if not found
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
                        supportsAllDrives: true
                    });
                    return res.status(200).json({ status: 'created', fileId: createRes.data.id });
                }
            }
            if (action === 'save-meta') {
                // Corrected to search only for snapshots
                const sortedFiles = await getSortedFiles(drive, FOLDER_ID, 'snapshot');
                let metaFileId = sortedFiles[0]?.id;
                const content = JSON.stringify(body);

                if (metaFileId) {
                    await drive.files.update({ 
                        fileId: metaFileId, 
                        media: { mimeType: 'application/json', body: content }, 
                        supportsAllDrives: true 
                    });
                    return res.status(200).json({ status: 'meta_saved', fileId: metaFileId });
                } else {
                    // Create Meta file if missing
                    const createRes = await drive.files.create({
                        requestBody: {
                            name: 'system_analytics_snapshot_meta.json', // Special name for sorting first
                            parents: [FOLDER_ID],
                            mimeType: 'application/json'
                        },
                        media: { mimeType: 'application/json', body: content },
                        supportsAllDrives: true
                    });
                    return res.status(200).json({ status: 'meta_created', fileId: createRes.data.id });
                }
            }
            
            // NEW: Cleanup old/unused chunks
            if (action === 'cleanup-chunks') {
                const keepCount = parseInt(req.query.keepCount as string, 10);
                if (!isNaN(keepCount)) {
                    // Corrected to search only for snapshots
                    const sortedFiles = await getSortedFiles(drive, FOLDER_ID, 'snapshot');
                    // sortedFiles[0] is meta. Chunks start at 1.
                    // If keepCount is 5, we keep meta + 5 chunks = index 0 to 5.
                    // Delete files from index (keepCount + 1) onwards.
                    
                    // Filter based on logical index in name, not just array position, for safety
                    const filesToDelete = sortedFiles.slice(1).filter((f: any) => {
                         const match = f.name.match(/\d+/);
                         const idx = match ? parseInt(match[0], 10) : -1;
                         return idx >= keepCount;
                    });
                    
                    console.log(`[CLEANUP] Deleting ${filesToDelete.length} obsolete chunks...`);
                    
                    await mapConcurrent(filesToDelete, 5, async (f: any) => 
                        drive.files.delete({ fileId: f.id }).catch((e: any) => console.error(`Failed to delete ${f.id}`, e))
                    );
                    
                    return res.status(200).json({ status: 'cleanup_done', deleted: filesToDelete.length });
                }
                return res.status(400).json({ error: 'Invalid keepCount' });
            }

            // Legacy Cache Operations
            if (action === 'add-to-cache') { const { rmName, rows } = body; await appendToCache(rmName, rows.map((r: any) => [r.address, r.lat||'', r.lon||''])); return res.json({success:true}); }
            
            if (action === 'update-address') { 
                if (!body.rmName) {
                    return res.status(400).json({ error: 'RM Name is missing' });
                }
                // Enhanced update: returns the actual written state
                // Pass skipHistory flag to prevent logging history for internal syncs
                const result = await updateAddressInCache(body.rmName, body.oldAddress, body.newAddress, body.comment, body.lat, body.lon, body.skipHistory); 
                return res.json(result); 
            }
            
            if (action === 'update-coords') { await updateCacheCoords(body.rmName, body.updates); return res.json({success:true}); }
            if (action === 'delete-address') { await deleteAddressFromCache(body.rmName, body.address); return res.json({success:true}); }
        }

        if (req.method === 'GET') {
            
            // --- NEW: Load Deltas Optimized ---
            if (action === 'get-deltas') {
                // Corrected to search only for savepoints
                const savepointsFiles = await getSortedFiles(drive, DELTA_FOLDER_ID, 'savepoints');
                
                // RESTORED: No strict size limit for Savepoints. 
                // We want to load even tiny 300-byte corrections.
                const filesToProcess = savepointsFiles.filter((f: any) => f.size > 0);
                
                if (filesToProcess.length > 20) {
                    console.warn(`[Performance] High delta count: ${filesToProcess.length}. Squash recommended.`);
                }
                
                const downloadFn = async (file: any) => {
                    return drive.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' })
                        .then(res => {
                            try {
                                const content = JSON.parse(Buffer.from(res.data as any).toString('utf-8'));
                                return Array.isArray(content.deltas) ? content.deltas : [];
                            } catch (e) {
                                console.warn(`Corrupt delta file ${file.name}`, e);
                                return [];
                            }
                        })
                        .catch(e => {
                            console.warn(`Failed to download delta file ${file.name}`, e);
                            return [];
                        });
                };

                // Limit concurrency to 8 requests at a time
                const results = await mapConcurrent(filesToProcess, 8, downloadFn);
                const allDeltas = results.flat();
                
                return res.json(allDeltas);
            }

            // Snapshot Operations
            if (action === 'get-snapshot-meta') {
                // Corrected to search only for snapshots
                const sortedFiles = await getSortedFiles(drive, FOLDER_ID, 'snapshot');
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
                // Corrected to search only for snapshots. 
                // This is the critical fix: filtering > 2KB here won't affect savepoints now.
                const sortedFiles = await getSortedFiles(drive, FOLDER_ID, 'snapshot');
                if (sortedFiles.length === 0) return res.json([]);

                // RESTORED: STRICT 2KB FILTER FOR SNAPSHOTS.
                // This ensures empty/garbage snapshots are ignored and do not overwrite valid data.
                const relevantFiles = sortedFiles.filter((f: any, index: number) => {
                    if (index === 0) return true; // Meta file is always relevant
                    return f.size > 2048; // STRICT > 2KB
                });

                return res.json(relevantFiles);
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
                if (!rmName || !address) return res.status(400).json({ error: 'Missing rmName or address' });
                const cached = await getAddressFromCache(rmName as string, address as string);
                // CHANGE: Return 200 with null if not found, preventing 404 console errors
                return res.json(cached || null);
            }
        }
        
        return res.status(400).json({ error: 'Invalid action' });
    } catch (error: any) {
        console.error("API Error:", error);
        if (action === 'get-snapshot-meta') return res.status(200).json({ versionHash: 'none' });
        return res.status(500).json({ error: error.message, details: error.stack });
    }
}