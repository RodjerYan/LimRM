import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
     if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    const googleScriptUrl = process.env.GOOGLE_SCRIPT_URL;
    if (!googleScriptUrl) {
        return res.status(500).json({ error: 'Google Script URL is not configured.' });
    }
    
    try {
        // Add an 'action=getStatus' parameter to the URL to call the specific function in the Apps Script.
        const response = await fetch(`${googleScriptUrl}?action=getStatus`);

        if (!response.ok) {
            throw new Error(`Google Script returned an error: ${response.statusText}`);
        }

        const statusData = await response.json();
        
        // The Apps Script should return a JSON object with `lastModified`, `rowCount`, etc.
        return res.status(200).json({
            isReady: !!statusData.lastModified,
            lastModified: statusData.lastModified || null,
            rowCount: statusData.rowCount || 0,
        });

    } catch (error) {
        console.error('Error fetching OKB status:', error);
        return res.status(500).json({
            isReady: false,
            error: 'Failed to get status from Google Sheets.',
            details: (error as Error).message,
        });
    }
}
