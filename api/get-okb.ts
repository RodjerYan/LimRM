
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
        
        // AGGRESSIVE SERVER-SIDE CACHING STRATEGY (Stale-While-Revalidate)
        // s-maxage=60: Кэш в CDN Vercel живет 60 секунд (обновление каждую минуту).
        // stale-while-revalidate=604800: Если кэш протух, сервер отдает старую версию МГНОВЕННО,
        // а в фоне запускает обновление. Cron-задача каждую минуту дергает этот эндпоинт, 
        // чтобы данные всегда были "теплыми".
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=604800');
        
        res.status(200).json(okbData);
    } catch (error) {
        console.error('Error in get-okb:', error);
        res.status(500).json({ error: 'Failed to load OKB data', details: error instanceof Error ? error.message : 'Unknown error' });
    }
}
