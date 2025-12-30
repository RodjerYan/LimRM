
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { saveSnapshot, getSnapshot } from './lib/sheets.js';

// Configuration to increase request body size limit
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4.5mb',
        },
    },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') {
        try {
            const snapshot = await getSnapshot();
            if (!snapshot) {
                // Return 404 cleanly so frontend knows to process manually
                return res.status(404).json({ message: 'No snapshot found' });
            }
            
            // Cache the snapshot response on Vercel Edge/CDN for 60 seconds
            res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
            return res.json(snapshot);
        } catch (error) {
            console.error('Error fetching snapshot:', error);
            return res.status(500).json({ error: (error as Error).message });
        }
    } else if (req.method === 'POST') {
        try {
            const data = req.body;
            // Basic validation to ensure we're saving something meaningful
            if (!data || !data.aggregatedData) {
                return res.status(400).json({ error: 'Invalid snapshot data structure' });
            }
            
            await saveSnapshot(data);
            return res.json({ success: true });
        } catch (error) {
            console.error('Error saving snapshot:', error);
            // Don't crash the frontend if save fails, just report it
            return res.status(500).json({ error: (error as Error).message });
        }
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
}
