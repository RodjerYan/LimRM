
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

const META_FILENAME = 'system_metadata_v2.json'; // v2 чтобы не конфликтовать со старым
const ROOT_FOLDERS: Record<string, string> = {
    '2025': '1uJX1deU3Xo29cGeaUsepvMdmDosCN-7u',
};

async function getRawBody(req: VercelRequest): Promise<Buffer> {
    const buffers = [];
    for await (const chunk of req) { buffers.push(chunk); }
    return Buffer.concat(buffers);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=5');
    const action = req.query.action as string;

    try {
        const drive = await getGoogleDriveClient();
        const rootId = ROOT_FOLDERS['2025'];

        if (req.method === 'GET') {
            // 1. Получить метаданные
            if (action === 'get-snapshot-meta') {
                try {
                    const list = await drive.files.list({
                        q: `name = '${META_FILENAME}' and '${rootId}' in parents and trashed = false`,
                        fields: 'files(id)', pageSize: 1
                    });
                    
                    if (list.data.files && list.data.files.length > 0) {
                        const fileId = list.data.files[0].id;
                        if (fileId) {
                            const content = await drive.files.get({ fileId, alt: 'media' });
                            return res.json(content.data);
                        }
                    }
                    return res.json({ versionHash: 'none' });
                } catch (e) {
                    return res.json({ versionHash: 'none', error: (e as Error).message });
                }
            }

            // 2. Скачать снимок (читает список файлов из метаданных и скачивает их)
            if (action === 'get-snapshot') {
                // Сначала получаем метаданные, чтобы узнать ID файлов-чанков
                const metaRes = await drive.files.list({
                    q: `name = '${META_FILENAME}' and '${rootId}' in parents and trashed = false`,
                    fields: 'files(id)', pageSize: 1
                });
                
                if (!metaRes.data.files || metaRes.data.files.length === 0) {
                    return res.status(404).json({ error: 'Meta file not found' });
                }

                // Читаем сам файл метаданных
                const fileId = metaRes.data.files[0].id;
                if (!fileId) return res.status(404).json({ error: 'Meta file ID invalid' });

                const metaContent = await drive.files.get({ fileId, alt: 'media' });
                const meta = metaContent.data as any;

                if (!meta.chunkFileIds || !Array.isArray(meta.chunkFileIds) || meta.chunkFileIds.length === 0) {
                    return res.status(404).json({ error: 'No chunks listed in metadata' });
                }

                // Скачиваем все файлы по списку ID
                const parts = await Promise.all(meta.chunkFileIds.map(async (fId: string) => {
                    try {
                        const resp = await drive.files.get({ fileId: fId, alt: 'media' });
                        return typeof resp.data === 'object' ? JSON.stringify(resp.data) : String(resp.data);
                    } catch (e) {
                        console.error(`Failed to download chunk ${fId}`, e);
                        return ''; // Skip failed chunk or handle error appropriately
                    }
                }));

                const fullJson = parts.join('');
                try {
                    return res.json(JSON.parse(fullJson));
                } catch (e) {
                    // Fallback if parsing fails (e.g. valid partial data)
                    return res.send(fullJson);
                }
            }
            
            if (action === 'get-full-cache' || !action) return res.json(await getFullCoordsCache());
            if (action === 'get-cached-address') {
                const { rmName, address } = req.query;
                const cached = await getAddressFromCache(rmName as string, address as string);
                return cached ? res.json(cached) : res.status(404).json({ error: 'Not found' });
            }
        }

        if (req.method === 'POST') {
            let body: any;
            try {
                const raw = await getRawBody(req);
                if (raw.length > 0) body = JSON.parse(raw.toString('utf8'));
            } catch (e) { }

            // 3. Инициализация (Ничего не удаляем, просто говорим ОК)
            if (action === 'init-snapshot') {
                return res.json({ success: true });
            }

            // 4. Загрузка части (Возвращает ID созданного файла)
            if (action === 'append-snapshot') {
                const { chunk, partIndex } = body; 
                const fileName = `snap_chunk_${Date.now()}_${partIndex}.json`;
                
                const file = await drive.files.create({
                    requestBody: { name: fileName, parents: [rootId] },
                    media: { mimeType: 'application/json', body: chunk },
                    fields: 'id'
                });
                
                // Возвращаем ID файла, чтобы клиент его запомнил
                return res.json({ success: true, fileId: file.data.id });
            }

            // 5. Финализация: Сохраняем список ID всех загруженных файлов
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

            // ... старые методы ...
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
