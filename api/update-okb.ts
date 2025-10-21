import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
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
                        'User-Agent': 'Limkorm-Geo-Analysis/1.1'
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
                } catch(e) {
                    console.error(`Invalid JSON from Overpass for region "${region}" on ${endpoint}`);
                    break;
                }

                return data.elements || [];
            } catch (error: any) {
                console.warn(`Attempt ${attempt}/${maxRetries} failed for "${region}" on ${endpoint}: ${error.message}`);
                if (attempt < maxRetries) await sleep(2000 * attempt);
                else console.error(`All retries failed for ${region} on ${endpoint}.`);
            }
        }
    }

    console.error(`Could not fetch data for region "${region}" from any Overpass endpoint.`);
    return [];
}

/**
 * The long-running background process. It assumes the 'doc' object is already authenticated.
 */
async function runDataFetchingAndUpdate(doc: GoogleSpreadsheet) {
    try {
        console.log("Background process started: Fetching data and updating sheet...");

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
        console.log(`OKB database update completed. Total clients: ${allClients.size}`);

    } catch (error: any) {
        console.error('CRITICAL ERROR during background OKB update:', error);
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY;

    if (!email || !key) {
        console.error("Handler: missing Google Service Account credentials.");
        return res.status(500).json({ error: 'Server: Google Service Account credentials not configured.' });
    }

    // --- STEP 1: Synchronous Authentication Check ---
    let doc;
    try {
        const serviceAccountAuth = new JWT({
            email,
            key: key.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo(); // This is the crucial, immediate check.

    } catch (error: any) {
        console.error("CRITICAL: Failed to authenticate with Google Sheets:", error);
        return res.status(500).json({ 
            error: 'Failed to connect to Google Sheets.',
            details: 'Please check that the Service Account has "Editor" permissions on the sheet and that the environment variables are correct.'
        });
    }

    // --- STEP 2: If authentication is successful, respond and run background task ---
    try {
        res.status(202).json({ message: 'Authentication successful. Background update process started.' });
        // Fire and forget the long-running process
        runDataFetchingAndUpdate(doc);
    } catch (err) {
        // This catch is a fallback, but the main error handling is now the authentication block above.
        console.error('Handler error after authentication:', err);
    }
}
