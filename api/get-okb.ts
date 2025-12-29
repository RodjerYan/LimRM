
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
        // s-maxage=86400: Кэш в CDN Vercel живет 24 часа.
        // stale-while-revalidate=604800: Если кэш протух (старше 24ч, но моложе 7 дней), 
        // сервер отдаст старую версию МГНОВЕННО, а в фоне обновит данные для следующего запроса.
        // Это гарантирует, что пользователь никогда не ждет загрузку из Google Sheets.
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
        
        res.status(200).json(okbData);
    } catch (error) {
        console.error('Error in get-okb:', error);
        res.status(500).json({ error: 'Failed to load OKB data', details: error instanceof Error ? error.message : 'Unknown error' });
    }
}
