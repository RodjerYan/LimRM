import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appendToCache } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { rmName, rows } = req.body;

        if (!rmName || typeof rmName !== 'string' || !Array.isArray(rows)) {
            return res.status(400).json({ error: 'A valid rmName (string) and an array of rows are required.' });
        }
        
        const formattedRows = rows.map(row => [row.address, row.lat, row.lon]);

        await appendToCache(rmName, formattedRows);

        res.status(200).json({ success: true, message: `Appended up to ${rows.length} rows to sheet for ${rmName}.` });
    } catch (error) {
        console.error(`Error in /api/add-to-cache for RM ${req.body?.rmName}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'Failed to add data to cache', details: errorMessage });
    }
}