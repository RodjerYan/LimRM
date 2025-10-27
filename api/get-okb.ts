import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getOKBData } from '../lib/sheets';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const okbData = await getOKBData();
        // Set cache headers to improve performance and reduce API calls
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
        res.status(200).json(okbData);
    } catch (error) {
        console.error('Error fetching OKB data from Google Sheets:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'Failed to retrieve OKB data', details: errorMessage });
    }
}
