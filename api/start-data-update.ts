
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    // The Job ID is just the start time. This makes the process stateless.
    const jobId = Date.now().toString();
    
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).json({ jobId });
}
