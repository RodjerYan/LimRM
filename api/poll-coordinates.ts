import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSheetDataWithHeaders } from '../lib/sheets';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { rmSheets } = req.body;

        if (!Array.isArray(rmSheets) || rmSheets.length === 0) {
            return res.status(400).json({ error: 'An array of sheet names (rmSheets) is required.' });
        }

        let combinedData = [];
        for (const sheetName of rmSheets) {
            try {
                const sheetData = await getSheetDataWithHeaders(sheetName);
                combinedData.push(...sheetData);
            } catch (error) {
                console.warn(`Could not fetch data for sheet: ${sheetName}`, error);
                // Continue to next sheet even if one fails
            }
        }

        res.status(200).json({ allData: combinedData });

    } catch (error) {
        console.error('Error polling for coordinates:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'API error during coordinate polling', details: errorMessage });
    }
}
