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

const sendProgress = (res: VercelResponse, progress: number, text: string, region: string = '') => {
  res.write(`data: ${JSON.stringify({ progress, text, region })}\n\n`);
};

const getAuth = () => {
  const client_email = process.env.GOOGLE_CLIENT_EMAIL;
  const private_key = process.env.GOOGLE_PRIVATE_KEY;
  if (!client_email || !private_key) throw new Error('GOOGLE_CLIENT_EMAIL или GOOGLE_PRIVATE_KEY не установлены.');
  return new JWT({
    email: client_email,
    key: private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
};

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

async function fetchFromOverpass(region: string, retries = 2): Promise<any[]> {
  const query = buildOverpassQuery(region);
  const endpoint = 'https://overpass-api.de/api/interpreter';

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return data.elements || [];
    } catch (err) {
      if (attempt === retries) {
        console.warn(`Overpass error for ${region}:`, err);
        return [];
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // delay retry
    }
  }
  return [];
}

function normalize(str: string) {
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

function processOverpassElements(elements: any[], region: string) {
  return elements.map(el => {
    const tags = el.tags;
    if (!tags) return null;

    const category = tags.amenity === 'veterinary' ? 'вет. клиника' : 'вет. магазин';
    const name = tags.name || 'Без названия';
    const phone = tags.phone || tags.contact?.phone || '';

    const city = tags['addr:city'] || tags['addr:place'] || tags['addr:suburb'] || tags['addr:municipality'] || region;
    const state = tags['addr:state'] || tags['addr:region'] || region;
    const country = tags['addr:country'] || 'РФ';
    const street = tags['addr:street'] || '';
    const housenumber = tags['addr:housenumber'] || '';
    const fullAddress = `${street}, ${housenumber}`.trim().replace(/^,|,$/g, '').trim();

    const lat = el.lat || el.center?.lat || '';
    const lon = el.lon || el.center?.lon || '';

    return {
      "Страна": country,
      "Субъект": state,
      "Город или населенный пункт": city,
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    sendProgress(res, 5, "Подключение к Google Sheets...");

    const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
    if (!SPREADSHEET_ID) throw new Error("GOOGLE_SHEET_ID не установлен.");

    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, getAuth());
    await doc.loadInfo();

    let sheet = doc.sheetsByTitle[SHEET_NAME];
    if (!sheet) sheet = await doc.addSheet({ title: SHEET_NAME, headerValues: HEADERS });
    else {
      await sheet.loadHeaderRow();
      if (!sheet.headerValues || sheet.headerValues.length === 0) await sheet.setHeaderRow(HEADERS);
    }

    sendProgress(res, 10, "Получение существующих записей для дедупликации...");
    const existingRowsRaw = await sheet.getRows();

    const existingRows = existingRowsRaw.filter(
      (row): row is GoogleSpreadsheetRow<Record<string, any>> => row != null
    );

    const existingEntries = new Set<string>();
    for (const row of existingRows) {
      const key = `${normalize(row.get('Наименование'))}|${normalize(row.get('Город или населенный пункт'))}`;
      existingEntries.add(key);
    }

    const allUniqueNewRows: any[] = [];
    const totalRegions = regions.length;

    for (let i = 0; i < totalRegions; i++) {
      const region = regions[i];
      sendProgress(res, 15 + Math.round((i / totalRegions) * 75), `Сбор данных...`, region);

      const elements = await fetchFromOverpass(region);
      if (elements.length === 0) continue;

      const processedRows = processOverpassElements(elements, region);
      const uniqueRows = processedRows.filter(row => {
        const key = `${normalize(row['Наименование'])}|${normalize(row['Город или населенный пункт'])}`;
        if (!existingEntries.has(key)) {
          existingEntries.add(key);
          return true;
        }
        return false;
      });

      if (uniqueRows.length > 0) allUniqueNewRows.push(...uniqueRows);
    }

    if (allUniqueNewRows.length > 0) {
      const BATCH_SIZE = 200;
      let totalAddedCount = 0;
      for (let i = 0; i < allUniqueNewRows.length; i += BATCH_SIZE) {
        const batch = allUniqueNewRows.slice(i, i + BATCH_SIZE);
        sendProgress(res, 90 + Math.round((i / allUniqueNewRows.length) * 9), `Запись строк: ${i + batch.length} из ${allUniqueNewRows.length}...`);
        const addedRowsRaw = await sheet.addRows(batch);
        const addedRows = addedRowsRaw.filter((row): row is GoogleSpreadsheetRow<Record<string, any>> => row != null);
        totalAddedCount += addedRows.length;
      }
      console.log(`Фактически добавлено ${totalAddedCount} из ${allUniqueNewRows.length} новых строк.`);
    }

    sendProgress(res, 100, `Обновление завершено! Найдено и обработано ${allUniqueNewRows.length} новых записей.`);

  } catch (err: any) {
    console.error('CRITICAL Error in update-okb stream:', err);
    sendProgress(res, 100, `Ошибка: ${err.message}`);
  } finally {
    res.end();
  }
}