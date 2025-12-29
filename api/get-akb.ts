
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listFilesForMonth, listFilesForYear, fetchFileContent, getGoogleDriveClient } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const year = (req.query.year as string) || '2025';
        const mode = req.query.mode as string; 
        
        // Режим 3: Быстрая проверка метаданных (для авто-обновления)
        if (mode === 'metadata') {
            const drive = await getGoogleDriveClient();
            const monthStr = req.query.month as string;
            
            let files = [];
            if (monthStr) {
                files = await listFilesForMonth(year, parseInt(monthStr, 10));
            } else {
                files = await listFilesForYear(year);
            }
            
            if (files.length === 0) return res.status(200).json({ version: 'none' });

            // Сортируем по времени изменения (если Google API позволяет получить modifiedTime сразу в списке,
            // но так как listFiles возвращает только id/name, берем метаданные первого попавшегося)
            const lastFile = files[0];
            const meta = await drive.files.get({
                fileId: lastFile.id,
                fields: 'modifiedTime, size, name'
            });

            // Для года хеш должен учитывать количество файлов
            return res.status(200).json({
                fileId: lastFile.id,
                name: lastFile.name,
                modifiedTime: meta.data.modifiedTime,
                size: meta.data.size,
                fileCount: files.length,
                // Создаем уникальный хеш версии. Добавляем количество файлов, 
                // чтобы изменение состава файлов в году тоже вызывало ресинк.
                versionHash: `${meta.data.modifiedTime}-${meta.data.size}-${files.length}`
            });
        }

        // Режим 1: Получение списка файлов
        if (mode === 'list') {
            const monthStr = req.query.month as string;
            let files = [];
            
            if (monthStr) {
                files = await listFilesForMonth(year, parseInt(monthStr, 10));
            } else {
                files = await listFilesForYear(year);
            }
            
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).json(files);
        }

        // Режим 2: Загрузка контента частями (Чанкинг)
        if (req.query.fileId) {
            const fileId = req.query.fileId as string;
            const offset = parseInt(req.query.offset as string || '0', 10);
            const limit = parseInt(req.query.limit as string || '2000', 10);
            
            const startRow = offset + 1;
            const endRow = offset + limit;
            const range = `A${startRow}:CZ${endRow}`;

            const chunk = await fetchFileContent(fileId, range);
            const hasMore = chunk.length > 0 && chunk.length >= limit;
            
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).json({
                fileId,
                rows: chunk,
                offset,
                limit,
                hasMore
            });
        }

        res.status(400).json({ error: 'Invalid request parameters' });

    } catch (error) {
        console.error('Error in /api/get-akb:', error);
        res.status(500).json({ error: 'Server error', details: error instanceof Error ? error.message : 'Unknown' });
    }
}
