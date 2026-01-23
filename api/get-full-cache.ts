import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { Buffer } from 'buffer';
import { parseCookies } from 'nookies'; // ВАЖНО: npm install nookies

// Импорты ваших библиотек оставляем как есть
import { 
    getFullCoordsCache, 
    getAddressFromCache, 
    appendToCache, 
    deleteAddressFromCache, 
    updateAddressInCache, 
    updateCacheCoords 
} from './_lib/sheets.js';

export const config = { maxDuration: 60, api: { bodyParser: false } };

// Настройка клиента OAuth (берем из переменных окружения Vercel)
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// Помощник для чтения тела запроса
async function getRawBody(req: VercelRequest): Promise<any> {
    const buffers = [];
    for await (const chunk of req) { buffers.push(chunk); }
    const data = Buffer.concat(buffers).toString('utf8');
    try { return JSON.parse(data); } catch (e) { return { chunk: data }; }
}

// --- НОВАЯ ЛОГИКА ПАПОК ---
// Ищет или создает папку "LimRM_Snapshots" на диске пользователя
async function getAppFolderId(drive: any) {
    try {
        const q = "mimeType = 'application/vnd.google-apps.folder' and name = 'LimRM_Snapshots' and trashed = false";
        const res = await drive.files.list({ q, fields: 'files(id)' });
        
        if (res.data.files && res.data.files.length > 0) {
            return res.data.files[0].id;
        }
        
        // Если папки нет — создаем
        const newFolder = await drive.files.create({
            requestBody: {
                name: 'LimRM_Snapshots',
                mimeType: 'application/vnd.google-apps.folder'
            },
            fields: 'id'
        });
        return newFolder.data.id;
    } catch (e) {
        console.error("Error finding/creating folder:", e);
        throw e;
    }
}

async function getSortedFiles(drive: any, folderId: string) {
    // Ищем файлы ТОЛЬКО в нашей папке
    const q = `'${folderId}' in parents and trashed = false`;
    
    const res = await drive.files.list({ 
        q, 
        fields: "files(id, name, mimeType)", 
        pageSize: 1000 
    });
    
    const allFiles = res.data.files || [];
    
    // Фильтрация
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

    return filteredFiles.sort((a: any, b: any) => sortKey(a) - sortKey(b)).map((f: any) => ({ id: f.id, name: f.name }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=5');
    
    // --- 1. ПРОВЕРКА АВТОРИЗАЦИИ ---
    const cookies = parseCookies({ req });
    const storedTokens = cookies.google_tokens;

    if (!storedTokens) {
        // Возвращаем 401, чтобы фронтенд показал окно входа
        return res.status(401).json({ error: 'Auth required', needLogin: true });
    }

    try {
        // Восстанавливаем доступ
        oauth2Client.setCredentials(JSON.parse(storedTokens));
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        // Получаем ID папки пользователя (или создаем новую)
        const FOLDER_ID = await getAppFolderId(drive);

        const action = req.query.action as string;
        const chunkIndex = req.query.chunkIndex ? parseInt(req.query.chunkIndex as string, 10) : -1;

        if (req.method === 'POST') {
            const body = await getRawBody(req);
            
            // --- SAVE CHUNK ---
            if (action === 'save-chunk') {
                let targetFileId = req.query.targetFileId as string;
                
                // Fallback: ищем файл по индексу, если ID не передан
                if (!targetFileId && chunkIndex !== -1) {
                    const sortedFiles = await getSortedFiles(drive, FOLDER_ID);
                    if (sortedFiles[chunkIndex + 1]) {
                        targetFileId = sortedFiles[chunkIndex + 1].id;
                    }
                }

                const content = typeof body === 'string' ? body : (body.chunk || JSON.stringify(body));

                if (targetFileId) {
                    // Обновление
                    await drive.files.update({ 
                        fileId: targetFileId, 
                        media: { mimeType: 'application/json', body: content }
                    });
                    return res.status(200).json({ status: 'saved' });
                } else if (chunkIndex !== -1) {
                    // Создание нового
                    const newFileName = `snapshot_chunk_${chunkIndex}.json`;
                    await drive.files.create({ 
                        requestBody: { name: newFileName, parents: [FOLDER_ID] }, 
                        media: { mimeType: 'application/json', body: content }
                    });
                    return res.status(200).json({ status: 'created', fileName: newFileName });
                }
                
                return res.status(400).json({ error: 'Missing targetFileId or chunkIndex.' });
            }

            // --- SAVE META ---
            if (action === 'save-meta') {
                const sortedFiles = await getSortedFiles(drive, FOLDER_ID);
                
                // Если мета-файл есть (он всегда первый при сортировке)
                if (sortedFiles[0] && (sortedFiles[0].name.includes('snapshot.json') || sortedFiles[0].name.includes('meta'))) {
                    await drive.files.update({ 
                        fileId: sortedFiles[0].id, 
                        media: { mimeType: 'application/json', body: JSON.stringify(body) }
                    });
                    return res.status(200).json({ status: 'meta_saved' });
                } else {
                    // Создаем мета-файл, если его нет
                    await drive.files.create({
                        requestBody: { name: 'snapshot.json', parents: [FOLDER_ID] },
                        media: { mimeType: 'application/json', body: JSON.stringify(body) }
                    });
                    return res.status(200).json({ status: 'meta_created' });
                }
            }

            // Legacy Cache Operations (для обратной совместимости)
            if (action === 'add-to-cache') { 
                const { rmName, rows } = body; 
                await appendToCache(rmName, rows.map((r: any) => [r.address, r.lat||'', r.lon||''])); 
                return res.json({success:true}); 
            }
            
            if (action === 'update-address') { 
                if (!body.rmName) return res.status(400).json({ error: 'RM Name is missing' });
                const result = await updateAddressInCache(body.rmName, body.oldAddress, body.newAddress, body.comment, body.lat, body.lon); 
                return res.json(result); 
            }
            
            if (action === 'update-coords') { await updateCacheCoords(body.rmName, body.updates); return res.json({success:true}); }
            if (action === 'delete-address') { await deleteAddressFromCache(body.rmName, body.address); return res.json({success:true}); }
        }

        if (req.method === 'GET') {
            // --- GET META ---
            if (action === 'get-snapshot-meta') {
                const sortedFiles = await getSortedFiles(drive, FOLDER_ID);
                if (sortedFiles.length === 0) return res.json({ versionHash: 'none' });
                
                try {
                    const response = await drive.files.get({ fileId: sortedFiles[0].id, alt: 'media' }, { responseType: 'arraybuffer' });
                    const content = JSON.parse(Buffer.from(response.data as any).toString('utf-8'));
                    
                    const actualChunksFound = Math.max(0, sortedFiles.length - 1);
                    content.chunkCount = actualChunksFound;
                    
                    return res.json(content);
                } catch (e: any) {
                    console.error("Meta download error:", e.message);
                    return res.json({ versionHash: 'none', error: e.message });
                }
            }

            // --- GET LIST ---
            if (action === 'get-snapshot-list') {
                const sortedFiles = await getSortedFiles(drive, FOLDER_ID);
                if (sortedFiles.length === 0) return res.json([]);
                
                // Возвращаем все файлы кроме первого (мета-файла)
                // Или если мета-файла нет, возвращаем как есть
                const chunkFiles = sortedFiles.slice(1);
                return res.json(chunkFiles);
            }

            // --- GET CONTENT ---
            if (action === 'get-file-content') {
                const fileId = String(req.query.fileId);
                const file = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
                file.data.pipe(res);
                return;
            }

            // Legacy Cache Operations
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
        
        // Если ошибка аутентификации (токен протух)
        if (error.code === 401 || error.message?.includes('invalid_grant')) {
             return res.status(401).json({ error: 'Auth expired', needLogin: true });
        }

        if (req.query.action === 'get-snapshot-meta') return res.status(200).json({ versionHash: 'none' });
        return res.status(500).json({ error: error.message, details: error.stack });
    }
}
