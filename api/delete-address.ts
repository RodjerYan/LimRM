import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deleteAddressFromCache, deleteHistoryEntry } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { rmName, address, action, entryIndex, currentAddress, entryContent } = req.body;

        if (!rmName || typeof rmName !== 'string') {
            return res.status(400).json({ error: 'Valid rmName is required.' });
        }

        // Scenario 1: Delete a specific history entry
        if (action === 'delete-history' || entryIndex !== undefined) {
            if (!currentAddress || entryIndex === undefined) {
                return res.status(400).json({ error: 'currentAddress and entryIndex are required for history deletion.' });
            }
            
            const result = await deleteHistoryEntry(rmName, currentAddress, entryIndex, entryContent || '');
            
            if (!result) {
                return res.status(404).json({ error: 'History entry not found or update failed.' });
            }

            return res.status(200).json({ 
                success: true, 
                message: 'History entry deleted.', 
                restoredAddress: result.restoredAddress,
                restoredComment: result.restoredComment
            });
        }

        // Scenario 2: Delete the entire address row (Soft delete)
        if (!address || typeof address !== 'string') {
            return res.status(400).json({ error: 'Valid address is required for deletion.' });
        }

        await deleteAddressFromCache(rmName, address);

        res.status(200).json({ success: true, message: `Address deleted successfully for ${rmName}.` });

    } catch (error) {
        console.error(`Error in /api/delete-address for RM ${req.body?.rmName}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'Failed to process deletion request', details: errorMessage });
    }
}