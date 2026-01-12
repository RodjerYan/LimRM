
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    getFullCoordsCache, 
    getAddressFromCache, 
    appendToCache, 
    deleteAddressFromCache, 
    updateAddressInCache, 
    updateCacheCoords,
    getGoogleDriveClient
} from './_lib/sheets.js';

export const config = {
    maxDuration: 60,
    api: { bodyParser: false },
};

const META_FILENAME = 'system_metadata.json';
const SNAPSHOT_FOLDER_NAME = 'System_Snapshot_Data'; // Папка для хранения кусков
const ROOT_FOLDERS: Record<string, string> = {
    '2025': '1uJX1deU3Xo29cGeaUsepvMdmDosCN-7u', // ID корневой папки
};

async function getRawBody(req: VercelRequest): Promise<Buffer> {
    const buffers = [];
    for await (const chunk of req) { buffers.push(chunk); }
    return Buffer.concat(buffers);
}

// Получить ID папки для хранения чанков (создать если нет)
async function getSnapshotFolderId(drive: any, parentId: string) {
    const q = `name = '${SNAPSHOT_FOLDER_NAME}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const res = await drive.files.list({ q, fields: 'files(id)' });
    if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;
    
    const newFolder = await drive.files.create({
        requestBody: { name: SNAPSHOT_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
        fields: 'id'
    });
    return newFolder.data.id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=5');
    const action = req.query.action as string;

    try {
        const drive = await getGoogleDriveClient();
        const rootId = ROOT_FOLDERS['2025'];

        if (req.method === 'GET') {
            // 1. Получить метаданные (версию)
            if (action === 'get-snapshot-meta') {
                const metaRes = await drive.files.list({
                    q: `name = '${META_FILENAME}' and '${rootId}' in parents and trashed = false`,
                    fields: 'files(id)', pageSize: 1
                });
                
                if (metaRes.data.files && metaRes.data.files.length > 0) {
                    const fileId = metaRes.data.files[0].id;
                    if (fileId) {
                        const content = await drive.files.get({ fileId: fileId, alt: 'media' });
                        return res.json(content.data);
                    }
                }
                return res.json({ versionHash: 'none' });
            }

            // 2. Скачать и склеить весь снимок
            if (action === 'get-snapshot') {
                const folderId = await getSnapshotFolderId(drive, rootId);
                // Получаем все части, отсортированные по имени (part_000, part_001...)
                const listRes = await drive.files.list({
                    q: `'${folderId}' in parents and trashed = false`,
                    orderBy: 'name',
                    fields: 'files(id, name)',
                    pageSize: 1000
                });

                if (!listRes.data.files || listRes.data.files.length === 0) {
                    return res.status(404).json({ error: 'No snapshot parts found' });
                }

                // Скачиваем все части параллельно
                const parts = await Promise.all(listRes.data.files.map(async (file: any) => {
                    const resp = await drive.files.get({ fileId: file.id, alt: 'media' });
                    // resp.data может быть объектом или строкой, приводим к строке
                    return typeof resp.data === 'object' ? JSON.stringify(resp.data) : String(resp.data);
                }));

                // Склеиваем и отдаем
                const fullJson = parts.join('');
                try {
                    const parsed = JSON.parse(fullJson);
                    return res.json(parsed);
                } catch (e) {
                    // Если вдруг склейка прошла криво, отдаем как текст (клиент разберется) или ошибку
                    return res.send(fullJson); 
                }
            }
            
            // ... старые GET методы (get-full-cache и т.д.) ...
            if (action === 'get-full-cache' || !action) return res.json(await getFullCoordsCache());
            if (action === 'get-cached-address') {
                const { rmName, address } = req.query;
                const cached = await getAddressFromCache(rmName as string, address as string);
                return cached ? res.json(cached) : res.status(404).json({ error: 'Not found' });
            }
        }

        if (req.method === 'POST') {
            let body: any;
            // Ручной парсинг body
            try {
                const raw = await getRawBody(req);
                if (raw.length > 0) body = JSON.parse(raw.toString('utf8'));
            } catch (e) { }

            // 3. Инициализация: Очищаем папку с частями
            if (action === 'init-snapshot') {
                const folderId = await getSnapshotFolderId(drive, rootId);
                const files = await drive.files.list({ q: `'${folderId}' in parents and trashed = false`, fields: 'files(id)' });
                if (files.data.files && files.data.files.length) {
                    // Удаляем старые части
                    // Google Drive API rate limits deletions, so we do it sequentially or limited parallel
                    for (const f of files.data.files) {
                        if (f.id) await drive.files.delete({ fileId: f.id });
                    }
                }
                return res.json({ success: true });
            }

            // 4. Добавление части: Создаем файл part_XXX.json
            if (action === 'append-snapshot') {
                const { chunk, partIndex } = body; 
                const folderId = await getSnapshotFolderId(drive, rootId);
                
                // Имя файла с ведущими нулями для сортировки: part_001.json
                const fileName = `part_${String(partIndex).padStart(5, '0')}.json`;
                
                await drive.files.create({
                    requestBody: { name: fileName, parents: [folderId] },
                    media: { mimeType: 'application/json', body: chunk }
                });
                return res.json({ success: true });
            }

            // 5. Сохранение метаданных (Манифест)
            if (action === 'save-meta') {
                const q = `name = '${META_FILENAME}' and '${rootId}' in parents and trashed = false`;
                const list = await drive.files.list({ q, fields: 'files(id)' });
                
                const media = { mimeType: 'application/json', body: JSON.stringify(body) };
                
                if (list.data.files && list.data.files.length > 0 && list.data.files[0].id) {
                    const fileId = list.data.files[0].id;
                    await drive.files.update({ fileId, media });
                } else {
                    await drive.files.create({ requestBody: { name: META_FILENAME, parents: [rootId] }, media });
                }
                
                return res.json({ success: true });
            }

            // ... старые POST методы ...
            if (action === 'add-to-cache') { const { rmName, rows } = body; await appendToCache(rmName, rows.map((r: any) => [r.address, r.lat||'', r.lon||''])); return res.json({success:true}); }
            if (action === 'update-address') { await updateAddressInCache(body.rmName, body.oldAddress, body.newAddress, body.comment); return res.json({success:true}); }
            if (action === 'update-coords') { await updateCacheCoords(body.rmName, body.updates); return res.json({success:true}); }
            if (action === 'delete-address') { await deleteAddressFromCache(body.rmName, body.address); return res.json({success:true}); }
        }

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: (error as Error).message });
    }
    return res.status(400).json({ error: 'Invalid action' });
}