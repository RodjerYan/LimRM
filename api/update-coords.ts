import type { VercelRequest, VercelResponse } from '@vercel/node';
import { updateCacheCoords } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { rmName, updates } = req.body;

        if (!rmName || typeof rmName !== 'string' || !Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({ error: 'A valid rmName (string) and a non-empty array of updates are required.' });
        }

        for (const update of updates) {
            if (typeof update.address !== 'string' || typeof update.lat !== 'number' || typeof update.lon !== 'number') {
                return res.status(400).json({ error: 'Each update must be an object with address (string), lat (number), and lon (number).' });
            }
        }

        await updateCacheCoords(rmName, updates);

        res.status(200).json({ success: true, message: `Updated coordinates for ${updates.length} addresses for ${rmName}.` });
    } catch (error) {
        console.error(`Error in /api/update-coords for RM ${req.body?.rmName}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'Failed to update coordinates in cache', details: errorMessage });
    }
}