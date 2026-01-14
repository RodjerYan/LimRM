
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

// ID расшаренной папки на Google Drive для хранения базы данных
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=5');
    
    const action = req.query.action as string;
    const { fileId } = req.query;

    try {
        const drive = await getDriveClient();
        
        if (req.method === 'POST') {
            const body = await getRawBody(req);
            
            // 1. ИНИЦИАЛИЗАЦИЯ (Очистка старой версии)
            if (action === 'init-snapshot') {
                const q = `'${FOLDER_ID}' in parents and name contains 'chunk_' and trashed=false`;
                // ВАЖНО: supportsAllDrives: true обязателен для сервисных аккаунтов в общих папках
                const files = await drive.files.list({ q, fields: 'files(id)', supportsAllDrives: true }); 
                
                if (files.data.files?.length) {
                    Promise.all(files.data.files.map(f => drive.files.delete({ fileId: f.id!, supportsAllDrives: true }).catch(() => {})));
                }
                return res.status(200).json({ status: 'ready', folderId: FOLDER_ID });
            }
            
            // 2. СОХРАНЕНИЕ ЧАНКА
            if (action === 'append-snapshot') {
                const { chunk } = body; 
                if (!chunk) return res.status(400).json({ error: 'No chunk data' });
                const name = `chunk_${Date.now()}.json`; 
                await drive.files.create({
                    requestBody: { name, parents: [FOLDER_ID], mimeType: 'application/json' },
                    media: { mimeType: 'application/json', body: chunk },
                    supportsAllDrives: true // ВАЖНО
                });
                return res.status(200).json({ status: 'saved', chunk: name });
            }

            // 3. СОХРАНЕНИЕ МЕТАДАННЫХ
            if (action === 'save-meta') {
                const q = `'${FOLDER_ID}' in parents and name = 'meta.json' and trashed=false`;
                const existing = await drive.files.list({ q, supportsAllDrives: true });
                if (existing.data.files?.length) {
                    await Promise.all(existing.data.files.map(f => drive.files.delete({ fileId: f.id!, supportsAllDrives: true })));
                }
                await drive.files.create({
                    requestBody: { name: 'meta.json', parents: [FOLDER_ID], mimeType: 'application/json' },
                    media: { mimeType: 'application/json', body: JSON.stringify(body) },
                    supportsAllDrives: true // ВАЖНО
                });
                return res.status(200).json({ status: 'meta_saved' });
            }

            // --- LEGACY OPERATIONS (Google Sheets для правок адресов) ---
            if (action === 'add-to-cache') { const { rmName, rows } = body; await appendToCache(rmName, rows.map((r: any) => [r.address, r.lat||'', r.lon||''])); return res.json({success:true}); }
            if (action === 'update-address') { await updateAddressInCache(body.rmName, body.oldAddress, body.newAddress, body.comment); return res.json({success:true}); }
            if (action === 'update-coords') { await updateCacheCoords(body.rmName, body.updates); return res.json({success:true}); }
            if (action === 'delete-address') { await deleteAddressFromCache(body.rmName, body.address); return res.json({success:true}); }
        }

        if (req.method === 'GET') {
            // 4. ПОЛУЧЕНИЕ МЕТАДАННЫХ
            if (action === 'get-snapshot-meta') {
                const q = `'${FOLDER_ID}' in parents and name = 'meta.json' and trashed=false`;
                const list = await drive.files.list({ q, fields: 'files(id)', supportsAllDrives: true });
                if (!list.data.files || list.data.files.length === 0) {
                    return res.status(200).json({ versionHash: 'none' });
                }
                const metaFile = await drive.files.get({ fileId: list.data.files[0].id!, alt: 'media', supportsAllDrives: true });
                return res.status(200).json(metaFile.data);
            }

            // 5. ПОЛУЧЕНИЕ СПИСКА ЧАНКОВ
            if (action === 'get-snapshot-list') {
                const q = `'${FOLDER_ID}' in parents and name contains 'chunk_' and trashed=false`;
                const list = await drive.files.list({ q, orderBy: 'createdTime', fields: 'files(id, name, size)', supportsAllDrives: true });
                return res.status(200).json(list.data.files || []);
            }

            // 6. СКАЧИВАНИЕ ФАЙЛА (PROXY)
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
        return res.status(500).json({ error: error.message });
    }
}
