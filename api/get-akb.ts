
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAkbData, listFilesForMonth, fetchFileContent } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Add artificial delay to prevent hammering Google API
        await new Promise(resolve => setTimeout(resolve, 300));

        const year = (req.query.year as string) || '2025';
        const mode = req.query.mode as string; // 'list' or 'content'
        
        // Mode 1: List Files for a specific month
        if (mode === 'list') {
            const monthStr = req.query.month as string;
            const month = parseInt(monthStr, 10);
            
            if (isNaN(month) || month < 1 || month > 12) {
                return res.status(400).json({ error: 'Valid month (1-12) is required for list mode.' });
            }

            const files = await listFilesForMonth(year, month);
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).json(files);
        }

        // Mode 2: Fetch Content for a specific File ID via JSON
        if (req.query.fileId) {
            const fileId = req.query.fileId as string;
            
            // Switch to fetchFileContent (JSON) instead of export (Stream)
            // This avoids "Readable stream" timeouts on Vercel
            const content = await fetchFileContent(fileId);
            
            // Safety Limit: 5000 rows max per file to fit in Vercel function payload limits (~4.5MB)
            const limit = 5000;
            const limitedContent = content.slice(0, limit);
            
            res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
            res.status(200).json({
                fileId,
                rows: limitedContent,
                totalRows: content.length,
                truncated: content.length > limit
            });
            return;
        }

        // Legacy Fallback (Dangerous for large folders, should be avoided)
        const quarterStr = req.query.quarter as string;
        const monthStr = req.query.month as string;
        let quarter: number | undefined;
        let month: number | undefined;

        if (quarterStr) quarter = parseInt(quarterStr, 10);
        if (monthStr) month = parseInt(monthStr, 10);
        
        const akbData = await getAkbData(year, quarter, month);
        
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json(akbData || []);

    } catch (error) {
        console.error('Error in /api/get-akb:', error);
        
        let detailedMessage = 'An unknown server error occurred.';
        if (error instanceof Error) {
            detailedMessage = error.message;
        }
        
        const gapiError = error as any;
        if (gapiError.response?.data?.error) {
            const { message, code, status } = gapiError.response.data.error;
            detailedMessage = `Google API Error ${code} (${status}): ${message}`;
        }

        // If headers sent, we can't send JSON error, just end.
        if (res.headersSent) {
            res.end();
        } else {
            res.status(500).json({ error: 'Failed to retrieve AKB data', details: detailedMessage });
        }
    }
}
