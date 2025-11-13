import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const address = req.query.address as string;

    if (!address) {
        return res.status(400).json({ error: 'Address query parameter is required.' });
    }

    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=ru,by,kz,ua`;
    
    try {
        const nominatimRes = await fetch(nominatimUrl, {
            headers: {
                'User-Agent': 'LimkormGeoAnalyzer/1.0 (https://limkorm.ru/)',
            },
        });

        if (!nominatimRes.ok) {
            throw new Error(`Nominatim API responded with status: ${nominatimRes.status}`);
        }

        const data = await nominatimRes.json() as any[];

        if (data && data.length > 0) {
            const { lat, lon } = data[0];
            res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
            res.status(200).json({ lat: parseFloat(lat), lon: parseFloat(lon) });
        } else {
            res.status(404).json({ error: 'Coordinates not found for the given address.' });
        }
    } catch (error) {
        console.error('Geocoding proxy error:', error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred during geocoding.';
        res.status(500).json({ error: 'Failed to fetch geocoding data', details: message });
    }
}
