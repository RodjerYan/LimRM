
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

        // Extract optional month parameter (1-12)
        const monthStr = req.query.month as string;
        let month: number | undefined;
        if (monthStr) {
            const m = parseInt(monthStr, 10);
            if (!isNaN(m) && m >= 1 && m <= 12) {
                month = m;
            }
        }
        
        const akbData = await getAkbData(year, quarter, month);
        
        // Return 200 with empty array even if no data, as per new logic for split loading
        // Only throw if absolutely no data AND no specific filter specified (full year missing)
        if ((!akbData || akbData.length === 0) && !quarter && !month) {
             throw new Error('No data found for year ' + year);
        }

        // Prevent caching for this data as it might change frequently
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.status(200).json(akbData || []);
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
