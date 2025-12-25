
import { google, sheets_v4, drive_v3 } from 'googleapis';
import { OkbDataRow } from '../../types';
import { Readable } from 'stream';

const SPREADSHEET_ID = '13HkruBN9a_Y5xF8nUGpoyo3N7nJxiTW3PPgqw8FsApI';
const CACHE_SPREADSHEET_ID = '1peEj55jcwLQMG9yN8uX5-0xtSCycNA0SA5UrAoF0OE8';
const SHEET_NAME = 'Base';

const ROOT_FOLDERS: Record<string, string> = {
    '2025': '1uJX1deU3Xo29cGeaUsepvMdmDosCN-7u',
    '2026': '1S3O-kl_ct4dfh11uG8rLRDeNUVeF3o17'
};

const RUSSIAN_MONTHS_ORDER = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const MONTH_MAP: Record<string, string> = {
    'Январь': 'January', 'Февраль': 'February', 'Март': 'March', 'Апрель': 'April',
    'Май': 'May', 'Июнь': 'June', 'Июль': 'July', 'Август': 'August',
    'Сентябрь': 'September', 'Октябрь': 'October', 'Ноябрь': 'November', 'Декабрь': 'December'
};

async function getAuthClient() {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set.');
    return new google.auth.GoogleAuth({
        credentials: JSON.parse(serviceAccountKey),
        scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    });
}

export async function getGoogleSheetsClient(): Promise<sheets_v4.Sheets> {
    const auth = await getAuthClient();
    return google.sheets({ version: 'v4', auth });
}

export async function getGoogleDriveClient(): Promise<drive_v3.Drive> {
    const auth = await getAuthClient();
    return google.drive({ version: 'v3', auth });
}

export async function saveCloudSnapshot(year: string, data: any): Promise<void> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS[year];
    const fileName = `analytics_snapshot_${year}.json`;

    const existing = await drive.files.list({
        q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
        fields: 'files(id)'
    });

    const media = { mimeType: 'application/json', body: JSON.stringify(data) };

    if (existing.data.files && existing.data.files.length > 0) {
        await drive.files.update({ fileId: existing.data.files[0].id!, media });
    } else {
        await drive.files.create({ requestBody: { name: fileName, parents: [folderId] }, media });
    }
}

export async function getCloudSnapshot(year: string): Promise<any | null> {
    try {
        const drive = await getGoogleDriveClient();
        const folderId = ROOT_FOLDERS[year];
        const fileName = `analytics_snapshot_${year}.json`;

        const existing = await drive.files.list({
            q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
            fields: 'files(id)'
        });

        if (!existing.data.files || existing.data.files.length === 0) return null;

        const res = await drive.files.get({ fileId: existing.data.files[0].id!, alt: 'media' });
        return res.data;
    } catch (e) {
        return null; // ТИХИЙ ВОЗВРАТ: если файла нет или ошибка — возвращаем null
    }
}

// --- УЛУЧШЕННЫЙ THROTTLING ---
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 300; 

async function throttle() {
    const now = Date.now();
    const timeSinceLast = now - lastRequestTime;
    if (timeSinceLast < MIN_REQUEST_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLast));
    }
    lastRequestTime = Date.now();
}

async function callWithRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
    let attempt = 0;
    while (attempt < 4) {
        try {
            await throttle();
            return await fn();
        } catch (error: any) {
            attempt++;
            if (attempt === 4) throw error;
            const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error(`Failed after retries: ${context}`);
}

export async function fetchFileContent(fileId: string, range: string): Promise<any[][]> {
    const sheets = await getGoogleSheetsClient();
    try {
        const res = await callWithRetry(() => sheets.spreadsheets.values.get({
            spreadsheetId: fileId, range, valueRenderOption: 'UNFORMATTED_VALUE'
        }), `fetch-${fileId}-${range}`) as any;
        return res.data.values || [];
    } catch (e: any) {
        // Если запрашиваем диапазон за пределами данных, Google может вернуть 400.
        // В этом случае возвращаем пустой массив.
        return [];
    }
}

export async function getOKBData(): Promise<OkbDataRow[]> {
  const sheets = await getGoogleSheetsClient();
  const res = await callWithRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:P`, 
  }), 'getOKBData') as any;

  const rows = res.data.values;
  if (!rows || rows.length < 2) return []; 

  const header = rows[0].map((h: any) => String(h || '').trim());
  const dataRows = rows.slice(1);

  return dataRows.map((rowArray: any[]) => {
        if (rowArray.every(cell => cell === null || cell === '')) return null;
        const row: { [key: string]: any } = {};
        header.forEach((key: string, index: number) => { if (key) row[key] = rowArray[index] || null; });
        return row as OkbDataRow;
    }).filter((row: any): row is OkbDataRow => row !== null);
}

export async function getOKBAddresses(): Promise<string[]> {
    const sheets = await getGoogleSheetsClient();
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!C2:C`,
    }), 'getOKBAddresses') as any;
    return (res.data.values || []).flat().map((address: any) => String(address || '').trim()).filter(Boolean);
}

export async function batchUpdateOKBStatus(updates: { rowIndex: number, status: string }[]) {
    if (updates.length === 0) return;
    const sheets = await getGoogleSheetsClient();
    const data = updates.map(update => ({ range: `${SHEET_NAME}!F${update.rowIndex}`, values: [[update.status]] }));
    await callWithRetry(() => sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { valueInputOption: 'RAW', data: data },
    }), 'batchUpdateOKBStatus');
}

export async function listFilesForYear(year: string): Promise<{ id: string, name: string }[]> {
    const drive = await getGoogleDriveClient();
    const rootFolderId = ROOT_FOLDERS[year];
    return callWithRetry(async () => {
        const folderListRes = await drive.files.list({
            q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)'
        });
        const allFiles: { id: string, name: string }[] = [];
        for (const folder of (folderListRes.data.files || [])) {
            if (!folder.id) continue;
            const fileListRes = await drive.files.list({
                q: `'${folder.id}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
                fields: 'files(id, name)'
            });
            allFiles.push(...(fileListRes.data.files || []).map(f => ({ id: f.id!, name: f.name || 'Untitled' })));
        }
        return allFiles;
    }, `listFilesForYear-${year}`);
}

export async function getFullCoordsCache(): Promise<Record<string, any[]>> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await callWithRetry(() => sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID }), 'cache-meta') as any;
    const sheetTitles = spreadsheet.data.sheets?.map((s: any) => s.properties?.title).filter(Boolean) as string[] || [];
    const ranges = sheetTitles.map((title: string) => `'${title}'!A:E`); 
    const response = await callWithRetry(() => sheets.spreadsheets.values.batchGet({ spreadsheetId: CACHE_SPREADSHEET_ID, ranges }), 'cache-data') as any;
    const cache: Record<string, any[]> = {};
    response.data.valueRanges?.forEach((valueRange: any) => {
        let title = valueRange.range?.split('!')[0].replace(/'/g, '') || 'Unknown';
        const values = valueRange.values || [];
        if (values.length > 1) { 
            cache[title] = values.slice(1).map((row: any) => ({
                address: String(row[0] || '').trim(),
                lat: row[1] && row[1] !== 'DELETED' ? parseFloat(String(row[1]).replace(',', '.')) : undefined,
                lon: row[2] && row[2] !== 'DELETED' ? parseFloat(String(row[2]).replace(',', '.')) : undefined
            })).filter((item: any) => item.address); 
        }
    });
    return cache;
}

export async function updateAddressInCache(rmName: string, oldAddress: string, newAddress: string, comment?: string): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID });
    let actualSheetTitle = spreadsheet.data.sheets?.find(s => s.properties?.title?.toLowerCase() === rmName.toLowerCase())?.properties?.title;
    if (!actualSheetTitle) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId: CACHE_SPREADSHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: rmName } } }] } });
        await sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A1`, valueInputOption: 'RAW', requestBody: { values: [['Адрес ТТ', 'lat', 'lon', 'История Изменений', 'Комментарии']] } });
        actualSheetTitle = rmName;
    }
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A:E` });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(r => String(r[0] || '').toLowerCase() === oldAddress.toLowerCase());
    const ts = new Date().toLocaleString();
    if (rowIndex === -1) {
        await sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[newAddress, '', '', `${oldAddress} [${ts}]`, comment || ""]] } });
    } else {
        const row = rows[rowIndex];
        const newHist = row[3] ? `${row[3]}\n${row[0]} [${ts}]` : `${row[0]} [${ts}]`;
        await sheets.spreadsheets.values.update({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A${rowIndex + 1}:E${rowIndex + 1}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[newAddress, "", "", newHist, comment || row[4] || ""]] } });
    }
}

export async function updateCacheCoords(rmName: string, updates: { address: string; lat: number; lon: number }[]): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A:A` });
    const addrs = res.data.values?.flat() || [];
    const data = updates.map(u => {
        const idx = addrs.findIndex(a => String(a).toLowerCase() === u.address.toLowerCase());
        return idx !== -1 ? { range: `'${rmName}'!B${idx + 1}:C${idx + 1}`, values: [[u.lat, u.lon]] } : null;
    }).filter(Boolean);
    if (data.length > 0) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: CACHE_SPREADSHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: data as any } });
}

export async function deleteAddressFromCache(rmName: string, address: string): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A:A` });
    const idx = (res.data.values || []).findIndex(r => String(r[0]).toLowerCase() === address.toLowerCase());
    if (idx !== -1) await sheets.spreadsheets.values.update({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!B${idx + 1}:C${idx + 1}`, valueInputOption: 'RAW', requestBody: { values: [['DELETED', 'DELETED']] } });
}

export async function getAddressFromCache(rmName: string, address: string): Promise<any> {
    const sheets = await getGoogleSheetsClient();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A:E` });
    const row = (res.data.values || []).find(r => String(r[0]).toLowerCase() === address.toLowerCase());
    if (!row || row[1] === 'DELETED') return null;
    return { address: row[0], lat: parseFloat(row[1]), lon: parseFloat(row[2]), history: row[3], comment: row[4], isInvalid: String(row[1]).includes('не найдено') };
}

export async function appendToCache(rmName: string, rows: any[][]): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await callWithRetry(() => sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID }), 'appendToCache-get-meta') as any;
    let actualSheetTitle = spreadsheet.data.sheets?.find((s: any) => s.properties?.title?.toLowerCase() === rmName.toLowerCase())?.properties?.title;
    if (!actualSheetTitle) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId: CACHE_SPREADSHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: rmName } } }] } });
        await sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A1`, valueInputOption: 'RAW', requestBody: { values: [['Адрес ТТ', 'lat', 'lon', 'История Изменений', 'Комментарии']] } });
        actualSheetTitle = rmName;
    }
    if (rows.length > 0) {
        await sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: rows } });
    }
}
