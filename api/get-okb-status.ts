import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { google } from 'googleapis';

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
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets.readonly',
            'https://www.googleapis.com/auth/drive.readonly' // Scope for file metadata
        ],
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
        
        let sheet = doc.sheetsByTitle[SHEET_NAME];
        if (!sheet) {
            sheet = doc.sheetsByIndex[0];
        }

        if (!sheet) {
            return res.status(404).json({ error: 'No sheets found in the document.' });
        }

        const rowCount = sheet.rowCount - 1; // Exclude header

        // To get last modified time, we need to query the Drive API
        const drive = google.drive({ version: 'v3', auth: serviceAccountAuth });
        const fileMeta = await drive.files.get({
            fileId: SPREADSHEET_ID,
            fields: 'modifiedTime'
        });
        
        const modifiedTime = fileMeta.data.modifiedTime 
            ? new Date(fileMeta.data.modifiedTime).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) 
            : 'N/A';
        
        res.setHeader('Cache-Control', 'no-cache');
        res.status(200).json({ 
            rowCount: rowCount > 0 ? rowCount : 0,
            modifiedTime,
        });

    } catch (error: any) {
        console.error('Error in get-okb-status:', error);
        res.status(500).json({ 
            error: 'Failed to fetch sheet status.', 
            details: error.message 
        });
    }
}
