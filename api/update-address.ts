import type { VercelRequest, VercelResponse } from '@vercel/node';
import { updateAddressInCache, updateCacheCoords } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { rmName, oldAddress, newAddress, comment, action, updates } = req.body;

        if (!rmName || typeof rmName !== 'string') {
            return res.status(400).json({ error: 'A valid rmName (string) is required.' });
        }

        // Scenario 1: Batch Update Coordinates (formerly api/update-coords.ts)
        if (action === 'update-coords') {
            if (!Array.isArray(updates) || updates.length === 0) {
                return res.status(400).json({ error: 'A non-empty array of updates is required for update-coords action.' });
            }
            
            // Validate updates structure
            for (const update of updates) {
                if (typeof update.address !== 'string' || typeof update.lat !== 'number' || typeof update.lon !== 'number') {
                    return res.status(400).json({ error: 'Each update must be an object with address (string), lat (number), and lon (number).' });
                }
            }

            await updateCacheCoords(rmName, updates);
            return res.status(200).json({ success: true, message: `Updated coordinates for ${updates.length} addresses for ${rmName}.` });
        }

        // Scenario 2: Single Address/Comment Update (Default)
        if (typeof oldAddress !== 'string' || typeof newAddress !== 'string' || !newAddress.trim()) {
            return res.status(400).json({ error: 'oldAddress and a non-empty newAddress are required for address update.' });
        }

        // Pass comment to update logic (can be undefined)
        await updateAddressInCache(rmName, oldAddress, newAddress, comment);

        res.status(200).json({ success: true, message: `Address updated successfully for ${rmName}.` });

    } catch (error) {
        console.error(`Error in /api/update-address for RM ${req.body?.rmName}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'Failed to update data in cache', details: errorMessage });
    }
}