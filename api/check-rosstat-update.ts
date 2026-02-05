
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Этот эндпоинт теперь проверяет версию статических данных, скомпилированных с приложением.
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Имитация небольшой сетевой задержки
        await new Promise(resolve => setTimeout(resolve, 800));

        // В реальном сценарии это будет читаться из БД или файла конфигурации на сервере.
        // Для демонстрации мы жестко кодируем версию, которая немного опережает версию клиента.
        const LATEST_DATA_VERSION = "2.5.1";
        const LAST_UPDATE_DATE = "2025-07-25";

        res.setHeader('Cache-Control', 'no-cache');
        return res.status(200).json({ 
            version: LATEST_DATA_VERSION,
            date: LAST_UPDATE_DATE,
        });

    } catch (error) {
        console.error('Error in /api/check-data-version:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
