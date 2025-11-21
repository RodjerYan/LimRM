import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serialize } from 'cookie';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const cookie = serialize('auth_token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        expires: new Date(0), // Expire immediately
        path: '/',
    });

    res.setHeader('Set-Cookie', cookie);
    res.status(200).json({ success: true });
}