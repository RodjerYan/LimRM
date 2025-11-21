import type { VercelRequest, VercelResponse } from '@vercel/node';
import { markUserVerified } from '../lib/drive-auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { token } = req.query;
    
    if (!token || typeof token !== 'string') {
        return res.status(400).send('Неверная ссылка подтверждения (нет токена).');
    }

    try {
        const email = Buffer.from(token, 'base64').toString('utf-8');
        await markUserVerified(email);

        // Redirect to main page with success query param
        res.redirect('/?verified=true');
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).send(`
            <h1>Ошибка подтверждения</h1>
            <p>Не удалось подтвердить email. Возможно, ссылка устарела или пользователь не найден.</p>
            <p>Ошибка: ${(error as Error).message}</p>
            <a href="/">Вернуться на главную</a>
        `);
    }
}