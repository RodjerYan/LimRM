import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Устанавливаем CORS заголовки
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Метод не разрешен' });
    }

    try {
        const query = req.query;
        if (!query.q && !query.city && !query.street) {
            return res.status(400).json({ error: 'Требуется хотя бы один параметр запроса (q, city, street).' });
        }
        
        // Гарантируем формат ответа jsonv2 для консистентности
        query.format = 'jsonv2';

        const searchParams = new URLSearchParams(query as Record<string, string>);
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?${searchParams.toString()}`;

        // Nominatim требует кастомный User-Agent для всех запросов
        const nominatimResponse = await fetch(nominatimUrl, {
            headers: {
                'User-Agent': 'Limkorm-Geo-Analysis-App/1.0 (Vercel Serverless Function)',
            }
        });

        if (!nominatimResponse.ok) {
            const errorText = await nominatimResponse.text();
            console.error('Ошибка API Nominatim:', errorText);
            return res.status(nominatimResponse.status).json({ error: 'Не удалось получить данные от API Nominatim.', details: errorText });
        }

        const data = await nominatimResponse.json();
        
        // Кэшируем ответ на стороне Vercel на 1 день для ускорения повторных запросов
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
        return res.status(200).json(data);

    } catch (error: any) {
        console.error('Ошибка прокси-сервера:', error);
        return res.status(500).json({ error: 'Внутренняя ошибка сервера', details: error.message });
    }
}
