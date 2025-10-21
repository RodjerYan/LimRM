import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { jobState } from './_data/regions'; // Import shared state

const SPREADSHEET_ID = '1ci4Uf92NaFHDlaem5UQ6lj7QjwJiKzTEu1BhcERUq6s';
const SHEET_NAME = 'Лист1';

// A limited list of regions for faster processing to avoid Vercel function timeouts.
const regionsToScan = [
    "Московская область", "Ленинградская область", "Краснодарский край", 
    "Республика Татарстан", "Свердловская область", "Новосибирская область", 
    "Нижегородская область", "Ростовская область"
];

const getAuth = () => {
    const credsBase64 = process.env.GOOGLE_CREDENTIALS_BASE64;
    if (!credsBase64) throw new Error('Google credentials GOOGLE_CREDENTIALS_BASE64 are not set.');
    const credsJson = Buffer.from(credsBase64, 'base64').toString('utf-8');
    const { client_email, private_key } = JSON.parse(credsJson);
    return new JWT({ email: client_email, key: private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
};

const getSheet = async () => {
    const serviceAccountAuth = getAuth();
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    let sheet = doc.sheetsByTitle[SHEET_NAME];
    if (!sheet) {
        sheet = await doc.addSheet({ title: SHEET_NAME, headerValues: ['Субъект', 'Город', 'Название', 'Тип', 'Адрес', 'Контакты'] });
    }
    return sheet;
};

async function queryOverpass(query: string): Promise<any> {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Overpass API error: ${response.status} ${errorText}`);
    }
    return response.json();
}

const fetchPotentialClientsForRegion = async (regionName: string): Promise<any[]> => {
    const query = `
        [out:json][timeout:90];
        area["name:ru"~"^${regionName}$"]->.searchArea;
        (
          node["shop"="pet"](area.searchArea); way["shop"="pet"](area.searchArea); relation["shop"="pet"](area.searchArea);
          node["amenity"="veterinary"](area.searchArea); way["amenity"="veterinary"](area.searchArea); relation["amenity"="veterinary"](area.searchArea);
        );
        out center;`;
    try {
        const results = await queryOverpass(query);
        return results.elements.map((el: any) => ({
            name: el.tags?.name || 'Без названия',
            type: el.tags?.shop === 'pet' ? 'Зоомагазин' : 'Ветклиника',
            address: `${el.tags?.['addr:street'] || ''} ${el.tags?.['addr:housenumber'] || ''}`.trim(),
            contacts: el.tags?.phone || el.tags?.website || '',
        }));
    } catch (e) {
        console.error(`Failed to fetch data for ${regionName}:`, e);
        return []; // Return empty array on error to not stop the whole process
    }
};

async function runUpdateProcess() {
    jobState.isRunning = true;
    jobState.progress = 0;
    jobState.statusText = 'Инициализация...';

    try {
        const sheet = await getSheet();
        jobState.statusText = 'Очистка старых данных...';
        await sheet.clearRows(); // Clears all rows except the header
        
        let allClients: any[] = [];
        for (let i = 0; i < regionsToScan.length; i++) {
            const region = regionsToScan[i];
            jobState.progress = ((i + 1) / regionsToScan.length) * 100;
            jobState.statusText = `Обработка: ${region}... (${i + 1} из ${regionsToScan.length})`;

            const clients = await fetchPotentialClientsForRegion(region);
            
            const formattedClients = clients
                .filter(c => c.name && c.name !== 'Без названия' && c.address)
                .map(c => ({
                    'Субъект': region,
                    'Город': c.name, // Simplified: using point name as city
                    'Название': c.name,
                    'Тип': c.type,
                    'Адрес': c.address,
                    'Контакты': c.contacts,
                }));
            
            if (formattedClients.length > 0) {
                 await sheet.addRows(formattedClients);
                 allClients.push(...formattedClients);
            }
        }

        jobState.rowCount = allClients.length;
        jobState.lastUpdated = new Date().toISOString();
        jobState.statusText = 'Обновление завершено!';
        jobState.progress = 100;
    } catch (error: any) {
        console.error('Update process failed:', error);
        jobState.statusText = `Ошибка: ${error.message}`;
    } finally {
        jobState.isRunning = false;
    }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    if (jobState.isRunning) {
        return res.status(409).json({ error: 'Процесс обновления уже запущен.' });
    }

    runUpdateProcess(); // Intentionally not awaited to run in the background

    return res.status(202).json({ message: 'Процесс обновления запущен.' });
}
