
import { google, sheets_v4, drive_v3 } from 'googleapis';
import { OkbDataRow } from '../../types';
import { Readable } from 'stream';

const SPREADSHEET_ID = '13HkruBN9a_Y5xF8nUGpoyo3N7nJxiTW3PPgqw8FsApI';
const CACHE_SPREADSHEET_ID = '1peEj55jcwLQMG9yN8uX5-0xtSCycNA0SA5UrAoF0OE8';
const SHEET_NAME = 'Base';

// Папка для хранения Master Snapshot JSON
const SNAPSHOT_FOLDER_ID = '15Mu4ByeDhObf2PBzDykTjHWV00AtfRT8';
const SNAPSHOT_FILENAME = 'akb_master_snapshot.json';

const ROOT_FOLDERS: Record<string, string> = {
    '2025': '1uJX1deU3Xo29cGeaUsepvMdmDosCN-7u',
    '2026': '1S3O-kl_ct4dfh11uG8rLRDeNUVeF3o17'
};

const MONTH_MAP: Record<string, string> = {
    'Январь': 'January', 'Февраль': 'February', 'Март': 'March', 'Апрель': 'April',
    'Май': 'May', 'Июнь': 'June', 'Июль': 'July', 'Август': 'August',
    'Сентябрь': 'September', 'Октябрь': 'October', 'Ноябрь': 'November', 'Декабрь': 'December'
};

const RUSSIAN_MONTHS_ORDER = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

async function getAuthClient() {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set.');
    return new google.auth.GoogleAuth({
        credentials: JSON.parse(serviceAccountKey),
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive' 
        ],
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

// --- SNAPSHOT LOGIC ---

/**
 * Загрузка Master JSON с Диска
 */
export async function loadMasterSnapshot(): Promise<any | null> {
    const drive = await getGoogleDriveClient();
    const files = await drive.files.list({
        q: `'${SNAPSHOT_FOLDER_ID}' in parents and name = '${SNAPSHOT_FILENAME}' and trashed = false`,
        fields: 'files(id, name, modifiedTime)'
    });

    if (!files.data.files || files.data.files.length === 0) return null;

    const fileId = files.data.files[0].id!;
    const res = await drive.files.get({ fileId, alt: 'media' });
    return res.data;
}

/**
 * Сохранение Master JSON на Диск (создание или обновление)
 */
export async function saveMasterSnapshot(data: any): Promise<string> {
    const drive = await getGoogleDriveClient();
    const files = await drive.files.list({
        q: `'${SNAPSHOT_FOLDER_ID}' in parents and name = '${SNAPSHOT_FILENAME}' and trashed = false`,
        fields: 'files(id)'
    });

    const content = JSON.stringify(data);
    const media = {
        mimeType: 'application/json',
        body: Readable.from([content])
    };

    if (files.data.files && files.data.files.length > 0) {
        // Обновляем существующий
        const fileId = files.data.files[0].id!;
        await drive.files.update({ fileId, media });
        return fileId;
    } else {
        // Создаем новый
        const res = await drive.files.create({
            requestBody: {
                name: SNAPSHOT_FILENAME,
                parents: [SNAPSHOT_FOLDER_ID],
                mimeType: 'application/json'
            },
            media: media,
            fields: 'id'
        });
        return res.data.id!;
    }
}

// --- REST OF THE CODE (Legacy support) ---

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 250;

async function throttle() {
    const now = Date.now();
    const timeSinceLast = now - lastRequestTime;
    if (timeSinceLast < MIN_REQUEST_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLast));
    }
    lastRequestTime = Date.now();
}

async function callWithRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
    const MAX_RETRIES = 5;
    let attempt = 0;
    while (true) {
        try {
            await throttle();
            return await fn();
        } catch (error: any) {
            attempt++;
            const status = error.response?.status || error.code;
            const msg = error.message || '';
            const isRetryable = status === 429 || status >= 500 || (status === 403 && (msg.includes('usage') || msg.includes('quota')));
            if (attempt > MAX_RETRIES || (!isRetryable && status >= 400 && status < 500)) throw error;
            const delay = Math.min(2000 * Math.pow(2, attempt - 1) + Math.random() * 1000, 30000);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
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
  return rows.slice(1).map((rowArray: any[]) => {
    if (rowArray.every(cell => cell === null || cell === '' || cell === undefined)) return null;
    const row: any = {};
    header.forEach((key: string, index: number) => { if (key) row[key] = rowArray[index] || null; });
    let latVal = row['lat'] || row['latitude'] || row['широта'];
    let lonVal = row['lon'] || row['longitude'] || row['долгота'];
    if (latVal && lonVal) {
        const lat = parseFloat(String(latVal).replace(',', '.').trim());
        const lon = parseFloat(String(lonVal).replace(',', '.').trim());
        if (!isNaN(lat) && !isNaN(lon)) { row.lat = lat; row.lon = lon; }
    }
    return row as OkbDataRow;
  }).filter((row: any): row is OkbDataRow => row !== null);
}

export async function getOKBAddresses(): Promise<string[]> {
    const sheets = await getGoogleSheetsClient();
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!C2:C`,
    }), 'getOKBAddresses') as any;
    return (res.data.values || []).flat().map((address: any) => String(address || '').trim()).filter(Boolean);
}

export async function batchUpdateOKBStatus(updates: { rowIndex: number, status: string }[]) {
    if (updates.length === 0) return;
    const sheets = await getGoogleSheetsClient();
    const data = updates.map(update => ({ range: `${SHEET_NAME}!F${update.rowIndex}`, values: [[update.status]] }));
    await callWithRetry(() => sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID, requestBody: { valueInputOption: 'RAW', data: data },
    }), 'batchUpdateOKBStatus');
}

export async function listFilesForMonth(year: string, month: number): Promise<{ id: string, name: string }[]> {
    const drive = await getGoogleDriveClient();
    const rootFolderId = ROOT_FOLDERS[year];
    if (!rootFolderId) throw new Error(`Folder for year ${year} not configured.`);
    const engMonthName = MONTH_MAP[RUSSIAN_MONTHS_ORDER[month - 1]];
    if (!engMonthName) return [];
    return callWithRetry(async () => {
        const folderListRes = await drive.files.list({ q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: 'files(id, name)' });
        const monthFolder = (folderListRes.data.files || []).find(f => f.name?.toLowerCase() === engMonthName.toLowerCase());
        if (!monthFolder || !monthFolder.id) return [];
        const fileListRes = await drive.files.list({ q: `'${monthFolder.id}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`, fields: 'files(id, name)' });
        return (fileListRes.data.files || []).map(f => ({ id: f.id!, name: f.name || 'Untitled' }));
    }, 'listFilesForMonth');
}

export async function listFilesForYear(year: string): Promise<{ id: string, name: string }[]> {
    const drive = await getGoogleDriveClient();
    const rootFolderId = ROOT_FOLDERS[year];
    return callWithRetry(async () => {
        const folderListRes = await drive.files.list({ q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: 'files(id, name)' });
        const allFiles: { id: string, name: string }[] = [];
        for (const folder of (folderListRes.data.files || [])) {
            if (!folder.id) continue;
            const fileListRes = await drive.files.list({ q: `'${folder.id}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`, fields: 'files(id, name)' });
            allFiles.push(...(fileListRes.data.files || []).map(f => ({ id: f.id!, name: f.name || 'Untitled' })));
        }
        return allFiles;
    }, 'listFilesForYear');
}

export async function fetchFileContent(fileId: string, range: string = 'A:CZ'): Promise<any[][]> {
    const sheets = await getGoogleSheetsClient();
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: fileId, range, valueRenderOption: 'UNFORMATTED_VALUE' }), 'fetchFileContent') as any;
    return res.data.values || [];
}

// ... Coordinate Cache functions omitted for brevity but remain the same ...
function normalizeForComparison(str: string): string {
    return String(str || '').toLowerCase().replace(/\u00A0/g, ' ').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isAddressInHistory(historyString: string, targetAddressNorm: string): boolean {
    if (!historyString) return false;
    return historyString.split(/\r?\n|\s*\|\|\s*/).some(entry => normalizeForComparison(entry.split('[')[0]) === targetAddressNorm);
}

export async function getFullCoordsCache(): Promise<any> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await callWithRetry(() => sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID }), 'getFullCoordsCache-meta') as any;
    const sheetTitles = spreadsheet.data.sheets?.map((s: any) => s.properties?.title).filter(Boolean) as string[] || [];
    if (sheetTitles.length === 0) return {};
    const ranges = sheetTitles.map((title: string) => `'${title}'!A:E`); 
    const response = await callWithRetry(() => sheets.spreadsheets.values.batchGet({ spreadsheetId: CACHE_SPREADSHEET_ID, ranges }), 'getFullCoordsCache-data') as any;
    const cache: any = {};
    response.data.valueRanges?.forEach((valueRange: any) => {
        let title = valueRange.range?.split('!')[0].replace(/'/g, '') || 'Unknown';
        const values = valueRange.values || [];
        if (values.length > 1) {
            cache[title] = values.slice(1).map((row: any) => ({
                address: String(row[0] || '').trim(),
                lat: row[1] && row[1] !== 'DELETED' ? parseFloat(String(row[1]).replace(',', '.')) : undefined,
                lon: row[2] && row[2] !== 'DELETED' ? parseFloat(String(row[2]).replace(',', '.')) : undefined,
                history: row[3], comment: row[4], isDeleted: row[1] === 'DELETED'
            })).filter((item: any) => item.address);
        }
    });
    return cache;
}

async function ensureSheetExists(sheets: sheets_v4.Sheets, rmName: string): Promise<string> {
    const spreadsheet = await callWithRetry(() => sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID }), 'ensureSheetExists') as any;
    const lowerRmName = rmName.toLowerCase();
    const existingSheet = spreadsheet.data.sheets?.find((s: any) => s.properties?.title?.toLowerCase() === lowerRmName);
    if (existingSheet) return existingSheet.properties!.title!;
    await callWithRetry(() => sheets.spreadsheets.batchUpdate({ spreadsheetId: CACHE_SPREADSHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: rmName } } }] } }), 'addSheet');
    await callWithRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A1`, valueInputOption: 'RAW', requestBody: { values: [['Адрес ТТ', 'lat', 'lon', 'История Изменений', 'Комментарии']] } }), 'initHeader');
    return rmName;
}

export async function appendToCache(rmName: string, rowsToAppend: any[][]) {
    const sheets = await getGoogleSheetsClient();
    const actualTitle = await ensureSheetExists(sheets, rmName);
    await callWithRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualTitle}'!A1`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: rowsToAppend } }), 'appendRows');
}

export async function updateCacheCoords(rmName: string, updates: any[]) {
    const sheets = await getGoogleSheetsClient();
    const actualTitle = await ensureSheetExists(sheets, rmName);
    const response = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualTitle}'!A:A` }), 'getAddr') as any;
    const addrs = (response.data.values || []).flat();
    const data = updates.map(u => {
        const idx = addrs.findIndex(a => normalizeForComparison(String(a)) === normalizeForComparison(u.address));
        return idx === -1 ? null : { range: `'${actualTitle}'!B${idx+1}:C${idx+1}`, values: [[u.lat, u.lon]] };
    }).filter(Boolean) as any[];
    if (data.length) await callWithRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: CACHE_SPREADSHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data } }), 'batchUpdate');
}

export async function updateAddressInCache(rmName: string, oldAddress: string, newAddress: string, comment?: string) {
    const sheets = await getGoogleSheetsClient();
    const actualTitle = await ensureSheetExists(sheets, rmName);
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualTitle}'!A:E` }), 'getRows') as any;
    const rows = res.data.values || [];
    const oldNorm = normalizeForComparison(oldAddress);
    let idx = rows.findIndex((r: any) => normalizeForComparison(r[0]) === oldNorm || isAddressInHistory(String(r[3] || ''), oldNorm));
    const ts = new Date().toLocaleString('ru-RU');
    if (idx === -1) {
        await callWithRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualTitle}'!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[newAddress, '', '', `${oldAddress} [${ts}]`, comment || ""]] } }), 'appendNew');
    } else {
        const r = rows[idx];
        const newHist = r[3] ? `${r[3]}\n${r[0]} [${ts}]` : `${r[0]} [${ts}]`;
        await callWithRetry(() => sheets.spreadsheets.values.update({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualTitle}'!A${idx+1}:E${idx+1}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[newAddress, "", "", newHist, comment || r[4] || ""]] } }), 'updateRow');
    }
}

export async function deleteAddressFromCache(rmName: string, address: string) {
    const sheets = await getGoogleSheetsClient();
    const actualTitle = await ensureSheetExists(sheets, rmName);
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualTitle}'!A:A` }), 'getRows') as any;
    const addrs = (res.data.values || []).flat();
    const idx = addrs.findIndex(a => normalizeForComparison(String(a)) === normalizeForComparison(address));
    if (idx !== -1) await callWithRetry(() => sheets.spreadsheets.values.update({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualTitle}'!B${idx+1}:C${idx+1}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [['DELETED', 'DELETED']] } }), 'markDel');
}

export async function getAddressFromCache(rmName: string, address: string) {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await callWithRetry(() => sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID }), 'getMeta') as any;
    const actualSheet = spreadsheet.data.sheets?.find((s: any) => s.properties?.title?.toLowerCase() === rmName.toLowerCase());
    if (!actualSheet) return null;
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheet.properties!.title}'!A:E` }), 'getData') as any;
    const rows = res.data.values || [];
    const norm = normalizeForComparison(address);
    const found = rows.find((r: any) => normalizeForComparison(r[0]) === norm || isAddressInHistory(String(r[3] || ''), norm));
    if (found && found[1] !== 'DELETED') {
        return { address: found[0], lat: parseFloat(String(found[1]).replace(',', '.')), lon: parseFloat(String(found[2]).replace(',', '.')), history: found[3], comment: found[4] };
    }
    return null;
}
