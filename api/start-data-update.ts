export default function handler(req: Request) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: {'Content-Type': 'application/json'} });
    }
    const jobId = Date.now().toString();
    return new Response(JSON.stringify({ jobId }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        }
    });
}