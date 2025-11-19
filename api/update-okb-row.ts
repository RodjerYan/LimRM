import type { VercelRequest, VercelResponse } from '@vercel/node';
import { updateOkbRow } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { rowData } = req.body;

        if (!rowData || typeof rowData !== 'object') {
            return res.status(400).json({ error: 'A valid rowData object is required.' });
        }
        
        // The rowData here is expected to be the *updated* full row object.
        // The sheets.ts helper will handle finding the original row and updating it.
        await updateOkbRow(rowData);

        res.status(200).json({ success: true, message: `Row updated successfully in OKB.` });
    } catch (error)
        {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        console.error(`Error in /api/update-okb-row:`, errorMessage);
        console.error('Full error object:', error);
        res.status(500).json({ error: 'Failed to update row in Google Sheets', details: errorMessage });
    }
}
