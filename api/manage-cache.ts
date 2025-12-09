import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    appendToCache, 
    deleteAddressFromCache, 
    updateAddressInCache, 
    updateCacheCoords, 
    deleteHistoryEntryFromCache 
} from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action } = req.query;

    try {
        // 1. Add to Cache
        if (action === 'add-to-cache') {
            const { rmName, rows } = req.body;
            if (!rmName || typeof rmName !== 'string' || !Array.isArray(rows)) {
                return res.status(400).json({ error: 'Valid rmName and rows array are required for add-to-cache.' });
            }
            // Format rows: [address, lat, lon]
            const formattedRows = rows.map((row: any) => [row.address, row.lat ?? '', row.lon ?? '']);
            await appendToCache(rmName, formattedRows);
            return res.status(200).json({ success: true, message: `Appended ${rows.length} rows.` });
        }

        // 2. Delete Address
        if (action === 'delete-address') {
            const { rmName, address } = req.body;
            if (!rmName || !address) {
                return res.status(400).json({ error: 'Valid rmName and address are required for delete-address.' });
            }
            await deleteAddressFromCache(rmName, address);
            return res.status(200).json({ success: true, message: 'Address deleted.' });
        }

        // 3. Update Address / Comment
        if (action === 'update-address') {
            const { rmName, oldAddress, newAddress, comment } = req.body;
            if (!rmName || !oldAddress || !newAddress) {
                return res.status(400).json({ error: 'Valid rmName, oldAddress, and newAddress are required.' });
            }
            await updateAddressInCache(rmName, oldAddress, newAddress, comment);
            return res.status(200).json({ success: true, message: 'Address updated.' });
        }

        // 4. Update Coordinates
        if (action === 'update-coords') {
            const { rmName, updates } = req.body;
            if (!rmName || !Array.isArray(updates)) {
                return res.status(400).json({ error: 'Valid rmName and updates array are required.' });
            }
            await updateCacheCoords(rmName, updates);
            return res.status(200).json({ success: true, message: `Updated ${updates.length} coords.` });
        }

        // 5. Delete History Entry
        if (action === 'delete-history-entry') {
             const { rmName, address, entryText } = req.body;
             if (!rmName || !address || !entryText) {
                 return res.status(400).json({ error: 'Valid rmName, address, and entryText are required.' });
             }
             await deleteHistoryEntryFromCache(rmName, address, entryText);
             return res.status(200).json({ success: true, message: 'History entry deleted.' });
        }

        return res.status(400).json({ error: `Unknown action: ${action}` });

    } catch (error) {
        console.error(`Error in manage-cache [${action}]:`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: `Failed to process ${action}`, details: errorMessage });
    }
}