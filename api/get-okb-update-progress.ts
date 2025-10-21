import type { VercelRequest, VercelResponse } from '@vercel/node';
import { jobState } from './_data/regions'; // Import shared state

export default function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Add headers to prevent caching of this dynamic progress response
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (!jobState.isRunning) {
        return res.status(404).json({ error: 'No update process is currently running.' });
    }

    res.status(200).json({
        progress: jobState.progress,
        status: jobState.statusText,
    });
}
