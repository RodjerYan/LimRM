
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
        
        if (!cached || !cached.history) {
            return new Response(JSON.stringify({ history: [] }), { 
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // History entries are usually separated by newlines or specific delimiters in the sheet
        const historyArray = cached.history
            .split(/\r?\n|\|\|/)
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0);
        
        // Return latest first
        return new Response(JSON.stringify({ history: historyArray.reverse() }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('History API Error:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}