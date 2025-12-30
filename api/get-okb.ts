
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';
import { Buffer } from 'buffer';
import { 
    getOKBData, 
    listFilesForMonth, 
    listFilesForYear, 
    fetchFileContent, 
    getGoogleDriveClient,
    getOKBAddresses, 
    batchUpdateOKBStatus 
} from './lib/sheets.js';

// HACK: Consolidated Data Handler to save Vercel slots.
export default async function handler(req: VercelRequest, res: VercelResponse) {
    const action = req.query.action as string;

    // --- GET: OKB & AKB Logic ---
    if (req.method === 'GET') {
        
        // 1. Get OKB (Default)
        if (action === 'get-okb' || !action) {
            try {
                const okbData = await getOKBData();
                res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60');
                return res.status(200).json(okbData);
            } catch (error) {
                return res.status(500).json({ error: 'Failed to load OKB', details: (error as Error).message });
            }
        }

        // 2. Get AKB (Cloud Files)
        if (action === 'get-akb') {
            try {
                const year = (req.query.year as string) || '2025';
                const mode = req.query.mode as string;

                // Sub-mode: Metadata
                if (mode === 'metadata') {
                    const drive = await getGoogleDriveClient();
                    const monthStr = req.query.month as string;
                    let files = monthStr ? await listFilesForMonth(year, parseInt(monthStr, 10)) : await listFilesForYear(year);
                    
                    if (files.length === 0) return res.status(200).json({ version: 'none' });
                    
                    const lastFile = files[0];
                    // Explicit cast to any for drive API response
                    const meta = await drive.files.get({ fileId: lastFile.id, fields: 'modifiedTime, size, name' }) as any;
                    
                    return res.status(200).json({
                        fileId: lastFile.id,
                        name: lastFile.name,
                        modifiedTime: meta.data.modifiedTime,
                        size: meta.data.size,
                        fileCount: files.length,
                        versionHash: `${meta.data.modifiedTime}-${meta.data.size}-${files.length}`
                    });
                }

                // Sub-mode: List
                if (mode === 'list') {
                    const monthStr = req.query.month as string;
                    const files = monthStr ? await listFilesForMonth(year, parseInt(monthStr, 10)) : await listFilesForYear(year);
                    res.setHeader('Cache-Control', 'no-store');
                    return res.status(200).json(files);
                }

                // Sub-mode: Content (Chunking)
                if (req.query.fileId) {
                    const fileId = req.query.fileId as string;
                    const offset = parseInt(req.query.offset as string || '0', 10);
                    const limit = parseInt(req.query.limit as string || '2000', 10);
                    const startRow = offset + 1;
                    const endRow = offset + limit;
                    
                    const chunk = await fetchFileContent(fileId, `A${startRow}:CZ${endRow}`);
                    const hasMore = chunk.length > 0 && chunk.length >= limit;
                    
                    res.setHeader('Cache-Control', 'no-store');
                    return res.status(200).json({ fileId, rows: chunk, offset, limit, hasMore });
                }
                
                return res.status(400).json({ error: 'Invalid AKB params' });

            } catch (error) {
                console.error('AKB Error:', error);
                return res.status(500).json({ error: 'AKB error', details: (error as Error).message });
            }
        }
    }

    // --- POST: OKB Status Check ---
    if (req.method === 'POST') {
        if (action === 'get-okb-status') {
            try {
                const okbAddresses = await getOKBAddresses();
                if (!req.body || !req.body.fileBase64) return res.status(400).json({ error: 'File required' });

                const buffer = Buffer.from(req.body.fileBase64, 'base64');
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const akbData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                const akbAddresses = new Set(akbData.flat().map(cell => String(cell).trim()));
                const updates: { rowIndex: number, status: string }[] = [];
                const results: { okbAddress: string, status: string }[] = [];

                okbAddresses.forEach((okbAddress: string, index: number) => {
                    const status = akbAddresses.has(okbAddress) ? 'Совпадение' : 'Не найдено';
                    updates.push({ rowIndex: index + 2, status });
                    results.push({ okbAddress, status });
                });

                if (updates.length > 0) await batchUpdateOKBStatus(updates);
                return res.status(200).json({ results });

            } catch (error) {
                console.error('OKB Status Error:', error);
                return res.status(500).json({ error: 'Status check failed', details: (error as Error).message });
            }
        }
    }

    return res.status(400).json({ error: 'Unknown action' });
}
