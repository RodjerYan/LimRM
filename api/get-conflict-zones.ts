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
                "name": "Зона проведения СВО",
                "description": "Территории, отраженные на карте-схеме zaschitnikiotechestva.ru. Передвижение крайне опасно.",
                "status": "occupied",
                "last_updated": "2024-07-30T09:00:00Z"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        // Highly detailed polygon tracing zaschitnikiotechestva.ru map
                        // Start: Kinburn Spit
                        [31.52, 46.54], 
                        [32.48, 46.58], // Up the Dnipro
                        [33.10, 46.75], 
                        [33.45, 47.10],
                        [34.54, 47.45], // Kakhovka Reservoir line
                        [35.15, 47.50], // Zaporizhzhia front
                        [35.50, 47.42], // Robotyne area
                        [36.00, 47.45],
                        [36.50, 47.60],
                        [36.90, 47.55], // Vuhledar direction
                        [37.25, 47.75], 
                        [37.45, 47.95], // Marinka/Donetsk area
                        [37.65, 48.10], // Avdiivka area
                        [37.90, 48.30], 
                        [38.10, 48.50], // Bakhmut/Soledar
                        [38.30, 48.75],
                        [38.20, 49.00], // Siversk direction
                        [38.05, 49.30], // Kreminna/Svatove line
                        [37.80, 49.50],
                        [37.75, 49.80], // Kupiansk direction
                        [38.00, 49.85], // Northern border
                        [38.50, 49.75],
                        [39.00, 49.60],
                        [39.50, 49.50],
                        [39.80, 49.00],
                        [39.85, 48.50], // Eastern border of LNR
                        [39.70, 48.00],
                        [39.00, 47.50],
                        [38.50, 47.20], // Southern border of DNR near Sea of Azov
                        [38.00, 47.00], 
                        [37.50, 46.90], // Mariupol
                        [36.80, 46.75], // Berdiansk
                        [36.00, 46.50],
                        [35.25, 46.25], // Melitopol area
                        [34.80, 45.70], // South of Kherson Oblast
                        [33.80, 45.80],
                        [32.50, 45.85], // Crimea
                        [33.00, 45.50],
                        [33.50, 45.00],
                        [34.00, 44.50],
                        [35.00, 44.80],
                        [36.00, 45.20],
                        [36.50, 45.40],
                        [35.50, 45.70],
                        [34.00, 46.10], // Back to Kherson
                        [32.00, 46.20],
                        [31.52, 46.54] // Close polygon at Kinburn Spit
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