
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listFilesForMonth, listFilesForYear, fetchFileContent, getGoogleDriveClient, getCloudSnapshot, saveCloudSnapshot } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const year = (req.query.year as string) || '2025';
        const mode = req.query.mode as string; 
        
        // РАБОТА СО СНИМКАМИ (SNAPSHOTS)
        if (mode === 'snapshot') {
            if (req.method === 'GET') {
                const snapshot = await getCloudSnapshot(year);
                return res.status(snapshot ? 200 : 404).json(snapshot || { error: 'Not found' });
            }
            if (req.method === 'POST') {
                await saveCloudSnapshot(year, req.body);
                return res.status(200).json({ success: true });
            }
        }

        // Режим метаданных
        if (mode === 'metadata') {
            const drive = await getGoogleDriveClient();
            const files = await listFilesForYear(year);
            if (files.length === 0) return res.status(200).json({ version: 'none' });
            const lastFile = files[0];
            const meta = await drive.files.get({ fileId: lastFile.id, fields: 'modifiedTime, size' });
            return res.status(200).json({ versionHash: `${meta.data.modifiedTime}-${meta.data.size}-${files.length}` });
        }

        // Режим списка
        if (mode === 'list') {
            const files = await listFilesForYear(year);
            return res.status(200).json(files);
        }

        // Режим чанков
        if (req.query.fileId) {
            const fileId = req.query.fileId as string;
            const offset = parseInt(req.query.offset as string || '0', 10);
            const limit = parseInt(req.query.limit as string || '2000', 10);
            const chunk = await fetchFileContent(fileId, `A${offset + 1}:CZ${offset + limit}`);
            return res.status(200).json({ fileId, rows: chunk, hasMore: chunk.length >= limit });
        }

        res.status(400).json({ error: 'Invalid request' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
}
