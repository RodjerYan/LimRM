import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SHEET_NAME = 'Лист1'; 

const getAuth = () => {
    const client_email = process.env.GOOGLE_CLIENT_EMAIL;
    const private_key = process.env.GOOGLE_PRIVATE_KEY;
    if (!client_email || !private_key) {
        throw new Error('Google credentials environment variables (GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY) are not set.');
    }
    
    return new JWT({
        email: client_email,
        key: private_key.replace(/\\n/g, '\n'),
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
        const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
        if (!SPREADSHEET_ID) {
            throw new Error("GOOGLE_SHEET_ID environment variable is not set.");
        }

        const serviceAccountAuth = getAuth();
        
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        let sheet = doc.sheetsByTitle[SHEET_NAME];
        
        // --- 2. Get modified time from Google Drive API ---
        const tokenResponse = await serviceAccountAuth.getAccessToken();
        const token = tokenResponse.token;
        if (!token) {
            throw new Error('Failed to retrieve access token for Google Drive API.');
        }

        const driveApiUrl = `https://www.googleapis.com/drive/v3/files/${SPREADSHEET_ID}?fields=modifiedTime`;
        const driveResponse = await fetch(driveApiUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!driveResponse.ok) {
            const errorText = await driveResponse.text();
            throw new Error(`Google Drive API error: ${driveResponse.status} ${errorText}`);
        }
        
        const fileMeta = await driveResponse.json();
        const modifiedTime = fileMeta.modifiedTime;

        // Per user suggestion: if sheet doesn't exist, or has 0/1 rows (header only), there are no data entries.
        if (!sheet || !sheet.rowCount || sheet.rowCount < 2) {
             res.setHeader('Cache-Control', 'no-cache');
             return res.status(200).json({ rowCount: 0, modifiedTime });
        }
        
        // Assuming rowCount > 1 implies a header row exists.
        const rowCount = sheet.rowCount - 1;

        res.setHeader('Cache-Control', 'no-cache');
        res.status(200).json({ rowCount, modifiedTime });

    } catch (error: any) {
        console.error('CRITICAL Error in get-okb-status:', error);
        
        let details = 'Failed to fetch sheet status.';
        // Check for specific Google API error structures
        const googleError = error.response?.data?.error;
        if (googleError) {
            if (googleError.code === 404) {
                details = `Google Sheet with the specified ID was not found. Please verify the GOOGLE_SHEET_ID environment variable.`;
            } else if (googleError.code === 403) {
                details = `Permission denied. The service account (${process.env.GOOGLE_CLIENT_EMAIL}) does not have 'Viewer' access to the Google Sheet.`;
            } else {
                details = `Google API Error: ${googleError.message}`;
            }
        } else if (error.message) {
             details = error.message;
        }

        res.status(500).json({ 
            error: 'Failed to fetch sheet status.', 
            details: details 
        });
    }
}
