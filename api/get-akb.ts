
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAkbData, listFilesForMonth, fetchFileContent } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Небольшая задержка для предотвращения лимитов Google API при частых запросах
        await new Promise(resolve => setTimeout(resolve, 200));

        const year = (req.query.year as string) || '2025';
        const mode = req.query.mode as string; 
        
        // Режим 1: Получение списка файлов
        if (mode === 'list') {
            const monthStr = req.query.month as string;
            const month = parseInt(monthStr, 10);
            
            if (isNaN(month) || month < 1 || month > 12) {
                return res.status(400).json({ error: 'Неверный месяц' });
            }

            const files = await listFilesForMonth(year, month);
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).json(files);
        }

        // Режим 2: Загрузка контента частями (Чанкинг)
        if (req.query.fileId) {
            const fileId = req.query.fileId as string;
            const offset = parseInt(req.query.offset as string || '0', 10);
            const limit = parseInt(req.query.limit as string || '5000', 10);
            
            // Загружаем контент
            const allContent = await fetchFileContent(fileId);
            
            // Берем только нужный срез данных
            const chunk = allContent.slice(offset, offset + limit);
            const hasMore = offset + limit < allContent.length;
            
            res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
            return res.status(200).json({
                fileId,
                rows: chunk,
                offset,
                limit,
                totalRows: allContent.length,
                hasMore
            });
        }

        // Legacy Fallback
        res.status(400).json({ error: 'Не указан fileId или mode=list' });

    } catch (error) {
        console.error('Error in /api/get-akb:', error);
        let detailedMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: 'Ошибка сервера при чтении данных', details: detailedMessage });
    }
}
