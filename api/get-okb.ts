
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getOKBData } from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Fetch data from Google Sheets
        const okbData = await getOKBData();
        
        // --- HYBRID CACHING STRATEGY ---
        // 1. max-age=0: Браузер НЕ кэширует ответ. Каждый запрос идет на сервер Vercel.
        // 2. s-maxage=60: Сервер Vercel (CDN) кэширует ответ на 60 секунд.
        // 3. stale-while-revalidate=60: Если кэш протух (прошла 1 минута), Vercel отдаст старое мгновенно и обновит в фоне.
        // Это и есть "Прямое подключение" без ожидания, но с обновлением раз в минуту.
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60');
        
        res.status(200).json(okbData);
    } catch (error) {
        console.error('Error in get-okb:', error);
        res.status(500).json({ error: 'Failed to load OKB data', details: error instanceof Error ? error.message : 'Unknown error' });
    }
}
