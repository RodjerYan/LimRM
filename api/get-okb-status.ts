import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SPREADSHEET_ID = '1ci4Uf92NaFHDlaem5UQ6lj7QjwJiKzTEu1BhcERUq6s';
const SHEET_NAME = 'Лист1'; 

// This auth function is specific to this endpoint, requesting readonly access
// to both Sheets and Drive metadata.
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
            'https://www.googleapis.com/auth/drive.metadata.readonly'
        ],
    });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const serviceAccountAuth = getAuth();
        
        // --- 1. Get row count from Google Sheets API ---
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        let sheet = doc.sheetsByTitle[SHEET_NAME];
        if (!sheet) {
            sheet = doc.sheetsByIndex[0];
        }

        let rowCount = 0;
        if (sheet) {
            const rows = await sheet.getRows();
            rowCount = rows.length;
        }

        // --- 2. Get modified time from Google Drive API ---
        const tokenResponse = await serviceAccountAuth.getAccessToken();
        const token = tokenResponse.token;
        if (!token) {
            throw new Error('Failed to retrieve access token for Google Drive API.');
        }

        const driveApiUrl = `https://www.googleapis.com/drive/v3/files/${SPREADSHEET_ID}?fields=modifiedTime`;
        const driveResponse = await fetch(driveApiUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!driveResponse.ok) {
            const errorText = await driveResponse.text();
            throw new Error(`Google Drive API error: ${driveResponse.status} ${errorText}`);
        }
        
        const fileMeta = await driveResponse.json();
        const modifiedTime = fileMeta.modifiedTime;

        // --- 3. Send response ---
        res.setHeader('Cache-Control', 'no-cache');
        res.status(200).json({ rowCount, modifiedTime });

    } catch (error: any) {
        console.error('Error in get-okb-status:', error);
        res.status(500).json({ 
            error: 'Failed to fetch sheet status.', 
            details: error.message 
        });
    }
}
