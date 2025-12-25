
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';
import { Buffer } from 'buffer';
import { 
    getOKBData, 
    getOKBAddresses, 
    batchUpdateOKBStatus, 
    listFilesForMonth, 
    listFilesForYear, 
    fetchFileContent, 
    getGoogleDriveClient 
} from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const action = req.query.action as string;

    try {
        // 1. Получение базы ОКБ
        if (action === 'get-okb') {
            const okbData = await getOKBData();
            res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
            return res.status(200).json(okbData);
        }

        // 2. Проверка статуса (Сопоставление)
        if (action === 'get-okb-status' && req.method === 'POST') {
            const okbAddresses = await getOKBAddresses();
            if (!req.body?.fileBase64) return res.status(400).json({ error: 'fileBase64 required' });
            
            const buffer = Buffer.from(req.body.fileBase64, 'base64');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const akbData: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
            const akbAddresses = new Set(akbData.flat().map(cell => String(cell || '').trim()));

            const updates: { rowIndex: number, status: string }[] = [];
            okbAddresses.forEach((addr, idx) => {
                const status = akbAddresses.has(addr) ? 'Совпадение' : 'Не найдено';
                updates.push({ rowIndex: idx + 2, status });
            });

            if (updates.length > 0) await batchUpdateOKBStatus(updates);
            return res.status(200).json({ success: true });
        }

        // 3. Работа с файлами АКБ (Облако)
        if (action === 'get-akb') {
            const year = (req.query.year as string) || '2025';
            const mode = req.query.mode as string;

            if (mode === 'metadata') {
                const drive = await getGoogleDriveClient();
                const files = await listFilesForYear(year);
                if (files.length === 0) return res.status(200).json({ version: 'none' });
                const meta = await drive.files.get({ fileId: files[0].id, fields: 'modifiedTime, size' });
                return res.status(200).json({ versionHash: `${meta.data.modifiedTime}-${meta.data.size}-${files.length}` });
            }

            if (mode === 'list') {
                const files = await listFilesForYear(year);
                return res.status(200).json(files);
            }

            if (req.query.fileId) {
                const offset = parseInt(req.query.offset as string || '0', 10);
                const limit = parseInt(req.query.limit as string || '5000', 10);
                const chunk = await fetchFileContent(req.query.fileId as string, `A${offset + 1}:CZ${offset + limit}`);
                return res.status(200).json({ rows: chunk, hasMore: chunk.length >= limit });
            }
        }

        return res.status(400).json({ error: 'Invalid action' });
    } catch (e: any) {
        console.error('Data API error:', e);
        return res.status(500).json({ error: e.message });
    }
}
