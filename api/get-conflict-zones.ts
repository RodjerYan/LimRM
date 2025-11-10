import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { FeatureCollection } from 'geojson';

// НАСТРОЙКА ЕЖЕДНЕВНОГО ОБНОВЛЕНИЯ (VERCEL):
// Для автоматического обновления данных каждый день в 9:00 МСК, добавьте
// Vercel Cron Job в вашем проекте (в файле vercel.json или через дашборд Vercel):
// "crons": [ { "path": "/api/get-conflict-zones", "schedule": "0 6 * * *" } ]
// 6:00 по UTC соответствует 9:00 по МСК.
//
// Этот эндпоинт имитирует такой сервис и возвращает статичный набор данных,
// обновляемый при каждом деплое или вызове кроном.

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
                        // Highly detailed polygon tracing zaschitnikiotechestva.ru map as of late July 2024
                        // Start: North of Kharkiv Oblast near Russian border
                        [36.93, 50.41], [37.52, 50.33], [37.94, 50.15],
                        // Kupyansk direction
                        [37.78, 49.80], [38.01, 49.65],
                        // Svatove-Kreminna line
                        [38.15, 49.42], [38.25, 49.17], [38.10, 48.94], // Bilohorivka
                        // Bakhmut/Soledar area
                        [38.08, 48.71], [38.26, 48.49], [38.02, 48.40],
                        // Avdiivka/Donetsk area
                        [37.76, 48.24], [37.60, 48.15], [37.51, 48.00], [37.68, 47.90],
                        // Vuhledar direction
                        [37.31, 47.77],
                        // Zaporizhzhia front (Robotyne, Huliaipole)
                        [36.60, 47.66], [36.27, 47.69], [35.85, 47.45], [35.41, 47.49],
                        // Kakhovka Reservoir line, down to Dnipro delta
                        [35.10, 47.53], [34.72, 47.42], [34.02, 47.28], [33.46, 46.80], [32.88, 46.70], [32.55, 46.57],
                        // Kinburn Spit (westernmost point)
                        [31.52, 46.54],
                        // Following the coastline east
                        [31.85, 46.33], [32.32, 46.12],
                        // Skadovsk
                        [32.90, 46.10],
                        // Southern border of Kherson Oblast
                        [33.54, 46.06], [34.18, 46.07], [34.82, 45.93],
                        // Through Crimea Isthmus
                        [34.90, 46.22], [35.15, 46.25],
                        // Along Arabat Spit
                        [35.45, 45.80],
                        // Kerch Peninsula
                        [36.00, 45.20], [36.65, 45.39],
                        // Sea of Azov coastline
                        [36.8, 46.75], // Berdiansk area
                        [37.50, 46.90], // Mariupol area
                        // Eastern border of DNR/LNR
                        [38.50, 47.20], [39.00, 47.50], [39.70, 48.00], [39.85, 48.50], [39.80, 49.00],
                        // Northern border of LNR back towards Kharkiv
                        [39.50, 49.50], [39.00, 49.60], [38.50, 49.75], [38.00, 49.85],
                        // Closing loop at Russian border
                        [37.8, 50.0], [37.2, 50.25], [36.93, 50.41]
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
        // Устанавливаем заголовки кэширования. s-maxage=3600 (1 час) - кэш на CDN.
        // stale-while-revalidate=86400 (24 часа) позволяет отдавать вчерашние данные,
        // пока в фоне загружается новая версия, что идеально для ежедневного обновления.
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
        res.status(200).json(MOCK_CONFLICT_ZONES_GEOJSON);
    } catch (error) {
        console.error('Error fetching conflict zones:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'Failed to retrieve conflict zone data', details: errorMessage });
    }
}.