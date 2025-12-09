
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deleteHistoryEntryFromCache } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { rmName, address, entryText } = req.body;

        if (!rmName || typeof rmName !== 'string' || !address || typeof address !== 'string' || !entryText || typeof entryText !== 'string') {
            return res.status(400).json({ error: 'Valid rmName, address, and entryText are required.' });
        }

        await deleteHistoryEntryFromCache(rmName, address, entryText);

        res.status(200).json({ success: true, message: `History entry deleted successfully.` });
    } catch (error) {
        console.error(`Error in /api/delete-history-entry for RM ${req.body?.rmName}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'Failed to delete history entry from cache', details: errorMessage });
    }
}
