
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    getFullCoordsCache, 
    getAddressFromCache, 
    appendToCache, 
    deleteAddressFromCache, 
    updateAddressInCache, 
    updateCacheCoords,
    getGoogleSheetsClient 
} from './_lib/sheets.js';

export const config = {
    maxDuration: 300, 
    api: { bodyParser: { sizeLimit: '20mb' } },
};

// ID таблицы для хранения снапшотов (как базы данных)
const SPREADSHEET_ID = '1jiC-jbWz6LYpOn1FTuDdlbC7hEevJ8gJkDFwra3shag'; 
const SNAPSHOT_SHEET_TITLE = 'System_Snapshot';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=5');
    const action = req.query.action as string;

    try {
        const sheets = await getGoogleSheetsClient();

        if (req.method === 'GET') {
            // 1. Читаем метаданные (Ячейка B1)
            if (action === 'get-snapshot-meta') {
                try {
                    const response = await sheets.spreadsheets.values.get({
                        spreadsheetId: SPREADSHEET_ID,
                        range: `'${SNAPSHOT_SHEET_TITLE}'!B1`
                    });
                    if (response.data.values && response.data.values.length > 0 && response.data.values[0][0]) {
                        return res.json(JSON.parse(response.data.values[0][0]));
                    }
                    return res.json({ versionHash: 'none' });
                } catch (e) { 
                    console.warn("Meta read failed (sheet might be missing):", e);
                    return res.json({ versionHash: 'none' }); 
                }
            }

            // 2. Скачиваем данные (Колонка A) - Склеиваем строки обратно в JSON
            if (action === 'get-snapshot') {
                try {
                    const response = await sheets.spreadsheets.values.get({
                        spreadsheetId: SPREADSHEET_ID,
                        range: `'${SNAPSHOT_SHEET_TITLE}'!A:A`
                    });
                    if (!response.data.values) return res.status(404).json({ error: 'Snapshot empty' });
                    
                    // Соединяем все ячейки столбца А в одну большую JSON-строку
                    const fullJson = response.data.values.map((row: any) => row[0]).join('');
                    return res.json(JSON.parse(fullJson));
                } catch (e) { 
                    console.error("Snapshot read failed:", e);
                    return res.status(404).json({ error: 'Snapshot not found or corrupted' }); 
                }
            }
            
            // --- Legacy GET methods ---
            if (action === 'get-full-cache' || !action) return res.json(await getFullCoordsCache());
            if (action === 'get-cached-address') {
                const { rmName, address } = req.query;
                const cached = await getAddressFromCache(rmName as string, address as string);
                return cached ? res.json(cached) : res.status(404).json({ error: 'Not found' });
            }
        }

        if (req.method === 'POST') {
            const body = req.body;

            // --- SHEETS SNAPSHOT LOGIC (Database Mode) ---
            
            if (action === 'init-snapshot') {
                // Проверяем/Создаем лист и очищаем его
                try {
                    await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, ranges: [SNAPSHOT_SHEET_TITLE] });
                } catch (e) {
                    await sheets.spreadsheets.batchUpdate({
                        spreadsheetId: SPREADSHEET_ID,
                        requestBody: { requests: [{ addSheet: { properties: { title: SNAPSHOT_SHEET_TITLE } } }] }
                    });
                }
                
                await sheets.spreadsheets.values.clear({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `'${SNAPSHOT_SHEET_TITLE}'!A:B`
                });
                return res.json({ success: true });
            }

            if (action === 'append-snapshot') {
                const { chunk } = body;
                if (!chunk) return res.status(400).json({ error: 'No chunk data' });
                
                // Пишем чанк в следующую свободную строку столбца А
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `'${SNAPSHOT_SHEET_TITLE}'!A:A`,
                    valueInputOption: 'RAW',
                    requestBody: { values: [[chunk]] }
                });
                return res.json({ success: true });
            }

            if (action === 'save-snapshot-meta') {
                 const { meta } = body;
                 // Пишем метаданные в ячейку B1
                 await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `'${SNAPSHOT_SHEET_TITLE}'!B1`,
                    valueInputOption: 'RAW',
                    requestBody: { values: [[JSON.stringify(meta)]] }
                });
                 return res.json({ success: true });
            }


            // --- Legacy POST methods ---
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
