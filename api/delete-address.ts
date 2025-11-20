import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deleteAddressFromCache } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { rmName, address } = req.body;

        if (!rmName || typeof rmName !== 'string' || !address || typeof address !== 'string') {
            return res.status(400).json({ error: 'Valid rmName and address are required.' });
        }

        await deleteAddressFromCache(rmName, address);

        res.status(200).json({ success: true, message: `Address deleted successfully for ${rmName}.` });
    } catch (error) {
        console.error(`Error in /api/delete-address for RM ${req.body?.rmName}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'Failed to delete address from cache', details: errorMessage });
    }
}