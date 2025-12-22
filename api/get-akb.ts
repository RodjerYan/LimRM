
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listFilesForMonth, fetchFileContent, getGoogleDriveClient } from './lib/sheets.js';

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
            const month = parseInt(req.query.month as string || '1', 10);
            const files = await listFilesForMonth(year, month);
            
            if (files.length === 0) return res.status(200).json({ version: 'none' });

            // Получаем подробные метаданные самого свежего файла в папке
            const lastFile = files[0];
            const meta = await drive.files.get({
                fileId: lastFile.id,
                fields: 'modifiedTime, size, name'
            });

            return res.status(200).json({
                fileId: lastFile.id,
                name: lastFile.name,
                modifiedTime: meta.data.modifiedTime,
                size: meta.data.size,
                // Создаем уникальный хеш версии
                versionHash: `${meta.data.modifiedTime}-${meta.data.size}`
            });
        }

        // Режим 1: Получение списка файлов
        if (mode === 'list') {
            const monthStr = req.query.month as string;
            const month = parseInt(monthStr, 10);
            const files = await listFilesForMonth(year, month);
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).json(files);
        }

        // Режим 2: Загрузка контента частями (Чанкинг)
        if (req.query.fileId) {
            const fileId = req.query.fileId as string;
            const offset = parseInt(req.query.offset as string || '0', 10);
            // Уменьшаем лимит до 2000, так как широкие таблицы (до CZ) могут превышать 4.5МБ лимит Vercel
            const limit = parseInt(req.query.limit as string || '2000', 10);
            
            const startRow = offset + 1;
            const endRow = offset + limit;
            // Расширяем диапазон до CZ (104 колонки), чтобы не терять данные в широких отчетах
            const range = `A${startRow}:CZ${endRow}`;

            const chunk = await fetchFileContent(fileId, range);
            // Если API вернуло пустой массив или меньше строк, чем мы просили — данных больше нет
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
