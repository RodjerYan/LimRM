import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getOKBData, getAkbData } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { source } = req.query;

        // Scenario 1: Fetch Active Client Base (AKB) from Cloud
        if (source === 'akb') {
            const akbData = await getAkbData();
            // Prevent caching for AKB as it might change frequently and is user-initiated
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            return res.status(200).json(akbData);
        }

        // Scenario 2: Fetch General Client Base (OKB) - Default
        const okbData = await getOKBData();
        // Set cache headers to improve performance and reduce API calls for OKB
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
        res.status(200).json(okbData);

    } catch (error) {
        console.error('--- Full Error Object from Google Sheets API ---');
        console.error(JSON.stringify(error, null, 2));

        let detailedMessage = 'An unknown server error occurred.';
        if (error instanceof Error) {
            detailedMessage = error.message;
        }
        
        const gapiError = error as any;
        if (gapiError.response?.data?.error) {
            const { message, code, status } = gapiError.response.data.error;
            detailedMessage = `Google API Error ${code} (${status}): ${message}`;
        } else if (gapiError.errors && Array.isArray(gapiError.errors) && gapiError.errors.length > 0) {
            detailedMessage = gapiError.errors.map((e: any) => e.message).join(', ');
        }

        res.status(500).json({ error: 'Failed to retrieve data', details: detailedMessage });
    }
}