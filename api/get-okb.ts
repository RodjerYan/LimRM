import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SPREADSHEET_ID = '1ci4Uf92NaFHDlaem5UQ6lj7QjwJiKzTEu1BhcERUq6s';
// ИСПРАВЛЕНО: Целевой лист изменен на 'Лист1' в соответствии со скриншотом.
const SHEET_NAME = 'Лист1'; 

const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        return res.status(500).json({ error: 'Google Service Account credentials are not configured on the server.' });
    }

    try {
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        
        // УЛУЧШЕНО: Более надежный поиск листа
        let sheet = doc.sheetsByTitle[SHEET_NAME];
        if (!sheet) {
            console.warn(`Sheet "${SHEET_NAME}" not found. Falling back to the first available sheet.`);
            sheet = doc.sheetsByIndex[0]; // Пытаемся взять первый лист, если по имени не найден
        }

        if (!sheet) {
            // Если листов нет вообще, значит база еще не создана.
            // Возвращаем пустой массив, это ожидаемое поведение.
            return res.status(200).json([]);
        }

        const rows = await sheet.getRows();
        const data = rows.map(row => row.toObject());

        // Add caching headers for Vercel's Edge Network
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=82800'); // Cache for 1 hour, stale for 23 hours
        res.status(200).json(data);

    } catch (error: any) {
        console.error('Error fetching from Google Sheets:', error);
        res.status(500).json({ error: 'Failed to fetch data from Google Sheets.', details: error.message });
    }
}
