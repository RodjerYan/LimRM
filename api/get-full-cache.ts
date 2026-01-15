
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
// UPDATED: New IDs from local script configuration (provided by user)
const SNAPSHOT_FILES = [
    '18m6S5WJQ4NYY1sFxtEQpp1Fx4kxbcHd0', '190N303psF7Vq-aWIc5a0xW_xxrNk4YYp', '192DT483FM8CC8XaxrhB09MwrCF7egdHO',
    '1B22R1UtpXyuLDFb3AiN0l_Fs3lqRyVRX', '1CZDCHo1LWPQX61lDceeVKCVNZAXzInT5', '1DQ5uy6C2FfzggSjWBRofdbpaZHp5Q5I9',
    '1E4Oye4hZEKik3AjGotGuELbMuyHuUjFn', '1ILFQxE0wa_D3QXtjQpOv1jeUGNrTo4kY', '1IVO6wchbYywzyYXvhLffh_PKDYs7zz04',
    '1M9G6K79Q--VAhlaOSR-cl-F2KkQ7DHN8', '1MDpoqARX_FSpyH77pR5C4c1dJuVPSEwZ', '1RM6pYwHuxGeehJQlsYE0Kcr7q3HJvMs3',
    '1SiCJUZoUolPua9VKDh8GYXIXiYB0fZ8s', '1Tv6H8wNy2RHuGGHs0gb920fXKtYXT3mo', '1U_I2o_NsLZX4aoj8UEMeEh45gW8epUYB',
    '1V0DZy648pHSnsjaiy5SColxazif08kY7', '1XKaeJ8vUVPTAvOjIVptsr7kd1uVDWy1r', '1aISJEs16em6PWYcvtcJIMTym3zDOtZ6e',
    '1aW9PtqshdK40Fo0BDNk78UFPlLuORdQx', '1ahXKWdb6XRygLQlKHgjO4_ZenafOAamP', '1dcj4d4nti_w_5R4COoCXrb8sORHFCKYX',
    '1dyX2MW2SOzchcafrF8URAyWDc83aLNCL', '1gT8t-tw-Cf9t6HRzkLzVkErhYljSQ9Fy', '1hGflNGx8HzDKN9wmWgmoCDvQktwJkHsY',
    '1hgY2Axg-Am0BIkPY89BhIeWtuf6GM9w5', '1iEwE82_s00TFx51o7gyXJjPcttVAD4Lx', '1i_M5OlMptkSC9ahxG4E684evsUQF_Yyx',
    '1pYqaxU5CfE2dqHi_MLTQHGawsi_Vmd6e', '1qsJUCK4rTlnIua7ZLz4FXUz9iX4nZYIt', '1sUPxf_DYXXH0gO3LnJkCG4EIGFkoHU5M',
    '1z33jzMZp5HlFl9jr53VmhfD77IONPQwC'
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
