
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { updateAddressInCache } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { rmName, oldAddress, newAddress, comment } = req.body;

        if (!rmName || typeof rmName !== 'string' || typeof oldAddress !== 'string' || typeof newAddress !== 'string' || !newAddress.trim()) {
            return res.status(400).json({ error: 'A valid rmName, oldAddress, and a non-empty newAddress are required.' });
        }

        // Pass comment to update logic (can be undefined)
        await updateAddressInCache(rmName, oldAddress, newAddress, comment);

        res.status(200).json({ success: true, message: `Address updated successfully for ${rmName}.` });
    } catch (error) {
        console.error(`Error in /api/update-address for RM ${req.body?.rmName}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'Failed to update address in cache', details: errorMessage });
    }
}
