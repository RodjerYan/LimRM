import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { regionCenters } from '../utils/regionCenters';

// Allow this function to run for up to 5 minutes on Vercel's Hobby plan
export const maxDuration = 300; 

const SPREADSHEET_ID = '1ci4Uf92NaFHDlaem5UQ6lj7QjwJiKzTEu1BhcERUq6s';
const SHEET_NAME = 'ОКБ'; 
const HEADERS = ['ID', 'Название', 'Тип', 'Адрес', 'Регион', 'Страна', 'Телефон', 'Email', 'Сайт', 'Широта', 'Долгота'];

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

// Simple delay function to avoid rate limiting
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchFromOverpass(region: string) {
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
    try {
        const response = await fetch(OVERPASS_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(query)}`
        });
        if (!response.ok) {
            console.error(`Overpass API error for ${region}: ${response.status} ${await response.text()}`);
            return []; // Return empty array on error to not stop the whole process
        }
        const data = await response.json();
        return data.elements;
    } catch (error) {
        console.error(`Failed to fetch from Overpass for ${region}:`, error);
        return [];
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        return res.status(500).json({ error: 'Google Service Account credentials are not configured on the server.' });
    }
    
    // Create the auth object INSIDE the handler, only after checking for env vars.
    // This prevents a server crash if the variables are missing.
    const serviceAccountAuth = new JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    // Immediately respond to the client so it doesn't time out
    res.status(202).json({ message: 'OKB database update process started. This may take several minutes.' });
    
    // --- Start the long-running process in the background ---
    (async () => {
        try {
            const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
            await doc.loadInfo();
            // FIX: Corrected a typo in the sheet name variable from `SHE-ET_NAME` to `SHEET_NAME`.
            let sheet = doc.sheetsByTitle[SHEET_NAME];
            if (!sheet) {
                sheet = await doc.addSheet({ title: SHEET_NAME, headerValues: HEADERS });
            }

            await sheet.clear();
            await sheet.setHeaderRow(HEADERS);

            const allClients = new Map<string, any>();
            let idCounter = 1;

            const regionsToProcess = Object.values(regionCenters);
            const uniqueRegions = [...new Set(regionsToProcess)];


            for (let i = 0; i < uniqueRegions.length; i++) {
                const region = uniqueRegions[i];
                console.log(`Processing region ${i + 1}/${uniqueRegions.length}: ${region}...`);
                
                const elements = await fetchFromOverpass(region);
                
                for (const el of elements) {
                    const name = el.tags?.name || 'Без названия';
                    const address = (el.tags?.['addr:full'] || `${el.tags?.['addr:city'] || ''}, ${el.tags?.['addr:street'] || ''}, ${el.tags?.['addr:housenumber'] || ''}`).replace(/^, |, $/g, '').trim();
                    const key = `${name}|${address}`;

                    if (address && !allClients.has(key)) {
                        allClients.set(key, {
                            ID: idCounter++,
                            Название: name,
                            Тип: el.tags?.amenity === 'veterinary' ? 'Ветклиника' : (el.tags?.shop ? 'Зоомагазин' : 'Другое'),
                            Адрес: address,
                            Регион: region,
                            Страна: el.tags?.['addr:country'] || 'RU',
                            Телефон: el.tags?.phone || '',
                            Email: el.tags?.email || '',
                            Сайт: el.tags?.website || '',
                            Широта: el.lat || el.center?.lat || '',
                            Долгота: el.lon || el.center?.lon || '',
                        });
                    }
                }
                // Add a small delay between requests to be polite to the API
                await sleep(1000); 
            }
            
            console.log(`Found ${allClients.size} unique clients. Writing to Google Sheet...`);
            const rows = Array.from(allClients.values());
            if (rows.length > 0) {
                 await sheet.addRows(rows);
            }
           
            console.log('OKB database update completed successfully.');

        } catch (error: any) {
            console.error('CRITICAL ERROR during OKB update:', error);
        }
    })();
}