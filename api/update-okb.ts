import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

// Data is self-contained to prevent Vercel build issues.
const regionCenters: Record<string, string> = {
  "москва": "город федерального значения москва", "санкт-петербург": "город федерального значения санкт-петербург", "севастополь": "город федерального значения севастополь",
  "майкоп": "республика адыгея", "горно-алтайск": "республика алтай", "уфа": "республика башкортостан", "улан-удэ": "республика бурятия", "махачкала": "республика дагестан", "магас": "республика ингушетия", "нальчик": "кабардино-балкарская республика", "элиста": "республика калмыкия", "черкесск": "карачаево-черкесская республика", "петрозаводск": "республика карелия", "сыктывкар": "республика коми", "йошкар-ола": "республика марий эл", "саранск": "республика мордовия", "якутск": "республика саха (якутия)", "владикавказ": "республика северная осетия — алания", "казань": "республика татарстан", "кызыл": "республика тыва", "ижевск": "удмуртская республика", "абакан": "республика хакасия", "грозный": "чеченская республика", "чебоксары": "чувашская республика", "симферополь": "республика крым",
  "барнаул": "алтайский край", "чита": "забайкальский край", "петропавловск-камчатский": "камчатский край", "краснодар": "краснодарский край", "красноярск": "красноярский край", "пермь": "пермский край", "владивосток": "приморский край", "ставрополь": "ставропольский край", "хабаровск": "хабаровский край",
  "благовещенск": "амурская область", "архангельск": "архангельская область", "астрахань": "астраханская область", "белгород": "белгородская область", "брянск": "брянская область", "владимир": "владимирская область", "волгоград": "волгоградская область", "вологда": "вологодская область", "воронеж": "воронежская область", "иваново": "ивановская область", "иркутск": "иркутская область", "калининград": "калининградская область", "калуга": "калужская область", "кемерово": "кемеровская область — кузбасс", "киров": "кировская область", "кострома": "костромская область", "курган": "курганская область", "курск": "курская область", "липецк": "липецкая область", "магадан": "магаданская область", "мурманск": "мурманская область", "нижний новгород": "нижегородская область", "великий новгород": "новгородская область", "новгород": "новгородская область", "новосибирск": "новосибирская область", "омск": "омская область", "оренбург": "оренбургская область", "орёл": "орловская область", "пенза": "пензенская область", "псков": "псковская область", "ростов-на-дону": "ростовская область", "рязань": "рязанская область", "самара": "самарская область", "саратов": "саратовская область", "южно-сахалинск": "сахалинская область", "екатеринбург": "свердловская область", "смоленск": "смоленская область", "тамбов": "тамбовская область", "тверь": "тверская область", "томск": "томская область", "тула": "тульская область", "тюмень": "тюменская область", "ульяновск": "ульяновская область", "челябинск": "челябинская область", "ярославль": "ярославская область",
  "биробиджан": "еврейская автономная область",
  "нарьян-мар": "ненецкий автономный округ", "ханты-мансийск": "ханты-мансийский автономный округ — югра", "анадырь": "чукотский автономный округ", "салехард": "ямало-ненецкий автономный округ",
  "минск": "республика беларусь", "астана": "республика казахстан", "нур-султан": "республика казахстан", "алматы": "республика казахстан", "бишкек": "киргизская республика", "душанбе": "республика таджикистан", "ашхабад": "туркменистан", "ташкент": "республика узбекистан", "ереван": "республика армения", "баку": "азербайджанская республика", "кишинёв": "республика молдова",
  "тбилиси": "грузия",
};

export const maxDuration = 300; 

const SHEET_NAME = 'Лист1';
const HEADERS = [
    "Страна", "Субъект", "Город или населенный пункт",
    "Категория (вет. клиника или вет. магазин)", "Наименование",
    "Адрес", "Контакты", "Дата обновления базы"
];

const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter'
];

const getAuth = () => {
    const client_email = process.env.GOOGLE_CLIENT_EMAIL;
    const private_key = process.env.GOOGLE_PRIVATE_KEY;
    if (!client_email || !private_key) {
        throw new Error('Google credentials environment variables (GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY) are not set.');
    }
    
    return new JWT({
        email: client_email,
        key: private_key.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
};

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

const normalizeAddressForDedupe = (str: string | undefined): string => {
    if (!str) return '';
    return str.toLowerCase().replace(/[^а-яa-z0-9]/g, '').trim();
};


async function runDataFetchingAndUpdate(doc: GoogleSpreadsheet) {
    try {
        console.log("BG_PROCESS: Background process started...");

        let sheet = doc.sheetsByTitle[SHEET_NAME];
        if (!sheet) {
            console.log(`BG_PROCESS: Sheet '${SHEET_NAME}' not found, creating it...`);
            sheet = await doc.addSheet({ title: SHEET_NAME, headerValues: HEADERS });
            console.log("BG_PROCESS: Sheet created successfully.");
        } else {
            console.log(`BG_PROCESS: Found sheet '${SHEET_NAME}'. Checking headers...`);
            await sheet.loadHeaderRow().catch(() => {});
            if (!sheet.headerValues || sheet.headerValues.length === 0) {
                console.log("BG_PROCESS: Headers not found. Setting headers...");
                await sheet.setHeaderRow(HEADERS);
            }
        }

        console.log("BG_PROCESS: Fetching existing data for deduplication...");
        const existingRows = await sheet.getRows();
        const existingAddresses = new Set(existingRows.map(row => normalizeAddressForDedupe(row.get('Адрес'))));
        console.log(`BG_PROCESS: Found ${existingAddresses.size} existing unique addresses.`);

        // Per user suggestion: clear sheet if it grows too large to prevent performance issues.
        const MAX_ROWS_BEFORE_CLEAR = 100000;
        if (existingRows.length > MAX_ROWS_BEFORE_CLEAR) {
            console.warn(`BG_PROCESS: Sheet has over ${MAX_ROWS_BEFORE_CLEAR} rows. Clearing all rows before update to maintain performance.`);
            await sheet.clear();
            await sheet.setHeaderRow(HEADERS);
            existingAddresses.clear(); // Reset the dedupe set as the sheet is now empty.
            console.log(`BG_PROCESS: Sheet cleared and headers restored.`);
        }

        const uniqueRegions = [...new Set(Object.values(regionCenters))];
        const allNewClients = new Map<string, any>();
        
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
                    
                    const normalizedAddress = normalizeAddressForDedupe(address);
                    const key = `${name}|${address}`.toLowerCase(); // Unique key for this run

                    if (address && !existingAddresses.has(normalizedAddress) && !allNewClients.has(key)) {
                        let category = 'Другое';
                        if (el.tags?.amenity === 'veterinary' || el.tags?.healthcare === 'veterinary') category = 'Ветклиника';
                        else if (el.tags?.shop?.includes('pet')) category = 'Зоомагазин';
                        else if (el.tags?.shop?.includes('veterinary')) category = 'Ветаптека';

                        allNewClients.set(key, {
                            'Страна': el.tags?.['addr:country'] || 'RU',
                            'Субъект': region,
                            'Город или населенный пункт': el.tags?.['addr:city'] || 'Не указан',
                            'Категория (вет. клиника или вет. магазин)': category,
                            'Наименование': name,
                            'Адрес': address,
                            'Контакты': [el.tags?.phone, el.tags?.email, el.tags?.website].filter(Boolean).join('; '),
                            'Дата обновления базы': new Date().toISOString()
                        });
                    }
                }
            });
            await sleep(1000);
        }

        console.log(`BG_PROCESS: Data fetching complete. Found ${allNewClients.size} new unique clients. Writing to sheet...`);
        if (allNewClients.size > 0) {
            await sheet.addRows(Array.from(allNewClients.values()));
            console.log(`BG_PROCESS: Successfully added ${allNewClients.size} new rows.`);
        } else {
             console.log(`BG_PROCESS: No new clients found to add.`);
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
    
    let doc;
    try {
        const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
        if (!SPREADSHEET_ID) {
            throw new Error("GOOGLE_SHEET_ID environment variable is not set.");
        }

        const serviceAccountAuth = getAuth();
        doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        
        await doc.loadInfo(); 

        res.status(202).json({ message: 'Authentication successful. Background update process started.' });
        
        // Do not await this call, let it run in the background
        runDataFetchingAndUpdate(doc);

    } catch (error: any) {
        console.error("HANDLER_CRITICAL_AUTH_ERROR:", error);
        let details = 'An unknown error occurred during authentication.';
        if (error.message) {
            if (error.message.includes('permission denied')) {
                details = 'The Service Account does not have "Editor" permissions on the Google Sheet. Please share the sheet with the service account email and grant "Editor" access.';
            } else if (error.message.includes('invalid_grant') || error.message.includes('unsupported')) {
                details = 'The private key is invalid or corrupted. Please verify the GOOGLE_PRIVATE_KEY variable in Vercel. Ensure the entire key was copied correctly.';
            } else {
                details = error.message;
            }
        }
        return res.status(500).json({ 
            error: 'Failed to connect to Google Sheets.',
            details: details
        });
    }
}