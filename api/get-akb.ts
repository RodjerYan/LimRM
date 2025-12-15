
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAkbData } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Extract year from query parameter, default to '2025' if not provided for safety
        const year = (req.query.year as string) || '2025';
        
        // Extract optional quarter parameter (1, 2, 3, 4)
        const quarterStr = req.query.quarter as string;
        let quarter: number | undefined;
        if (quarterStr) {
            const q = parseInt(quarterStr, 10);
            if (!isNaN(q) && q >= 1 && q <= 4) {
                quarter = q;
            }
        }
        
        const akbData = await getAkbData(year, quarter);
        
        if (!akbData || akbData.length === 0) {
             throw new Error('No data found for year ' + year + (quarter ? ` Q${quarter}` : ''));
        }

        // Prevent caching for this data as it might change frequently
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.status(200).json(akbData);
    } catch (error) {
        console.error('Error fetching AKB data from Google Sheets:', error);
        
        let detailedMessage = 'An unknown server error occurred.';
        if (error instanceof Error) {
            detailedMessage = error.message;
        }
        
        const gapiError = error as any;
        if (gapiError.response?.data?.error) {
            const { message, code, status } = gapiError.response.data.error;
            detailedMessage = `Google API Error ${code} (${status}): ${message}`;
        }

        res.status(500).json({ error: 'Failed to retrieve AKB data', details: detailedMessage });
    }
}
