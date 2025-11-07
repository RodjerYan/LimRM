import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { FeatureCollection } from 'geojson';

// ВАЖНО: В реальной производственной системе этот эндпоинт должен быть частью
// более сложного бэкенд-сервиса. Этот сервис должен по расписанию (например,
// с помощью cron-задания на Vercel) запрашивать данные из надежного и стабильного
// источника (например, официального API).
//
// Этот файл является имитацией такого сервиса и возвращает обновленный, более реалистичный набор данных,
// основанный на визуальном анализе карты "Защитники Отечества".

const MOCK_CONFLICT_ZONES_GEOJSON: FeatureCollection = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {
                "name": "Приграничная зона (угроза БПЛА)",
                "description": "Зона повышенной опасности из-за возможных атак БПЛА. Глубина ~10 км от границы.",
                "status": "drone_danger",
                "last_updated": "2024-07-29T09:00:00Z"
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
                "name": "Зона проведения СВО",
                "description": "Территории с активными боевыми действиями или под контролем ВС РФ. Передвижение крайне опасно.",
                "status": "occupied",
                "last_updated": "2024-07-29T09:00:00Z"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        // Detailed Frontline Trace
                        [39.81, 49.79], // North-east point in LNR
                        [38.48, 49.65],
                        [38.08, 49.11], // Svatove direction
                        [38.07, 48.67], // Bakhmut direction
                        [37.95, 48.33], // Avdiivka
                        [37.56, 47.88], // Marinka
                        [37.26, 47.66], // Vuhledar direction
                        [36.63, 47.45], // Zaporizhzhia front
                        [35.83, 47.44],
                        [35.03, 47.40], // Kakhovka Reservoir line
                        [34.40, 47.20],
                        [33.45, 46.77], // Dnipro river
                        [32.70, 46.50], // Kherson coastline
                        [32.48, 46.13], // Kinburn Spit
                        [33.16, 46.03],
                        [33.78, 45.89],
                        [34.69, 45.92],
                        [35.19, 46.30], // Molochnyi Lyman
                        [35.43, 46.56], // Berdiansk approach
                        [36.19, 46.74],
                        [36.80, 46.90],
                        [37.58, 46.96], // Mariupol
                        [38.16, 47.20], // Novoazovsk
                        [38.83, 47.63],
                        [39.02, 47.96],
                        [39.69, 48.10],
                        [39.79, 48.56],
                        [39.81, 49.79] // Close polygon
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