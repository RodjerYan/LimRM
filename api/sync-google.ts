
import { getAddressFromCache } from './_lib/sheets.js';

export default async function handler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
    }

    const url = new URL(req.url);
    const rmName = url.searchParams.get('rm');
    const address = url.searchParams.get('address');

    if (!rmName || !address) {
        return new Response(JSON.stringify({ error: 'Missing rm or address parameter' }), { status: 400 });
    }

    try {
        const cached = await getAddressFromCache(rmName, address);
        
        if (!cached) {
            return new Response(JSON.stringify({ 
                error: 'Address not found in cache',
                notFound: true 
            }), { 
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const updatedPoint = {
            address: cached.address,
            lat: cached.lat,
            lon: cached.lon,
            comment: cached.comment,
            coordStatus: cached.coordStatus || (cached.lat && cached.lon ? 'confirmed' : 'pending'),
            geocodingError: cached.isInvalid ? 'Адрес помечен как некорректный в базе' : undefined
        };

        return new Response(JSON.stringify({ updatedPoint }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('Sync API Error:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
