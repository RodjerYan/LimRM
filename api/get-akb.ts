
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchFileContent, listFilesForYear } from './_lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS Headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { year, mode, fileId, offset = '0', limit = '1000', mimeType } = req.query;

    try {
        // --- РЕЖИМ: ПОЛУЧИТЬ СПИСОК ФАЙЛОВ ---
        if (mode === 'list') {
            if (!year || typeof year !== 'string') {
                return res.status(400).json({ error: 'Year is required for list mode' });
            }
            const files = await listFilesForYear(year);
            res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=59');
            return res.status(200).json(files);
        }

        // --- РЕЖИМ: ПОЛУЧИТЬ КОНТЕНТ ФАЙЛА (ЧАНК) ---
        if (fileId && typeof fileId === 'string') {
            // Создаем range-строку для новой функции
            const startRow = parseInt(offset as string, 10);
            const endRow = startRow + parseInt(limit as string, 10);
            const range = `A${startRow + 1}:CZ${endRow}`; 

            // Передаем mimeType, чтобы функция знала, как обработать файл
            const rows = await fetchFileContent(fileId, range, mimeType as string);
            
            const hasMore = rows.length === parseInt(limit as string, 10);
            
            res.setHeader('Cache-Control', 'no-store'); // Данные чанка не кэшируем
            return res.status(200).json({
                fileId,
                rows,
                offset,
                limit,
                hasMore
            });
        }

        // Если ни один из режимов не подошел
        return res.status(400).json({ error: 'Invalid parameters. Use mode=list or provide a fileId.' });

    } catch (error: any) {
        console.error(`Critical API Error in /api/get-akb (mode=${mode}, fileId=${fileId}):`, error);
        res.status(500).json({ 
            error: 'Failed to process file from Google Drive.', 
            details: error.message 
        });
    }
}
