import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- Полный CORS для любого домена ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Разрешаем только GET и POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не разрешен. Используйте GET или POST.' });
  }

  try {
    // Берем параметры запроса
    const query: Record<string, any> = req.method === 'GET' ? req.query : req.body;
    if (!query.q) {
      return res.status(400).json({ error: 'Не указан обязательный параметр q' });
    }

    // Формируем безопасные параметры для Nominatim
    const params: Record<string, string> = {};
    for (const key in query) {
      const value = query[key];
      if (value) {
        params[key] = Array.isArray(value) ? value[0] : String(value);
      }
    }

    // Всегда возвращаем JSON с деталями
    params.format = 'jsonv2';
    params.addressdetails = '1';
    params.extratags = '1';
    params.limit = '100';

    const searchParams = new URLSearchParams(params);
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?${searchParams.toString()}`;

    const nominatimResponse = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'Limkorm-Geo-Analysis-App/1.1 (Vercel Serverless Function)',
      }
    });

    if (!nominatimResponse.ok) {
      const errorText = await nominatimResponse.text();
      return res.status(nominatimResponse.status).json({ error: 'Ошибка Nominatim', details: errorText });
    }

    const data = await nominatimResponse.json();

    // Кэшируем на стороне Vercel на 1 день
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    return res.status(200).json(data);

  } catch (err: any) {
    console.error('Ошибка OSM Proxy:', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера', details: err.message });
  }
}
