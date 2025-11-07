import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { FeatureCollection } from 'geojson';

// ВАЖНО: В реальной производственной системе этот эндпоинт должен быть частью
// более сложного бэкенд-сервиса. Этот сервис должен по расписанию (например,
// с помощью cron-задания на Vercel) запрашивать данные из надежного и стабильного
// источника (например, официального API от верифицированного OSINT-проекта).
// Прямой скрапинг deepstatemap.live ненадежен и может нарушать их условия использования.
//
// Полученные данные должны быть обработаны, приведены к формату GeoJSON и сохранены
// в кэше или статичном хранилище (например, Vercel Blob) для быстрых запросов от клиента.
//
// Этот файл является имитацией такого сервиса и возвращает статический пример данных.

const MOCK_CONFLICT_ZONES_GEOJSON: FeatureCollection = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {
                "name": "Зона активных боевых действий",
                "description": "Повышенная опасность. Посещение запрещено без согласования с руководством.",
                "last_updated": new Date().toISOString()
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [37.5, 47.9],
                        [38.0, 48.1],
                        [38.5, 47.8],
                        [38.2, 47.4],
                        [37.6, 47.5],
                        [37.5, 47.9]
                    ]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Прифронтовая зона",
                "description": "Зона повышенного риска. Передвижение требует осторожности и согласования.",
                "last_updated": new Date().toISOString()
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [38.8, 49.0],
                        [39.5, 49.2],
                        [39.8, 48.8],
                        [39.1, 48.6],
                        [38.8, 49.0]
                    ]
                ]
            }
        }
    ]
};


export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Устанавливаем заголовки кэширования, чтобы клиент запрашивал данные не чаще, чем раз в 6 часов.
        // В идеале, это должно совпадать с расписанием обновления данных на сервере.
        res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=43200');
        res.status(200).json(MOCK_CONFLICT_ZONES_GEOJSON);
    } catch (error) {
        console.error('Error fetching conflict zones:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'Failed to retrieve conflict zone data', details: errorMessage });
    }
}
