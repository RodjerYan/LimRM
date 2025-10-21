import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SPREADSHEET_ID = '1ci4Uf92NaFHDlaem5UQ6lj7QjwJiKzTEu1BhcERUq6s';
const SHEET_NAME = 'Лист1'; 

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY;

    if (!email || !key) {
        console.error("Handler failed: Google Service Account credentials are not configured.");
        return res.status(500).json({ error: 'Google Service Account credentials are not configured on the server.' });
    }

    try {
        // CRITICAL FIX: Authentication logic moved from the global scope into the handler.
        // This prevents the entire module from crashing on startup if env vars are not immediately available.
        const serviceAccountAuth = new JWT({
            email: email,
            key: key.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        
        let sheet = doc.sheetsByTitle[SHEET_NAME];
        if (!sheet) {
            console.warn(`Sheet "${SHEET_NAME}" not found. Falling back to the first available sheet.`);
            sheet = doc.sheetsByIndex[0];
        }

        if (!sheet) {
            return res.status(200).json([]);
        }

        const rows = await sheet.getRows();
        const data = rows.map(row => row.toObject());

        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=82800');
        res.status(200).json(data);

    } catch (error: any) {
        console.error('Error fetching from Google Sheets:', error);
        res.status(500).json({ error: 'Failed to fetch data from Google Sheets.', details: error.message });
    }
}