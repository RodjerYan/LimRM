import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getOKBData } from '../lib/sheets.js';

export const maxDuration = 30; // Set max duration to 30 seconds for this function

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
        // --- Enhanced Error Logging ---
        console.error('--- Full Error Object from Google Sheets API ---');
        console.error(JSON.stringify(error, null, 2)); // Log the full error object for detailed inspection in Vercel

        let detailedMessage = 'An unknown server error occurred.';
        if (error instanceof Error) {
            detailedMessage = error.message;
        }
        
        // Check for specific Google API error structures
        const gapiError = error as any;
        if (gapiError.response?.data?.error) {
            const { message, code, status } = gapiError.response.data.error;
            detailedMessage = `Google API Error ${code} (${status}): ${message}`;
        } else if (gapiError.errors && Array.isArray(gapiError.errors) && gapiError.errors.length > 0) {
            detailedMessage = gapiError.errors.map((e: any) => e.message).join(', ');
        }

        res.status(500).json({ error: 'Failed to retrieve OKB data', details: detailedMessage });
    }
}