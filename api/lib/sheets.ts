
import { google, sheets_v4, drive_v3 } from 'googleapis';
import { OkbDataRow } from '../../types';
import { Readable } from 'stream';

// Основные таблицы (ОКБ и Кэш) остаются статичными, так как это справочники
const SPREADSHEET_ID = '13HkruBN9a_Y5xF8nUGpoyo3N7nJxiTW3PPgqw8FsApI';
const CACHE_SPREADSHEET_ID = '1peEj55jcwLQMG9yN8uX5-0xtSCycNA0SA5UrAoF0OE8';
const SHEET_NAME = 'Base';

// ID корневых папок с данными по годам
const ROOT_FOLDERS: Record<string, string> = {
    '2025': '1uJX1deU3Xo29cGeaUsepvMdmDosCN-7u',
    '2026': '1S3O-kl_ct4dfh11uG8rLRDeNUVeF3o17'
};

// Маппинг названий месяцев (Русский -> Название папки на Google Drive)
const MONTH_MAP: Record<string, string> = {
    'Январь': 'January',
    'Февраль': 'February',
    'Март': 'March',
    'Апрель': 'April',
    'Май': 'May',
    'Июнь': 'June',
    'Июль': 'July',
    'Август': 'August',
    'Сентябрь': 'September',
    'Октябрь': 'October',
    'Ноябрь': 'November',
    'Декабрь': 'December'
};

const RUSSIAN_MONTHS_ORDER = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

/**
 * Creates an authenticated Google Auth client.
 */
async function getAuthClient() {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
        throw new Error('The GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set.');
    }

    let credentials;
    try {
        credentials = JSON.parse(serviceAccountKey);
    } catch (error) {
        console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:", error);
        throw new Error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY.');
    }

    return new google.auth.GoogleAuth({
        credentials,
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.readonly' 
        ],
    });
}

// FIX: Exported getGoogleSheetsClient to resolve the import error in other modules.
export async function getGoogleSheetsClient(): Promise<sheets_v4.Sheets> {
    const auth = await getAuthClient();
    return google.sheets({ version: 'v4', auth });
}

// FIX: Exported getGoogleDriveClient to resolve the import error in api/get-akb.ts.
export async function getGoogleDriveClient(): Promise<drive_v3.Drive> {
    const auth = await getAuthClient();
    return google.drive({ version: 'v3', auth });
}

// --- HELPER: API CALL WRAPPER WITH RETRY & THROTTLE ---

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 250; // Throttle requests (ms)

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
            
            // Check for quota/rate limit/server errors
            const isRetryable = 
                status === 429 || 
                status === 500 || 
                status === 502 || 
                status === 503 || 
                status === 504 ||
                (status === 403 && (msg.includes('usage') || msg.includes('quota') || msg.includes('rate')));
            
            if (attempt > MAX_RETRIES || (!isRetryable && status >= 400 && status < 500)) {
                console.error(`[${context}] Failed permanently after ${attempt} attempts. Status: ${status}. Error: ${msg}`);
                throw error;
            }

            const baseDelay = 2000 * Math.pow(2, attempt - 1);
            const jitter = Math.random() * 1000;
            const delay = Math.min(baseDelay + jitter, 30000); 

            console.warn(`[${context}] Attempt ${attempt} failed (Status ${status}). Retrying in ${Math.round(delay)}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// --- PUBLIC METHODS ---

export async function getOKBData(): Promise<OkbDataRow[]> {
  const sheets = await getGoogleSheetsClient();
  const res = await callWithRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:P`, 
  }), 'getOKBData') as any;

  const rows = res.data.values;
  if (!rows || rows.length < 2) {
    return []; 
  }

  const header = rows[0].map((h: any) => String(h || '').trim());
  const dataRows = rows.slice(1);

  const okbData: OkbDataRow[] = dataRows
    .map((rowArray: any[]) => {
        if (rowArray.every(cell => cell === null || cell === '' || cell === undefined)) {
            return null;
        }

        const row: { [key: string]: any } = {};
        header.forEach((key: string, index: number) => {
            if (key) {
                row[key] = rowArray[index] || null;
            }
        });
        
        let latVal = row['lat'] || row['latitude'] || row['широта'] || row['Широта'];
        let lonVal = row['lon'] || row['longitude'] || row['долгота'] || row['Долгота'];

        if (rowArray.length > 12) {
             const rawLon = rowArray[11]; 
             const rawLat = rowArray[12]; 
             
             if (rawLat && rawLon) {
                 latVal = rawLat;
                 lonVal = rawLon;
             }
        }

        if (latVal && lonVal) {
            const lat = parseFloat(String(latVal).replace(',', '.').trim());
            const lon = parseFloat(String(lonVal).replace(',', '.').trim());

            if (!isNaN(lat) && !isNaN(lon)) {
                row.lat = lat;
                row.lon = lon;
            }
        }

        return row as OkbDataRow;
    })
    .filter((row: any): row is OkbDataRow => row !== null);

  return okbData;
}

export async function getOKBAddresses(): Promise<string[]> {
    const sheets = await getGoogleSheetsClient();
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!C2:C`,
    }), 'getOKBAddresses') as any;

    const rows = res.data.values || [];
    return rows.flat().map((address: any) => String(address || '').trim()).filter(Boolean);
}

export async function batchUpdateOKBStatus(updates: { rowIndex: number, status: string }[]) {
    if (updates.length === 0) return;

    const sheets = await getGoogleSheetsClient();

    const data = updates.map(update => ({
        range: `${SHEET_NAME}!F${update.rowIndex}`,
        values: [[update.status]],
    }));

    await callWithRetry(() => sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
            valueInputOption: 'RAW',
            data: data,
        },
    }), 'batchUpdateOKBStatus');
}

/**
 * Returns a list of file IDs and names for a specific year/month.
 */
export async function listFilesForMonth(year: string, month: number): Promise<{ id: string, name: string }[]> {
    const drive = await getGoogleDriveClient();
    const rootFolderId = ROOT_FOLDERS[year];
    
    if (!rootFolderId) throw new Error(`Folder for year ${year} not configured.`);

    const mName = RUSSIAN_MONTHS_ORDER[month - 1];
    if (!mName) throw new Error(`Invalid month index: ${month}`);
    
    const engMonthName = MONTH_MAP[mName];
    if (!engMonthName) return []; 

    return callWithRetry(async () => {
        const folderListRes = await drive.files.list({
            q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 50
        });
        
        const yearFolders = folderListRes.data.files || [];
        const monthFolder = yearFolders.find(f => f.name?.toLowerCase() === engMonthName.toLowerCase());

        if (!monthFolder || !monthFolder.id) {
            return [];
        }

        const fileListRes = await drive.files.list({
            q: `'${monthFolder.id}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 100 
        });

        return (fileListRes.data.files || []).map(f => ({
            id: f.id!,
            name: f.name || 'Untitled'
        }));
    }, `listFilesForMonth-${year}-${month}`);
}

/**
 * Exports a spreadsheet file as a CSV stream.
 */
export async function exportFileAsCsv(fileId: string): Promise<Readable> {
    const drive = await getGoogleDriveClient();
    
    return callWithRetry(async () => {
        const res = await drive.files.export({
            fileId: fileId,
            mimeType: 'text/csv',
        }, { responseType: 'stream' });

        return res.data as unknown as Readable;
    }, `exportFileAsCsv-${fileId}`);
}

/**
 * Fetches content of a specific spreadsheet file with optional range support.
 * ОПТИМИЗИРОВАНО: Если передан range, запрашивает только его.
 */
export async function fetchFileContent(fileId: string, range: string = 'A:BZ'): Promise<any[][]> {
    const sheets = await getGoogleSheetsClient();
    
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({
        spreadsheetId: fileId,
        range: range, 
        valueRenderOption: 'UNFORMATTED_VALUE',
    }), `fetchFileContent-${fileId}-${range}`) as any;

    return res.data.values || [];
}

/**
 * Legacy support - kept but deprecated.
 */
export async function getAkbData(year?: string, quarter?: number, month?: number): Promise<any[][]> {
    const fileList: { id: string, name: string }[] = [];
    
    let targetMonths: number[] = [];
    if (month) targetMonths = [month];
    else if (quarter) targetMonths = [(quarter - 1) * 3 + 1, (quarter - 1) * 3 + 2, (quarter - 1) * 3 + 3];
    else targetMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    for (const m of targetMonths) {
        const files = await listFilesForMonth(year || '2025', m);
        fileList.push(...files);
    }

    const allData: any[][] = [];
    let headersSet = false;

    for (const file of fileList) {
        try {
            const rows = await fetchFileContent(file.id);
            if (rows.length > 0) {
                if (!headersSet) {
                    for(let i=0; i<rows.length; i++) allData.push(rows[i]);
                    headersSet = true;
                } else {
                    if (rows.length > 1) {
                        for(let i=1; i<rows.length; i++) allData.push(rows[i]);
                    }
                }
            }
        } catch (e) {
            console.error(`Error fetching file ${file.name}`, e);
        }
    }
    
    return allData;
}


// --- COORDINATE CACHE FUNCTIONS ---

function normalizeForComparison(str: string): string {
    return String(str || '')
        .toLowerCase()
        .replace(/\u00A0/g, ' ') 
        .replace(/[.,]/g, ' ')   
        .replace(/\s+/g, ' ')    
        .trim();
}

function isAddressInHistory(historyString: string, targetAddressNorm: string): boolean {
    if (!historyString) return false;
    const entries = historyString.split(/\r?\n|\s*\|\|\s*/);
    return entries.some(entry => {
        const addrPart = entry.split('[')[0];
        return normalizeForComparison(addrPart) === targetAddressNorm;
    });
}

export async function getFullCoordsCache(): Promise<Record<string, { address: string; lat?: number; lon?: number; history?: string; isDeleted?: boolean; isInvalid?: boolean; comment?: string }[]>> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await callWithRetry(() => sheets.spreadsheets.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
    }), 'getFullCoordsCache-meta') as any;

    const sheetTitles = spreadsheet.data.sheets?.map((s: any) => s.properties?.title).filter(Boolean) as string[] || [];
    if (sheetTitles.length === 0) return {};

    const ranges = sheetTitles.map((title: string) => `'${title}'!A:E`); 
    const response = await callWithRetry(() => sheets.spreadsheets.values.batchGet({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        ranges,
    }), 'getFullCoordsCache-data') as any;
    
    const cache: Record<string, { address: string; lat?: number; lon?: number; history?: string; isDeleted?: boolean; isInvalid?: boolean; comment?: string }[]> = {};
    const BAD_STATUSES = ['не найдено', 'некорректный адрес'];

    response.data.valueRanges?.forEach((valueRange: any) => {
        let title = valueRange.range?.split('!')[0] || 'Unknown';
        if (title.startsWith("'") && title.endsWith("'")) {
             title = title.substring(1, title.length - 1); 
        }
        const values = valueRange.values || [];
        if (values.length > 1) { 
            cache[title] = values.slice(1).map((row: any) => {
                const latStr = String(row[1] || '').trim(); 
                const lonStr = String(row[2] || '').trim();
                const latStrLower = latStr.toLowerCase();
                const lonStrLower = lonStr.toLowerCase();
                
                const isDeleted = latStr === 'DELETED' || lonStr === 'DELETED';
                const isInvalid = BAD_STATUSES.some(status => latStrLower.includes(status) || lonStrLower.includes(status));

                const lat = (!isDeleted && !isInvalid && latStr) ? parseFloat(latStr.replace(',', '.')) : undefined;
                const lon = (!isDeleted && !isInvalid && lonStr) ? parseFloat(lonStr.replace(',', '.')) : undefined;
                
                const history = row[3] ? String(row[3]).trim() : undefined;
                const comment = row[4] ? String(row[4]).trim() : undefined;

                return {
                    address: String(row[0] || '').trim(),
                    lat: (lat !== undefined && !isNaN(lat)) ? lat : undefined,
                    lon: (lon !== undefined && !isNaN(lon)) ? lon : undefined,
                    history: history, 
                    isDeleted: isDeleted,
                    isInvalid: isInvalid,
                    comment: comment
                };
            }).filter((item: any) => item.address); 
        }
    });

    return cache;
}

async function ensureSheetExists(sheets: sheets_v4.Sheets, rmName: string): Promise<string> {
    const spreadsheet = await callWithRetry(() => sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID }), 'ensureSheetExists') as any;
    const lowerRmName = rmName.toLowerCase();
    const existingSheet = spreadsheet.data.sheets?.find((s: any) => s.properties?.title?.toLowerCase() === lowerRmName);

    if (existingSheet && existingSheet.properties?.title) {
        return existingSheet.properties.title; 
    }
    
    await callWithRetry(() => sheets.spreadsheets.batchUpdate({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        requestBody: {
            requests: [{ addSheet: { properties: { title: rmName } } }],
        },
    }), 'addSheet');
    
    await callWithRetry(() => sheets.spreadsheets.values.append({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${rmName}'!A1`,
        valueInputOption: 'RAW',
        requestBody: {
            values: [['Адрес ТТ', 'lat', 'lon', 'История Изменений', 'Комментарии']],
        },
    }), 'initSheetHeader');
    return rmName; 
}

export async function appendToCache(rmName: string, rowsToAppend: (string | number | undefined)[][]): Promise<void> {
    if (rowsToAppend.length === 0) return;
    
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);

    const existingAddressesResponse = await callWithRetry(() => sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A2:A`,
    }), 'checkExistingAddr') as any;

    const existingAddresses = new Set(existingAddressesResponse.data.values?.flat().map((a: any) => normalizeForComparison(String(a))) || []);

    const uniqueRowsToAppend = rowsToAppend.filter(row => {
        const address = String(row[0] || '').trim();
        return address && !existingAddresses.has(normalizeForComparison(address));
    });

    if (uniqueRowsToAppend.length === 0) {
        return;
    }

    await callWithRetry(() => sheets.spreadsheets.values.append({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A1`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
            values: uniqueRowsToAppend,
        },
    }), 'appendRows');
}

export async function updateCacheCoords(rmName: string, updates: { address: string; lat: number; lon: number }[]): Promise<void> {
    if (updates.length === 0) return;
    
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);
    
    const response = await callWithRetry(() => sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A:A`,
    }), 'getAddrForUpdate') as any;

    const addressesInSheet = response.data.values?.flat() || [];
    const addressIndexMap = new Map<string, number>();
    addressesInSheet.forEach((addr: any, i: number) => {
        if(addr) addressIndexMap.set(normalizeForComparison(String(addr)), i + 1)
    });

    const dataForUpdate = updates.map(update => {
        const rowIndex = addressIndexMap.get(normalizeForComparison(update.address));
        if (!rowIndex) return null;
        return {
            range: `'${actualSheetTitle}'!B${rowIndex}:C${rowIndex}`,
            values: [[update.lat, update.lon]],
        };
    }).filter((item): item is NonNullable<typeof item> => item !== null);
    
    if (dataForUpdate.length > 0) {
        await callWithRetry(() => sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: CACHE_SPREADSHEET_ID,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: dataForUpdate,
            },
        }), 'batchUpdateCoords');
    }
}

export async function updateAddressInCache(
    rmName: string,
    oldAddress: string,
    newAddress: string,
    comment?: string
): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);

    const response = await callWithRetry(() => sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A:E`,
    }), 'getAddrForUpdate2') as any;

    const rows = response.data.values || [];
    const oldNorm = normalizeForComparison(oldAddress);
    const newNorm = normalizeForComparison(newAddress);

    let rowIndex = -1;
    rowIndex = rows.findIndex((r: any) => normalizeForComparison(r[0]) === oldNorm);

    if (rowIndex === -1) {
        rowIndex = rows.findIndex((r: any) => isAddressInHistory(String(r[3] || ''), oldNorm));
    }

    const timestamp = new Date().toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    if (rowIndex === -1) {
        await callWithRetry(() => sheets.spreadsheets.values.append({
            spreadsheetId: CACHE_SPREADSHEET_ID,
            range: `'${actualSheetTitle}'!A1`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: [[newAddress, '', '', `${oldAddress} [${timestamp}]`, comment || ""]],
            },
        }), 'appendNewUpdate');
        return;
    }

    const row = rows[rowIndex];
    const currentAddress = String(row[0] || '');
    const currentHistory = row[3] ? String(row[3]) : '';
    const currentComment = row[4] ? String(row[4]) : '';
    const rowNumber = rowIndex + 1;

    if (normalizeForComparison(currentAddress) === newNorm) {
        if (comment !== undefined && comment !== currentComment) {
             await callWithRetry(() => sheets.spreadsheets.values.update({
                spreadsheetId: CACHE_SPREADSHEET_ID,
                range: `'${actualSheetTitle}'!E${rowNumber}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[comment]] },
            }), 'updateComment');
        }
        return;
    }

    const valueToArchive = currentAddress || oldAddress;
    const historyEntry = `${valueToArchive} [${timestamp}]`;
    const newHistory = currentHistory ? `${currentHistory}\n${historyEntry}` : historyEntry;

    await callWithRetry(() => sheets.spreadsheets.values.update({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A${rowNumber}:E${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: [[newAddress, "", "", newHistory, comment !== undefined ? comment : currentComment]], 
        },
    }), 'updateFullRow');
}

export async function deleteAddressFromCache(rmName: string, address: string): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);

    const response = await callWithRetry(() => sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A:A`,
    }), 'getAddrForDelete') as any;

    const addressesInSheet = response.data.values?.flat() || [];
    let rowIndex = -1;
    const addressNorm = normalizeForComparison(address);
    
    for (let i = 0; i < addressesInSheet.length; i++) {
        if (normalizeForComparison(String(addressesInSheet[i])) === addressNorm) {
            rowIndex = i + 1; 
            break;
        }
    }

    if (rowIndex !== -1) {
        await callWithRetry(() => sheets.spreadsheets.values.update({
            spreadsheetId: CACHE_SPREADSHEET_ID,
            range: `'${actualSheetTitle}'!B${rowIndex}:C${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [['DELETED', 'DELETED']],
            },
        }), 'markDeleted');
    }
}

export async function getAddressFromCache(rmName: string, address: string): Promise<{ address: string; lat?: number; lon?: number; history?: string; comment?: string; isInvalid?: boolean } | null> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await callWithRetry(() => sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID }), 'getSpreadsheet') as any;
    const lowerRmName = rmName.toLowerCase();
    const existingSheet = spreadsheet.data.sheets?.find((s: any) => s.properties?.title?.toLowerCase() === lowerRmName);
    
    if (!existingSheet || !existingSheet.properties?.title) {
        return null; 
    }
    const actualSheetTitle = existingSheet.properties.title;

    const response = await callWithRetry(() => sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A:E`,
    }), 'getAddrData') as any;

    const values = response.data.values || [];
    if (values.length < 2) {
        return null;
    }

    const addressNorm = normalizeForComparison(address);
    let foundRow = values.find((row: any) => normalizeForComparison(row[0]) === addressNorm);

    if (!foundRow) {
        foundRow = values.find((row: any) => isAddressInHistory(String(row[3] || ''), addressNorm));
    }

    if (foundRow) {
        const latStr = String(foundRow[1] || '').trim();
        const lonStr = String(foundRow[2] || '').trim();
        const history = foundRow[3] ? String(foundRow[3]).trim() : undefined;
        const comment = foundRow[4] ? String(foundRow[4]).trim() : undefined;
        
        if (latStr === 'DELETED' || lonStr === 'DELETED') {
             return null; 
        }

        const BAD_STATUSES = ['не найдено', 'некорректный адрес'];
        const isInvalid = BAD_STATUSES.some(status => latStr.toLowerCase().includes(status) || lonStr.toLowerCase().includes(status));

        const lat = (!isInvalid && latStr) ? parseFloat(latStr.replace(',', '.')) : undefined;
        const lon = (!isInvalid && lonStr) ? parseFloat(lonStr.replace(',', '.')) : undefined;
        
        return {
            address: String(foundRow[0]),
            lat: (lat !== undefined && !isNaN(lat)) ? lat : undefined,
            lon: (lon !== undefined && !isNaN(lon)) ? lon : undefined,
            history: history,
            comment: comment,
            isInvalid: isInvalid
        };
    }

    return null;
}
