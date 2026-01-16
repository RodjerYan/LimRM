
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
    // 1. УЗНАЕМ, КТО МЫ (под каким email зашел бот)
    try {
        const authInfo = await drive.about.get({ fields: 'user' });
        console.log(`[AUTH] Бот работает под аккаунтом: ${authInfo.data.user.emailAddress}`);
    } catch (e) {
        console.log("[AUTH] Не удалось получить email бота");
    }

    // 2. ПРОСИМ ВСЕ ФАЙЛЫ В ПАПКЕ (без фильтра по имени)
    // Убираем 'name contains snapshot', чтобы исключить ошибки индексации
    const q = `'${FOLDER_ID}' in parents and trashed = false`;
    
    const res = await drive.files.list({ 
        q, 
        fields: "files(id, name, mimeType)", 
        supportsAllDrives: true, 
        includeItemsFromAllDrives: true,
        pageSize: 1000 
    });
    
    const allFiles = res.data.files || [];
    
    // 3. ПИШЕМ В ЛОГИ ВСЁ, ЧТО ВИДИТ БОТ
    console.log(`[DEBUG] Всего объектов найдено в папке: ${allFiles.length}`);
    allFiles.forEach((f: any) => {
        console.log(` -> Объект: "${f.name}" | Тип: ${f.mimeType} | ID: ${f.id}`);
    });

    // 4. Фильтруем файлы уже в коде (так надежнее)
    const filteredFiles = allFiles.filter((f: any) => 
        f.name.toLowerCase().includes('snapshot') && 
        f.mimeType !== 'application/vnd.google-apps.folder'
    );

    console.log(`[FILTER] После фильтрации осталось: ${filteredFiles.length} файлов`);

    const sortKey = (f: any) => {
        const name = f.name.toLowerCase();
        if (name === 'snapshot.json' || name.includes('system_analytics_snapshot')) return -1;
        const match = name.match(/\d+/);
        return match ? parseInt(match[0], 10) : 9999;
    };

    return filteredFiles.sort((a: any, b: any) => sortKey(a) - sortKey(b)).map((f: any) => f.id);
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
                    console.log("Папка пуста или файлы не найдены (filtered locally)");
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

                try {
                    // 1. Сначала читаем мета-файл (он под индексом 0)
                    const metaRes = await drive.files.get(
                        { fileId: sortedIds[0], alt: 'media', supportsAllDrives: true },
                        { responseType: 'arraybuffer' }
                    );
                    const metaStr = Buffer.from(metaRes.data as any).toString('utf-8');
                    const meta = JSON.parse(metaStr);
                    
                    // 2. Узнаем, сколько чанков реально принадлежит этой версии
                    const activeChunkCount = meta.chunkCount || (sortedIds.length - 1);

                    // 3. Берем ровно столько ID, сколько нужно, начиная с первого чанка
                    // (slice(1, activeChunkCount + 1) пропустит мета-файл и возьмет только чанки)
                    const chunkFiles = sortedIds.slice(1, activeChunkCount + 1);
                    
                    console.log(`[LIST] Версия ${meta.versionHash} требует ${activeChunkCount} чанков. Отдаем ${chunkFiles.length} ID.`);
                    
                    return res.json(chunkFiles.map((id: string) => ({ id })));
                } catch (e) {
                    // Если мета-файл не прочитался, отдаем все как раньше (fallback)
                    const chunkFiles = sortedIds.slice(1);
                    return res.json(chunkFiles.map((id: string) => ({ id })));
                }
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
