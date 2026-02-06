
export default function handler(req: Request) {
    return new Response(JSON.stringify({ status: 'alive', timestamp: Date.now() }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        }
    });
}
