
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SPREADSHEET_ID = '1ci4Uf92NaFHDlaem5UQ6lj7QjwJiKzTEu1BhcERUq6s';
const SHEET_NAME = 'Лист1';

const getAuth = () => {
    const credsBase64 = process.env.GOOGLE_CREDENTIALS_BASE64;
    if (!credsBase64) {
        throw new Error('Google credentials environment variable GOOGLE_CREDENTIALS_BASE64 is not set.');
    }
    
    const credsJson = Buffer.from(credsBase64, 'base64').toString('utf-8');
    const { client_email, private_key } = JSON.parse(credsJson);

    return new JWT({
        email: client_email,
        key: private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const serviceAccountAuth = getAuth();
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        
        await doc.loadInfo();
        
        const sheet = doc.sheetsByTitle[SHEET_NAME];
        if (!sheet) {
            return res.status(200).json({ rowCount: 0, lastUpdated: null, message: `Sheet "${SHEET_NAME}" not found.` });
        }
        
        const lastUpdated = doc.properties.modifiedTime;

        // rowCount includes the header row, so subtract 1 for the actual data row count.
        const dataRowCount = sheet.rowCount > 0 ? sheet.rowCount - 1 : 0;
        
        res.setHeader('Cache-Control', 'no-cache');
        res.status(200).json({ 
            rowCount: dataRowCount,
            lastUpdated: lastUpdated
        });

    } catch (error: any) {
        console.error('CRITICAL API ERROR in get-okb-status:', error);
        res.status(500).json({ 
            error: 'Failed to fetch sheet status.', 
            details: error.message 
        });
    }
}
