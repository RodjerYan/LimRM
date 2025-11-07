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
// Этот файл является имитацией такого сервиса и возвращает обновленный, более реалистичный набор данных.

const MOCK_CONFLICT_ZONES_GEOJSON: FeatureCollection = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {
                "name": "Южная зона активных боевых действий",
                "description": "Обширная зона с высокой интенсивностью боевых действий. Включает районы Донецка, Мариуполя и Волновахи. Передвижение крайне опасно.",
                "last_updated": new Date().toISOString()
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [37.2, 47.3],
                        [37.0, 47.8],
                        [37.6, 48.3],
                        [38.5, 48.4],
                        [38.9, 47.9],
                        [38.3, 47.1],
                        [37.2, 47.3]
                    ]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Восточная зона активных боевых действий",
                "description": "Зона интенсивных боев в районе Луганска, Северодонецка, Лисичанска. Высокий риск.",
                "last_updated": new Date().toISOString()
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [38.3, 48.8],
                        [38.2, 49.3],
                        [38.8, 49.5],
                        [39.7, 49.4],
                        [40.0, 48.7],
                        [39.3, 48.4],
                        [38.3, 48.8]
                    ]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Северная приграничная зона",
                "description": "Приграничные территории с повышенным риском обстрелов и диверсионной активности. Требуется повышенная бдительность.",
                "last_updated": new Date().toISOString()
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                   [
                        [36.0, 50.0],
                        [37.5, 50.4],
                        [38.0, 50.1],
                        [36.8, 49.7],
                        [36.0, 50.0]
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