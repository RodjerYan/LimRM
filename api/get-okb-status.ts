import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';
// FIX: Explicitly import `Buffer` to resolve the "Cannot find name 'Buffer'" TypeScript error.
// This ensures the type is available even if Node.js globals are not automatically included in the compilation scope.
import { Buffer } from 'buffer';
import { getOKBAddresses, batchUpdateOKBStatus } from '../lib/sheets.js';

export const maxDuration = 30; // Set max duration to 30 seconds for this function

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 1. Get reference addresses from Google Sheets
        const okbAddresses = await getOKBAddresses();

        // 2. Validate and process the uploaded file from the request body
        if (!req.body || !req.body.fileBase64) {
            return res.status(400).json({ error: 'AKB file (as fileBase64) is required in the request body.' });
        }
        
        const buffer = Buffer.from(req.body.fileBase64, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const akbData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Create a Set for efficient lookup of addresses from the uploaded file
        const akbAddresses = new Set(akbData.flat().map(cell => String(cell).trim()));

        // 3. Compare addresses and prepare data for batch update
        const updates: { rowIndex: number, status: string }[] = [];
        const results: { okbAddress: string, status: string }[] = [];

        okbAddresses.forEach((okbAddress, index) => {
            const status = akbAddresses.has(okbAddress) ? 'Совпадение' : 'Не найдено';
            // Sheet is 1-indexed, and our data starts from row 2.
            updates.push({ rowIndex: index + 2, status });
            results.push({ okbAddress, status });
        });

        // 4. Perform the batch update to Google Sheets
        if (updates.length > 0) {
            await batchUpdateOKBStatus(updates);
        }

        // 5. Return the verification results
        res.status(200).json({ results });

    } catch (error) {
        console.error('Error during OKB status check:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'API error during OKB status check', details: errorMessage });
    }
}