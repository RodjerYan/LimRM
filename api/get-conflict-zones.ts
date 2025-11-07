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
// Этот файл является имитацией такого сервиса и возвращает обновленный, более реалистичный набор данных,
// основанный на визуальном анализе deepstatemap.live.

const MOCK_CONFLICT_ZONES_GEOJSON: FeatureCollection = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {
                "name": "Приграничная зона (угроза БПЛА)",
                "description": "Зона повышенной опасности из-за возможных атак БПЛА. Глубина ~10 км от границы.",
                "status": "drone_danger",
                "last_updated": "2024-07-28T09:00:00Z"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        // Russian-Ukrainian Border (approximate)
                        [38.21, 47.16], // near Sea of Azov
                        [39.78, 48.06],
                        [40.23, 49.33],
                        [38.83, 50.36],
                        [37.28, 50.45],
                        [35.95, 51.48],
                        [34.45, 52.33],
                        [32.88, 52.36],
                        [31.8, 52.2],

                        // 10km offset line inside Russia (approximate)
                        [31.9, 52.3], // Go north a bit
                        [32.98, 52.46],
                        [34.55, 52.43],
                        [36.05, 51.58],
                        [37.38, 50.55],
                        [38.93, 50.46],
                        [40.33, 49.43],
                        [39.88, 48.16],
                        [38.31, 47.26], // back towards Sea of Azov
                        [38.21, 47.16] // Close polygon
                    ]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Освобожденные территории (Север)",
                "description": "Территории, освобожденные в ходе контрнаступления в Харьковской области.",
                "status": "liberated",
                "last_updated": "2024-07-28T09:00:00Z"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [36.3, 50.3], [37.5, 50.4], [37.9, 50.0], [38.0, 49.6], [37.4, 49.3], [36.9, 49.5], [36.3, 50.3]
                    ]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Освобожденные территории (Херсон)",
                "description": "Территории на правом берегу Днепра, включая город Херсон.",
                "status": "liberated",
                "last_updated": "2024-07-28T09:00:00Z"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [32.4, 47.3], [33.5, 47.5], [34.2, 47.2], [33.8, 46.8], [32.5, 46.6], [32.4, 47.3]
                    ]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Оккупированные территории и зона боевых действий",
                "description": "Территории с активными боевыми действиями или под контролем ВС РФ. Передвижение крайне опасно.",
                "status": "occupied",
                "last_updated": "2024-07-28T09:00:00Z"
            },
            "geometry": {
                "type": "MultiPolygon",
                "coordinates": [
                    // Основная зона: Херсонская, Запорожская, ДНР, ЛНР
                    [[
                        [32.5, 46.6], [33.8, 46.8], [34.2, 47.2], [35.0, 47.7], [35.8, 47.7], [36.8, 47.4], [37.4, 47.0],
                        [38.3, 47.1], [38.9, 47.9], [38.5, 48.4], [39.0, 48.6], [40.0, 48.7], [39.7, 49.4], [38.8, 49.5],
                        [38.2, 49.3], [38.3, 48.8], [37.6, 48.3], [36.0, 47.8], [35.2, 46.3], [34.0, 46.0], [32.5, 46.6]
                    ]],
                    // Крым
                    [[
                        [33.4, 46.2], [34.0, 46.2], [35.0, 45.7], [36.3, 45.4], [36.2, 45.1], [35.0, 44.8], [33.5, 44.4],
                        [32.5, 45.3], [33.4, 46.2]
                    ]]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Приднестровье",
                "description": "Зона с повышенным риском в связи с наличием военного контингента.",
                "status": "special_risk",
                "last_updated": "2024-07-28T09:00:00Z"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [29.3, 48.1], [29.8, 48.0], [30.1, 47.4], [30.0, 46.7], [29.5, 46.5], [29.3, 47.0], [29.3, 48.1]
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