import type { VercelRequest, VercelResponse } from '@vercel/node';

// This is a placeholder for a real caching mechanism (e.g., Vercel KV, Redis).
// For simplicity, we use an in-memory cache with a TTL.
let cache = {
    data: null as any[] | null,
    timestamp: 0,
};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const googleScriptUrl = process.env.GOOGLE_SCRIPT_URL;
    if (!googleScriptUrl) {
        return res.status(500).json({ error: 'Google Script URL is not configured.' });
    }

    const now = Date.now();
    if (cache.data && (now - cache.timestamp < CACHE_TTL)) {
        return res.status(200).json({ data: cache.data, source: 'cache' });
    }

    try {
        // The Apps Script is expected to return JSON data directly.
        // A 'action=getData' parameter is added to tell the script what we want.
        const response = await fetch(`${googleScriptUrl}?action=getData`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch from Google Script: ${response.status} ${response.statusText}. Details: ${errorText}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
             throw new Error('Invalid data format received from Google Script. Expected an array.');
        }

        // Update cache
        cache.data = data;
        cache.timestamp = now;

        return res.status(200).json({ data, source: 'network' });

    } catch (error) {
        console.error('Error fetching OKB data:', error);
        return res.status(500).json({ error: 'Failed to retrieve data from Google Sheets.', details: (error as Error).message });
    }
}
