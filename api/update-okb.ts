import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet, GoogleSpreadsheetRow } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SHEET_NAME = 'Лист1';
// FIX: Added coordinate columns to align with get-okb.ts and application needs.
const HEADERS = [
    "Страна", "Субъект", "Город или населенный пункт",
    "Категория (вет. клиника или вет. магазин)", "Наименование",
    "Адрес", "Контакты", "Широта", "Долгота", "Дата обновления базы"
];

// Определяем интерфейс для данных из OSM для строгой типизации
interface OsmDataRow {
    // FIX: Add index signature to be compatible with google-spreadsheet's `addRows` method,
    // which expects an object that can be indexed by any string. This also fixes the TS error.
    [key: string]: string;
    "Страна": string;
    "Субъект": string;
    "Город или населенный пункт": string;
    "Категория (вет. клиника или вет. магазин)": string;
    "Наименование": string;
    "Адрес": string;
    "Контакты": string;
    "Широта": string;
    "Долгота": string;
    "Дата обновления базы": string;
}

// --- Аутентификация и работа с Google Sheets ---
const getAuth = () => {
    const client_email = process.env.GOOGLE_CLIENT_EMAIL;
    const private_key = process.env.GOOGLE_PRIVATE_KEY;
    if (!client_email || !private_key) {
        throw new Error('Переменные окружения GOOGLE_CLIENT_EMAIL и GOOGLE_PRIVATE_KEY не установлены.');
    }
    return new JWT({
        email: client_email,
        key: private_key.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
};

// --- Сбор данных из OpenStreetMap (Overpass API) ---

// FIX: Switched from "out body" to "out center" to efficiently get coordinates for all element types.
const OVERPASS_QUERY = `
[out:json][timeout:900];
(
  node["amenity"="veterinary"](40.9, 19.9, 78.2, 180.0);
  way["amenity"="veterinary"](40.9, 19.9, 78.2, 180.0);
  relation["amenity"="veterinary"](40.9, 19.9, 78.2, 180.0);
  node["shop"~"pet|animal"](40.9, 19.9, 78.2, 180.0);
  way["shop"~"pet|animal"](40.9, 19.9, 78.2, 180.0);
  relation["shop"~"pet|animal"](40.9, 19.9, 78.2, 180.0);
);
out center;
`;

// Несколько публичных эндпоинтов Overpass API для надежности
const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
];

/**
 * Отправляет запрос к Overpass API
 */
async function fetchFromOverpass() {
    for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
            console.log(`Trying Overpass endpoint: ${endpoint}`);
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
            });
            if (response.ok) {
                console.log('Successfully fetched data from Overpass.');
                return await response.json();
            }
            console.warn(`Endpoint ${endpoint} failed with status: ${response.status}`);
        } catch (error) {
            console.error(`Error with endpoint ${endpoint}:`, error);
        }
    }
    throw new Error('All Overpass API endpoints failed.');
}

/**
 * Обрабатывает и форматирует данные, полученные от Overpass.
 * @param overpassData - JSON ответ от Overpass API.
 * @returns - Массив объектов, готовых для записи в Google Sheet.
 */
function processOverpassData(overpassData: any): OsmDataRow[] {
    const elements = overpassData.elements;
    if (!elements) return [];

    return elements.map((el: any) => {
        const tags = el.tags;
        if (!tags) return null;

        const category = tags.amenity === 'veterinary' ? 'вет. клиника' : 'вет. магазин';
        const name = tags.name || 'Без названия';
        const phone = tags.phone || tags.contact?.phone || '';

        const addressParts = {
            country: tags['addr:country'] || 'РФ', // Default to РФ
            state: tags['addr:state'] || tags['addr:region'] || '',
            city: tags['addr:city'] || tags['addr:place'] || '',
            street: tags['addr:street'] || '',
            housenumber: tags['addr:housenumber'] || '',
        };
        
        const fullAddress = `${addressParts.street}, ${addressParts.housenumber}`.trim().replace(/^,|,$/g, '').trim();

        // FIX: Extract coordinates from Overpass response.
        const lat = el.lat || el.center?.lat || '';
        const lon = el.lon || el.center?.lon || '';

        return {
            "Страна": addressParts.country,
            "Субъект": addressParts.state,
            "Город или населенный пункт": addressParts.city,
            "Категория (вет. клиника или вет. магазин)": category,
            "Наименование": name,
            "Адрес": fullAddress,
            "Контакты": phone,
            "Широта": String(lat),
            "Долгота": String(lon),
            "Дата обновления базы": new Date().toISOString().split('T')[0],
        };
    }).filter((item: any): item is OsmDataRow => item && item['Наименование'] && item['Город или населенный пункт']);
}


/**
 * Основной фоновый процесс, который выполняет всю работу.
 */
async function runBackgroundUpdate() {
    try {
        console.log('Starting background OKB update process...');
        
        // 1. Получаем данные из OpenStreetMap
        console.log('Fetching data from OSM via Overpass API...');
        const osmData = await fetchFromOverpass();
        const newRows = processOverpassData(osmData);
        console.log(`Found ${newRows.length} potential clients in OSM.`);

        if (newRows.length === 0) {
            console.log('No new data from OSM. Exiting.');
            return;
        }

        // 2. Подключаемся к Google Sheets и выполняем дедупликацию
        console.log('Connecting to Google Sheets...');
        const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
        if (!SPREADSHEET_ID) throw new Error("GOOGLE_SHEET_ID is not set.");
        
        const serviceAccountAuth = getAuth();
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo();

        let sheet = doc.sheetsByTitle[SHEET_NAME];
        if (!sheet) {
            console.log(`Sheet "${SHEET_NAME}" not found, creating it.`);
            sheet = await doc.addSheet({ title: SHEET_NAME, headerValues: HEADERS });
        } else {
             await sheet.loadHeaderRow();
             if (!sheet.headerValues || sheet.headerValues.length === 0) {
                 await sheet.setHeaderRow(HEADERS);
             }
        }

        console.log('Fetching existing rows for deduplication...');
        const existingRows = await sheet.getRows();
        
        // ИСПРАВЛЕНО: Добавлен явный тип для параметра 'row', чтобы избежать ошибки TS7006.
        const existingEntries = new Set(
            existingRows.map((row: GoogleSpreadsheetRow<Record<string, any>>) => `${row.get('Наименование')}|${row.get('Город или населенный пункт')}`.toLowerCase())
        );
        
        // ИСПРАВЛЕНО: Тип 'row' теперь корректно определяется из типизированного массива 'newRows'.
        const uniqueNewRows = newRows.filter(row => {
            const key = `${row['Наименование']}|${row['Город или населенный пункт']}`.toLowerCase();
            return !existingEntries.has(key);
        });

        console.log(`After deduplication, ${uniqueNewRows.length} new unique rows will be added.`);

        // 3. Добавляем новые уникальные строки пакетом
        if (uniqueNewRows.length > 0) {
            console.log(`Adding ${uniqueNewRows.length} new rows to the sheet...`);
            await sheet.addRows(uniqueNewRows);
            console.log('Successfully added new rows to Google Sheets.');
        }

        console.log('Background OKB update process finished successfully.');

    } catch (error) {
        console.error('CRITICAL ERROR in background OKB update:', error);
    }
}

/**
 * Основной обработчик API, который запускает фоновый процесс.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Немедленно отвечаем клиенту, чтобы избежать таймаута.
    res.status(202).json({ message: 'Процесс сбора и обновления базы ОКБ запущен в фоновом режиме.' });

    // Запускаем длительный процесс без ожидания его завершения.
    runBackgroundUpdate();
}