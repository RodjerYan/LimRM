import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export const maxDuration = 300; // 5 minutes

// --- CONFIGURATION ---
const SPREADSHEET_ID = '1ci4Uf92NaFHDlaem5UQ6lj7QjwJiKzTEu1BhcERUq6s';
const SHEET_NAME = 'Лист1';
// NEW HEADERS to match user's sheet and application needs
const HEADERS = ['ID', 'Название', 'Тип', 'Страна', 'Субъект', 'Город или населенный пункт', 'Адрес', 'Контакты', 'Дата обновления'];

const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter'
];

// Data is self-contained to prevent Vercel build issues with file imports.
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

// --- HELPER FUNCTIONS ---

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getAuth = () => {
    const credsBase64 = process.env.GOOGLE_CREDENTIALS_BASE64;
    if (!credsBase64) {
        throw new Error('Google credentials env variable GOOGLE_CREDENTIALS_BASE64 is not set.');
    }
    const credsJson = Buffer.from(credsBase64, 'base64').toString('utf-8');
    const { client_email, private_key } = JSON.parse(credsJson);
    return new JWT({
        email: client_email,
        key: private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
};

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
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
                     console.error(`Invalid JSON from Overpass for region "${region}" on ${endpoint}`);
                     break;
                }

                return data.elements || [];

            } catch (error: any) {
                console.warn(`Attempt ${attempt}/${maxRetries} failed for "${region}" on ${endpoint}: ${error.message}`);
                if (attempt < maxRetries) await sleep(2000 * attempt);
            }
        }
    }
    console.error(`All retries failed for region "${region}" on all endpoints.`);
    return [];
}


// --- MAIN HANDLER ---

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const serviceAccountAuth = getAuth();
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo(); 
        
        console.log("OKB update process started by user request.");
        
        runUpdateProcess(doc).catch(err => {
            console.error("CRITICAL BACKGROUND ERROR in runUpdateProcess:", err);
        });

        res.status(202).json({ message: 'OKB update process has been successfully started in the background.' });

    } catch (error: any) {
        console.error('CRITICAL HANDLER ERROR (likely auth/connection issue):', error);
        res.status(500).json({ 
            error: 'Failed to start OKB update. Check server logs.',
            details: `Failed to authenticate or connect to Google Sheets. Details: ${error.message}`
        });
    }
}

async function runUpdateProcess(doc: GoogleSpreadsheet) {
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
    const now = new Date().toISOString();

    for (let i = 0; i < uniqueRegions.length; i += concurrencyLimit) {
        const batch = uniqueRegions.slice(i, i + concurrencyLimit);
        console.log(`Processing batch ${i / concurrencyLimit + 1}/${Math.ceil(uniqueRegions.length / concurrencyLimit)}: [${batch.join(', ')}]`);

        const results = await Promise.all(batch.map(region => fetchFromOverpassWithRetry(region)));

        batch.forEach((region, index) => {
            const elements = results[index];
            for (const el of elements) {
                const name = el.tags?.name || 'Без названия';
                const address = (el.tags?.['addr:full'] || [el.tags?.['addr:street'], el.tags?.['addr:housenumber']].filter(Boolean).join(', ')).trim();
                const key = `${name}|${address}`.toLowerCase();

                if (address && !allClients.has(key)) {
                    let type = 'Другое';
                    if (el.tags?.amenity === 'veterinary' || el.tags?.healthcare === 'veterinary') type = 'Ветклиника';
                    else if (el.tags?.shop?.includes('pet')) type = 'Зоомагазин';
                    else if (el.tags?.shop?.includes('veterinary')) type = 'Ветаптека';

                    const phone = el.tags?.phone || '';
                    const email = el.tags?.email || '';
                    const website = el.tags?.website || '';
                    const contacts = [
                        phone ? `Тел: ${phone}` : '',
                        email ? `Email: ${email}` : '',
                        website ? `Сайт: ${website}` : ''
                    ].filter(Boolean).join('; ');

                    allClients.set(key, {
                        'ID': idCounter++,
                        'Название': name,
                        'Тип': type,
                        'Страна': el.tags?.['addr:country'] || 'RU',
                        'Субъект': region,
                        'Город или населенный пункт': el.tags?.['addr:city'] || '',
                        'Адрес': address,
                        'Контакты': contacts,
                        'Дата обновления': now
                    });
                }
            }
        });
        await sleep(1000);
    }

    const rows = Array.from(allClients.values());
    if (rows.length > 0) {
        await sheet.addRows(rows);
    }
    
    console.log(`OKB update completed successfully. Total unique clients found and written: ${allClients.size}`);
}