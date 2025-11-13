import type { VercelRequest, VercelResponse } from '@vercel/node';
import { syncAkbAndFetch, pollCoordinates } from '../lib/sheets.js';
import { AkbRow } from '../types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { action, payload } = req.body;

        switch (action) {
            case 'SYNC':
                const { allData, newlyAddedAddresses } = await syncAkbAndFetch(payload as { [rmName: string]: AkbRow[] });
                return res.status(200).json({ allData, newlyAddedAddresses });

            case 'POLL':
                const updatedRows = await pollCoordinates(payload as { [rmName: string]: string[] });
                return res.status(200).json(updatedRows);

            default:
                return res.status(400).json({ error: 'Invalid action specified.' });
        }

    } catch (error) {
        console.error('--- AKB API Error ---');
        console.error(JSON.stringify(error, null, 2));

        let detailedMessage = 'An unknown server error occurred.';
        if (error instanceof Error) {
            detailedMessage = error.message;
        }

        const gapiError = error as any;
        if (gapiError.response?.data?.error) {
            const { message, code, status } = gapiError.response.data.error;
            detailedMessage = `Google API Error ${code} (${status}): ${message}`;
        } else if (gapiError.errors && Array.isArray(gapiError.errors) && gapiError.errors.length > 0) {
            detailedMessage = gapiError.errors.map((e: any) => e.message).join(', ');
        }

        res.status(500).json({ error: 'Failed to process AKB request', details: detailedMessage });
    }
}