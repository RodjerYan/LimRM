import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SHEET_NAME = 'Лист1'; 
const HEADERS = [
    "Страна", "Субъект", "Город или населенный пункт",
    "Категория (вет. клиника или вет. магазин)", "Наименование",
    "Адрес", "Контакты", "Дата обновления базы"
];

const getAuth = () => {
    const client_email = process.env.GOOGLE_CLIENT_EMAIL;
    const private_key = process.env.GOOGLE_PRIVATE_KEY;

    if (!client_email || !private_key) {
        throw new Error('Google credentials environment variables (GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY) are not set.');
    }

    return new JWT({
        email: client_email,
        key: private_key.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
};


export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
        if (!SPREADSHEET_ID) {
            throw new Error("GOOGLE_SHEET_ID environment variable is not set.");
        }

        const serviceAccountAuth = getAuth();
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        
        await doc.loadInfo();
        
        let sheet = doc.sheetsByTitle[SHEET_NAME];
        if (!sheet) {
            console.log(`Sheet "${SHEET_NAME}" not found, creating it.`);
            sheet = await doc.addSheet({ title: SHEET_NAME, headerValues: HEADERS });
            return res.status(200).json([]);
        }

        // Ensure headers exist even if the sheet was created manually but is empty
        await sheet.loadHeaderRow().catch(() => {});
        if (!sheet.headerValues || sheet.headerValues.length === 0) {
            console.log("Sheet exists but has no headers. Setting headers now.");
            await sheet.setHeaderRow(HEADERS);
            return res.status(200).json([]);
        }

        const rows = await sheet.getRows();
        const data = rows.map(row => row.toObject());

        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=82800');
        res.status(200).json(data);

    } catch (error: any) {
        console.error('CRITICAL API ERROR in get-okb:', error);
        res.status(500).json({ 
            error: 'Failed to fetch data from Google Sheets.', 
            details: error.message 
        });
    }
}
