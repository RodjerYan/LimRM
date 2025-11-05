import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getOKBData } from '../lib/sheets';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // This top-level try-catch is a failsafe to ensure a JSON response is always sent.
    try {
        if (req.method !== 'GET') {
            res.setHeader('Allow', ['GET']);
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const okbData = await getOKBData();
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
        res.status(200).json(okbData);

    } catch (error) {
        console.error('--- КРИТИЧЕСКАЯ ОШИБКА В /api/get-okb ---');
        
        let detailedMessage = 'Произошла неизвестная ошибка на сервере.';
        let errorStack = 'Нет доступного стека вызовов.';
        
        if (error instanceof Error) {
            detailedMessage = error.message;
            errorStack = error.stack || 'Нет стека вызовов.';
        } else {
            try {
                detailedMessage = JSON.stringify(error);
            } catch {
                detailedMessage = 'Не удалось преобразовать ошибку в строку.';
            }
        }

        console.error('Сообщение:', detailedMessage);
        console.error('Стек:', errorStack);

        res.status(500).json({ 
            error: 'Не удалось получить данные ОКБ из-за критической ошибки сервера.', 
            details: detailedMessage 
        });
    }
}