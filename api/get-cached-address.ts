import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAddressFromCache } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { rmName, address } = req.query;

        if (!rmName || typeof rmName !== 'string' || !address || typeof address !== 'string') {
            return res.status(400).json({ error: 'Query parameters rmName (string) and address (string) are required.' });
        }

        const cachedAddress = await getAddressFromCache(rmName, address as string);

        if (cachedAddress) {
            // We always want the latest data from the sheet for polling
            res.setHeader('Cache-Control', 'no-cache');
            return res.status(200).json(cachedAddress);
        } else {
            return res.status(404).json({ error: 'Address not found in the cache for the specified RM.' });
        }

    } catch (error) {
        console.error(`Error in /api/get-cached-address:`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'Failed to retrieve address from cache', details: errorMessage });
    }
}
