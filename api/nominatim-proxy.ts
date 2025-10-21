import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: 'Query parameter "q" is required and must be a string.' });
    }

    // Nominatim's usage policy requires a descriptive User-Agent header.
    const userAgent = 'Geo-Analiz-Rynka-Limkorm/1.0 (https://ai.studio)';
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=ru&limit=1`;

    try {
        const nominatimResponse = await fetch(url, {
            headers: { 'User-Agent': userAgent },
        });

        if (!nominatimResponse.ok) {
            const errorText = await nominatimResponse.text();
            console.error(`Nominatim API error for query "${q}": ${nominatimResponse.status} ${errorText}`);
            throw new Error(`Nominatim API responded with status ${nominatimResponse.status}`);
        }

        const data = await nominatimResponse.json();
        
        // Add caching headers for Vercel's Edge Network
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate'); 
        res.status(200).json(data);

    } catch (error: any) {
        console.error('Nominatim Proxy Error:', error);
        res.status(500).json({ error: 'Failed to fetch from Nominatim API', details: error.message });
    }
}
