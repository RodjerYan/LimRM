import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { regionCenters } from '../utils/regionCenters';

// Эта опция позволяет функции работать до 5 минут на бесплатном тарифе Vercel
export const maxDuration = 300; 

const SPREADSHEET_ID = '1ci4Uf92NaFHDlaem5UQ6lj7QjwJiKzTEu1BhcERUq6s';
const SHEET_NAME = 'Лист1'; 
const HEADERS = ['ID', 'Название', 'Тип', 'Адрес', 'Регион', 'Страна', 'Телефон', 'Email', 'Сайт', 'Широта', 'Долгота'];

const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter'
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Улучшенная функция для запросов к Overpass API с ретраями и переключением на зеркала.
 */
async function fetchFromOverpassWithRetry(region: string, maxRetries = 3) {
    const query = `
        [out:json][timeout:90];
        area["name"="${region}"];
        (
          nwr["amenity"="veterinary"](area);
          nwr["shop"~"pet|veterinary"](area);
          nwr["healthcare"="veterinary"](area);
          nwr["name"~"вет", i](area);
        );
        out center;
    `;

    for (const endpoint of OVERPASS_ENDPOINTS) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Limkorm-Geo-Analysis/1.1' },
                    body: `data=${encodeURIComponent(query)}`,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (response.status === 429 || response.status >= 500) {
                    throw new Error(`Server error: ${response.status}`);
                }
                if (!response.ok) {
                    console.error(`Overpass API non-retriable error for ${region} on ${endpoint}: ${response.status} ${await response.text()}`);
                    break; 
                }
                const data = await response.json();
                return data.elements || [];
            } catch (error: any) {
                console.warn(`Attempt ${attempt}/${maxRetries} failed for "${region}" on ${endpoint}: ${error.message}`);
                if (attempt < maxRetries) {
                    await sleep(2000 * attempt);
                } else {
                    console.error(`All retries failed for ${region} on ${endpoint}.`);
                }
            }
        }
    }
    
    console.error(`CRITICAL: Could not fetch data for region "${region}" from any Overpass endpoint.`);
    return [];
}


/**
 * Основная функция, выполняющая всю работу в фоновом режиме.
 */
async function runUpdateProcess() {
    try {
        console.log("Starting OKB update process...");
        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        
        let sheet = doc.sheetsByTitle[SHEET_NAME] || doc.sheetsByIndex[0];
        if (!sheet) {
            sheet = await doc.addSheet({ title: SHEET_NAME, headerValues: HEADERS });
        }

        await sheet.clear();
        await sheet.setHeaderRow(HEADERS);

        const uniqueRegions = [...new Set(Object.values(regionCenters))];
        const allClients = new Map<string, any>();
        let idCounter = 1;
        
        // **КЛЮЧЕВОЕ УЛУЧШЕНИЕ: Параллельная обработка**
        const concurrencyLimit = 8;
        const regionBatches: string[][] = [];
        for (let i = 0; i < uniqueRegions.length; i += concurrencyLimit) {
            regionBatches.push(uniqueRegions.slice(i, i + concurrencyLimit));
        }

        for (let i = 0; i < regionBatches.length; i++) {
            const batch = regionBatches[i];
            console.log(`Processing batch ${i + 1}/${regionBatches.length}: [${batch.join(', ')}]`);
            
            const results = await Promise.all(
                batch.map(region => fetchFromOverpassWithRetry(region))
            );

            batch.forEach((region, index) => {
                const elements = results[index];
                console.log(`-> Received ${elements.length} elements for ${region}`);
                for (const el of elements) {
                    const name = el.tags?.name || 'Без названия';
                    const address = (el.tags?.['addr:full'] || [el.tags?.['addr:city'], el.tags?.['addr:street'], el.tags?.['addr:housenumber']].filter(Boolean).join(', ')).trim();
                    const key = `${name}|${address}`.toLowerCase();

                    if (address && !allClients.has(key)) {
                        let type = 'Другое';
                        if (el.tags?.amenity === 'veterinary' || el.tags?.healthcare === 'veterinary') type = 'Ветклиника';
                        else if (el.tags?.shop?.includes('pet')) type = 'Зоомагазин';
                        else if (el.tags?.shop?.includes('veterinary')) type = 'Ветаптека';

                        allClients.set(key, {
                            ID: idCounter++,
                            Название: name, Тип: type, Адрес: address, Регион: region,
                            Страна: el.tags?.['addr:country'] || 'RU',
                            Телефон: el.tags?.phone || '', Email: el.tags?.email || '', Сайт: el.tags?.website || '',
                            Широта: el.lat || el.center?.lat || '', Долгота: el.lon || el.center?.lon || '',
                        });
                    }
                }
            });
             await sleep(1000); // Вежливая задержка между пачками запросов
        }
        
        console.log(`Found ${allClients.size} unique clients. Writing to Google Sheet...`);
        const rows = Array.from(allClients.values());
        if (rows.length > 0) {
             await sheet.addRows(rows);
        }
       
        console.log('OKB database update completed successfully.');

    } catch (error: any) {
        console.error('CRITICAL ERROR during OKB background update:', error);
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        console.error("Google Service Account credentials are not configured.");
        return res.status(500).json({ error: 'Google Service Account credentials are not configured on the server.' });
    }
    
    // Немедленно отвечаем клиенту, что процесс запущен, чтобы избежать таймаута
    res.status(202).json({ message: 'OKB database update process started. This may take several minutes.' });
    
    // Запускаем длительный процесс в фоновом режиме
    runUpdateProcess();
}
