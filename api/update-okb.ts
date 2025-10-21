import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet, GoogleSpreadsheetRow } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { regions } from './_data/regions';

const SHEET_NAME = 'Лист1';
const HEADERS = [
    "Страна", "Субъект", "Город или населенный пункт",
    "Категория (вет. клиника или вет. магазин)", "Наименование",
    "Адрес", "Контакты", "Широта", "Долгота", "Дата обновления базы"
];

// --- Утилиты ---

// Функция для отправки прогресса клиенту через Server-Sent Events
const sendProgress = (res: VercelResponse, progress: number, text: string, region: string = '') => {
    res.write(`data: ${JSON.stringify({ progress, text, region })}\n\n`);
};

// --- Аутентификация ---
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

// --- Логика работы с OpenStreetMap ---
const buildOverpassQuery = (region: string) => `
[out:json][timeout:180];
area[name="${region}"]->.searchArea;
(
  node["amenity"="veterinary"](area.searchArea);
  way["amenity"="veterinary"](area.searchArea);
  relation["amenity"="veterinary"](area.searchArea);
  node["shop"~"pet|animal"](area.searchArea);
  way["shop"~"pet|animal"](area.searchArea);
  relation["shop"~"pet|animal"](area.searchArea);
);
out center;
`;

async function fetchFromOverpass(region: string) {
    const query = buildOverpassQuery(region);
    const endpoint = 'https://overpass-api.de/api/interpreter';
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
    });
    if (!response.ok) {
        const errorText = await response.text();
        console.warn(`Overpass API error for region "${region}": ${errorText}`);
        return []; // Возвращаем пустой массив в случае ошибки, чтобы не прерывать весь процесс
    }
    const data = await response.json();
    return data.elements || [];
}

function processOverpassElements(elements: any[], region: string) {
    return elements.map((el: any) => {
        const tags = el.tags;
        if (!tags) return null;

        const category = tags.amenity === 'veterinary' ? 'вет. клиника' : 'вет. магазин';
        const name = tags.name || 'Без названия';
        const phone = tags.phone || tags.contact?.phone || '';

        const addressParts = {
            country: tags['addr:country'] || 'РФ',
            state: tags['addr:state'] || tags['addr:region'] || region,
            city: tags['addr:city'] || tags['addr:place'] || '',
            street: tags['addr:street'] || '',
            housenumber: tags['addr:housenumber'] || '',
        };
        const fullAddress = `${addressParts.street}, ${addressParts.housenumber}`.trim().replace(/^,|,$/g, '').trim();

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
    }).filter(item => item && item['Наименование'] && item['Город или населенный пункт']);
}

// --- Основной обработчик ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Настраиваем заголовки для Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Необходимо для Vercel, чтобы соединение не обрывалось
    res.flushHeaders(); 

    try {
        sendProgress(res, 5, "Подключение к Google Sheets...");

        const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
        if (!SPREADSHEET_ID) throw new Error("GOOGLE_SHEET_ID не установлен.");
        
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, getAuth());
        await doc.loadInfo();

        let sheet = doc.sheetsByTitle[SHEET_NAME];
        if (!sheet) {
            sheet = await doc.addSheet({ title: SHEET_NAME, headerValues: HEADERS });
        } else {
            await sheet.loadHeaderRow();
            if (!sheet.headerValues || sheet.headerValues.length === 0) {
                await sheet.setHeaderRow(HEADERS);
            }
        }
        
        sendProgress(res, 10, "Получение существующих записей для дедупликации...");
        const existingRows = await sheet.getRows();
        const existingEntries = new Set(
            existingRows
                // FIX: Add filter to address TS18047 build error. This ensures `row` cannot be null.
                .filter((row): row is GoogleSpreadsheetRow<Record<string, any>> => Boolean(row))
                .map((row) => 
                    `${row.get('Наименование')}|${row.get('Город или населенный пункт')}`.toLowerCase()
                )
        );
        
        const allUniqueNewRows: any[] = [];
        const totalRegions = regions.length;

        for (let i = 0; i < totalRegions; i++) {
            const region = regions[i];
            const progress = 15 + Math.round((i / totalRegions) * 70);
            sendProgress(res, progress, `Сбор данных...`, region);

            const elements = await fetchFromOverpass(region);
            if (elements.length === 0) continue;

            const processedRows = processOverpassElements(elements, region);
            
            const uniqueNewRowsInRegion = processedRows.filter(row => {
                const key = `${row['Наименование']}|${row['Город или населенный пункт']}`.toLowerCase();
                if (!existingEntries.has(key)) {
                    existingEntries.add(key); // Добавляем в сет, чтобы избежать дублей внутри одной сессии
                    return true;
                }
                return false;
            });
            
            if (uniqueNewRowsInRegion.length > 0) {
                allUniqueNewRows.push(...uniqueNewRowsInRegion);
            }
        }
        
        if (allUniqueNewRows.length > 0) {
            sendProgress(res, 90, `Запись ${allUniqueNewRows.length} новых строк в таблицу...`);
            
            // FIX: Refactor to use filter for safer handling and cleaner code, per user suggestion.
            const addedRows = (await sheet.addRows(allUniqueNewRows))
                 .filter((row): row is GoogleSpreadsheetRow<Record<string, any>> => Boolean(row));

            console.log(`Фактически добавлено ${addedRows.length} из ${allUniqueNewRows.length} новых строк.`);
        }

        sendProgress(res, 100, `Обновление завершено! Найдено ${allUniqueNewRows.length} новых записей.`);

    } catch (error: any) {
        console.error('CRITICAL Error in update-okb stream:', error);
        const errorMessage = `Ошибка: ${error.message}`;
        sendProgress(res, 100, errorMessage);
    } finally {
        res.end(); // Завершаем соединение
    }
}