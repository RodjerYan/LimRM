
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { loadMasterSnapshot, saveMasterSnapshot } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // GET: Загрузить слепок
    if (req.method === 'GET') {
        try {
            const snapshot = await loadMasterSnapshot();
            if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
            
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).json(snapshot);
        } catch (e) {
            console.error('Load snapshot error:', e);
            return res.status(500).json({ error: 'Failed to load cloud snapshot' });
        }
    }

    // POST: Сохранить слепок
    if (req.method === 'POST') {
        try {
            const data = req.body;
            if (!data) return res.status(400).json({ error: 'No data provided' });

            const fileId = await saveMasterSnapshot(data);
            return res.status(200).json({ success: true, fileId });
        } catch (e) {
            console.error('Save snapshot error:', e);
            return res.status(500).json({ error: 'Failed to save cloud snapshot' });
        }
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method not allowed' });
}
