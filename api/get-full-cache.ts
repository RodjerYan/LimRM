
import { google } from 'googleapis';
import { Buffer } from 'buffer';
import jwt from 'jsonwebtoken';
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
const TASKS_FOLDER_ID = '1LxM3kjiEanQnqj5y-7QE1tHkTFiUFHD2'; // New folder for Tasks (Deferred/Deleted)
const INTEREST_FOLDER_ID = '1Ak8XBQMNNnHFlIg6NWb6DHuSjI8TSg2l'; // New folder for Blue Points Deltas

const SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'];

// New filenames
const DEFERRED_FILENAME = 'Deferred.json';
const DELETED_FILENAME = 'Deleted.json';

const JWT_SECRET = process.env.AUTH_JWT_SECRET || "default-dev-secret-do-not-use-in-prod-limrm-geo";

// Helper to normalize strings for comparison (RM matching)
const normalize = (s: string) => s ? s.toLowerCase().trim().replace(/[^a-zа-я0-9]/g, '') : '';

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

    // Reverted: Removed 'subject' which causes 401 error for non-Workspace accounts.
    const auth = new google.auth.JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: SCOPES
    });

    return google.drive({ version: 'v3', auth });
}

async function getSortedFiles(drive: any, folderId: string = FOLDER_ID, fileType: 'snapshot' | 'savepoints' | 'interest' | 'all' = 'all') {
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
        if (fileType === 'interest') return lowerName.includes('points_of_interest');
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

// --- NEW TASK MANAGER HELPERS (Specific Files) ---
async function getJsonFile(drive: any, filename: string, folderId: string) {
    try {
        const q = `name = '${filename}' and '${folderId}' in parents and trashed = false`;
        const list = await drive.files.list({ q, fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true });
        
        if (list.data.files && list.data.files.length > 0) {
            const fileId = list.data.files[0].id;
            const res = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'json' });
            return { fileId, data: Array.isArray(res.data) ? res.data : [] };
        }
        return { fileId: null, data: [] };
    } catch (e) {
        console.error(`Failed to read ${filename}:`, e);
        return { fileId: null, data: [] };
    }
}

async function saveJsonFile(drive: any, filename: string, folderId: string, data: any[], fileId: string | null) {
    const content = JSON.stringify(data, null, 2);
    if (fileId) {
        await drive.files.update({ 
            fileId, 
            media: { mimeType: 'application/json', body: content }, 
            supportsAllDrives: true 
        });
    } else {
        await drive.files.create({
            requestBody: { name: filename, parents: [folderId], mimeType: 'application/json' },
            media: { mimeType: 'application/json', body: content },
            supportsAllDrives: true
        });
    }
}

function verifyUser(req: Request) {
    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) return null;
        const token = authHeader.replace('Bearer ', '');
        return jwt.verify(token, JWT_SECRET) as { email: string; role: string; lastName: string; firstName: string };
    } catch (e) {
        return null;
    }
}

export default async function handler(req: Request) {
    const url = new URL(req.url);
    let action = url.searchParams.get('action');
    const chunkIndexStr = url.searchParams.get('chunkIndex');
    const chunkIndex = chunkIndexStr ? parseInt(chunkIndexStr, 10) : -1;

    // Detect action from path if not provided in params
    if (!action) {
        if (url.pathname.endsWith('/update-address')) action = 'update-address';
        else if (url.pathname.endsWith('/delete-address')) action = 'delete-address';
        else if (url.pathname.endsWith('/get-cached-address')) action = 'get-cached-address';
        else if (url.pathname.endsWith('/snapshot')) {
             action = req.method === 'POST' ? 'save-snapshot' : 'get-snapshot';
        }
    }

    try {
        // We only need Drive client for snapshot/delta/tasks operations
        const needsDrive = ['save-delta', 'save-interest-delta', 'get-interest-deltas', 'clear-deltas', 'save-chunk', 'save-meta', 'cleanup-chunks', 'get-deltas', 'get-snapshot-meta', 'get-snapshot-list', 'get-file-content', 'get-settings', 'save-settings', 'get-tasks', 'save-task', 'restore-task'].includes(action || '');
        const drive = needsDrive ? await getDriveClient() : null;

        if (req.method === 'POST') {
            const body = await req.json().catch(() => ({}));
            
            // --- SAVE INTEREST DELTA (BLUE POINTS) ---
            if (action === 'save-interest-delta' && drive) {
                const deltaItem = body;
                if (!deltaItem || Object.keys(deltaItem).length === 0) {
                    return new Response(JSON.stringify({ error: 'Missing or empty delta payload' }), { status: 400 });
                }

                // Verify user for authorship
                const user = verifyUser(req);
                if (user) {
                    deltaItem.user = `${user.lastName} ${user.firstName}`; // Enforce user name
                }

                // Logic to find the latest "Points_of_interest{N}.json"
                const interestFiles = await getSortedFiles(drive, INTEREST_FOLDER_ID, 'interest');
                let targetFile = null;
                let fileContent: any[] = [];
                let nextIndex = 1;

                if (interestFiles.length > 0) {
                    const lastFile = interestFiles[interestFiles.length - 1];
                    const match = lastFile.name.match(/Points_of_interest(\d+)\.json/i);
                    // Handle case where file is just "Points_of_interest.json" -> treat as 1
                    const currentIndex = match ? parseInt(match[1], 10) : 1;
                    nextIndex = currentIndex;
                    const fileSize = lastFile.size;

                    // If file is > 500KB, start a new one
                    if (fileSize > 500 * 1024) {
                        nextIndex = currentIndex + 1;
                        targetFile = null;
                    } else {
                        try {
                            const fileRes = await drive.files.get({ fileId: lastFile.id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
                            const contentStr = Buffer.from(fileRes.data as any).toString('utf-8');
                            targetFile = lastFile;
                            try { 
                                const parsed = JSON.parse(contentStr);
                                fileContent = Array.isArray(parsed) ? parsed : [];
                            } catch (e) { fileContent = []; }
                        } catch (e) {
                            nextIndex = currentIndex + 1;
                            targetFile = null; 
                        }
                    }
                }

                fileContent.push(deltaItem);
                
                const newContentStr = JSON.stringify(fileContent, null, 2);
                const fileName = `Points_of_interest${nextIndex}.json`;

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
                            parents: [INTEREST_FOLDER_ID],
                            mimeType: 'application/json'
                        },
                        media: { mimeType: 'application/json', body: newContentStr },
                        supportsAllDrives: true
                    });
                    return new Response(JSON.stringify({ status: 'created', file: fileName }));
                }
            }

            // --- TASK MANAGEMENT POST ---
            if (action === 'save-task' && drive) {
                const user = verifyUser(req);
                if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

                const newTask = body;
                // Enforce author
                newTask.user = user.email;
                // Owner is already passed in newTask.owner from frontend

                const filename = newTask.type === 'snooze' ? DEFERRED_FILENAME : DELETED_FILENAME;
                
                const { fileId, data } = await getJsonFile(drive, filename, TASKS_FOLDER_ID);
                data.push(newTask);
                await saveJsonFile(drive, filename, TASKS_FOLDER_ID, data, fileId);
                
                return new Response(JSON.stringify({ success: true }));
            }

            if (action === 'restore-task' && drive) {
                const user = verifyUser(req);
                if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

                const { taskId } = body;
                
                const deferred = await getJsonFile(drive, DEFERRED_FILENAME, TASKS_FOLDER_ID);
                const deleted = await getJsonFile(drive, DELETED_FILENAME, TASKS_FOLDER_ID);
                
                let found = false;

                // Helper to check ownership or access
                const canRestore = (t: any) => {
                    if (user.role === 'admin') return true;
                    if (t.user === user.email) return true; // I created it
                    // Check if I am the owner (RM) of the point
                    if (t.owner) {
                        const ownerName = normalize(t.owner);
                        const myName = normalize(user.lastName);
                        if (ownerName.includes(myName)) return true;
                    }
                    return false;
                };

                if (deferred.data.some((t: any) => t.id === taskId && canRestore(t))) {
                    const newData = deferred.data.filter((t: any) => t.id !== taskId);
                    await saveJsonFile(drive, DEFERRED_FILENAME, TASKS_FOLDER_ID, newData, deferred.fileId);
                    found = true;
                }
                
                if (!found && deleted.data.some((t: any) => t.id === taskId && canRestore(t))) {
                    const newData = deleted.data.filter((t: any) => t.id !== taskId);
                    await saveJsonFile(drive, DELETED_FILENAME, TASKS_FOLDER_ID, newData, deleted.fileId);
                    found = true;
                }

                if (!found) {
                    // Could be not found OR permission denied (we hide existence if denied for security/simplicity)
                    return new Response(JSON.stringify({ success: false, error: 'Task not found or permission denied' }));
                }

                return new Response(JSON.stringify({ success: true, restored: found }));
            }
            // ---------------------------

            if (action === 'save-delta' && drive) {
                const deltaItem = body;
                if (!deltaItem || Object.keys(deltaItem).length === 0) {
                    return new Response(JSON.stringify({ error: 'Missing or empty delta payload' }), { status: 400 });
                }

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
                    
                    if (fileSize > 250 * 1024) { // Limit delta file size to 250KB to avoid huge reads
                        nextIndex = currentIndex + 1;
                        targetFile = null;
                    } else {
                        try {
                            const fileRes = await drive.files.get({ fileId: lastFile.id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
                            const contentStr = Buffer.from(fileRes.data as any).toString('utf-8');
                            targetFile = lastFile;
                            try { fileContent = JSON.parse(contentStr); } catch (e) { }
                        } catch (e) {
                            // If failed to read, start new file
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

            if (action === 'clear-deltas' && drive) {
                const savepointsFiles = await getSortedFiles(drive, DELTA_FOLDER_ID, 'savepoints');
                await mapConcurrent(savepointsFiles, 5, async (f: any) => 
                    drive.files.delete({ fileId: f.id }).catch((e: any) => console.error(`Failed to delete delta ${f.id}`, e))
                );
                return new Response(JSON.stringify({ status: 'deltas_cleared', count: savepointsFiles.length }));
            }

            if (action === 'save-chunk' && drive) {
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
            if (action === 'save-meta' && drive) {
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

            if (action === 'save-settings' && drive) {
                const content = JSON.stringify(body); // Expecting { baseRate: number }
                
                // Check if file exists
                const q = `name = 'system_settings.json' and '${FOLDER_ID}' in parents and trashed = false`;
                const list = await drive.files.list({ q, fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true });
                
                if (list.data.files && list.data.files.length > 0) {
                    const fileId = list.data.files[0].id;
                    await drive.files.update({ 
                        fileId: fileId!, 
                        media: { mimeType: 'application/json', body: content }, 
                        supportsAllDrives: true 
                    });
                    return new Response(JSON.stringify({ status: 'updated' }));
                } else {
                    await drive.files.create({
                        requestBody: { name: 'system_settings.json', parents: [FOLDER_ID], mimeType: 'application/json' },
                        media: { mimeType: 'application/json', body: content },
                        supportsAllDrives: true
                    });
                    return new Response(JSON.stringify({ status: 'created' }));
                }
            }
            
            if (action === 'cleanup-chunks' && drive) {
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
            
            if (action === 'delete-history-entry') {
                if (!body.rmName || !body.address) {
                    return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400 });
                }
                // We need either entryText OR (timestamp AND commentText)
                if (!body.entryText && (!body.timestamp || !body.commentText)) {
                     return new Response(JSON.stringify({ error: 'Missing entryText or timestamp/commentText' }), { status: 400 });
                }
                
                await deleteHistoryEntryFromCache(body.rmName, body.address, body.entryText, body.timestamp, body.commentText);
                return new Response(JSON.stringify({ success: true }));
            }

            if (action === 'update-address') { 
                if (!body.rmName) return new Response(JSON.stringify({ error: 'RM Name is missing' }), { status: 400 });
                const user = verifyUser(req);
                const userName = user ? `${user.lastName} ${user.firstName}` : 'Система';
                
                const result = await updateAddressInCache(
                    body.rmName, 
                    body.oldAddress, 
                    body.newAddress, 
                    body.comment, 
                    body.lat, 
                    body.lon, 
                    body.skipHistory,
                    userName
                ); 
                return new Response(JSON.stringify(result)); 
            }
            
            if (action === 'update-coords') { await updateCacheCoords(body.rmName, body.updates); return new Response(JSON.stringify({success:true})); }
            if (action === 'delete-address') { await deleteAddressFromCache(body.rmName, body.address); return new Response(JSON.stringify({success:true})); }
        }

        if (req.method === 'GET') {
            
            // --- GET INTEREST DELTAS ---
            if (action === 'get-interest-deltas' && drive) {
                const interestFiles = await getSortedFiles(drive, INTEREST_FOLDER_ID, 'interest');
                const filesToProcess = interestFiles.filter((f: any) => f.size > 0);
                
                const downloadFn = async (file: any) => {
                    return drive.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' })
                        .then(res => {
                            try {
                                const content = JSON.parse(Buffer.from(res.data as any).toString('utf-8'));
                                return Array.isArray(content) ? content : [];
                            } catch (e) { return []; }
                        })
                        .catch(e => { return []; });
                };

                const results = await mapConcurrent(filesToProcess, 8, downloadFn);
                const allDeltas = results.flat();
                return new Response(JSON.stringify(allDeltas));
            }

            // --- TASK MANAGEMENT GET ---
            if (action === 'get-tasks' && drive) {
                const user = verifyUser(req);
                if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

                const now = Date.now();
                
                // 1. Process Deferred.json
                const deferred = await getJsonFile(drive, DEFERRED_FILENAME, TASKS_FOLDER_ID);
                const activeDeferred = deferred.data.filter((task: any) => task.snoozeUntil > now);
                
                // If we cleaned up expired items, save the file back (maintenance)
                if (activeDeferred.length !== deferred.data.length) {
                     await saveJsonFile(drive, DEFERRED_FILENAME, TASKS_FOLDER_ID, activeDeferred, deferred.fileId);
                     console.log(`[Tasks] Auto-woke ${deferred.data.length - activeDeferred.length} snoozed items.`);
                }

                // 2. Process Deleted.json
                const deleted = await getJsonFile(drive, DELETED_FILENAME, TASKS_FOLDER_ID);
                // For deleted items, we KEEP them in the file even if expired (as history).
                // Frontend logic will determine if they are recoverable or just logs.

                let allTasks = [...activeDeferred, ...deleted.data];

                // 3. FILTER BY USER (unless admin)
                // Logic: Show if User is Author OR User is Target Owner (RM)
                if (user.role !== 'admin') {
                    const userSurname = normalize(user.lastName);
                    allTasks = allTasks.filter((t: any) => {
                        const isAuthor = t.user === user.email;
                        const isOwner = t.owner && normalize(t.owner).includes(userSurname);
                        return isAuthor || isOwner;
                    });
                }
                
                return new Response(JSON.stringify({ tasks: allTasks }));
            }
            // ---------------------------

            if (action === 'get-deltas' && drive) {
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

            if (action === 'get-snapshot-meta' && drive) {
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
            if (action === 'get-snapshot-list' && drive) {
                const sortedFiles = await getSortedFiles(drive, FOLDER_ID, 'snapshot');
                const relevantFiles = sortedFiles.filter((f: any, index: number) => {
                    if (index === 0) return true; 
                    return f.size > 2048; 
                });
                return new Response(JSON.stringify(relevantFiles));
            }
            if (action === 'get-file-content' && drive) {
                const fileId = url.searchParams.get('fileId');
                if (!fileId) return new Response('File ID required', { status: 400 });
                const file = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
                
                // Return as stream
                return new Response(file.data as any);
            }

            if (action === 'get-settings' && drive) {
                const q = `name = 'system_settings.json' and '${FOLDER_ID}' in parents and trashed = false`;
                const list = await drive.files.list({ q, fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true });
                if (list.data.files && list.data.files.length > 0) {
                    const fileId = list.data.files[0].id;
                    const res = await drive.files.get({ fileId: fileId!, alt: 'media', supportsAllDrives: true }, { responseType: 'json' });
                    return new Response(JSON.stringify(res.data));
                }
                // Return default if not found
                return new Response(JSON.stringify({ baseRate: 15 }));
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
