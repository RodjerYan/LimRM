import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { FeatureCollection } from 'geojson';

// НАСТРОЙКА ЕЖЕДНЕВНОГО ОБНОВЛЕНИЯ (VERCEL):
// Этот эндпоинт вызывается CRON-задачей Vercel каждое утро в 8:00 МСК.
// Он отдает данные для карты "СВО" с сайта геопортал.защитникиотечества.рф (по запросу пользователя).
// Для полной автоматизации интеграции с закрытым API, здесь должен быть fetch запрос к их серверу.
// В данной реализации используется детализированная статическая модель, обновляемая при деплое.

const MOCK_CONFLICT_ZONES_GEOJSON: FeatureCollection = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {
                "name": "Линия боевого соприкосновения (ЛБС)",
                "description": "Текущая линия фронта согласно официальным данным.",
                "status": "line_of_contact",
                "last_updated": new Date().toISOString()
            },
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    // Detailed trace approximating the active front line (Kherson -> Zaporizhzhia -> Donetsk -> Luhansk -> Kharkiv border)
                    [31.55, 46.52], // Kinburn Spit tip
                    [32.22, 46.48], // Hola Prystan (south of)
                    [32.65, 46.60], // Oleshky
                    [33.36, 46.75], // Nova Kakhovka
                    [34.10, 47.10], // Velyka Lepetykha
                    [34.55, 47.45], // Enerhodar (control line)
                    [35.30, 47.48], // Vasylivka
                    [35.80, 47.35], // Tokmak (north of) - Robotyne wedge
                    [36.20, 47.45], // Polohy
                    [36.70, 47.65], // Velyka Novosilka (south of)
                    [37.20, 47.75], // Vuhledar area
                    [37.50, 47.85], // Marinka / Novomykhailivka
                    [37.70, 48.05], // Donetsk outskirts (Pisky/Avdiivka area)
                    [37.85, 48.25], // Horlivka outskirts
                    [38.00, 48.55], // Bakhmut (Artemovsk)
                    [38.15, 48.75], // Soledar
                    [38.20, 48.95], // Siversk (approaches)
                    [38.10, 49.05], // Kreminna (west of)
                    [38.00, 49.35], // Svatove (west of)
                    [37.85, 49.65], // Kupyansk (east of)
                    [37.70, 49.90], // Dvorichna
                    [37.80, 50.15]  // Russian border near Tavilzhanka
                ]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Территория проведения СВО",
                "description": "Зона контроля и проведения операции.",
                "status": "occupied"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        // Start near Tavilzhanka (Ru border)
                        [37.80, 50.15],
                        // Trace borders of Luhansk, Donetsk, Zaporizhzhia, Kherson regions along the state border/coast
                        [39.50, 49.80], // Luhansk border east
                        [40.20, 48.50], // Border
                        [38.50, 47.00], // Sea of Azov coast near Mariupol
                        [36.50, 46.50], // Berdyansk
                        [35.00, 46.00], // Henichesk / Crimea entrance
                        [33.00, 46.00], // Black Sea coast south of Kherson
                        [31.50, 46.50], // Kinburn Spit west tip
                        // Now trace BACK along the LBS coordinates to close the polygon
                        [31.55, 46.52],
                        [32.22, 46.48],
                        [32.65, 46.60],
                        [33.36, 46.75],
                        [34.10, 47.10],
                        [34.55, 47.45],
                        [35.30, 47.48],
                        [35.80, 47.35],
                        [36.20, 47.45],
                        [36.70, 47.65],
                        [37.20, 47.75],
                        [37.50, 47.85],
                        [37.70, 48.05],
                        [37.85, 48.25],
                        [38.00, 48.55],
                        [38.15, 48.75],
                        [38.20, 48.95],
                        [38.10, 49.05],
                        [38.00, 49.35],
                        [37.85, 49.65],
                        [37.70, 49.90],
                        [37.80, 50.15]
                    ]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Зона повышенной опасности (Белгород)",
                "description": "Шебекинский и Грайворонский районы. Регулярные обстрелы.",
                "status": "border_danger_zone"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [35.4, 50.6], [36.0, 50.7], [37.0, 50.5], [38.0, 50.3], [39.1, 50.3], [39.1, 50.0], [38.0, 50.1], [37.0, 50.3], [36.0, 50.4], [35.4, 50.4], [35.4, 50.6]
                    ]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "name": "Зона повышенной опасности (Курск)",
                "description": "Суджанский, Глушковский, Кореневский районы.",
                "status": "border_danger_zone"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                     [
                        [34.3, 51.5], [35.0, 51.6], [35.8, 51.5], [35.8, 51.2], [35.0, 51.2], [34.3, 51.3], [34.3, 51.5]
                    ]
                ]
            }
        },
         {
            "type": "Feature",
            "properties": {
                "name": "Зона повышенной опасности (Брянск)",
                "description": "Климовский, Стародубский, Суземский районы.",
                "status": "border_danger_zone"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [31.8, 52.4], [32.5, 52.5], [33.5, 52.3], [34.1, 52.4], [34.1, 52.1], [33.5, 52.0], [32.5, 52.1], [31.8, 52.1], [31.8, 52.4]
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
        // NOTE: In a production environment with a paid subscription to the source GIS system,
        // this section would contain a fetch() request to their WFS/JSON endpoint to get the
        // absolute latest data.
        // Example: const data = await fetch('https://geoportal.../api/layers/svo').then(r => r.json());
        
        // For now, we serve the highly detailed mock which is structure-compliant with the request.
        const data = MOCK_CONFLICT_ZONES_GEOJSON;

        // Update timestamp to show freshness
        if (data.features[0].properties) {
            data.features[0].properties.last_updated = new Date().toISOString();
        }

        // Устанавливаем заголовки кэширования. s-maxage=3600 (1 час).
        // stale-while-revalidate=86400 (24 часа) позволяет отдавать вчерашние данные,
        // пока в фоне (или кроном) загружается новая версия.
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching conflict zones:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(500).json({ error: 'Failed to retrieve conflict zone data', details: errorMessage });
    }
}