export default async function handler(req: Request) {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
    }

    try {
        await new Promise(resolve => setTimeout(resolve, 800));

        const LATEST_DATA_VERSION = "2.5.1";
        const LAST_UPDATE_DATE = "2025-07-25";

        return new Response(JSON.stringify({ 
            version: LATEST_DATA_VERSION,
            date: LAST_UPDATE_DATE,
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });

    } catch (error) {
        console.error('Error in /api/check-data-version:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
}