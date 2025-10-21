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

async function runDataFetchingAndUpdate(doc: GoogleSpreadsheet) {
    try {
        console.log("BG_PROCESS: Background process started...");

        let sheet = doc.sheetsByTitle[SHEET_NAME] || doc.sheetsByIndex[0];
        if (!sheet) {
            console.log(`BG_PROCESS: Sheet '${SHEET_NAME}' not found, creating it...`);
            sheet = await doc.addSheet({ title: SHEET_NAME, headerValues: HEADERS });
            console.log("BG_PROCESS: Sheet created successfully.");
        } else {
             console.log(`BG_PROCESS: Found sheet '${SHEET_NAME}'.`);
        }

        console.log("BG_PROCESS: Clearing old data from sheet...");
        await sheet.clear();
        console.log("BG_PROCESS: Setting new headers...");
        await sheet.setHeaderRow(HEADERS);
        console.log("BG_PROCESS: Sheet prepared. Starting data fetch from Overpass...");

        const uniqueRegions = [...new Set(Object.values(regionCenters))];
        const allClients = new Map<string, any>();
        let idCounter = 1;

        const concurrencyLimit = 8;
        for (let i = 0; i < uniqueRegions.length; i += concurrencyLimit) {
            const batch = uniqueRegions.slice(i, i + concurrencyLimit);
            console.log(`BG_PROCESS: Processing batch ${Math.floor(i / concurrencyLimit) + 1}/${Math.ceil(uniqueRegions.length / concurrencyLimit)}: [${batch.join(', ')}]`);

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

        console.log(`BG_PROCESS: Data fetching complete. Found ${allClients.size} unique clients. Writing to sheet...`);
        if (allClients.size > 0) {
            await sheet.addRows(Array.from(allClients.values()));
        }
        console.log(`BG_PROCESS: OKB database update completed successfully.`);

    } catch (error: any) {
        console.error('BG_PROCESS_CRITICAL_ERROR:', error);
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    console.log("HANDLER: Received POST request to /api/update-okb.");

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_PRIVATE_KEY;

    if (!email || !key) {
        console.error("HANDLER_FATAL: Google Service Account credentials missing in environment variables.");
        return res.status(500).json({ error: 'Server: Google Service Account credentials not configured.' });
    }
     console.log("HANDLER: Found Google credentials in environment.");

    let doc;
    try {
        console.log("HANDLER: Attempting to create JWT auth client...");
        const serviceAccountAuth = new JWT({
            email,
            key: key.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
         console.log("HANDLER: JWT client created. Initializing GoogleSpreadsheet object...");

        doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        
        console.log("HANDLER: Authenticating and loading sheet info (doc.loadInfo)...");
        await doc.loadInfo(); 
        console.log("HANDLER: Successfully authenticated with Google Sheets and loaded document info.");

    } catch (error: any) {
        console.error("HANDLER_CRITICAL_AUTH_ERROR:", error);
        let details = 'An unknown error occurred during authentication.';
        if (error.message) {
            if (error.message.includes('permission denied')) {
                details = 'The Service Account does not have "Editor" permissions on the Google Sheet. Please share the sheet with the service account email and grant "Editor" access.';
            } else if (error.message.includes('invalid_grant')) {
                details = 'The private key is invalid or the service account may be misconfigured. Please verify the private key in your environment variables.';
            } else {
                details = error.message;
            }
        }
        return res.status(500).json({ 
            error: 'Failed to connect to Google Sheets.',
            details: details
        });
    }

    try {
        res.status(202).json({ message: 'Authentication successful. Background update process started.' });
        console.log("HANDLER: Responded 202 to client. Starting background process...");
        runDataFetchingAndUpdate(doc);
    } catch (err) {
        console.error('HANDLER_FALLBACK_ERROR: Error after authentication:', err);
    }
}
