
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getGoogleSheetsClient, listFilesForYear, getOKBData } from './_lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS Headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { year, mode, fileId, offset = '0', limit = '1000' } = req.query;

    try {
        // --- РЕЖИМ: ПОЛУЧИТЬ БАЗУ КЛИЕНТОВ (OKB) ---
        if (mode === 'okb_data') {
            const data = await getOKBData();
            res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60');
            return res.status(200).json(data);
        }

        // --- РЕЖИМ: ПОЛУЧИТЬ СПИСОК ФАЙЛОВ ---
        if (mode === 'list') {
            if (!year || typeof year !== 'string') {
                return res.status(400).json({ error: 'Year is required for list mode' });
            }
            const files = await listFilesForYear(year);
            res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=59');
            return res.status(200).json(files);
        }

        // --- РЕЖИМ: ПОЛУЧИТЬ КОНТЕНТ ФАЙЛА (ЧАНК ЧЕРЕЗ SHEETS API) ---
        if (fileId && typeof fileId === 'string') {
            const sheets = await getGoogleSheetsClient();
            
            // Sheets API использует 1-based индексацию
            const startRow = parseInt(offset as string, 10) + 1; 
            const endRow = startRow + parseInt(limit as string, 10) - 1;
            
            // Запрашиваем диапазон. Если имя листа не указано, берется первый.
            const range = `A${startRow}:CZ${endRow}`;

            try {
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: fileId,
                    range: range,
                    valueRenderOption: 'UNFORMATTED_VALUE',
                });
                
                const rows = response.data.values || [];
                
                // Если вернулось меньше строк, чем лимит, значит файл кончился
                const hasMore = rows.length === parseInt(limit as string, 10);

                res.setHeader('Cache-Control', 'no-store');
                return res.status(200).json({
                    fileId,
                    rows,
                    offset,
                    limit,
                    hasMore
                });

            } catch (error: any) {
                // ОБРАБОТКА КОНЦА ФАЙЛА
                // Если мы запросили диапазон за пределами листа (например, строки 90001-91000, а всего 90000),
                // Google вернет 400 Bad Request с сообщением "Range exceeds grid limits".
                // Мы ловим это и возвращаем пустой результат, чтобы фронтенд перешел к следующему файлу.
                if (error.code === 400 && (error.message.includes('exceeds grid limits') || error.message.includes('Unable to parse range'))) {
                    console.log(`Graceful EOF for file ${fileId} at offset ${offset}.`);
                    return res.status(200).json({
                        fileId,
                        rows: [],
                        offset,
                        limit,
                        hasMore: false
                    });
                }
                
                // Если ошибка другая, пробрасываем её дальше
                throw error;
            }
        }

        // Если ни один из режимов не подошел
        return res.status(400).json({ error: 'Invalid parameters. Use mode=list, mode=okb_data or provide a fileId.' });

    } catch (error: any) {
        console.error(`Critical API Error in /api/get-akb (mode=${mode}, fileId=${fileId}):`, error);
        res.status(500).json({ 
            error: 'Failed to process request.', 
            details: error.message 
        });
    }
}
