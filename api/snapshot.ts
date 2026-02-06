import handler from './get-full-cache.js';

export default async function (req: Request) {
    // Modify the request URL to include the action parameter
    const url = new URL(req.url);
    if (req.method === 'POST') {
        url.searchParams.set('action', 'save-snapshot');
    } else if (req.method === 'GET') {
        url.searchParams.set('action', 'get-snapshot');
    }
    
    // Create a new request with the modified URL
    const newReq = new Request(url.toString(), req);
    return handler(newReq);
}