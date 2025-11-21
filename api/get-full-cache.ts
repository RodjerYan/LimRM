import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFullCoordsCache } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const cacheData = await getFullCoordsCache();
        // FIX: Disable caching completely to ensure immediate synchronization.
        // When a user updates an address in the UI, the next file upload MUST see that change immediately.
        res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
        res.status(200).json(cacheData);
    } catch (error) {
        console.error('--- Full Error Object from getFullCoordsCache ---');
        console.error(JSON.stringify(error, null, 2));

        let detailedMessage = 'An unknown server error occurred.';
        if (error instanceof Error) {
            detailedMessage = error.message;
        }
        
        const gapiError = error as any;
        if (gapiError.response?.data?.error) {
            const { message, code, status } = gapiError.response.data.error;
            detailedMessage = `Google API Error ${code} (${status}): ${message}`;
        }

        res.status(500).json({ error: 'Failed to retrieve coordinate cache data', details: detailedMessage });
    }
}