import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
// FIX: Import JWT for authentication with Google Sheets API.
import { JWT } from 'google-auth-library';
import { regionCenters } from './_data/regions';

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

// CRITICAL FIX: The second argument to setTimeout was incorrectly 'resolve' instead of 'ms', causing a runtime crash.
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
                const timeoutId = setTimeout(() => controller.abort(), 120000); 

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Limkorm-Geo-Analysis/1.2'
                    },
                    body: `data=${encodeURIComponent(query)}`,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (response.status === 429 || response.status >= 500) {
                    throw new Error(`Server error: ${response.status}`);
                }
                
                let data;
                try {
                    data = await response.json();
                } catch (e) {
                    console.error(`Invalid JSON response from Overpass for region "${region}" on ${endpoint}. Status: ${response.status}`);
                    break; 
                }

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

async function runUpdateProcess() {
    try {
        console.log("Starting OKB update process in background...");

        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const key = process.env.GOOGLE_PRIVATE_KEY;

        if (!email || !key) {
            console.error("FATAL: Google Service Account credentials missing in environment.");
            return;
        }
        
        // FIX: Replaced deprecated authentication method with the current JWT-based approach.
        // This resolves both the "Expected 2 arguments" error and the non-existent 'useServiceAccountAuth' property error.
        const serviceAccountAuth = new JWT({
            email: email,
            key: key.replace(/\\n/g, '\n'),
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

        const concurrencyLimit = 8;
        for (let i = 0; i < uniqueRegions.length; i += concurrencyLimit) {
            const batch = uniqueRegions.slice(i, i + concurrencyLimit);
            console.log(`Processing batch ${Math.floor(i / concurrencyLimit) + 1}/${Math.ceil(uniqueRegions.length / concurrencyLimit)}: [${batch.join(', ')}]`);

            const results = await Promise.all(batch.map(region => fetchFromOverpassWithRetry(region)));

            batch.forEach((region, index) => {
                const elements = results[index];
                if (!elements) return;

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
            await sleep(1000);
        }

        if (allClients.size > 0) {
            await sheet.addRows(Array.from(allClients.values()));
        }
        
        console.log(`OKB database update completed successfully. Total unique clients found: ${allClients.size}`);
    } catch (error: any) {
        console.error('CRITICAL ERROR during OKB background update:', error.stack || error);
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        console.error("Handler check failed: Google Service Account credentials are not configured.");
        return res.status(500).json({ error: 'Server configuration error: Google Service Account credentials are missing.' });
    }
    
    try {
        res.status(202).json({ message: 'OKB database update process has been successfully started. This may take several minutes.' });
        runUpdateProcess();
    } catch (err: any) {
        console.error('Handler failed to initiate background process:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Server error while trying to start the update process.' });
        }
    }
}