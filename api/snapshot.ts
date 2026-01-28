
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from './get-full-cache.js';

export const config = {
    maxDuration: 60,
    api: {
        bodyParser: false,
    },
};

export default async function (req: VercelRequest, res: VercelResponse) {
    if (req.method === 'POST') {
        req.query.action = 'save-snapshot';
    } else if (req.method === 'GET') {
        req.query.action = 'get-snapshot';
    }
    return handler(req, res);
}
