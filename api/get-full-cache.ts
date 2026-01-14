
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

// МАССИВ PRE-CREATED ФАЙЛОВ (31 файл)
// Индекс 0: Meta
// Индекс 1-30: Data Chunks
const SNAPSHOT_FILES = [
    '1-MR1rOawgl--ORjVPu4qZqt_5kGOaHoq', '10cnDHR5IyBVKXhNlXcFlx-hW4IIbNoH_', '112onIGNBVw0x-FcYmbBHTEi6lPVpHwYn',
    '136_cbRU4KSkOzus1trXO2CKViR5cyldV', '13D4tkMouV7AxAtHQxJkfKwRv_PEKWycn', '17I7F_e5apYtvBOKNaVBAppEpI6lZrTzH',
    '1BGIcxm9y3JahVDSH-LiNbAntkSDxzcQl', '1Gzg2_oW3T6euZxXmzbyVTZAVahFN3Ac3', '1JpYVThJ0Q1bfFF5B6ZSiB0kBRtifNOaR',
    '1L1PDLU-ddIOfYd_RIACbAxQJzoYfZTQe', '1NZSpW5qLDppJg0mlYX9dgICbhQyaFaBb', '1OBLQLiAh71HL95z8QTqDBW0fnN0TqE6y',
    '1VO0trlHMP8c6Y6QTIVkdTRgeBI_f3XLc', '1VPcYuvUmhiWL583EISY0ed-BEfVFwzhf', '1WOyHafp5wF8p9ybUFtd7ChhuOvqENzM0',
    '1YDwdBJRhnstlRRwp8SF_1VRoXnNOoTav', '1Zj_j5as83QJlCrRi9foUwdosVs3K7dw3', '1bwhS_QeOYs95SK-MtafLEVoaXX9R6StR',
    '1c-ZgnberT5srrHoi3zXLvA51QYHPoKoD', '1dribJF8Bkt5KcW19EKdOzxz7eiVVliId', '1i8pa2h5Ej-BU-4le-SBlvgPWqS_6pNZ3',
    '1j9wdkKraXI1-rQR1bOY8Nio-4LmWhK2w', '1oPheK3WxhwEQFOoUQaM-67QczcQIZVfI', '1pPof5L98jGHHIr4BDjLlq_TRhps3Yi9d',
    '1qsR8WPPsFt_PeWads-eTiqhosn568CkH', '1stEiGMFioK5T6crIeREgTPH6kv_ndBvu', '1uJmwkNjxkwHjeoM6neaVv8zlDd8kUWhl',
    '1vSWXvAYHnZqnwbjZgIoWAOOZJPezdhOl', '1wWnq8dcqiMryRTG-xnMRXV0_3C4c4lC7', '1xyt_cKyyYlS6X3_Ik2X0wSiOVouRDA2Z',
    '1y-fEGcpqaB6rrK4EBpwe1sdvXMYQgPep'
];

const META_FILE_ID = SNAPSHOT_FILES[0];
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=5');
    
    const action = req.query.action as string;
    const chunkIndex = req.query.chunkIndex ? parseInt(req.query.chunkIndex as string, 10) : -1;
    const { fileId } = req.query;

    try {
        const drive = await getDriveClient();
        
        if (req.method === 'POST') {
            const body = await getRawBody(req);
            
            // 1. SAVE CHUNK (UPDATE EXISTING FILE)
            if (action === 'save-chunk') {
                const { chunk } = body; 
                // Берем ID файла из списка (пропуская первый, он для меты)
                const targetFileId = SNAPSHOT_FILES[chunkIndex + 1];

                if (!targetFileId) return res.status(400).json({ error: 'Chunk index out of bounds (max 30 chunks)' });

                await drive.files.update({
                    fileId: targetFileId,
                    media: { mimeType: 'application/json', body: chunk },
                    supportsAllDrives: true
                });

                return res.status(200).json({ status: 'saved', index: chunkIndex });
            }

            // 2. SAVE META (UPDATE FIRST FILE)
            if (action === 'save-meta') {
                await drive.files.update({
                    fileId: META_FILE_ID,
                    media: { mimeType: 'application/json', body: JSON.stringify(body) },
                    supportsAllDrives: true
                });
                return res.status(200).json({ status: 'meta_saved' });
            }

            // --- LEGACY OPERATIONS (Google Sheets для правок адресов) ---
            if (action === 'add-to-cache') { const { rmName, rows } = body; await appendToCache(rmName, rows.map((r: any) => [r.address, r.lat||'', r.lon||''])); return res.json({success:true}); }
            if (action === 'update-address') { await updateAddressInCache(body.rmName, body.oldAddress, body.newAddress, body.comment); return res.json({success:true}); }
            if (action === 'update-coords') { await updateCacheCoords(body.rmName, body.updates); return res.json({success:true}); }
            if (action === 'delete-address') { await deleteAddressFromCache(body.rmName, body.address); return res.json({success:true}); }
            
            // Init snapshot (legacy call support, now essentially no-op)
            if (action === 'init-snapshot') {
                 return res.status(200).json({ status: 'ready', folderId: 'pre-created' });
            }
        }

        if (req.method === 'GET') {
            // 3. GET SNAPSHOT META
            if (action === 'get-snapshot-meta') {
                const file = await drive.files.get({ fileId: META_FILE_ID, alt: 'media', supportsAllDrives: true });
                return res.status(200).json(file.data);
            }

            // 4. GET SNAPSHOT LIST (Returns IDs of chunks based on meta count)
            if (action === 'get-snapshot-list') {
                // First fetch meta to know how many chunks
                try {
                    const metaRes = await drive.files.get({ fileId: META_FILE_ID, alt: 'media', supportsAllDrives: true });
                    const meta = metaRes.data as any;
                    
                    if (meta && typeof meta.chunkCount === 'number') {
                        const usedIds = SNAPSHOT_FILES.slice(1, meta.chunkCount + 1);
                        return res.status(200).json(usedIds.map(id => ({ id })));
                    } else {
                        // Fallback if meta is empty
                        return res.status(200).json([]);
                    }
                } catch (e) {
                    console.warn("Failed to read meta for list", e);
                    return res.status(200).json([]);
                }
            }

            // 5. GET FILE CONTENT (Proxy)
            if (action === 'get-file-content') {
                if (!fileId) return res.status(400).json({ error: 'No fileId' });
                const file = await drive.files.get({ fileId: String(fileId), alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
                file.data.pipe(res);
                return;
            }

            // --- LEGACY OPERATIONS (GET) ---
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
        // Handle case where meta file might be empty initially
        if (action === 'get-snapshot-meta' && (error.message.includes('Unexpected end of JSON input') || error.code === 404)) {
             return res.status(200).json({ versionHash: 'none' });
        }
        return res.status(500).json({ error: error.message });
    }
}
