
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- Полный CORS для любого домена ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Метод не разрешен. Используйте GET.' });
  }

  const query = (req.query.q || req.query.query || '').toString();
  if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Не указан обязательный параметр "q"' });
  }

  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=8&q=${encodeURIComponent(query)}`;
    
    // ВАЖНО: Nominatim требует осмысленный User-Agent
    const nominatimResponse = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'Limkorm-Geo-Analysis-App/1.3 (Vercel Function; for internal use)',
      },
    });

    if (!nominatimResponse.ok) {
      const errorText = await nominatimResponse.text();
      console.error('Ошибка от Nominatim API:', nominatimResponse.status, errorText);
      return res.status(nominatimResponse.status).json({ error: 'Ошибка от Nominatim API', details: errorText });
    }

    const data = await nominatimResponse.json();
    
    // Опционально: упрощаем ответ для клиента, чтобы он был консистентным
    const mapped = (data || []).map((item: any) => ({
      display_name: item.display_name,
      lat: Number(item.lat),
      lon: Number(item.lon),
      type: item.type,
      class: item.class,
      importance: item.importance
    }));

    // Кэшируем на стороне Vercel на 1 час для уменьшения нагрузки на Nominatim
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json(mapped);

  } catch (err: any) {
    console.error('Ошибка в OSM Proxy:', err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера', details: err.message });
  }
}
