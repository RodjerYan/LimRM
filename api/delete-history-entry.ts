
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deleteHistoryEntry } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { rmName, currentAddress, entryIndex, entryContent } = req.body;

        if (!rmName || !currentAddress || entryIndex === undefined) {
            return res.status(400).json({ error: 'Valid rmName, currentAddress, and entryIndex are required.' });
        }

        const result = await deleteHistoryEntry(rmName, currentAddress, entryIndex, entryContent);

        if (!result) {
             return res.status(404).json({ error: 'Record not found or update failed.' });
        }

        res.status(200).json({ 
            success: true, 
            message: 'History entry deleted.', 
            restoredAddress: result.restoredAddress,
            restoredComment: result.restoredComment
        });
    } catch (error) {
        console.error(`Error in /api/delete-history-entry for RM ${req.body?.rmName}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'Failed to delete history entry', details: errorMessage });
    }
}
