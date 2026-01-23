
import { google, sheets_v4, drive_v3 } from 'googleapis';
import * as XLSX from 'xlsx';
import { OkbDataRow } from '../../types';

const SPREADSHEET_ID = '13HkruBN9a_Y5xF8nUGpoyo3N7nJxiTW3PPgqw8FsApI';
const CACHE_SPREADSHEET_ID = '1peEj55jcwLQMG9yN8uX5-0xtSCycNA0SA5UrAoF0OE8';
const SHEET_NAME = 'Base';

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
    if (!serviceAccountKey) throw new Error('The GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set.');
    let credentials;
    try { credentials = JSON.parse(serviceAccountKey); } catch (error) { throw new Error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY.'); }
    
    if (credentials.private_key) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }

    return new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    });
}

export async function getGoogleSheetsClient(): Promise<sheets_v4.Sheets> {
    const auth = await getAuthClient();
    const authClient = await auth.getClient() as any;
    return google.sheets({ version: 'v4', auth: authClient });
}

export async function getGoogleDriveClient(): Promise<drive_v3.Drive> {
    const auth = await getAuthClient();
    const authClient = await auth.getClient() as any;
    return google.drive({ version: 'v3', auth: authClient });
}

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
            const isRetryable = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
            
            console.warn(`Retry attempt ${attempt} for ${context}. Status: ${status}`);

            if (attempt > MAX_RETRIES || (!isRetryable && status >= 400 && status < 500)) throw error;
            const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// ... (Snapshot & OKB Data functions remain same) ...
export async function saveSnapshot(data: any): Promise<void> { /* ... */ }
export async function getSnapshot(): Promise<any | null> { return null; }

export async function getOKBData(): Promise<OkbDataRow[]> {
  const sheets = await getGoogleSheetsClient();
  const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!A:P` }), 'getOKBData') as any;
  const rows = res.data.values;
  if (!rows || rows.length < 2) return [];
  const header = rows[0].map((h: any) => String(h || '').trim());
  return rows.slice(1).map((rowArray: any[]) => {
        if (rowArray.every(cell => !cell)) return null;
        const row: { [key: string]: any } = {};
        header.forEach((key: string, index: number) => { if (key) row[key] = rowArray[index] || null; });
        
        let latVal = row['lat'] || row['latitude'] || row['широта'];
        let lonVal = row['lon'] || row['lng'] || row['longitude'] || row['долгота'];
        
        if ((!latVal || !lonVal) && rowArray.length > 12) {
             const rawLon = rowArray[11]; 
             const rawLat = rowArray[12];
             if (rawLat && rawLon) { 
                 latVal = latVal || rawLat; 
                 lonVal = lonVal || rawLon; 
             }
        }

        if (latVal && lonVal) {
            const lat = parseFloat(String(latVal).replace(',', '.').trim());
            const lon = parseFloat(String(lonVal).replace(',', '.').trim());
            if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && lat !== 0) { 
                row.lat = lat; 
                row.lon = lon; 
            }
        }
        return row as OkbDataRow;
    }).filter((row: any): row is OkbDataRow => row !== null);
}

// ... (Rest of helpers) ...
export async function getOKBAddresses(): Promise<string[]> {
    const sheets = await getGoogleSheetsClient();
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!C2:C` }), 'getOKBAddresses') as any;
    return (res.data.values || []).flat().map((address: any) => String(address || '').trim()).filter(Boolean);
}

export async function batchUpdateOKBStatus(updates: { rowIndex: number, status: string }[]) {
    if (updates.length === 0) return;
    const sheets = await getGoogleSheetsClient();
    const data = updates.map(update => ({ range: `${SHEET_NAME}!F${update.rowIndex}`, values: [[update.status]] }));
    await callWithRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { valueInputOption: 'RAW', data } }), 'batchUpdateOKBStatus');
}

export async function listFilesForMonth(year: string, month: number): Promise<{ id: string, name: string, mimeType: string }[]> {
    const drive = await getGoogleDriveClient();
    const rootFolderId = ROOT_FOLDERS[year];
    if (!rootFolderId) throw new Error(`Folder for year ${year} not configured.`);
    const mName = RUSSIAN_MONTHS_ORDER[month - 1];
    const engMonthName = MONTH_MAP[mName];
    if (!engMonthName) return [];
    
    return callWithRetry(async () => {
        const folderListRes = await drive.files.list({ q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: 'files(id, name)', pageSize: 50 }) as any;
        const monthFolder = folderListRes.data.files?.find((f: any) => f.name?.toLowerCase() === engMonthName.toLowerCase());
        if (!monthFolder || !monthFolder.id) return [];
        const fileListRes = await drive.files.list({ q: `'${monthFolder.id}' in parents and (mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType = 'text/csv') and trashed = false`, fields: 'files(id, name, mimeType)', pageSize: 100 }) as any;
        return (fileListRes.data.files || []).map((f: any) => ({ id: f.id!, name: f.name || 'Untitled', mimeType: f.mimeType }));
    }, `listFilesForMonth-${year}-${month}`);
}

export async function listFilesForYear(year: string): Promise<{ id: string, name: string, mimeType: string }[]> {
    const drive = await getGoogleDriveClient();
    const rootFolderId = ROOT_FOLDERS[year];
    if (!rootFolderId) throw new Error(`Папка для года ${year} не настроена.`);
    return callWithRetry(async () => {
        const allFiles: { id: string, name: string, mimeType: string }[] = [];
        const folderListRes = await drive.files.list({ q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: 'files(id, name)', pageSize: 50 }) as any;
        for (const folder of (folderListRes.data.files || [])) {
            if (!folder.id) continue;
            const fileListRes = await drive.files.list({ q: `'${folder.id}' in parents and (mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType = 'text/csv') and trashed = false`, fields: 'files(id, name, mimeType)', pageSize: 100 }) as any;
            allFiles.push(...(fileListRes.data.files || []).map((f: any) => ({ id: f.id!, name: f.name || 'Untitled', mimeType: f.mimeType })));
        }
        const rootFilesRes = await drive.files.list({ q: `'${rootFolderId}' in parents and (mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') and trashed = false`, fields: 'files(id, name, mimeType)', pageSize: 100 }) as any;
        allFiles.push(...(rootFilesRes.data.files || []).map((f: any) => ({ id: f.id!, name: f.name || 'Untitled', mimeType: f.mimeType })));
        return allFiles;
    }, `listFilesForYear-${year}`);
}

export async function fetchFileContent(fileId: string, range: string = 'A:CZ', mimeType?: string): Promise<any[][]> {
    const drive = await getGoogleDriveClient();
    let res: any;
    try {
        if (mimeType === 'application/vnd.google-apps.spreadsheet') {
             res = await callWithRetry(() => drive.files.export({ fileId, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, { responseType: 'arraybuffer' }), `export-${fileId}`);
        } else {
             res = await callWithRetry(() => drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' }), `download-${fileId}`);
        }
        const workbook = XLSX.read(res.data, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        const match = range.match(/[A-Z]+(\d+):[A-Z]+(\d+)/);
        if (match) {
            const startRow = parseInt(match[1], 10) - 1; 
            const endRow = parseInt(match[2], 10);
            if (startRow >= rows.length) return [];
            return rows.slice(startRow, endRow);
        }
        return rows;
    } catch (e: any) { console.error(`Error reading file ${fileId} (${mimeType}):`, e.message); throw e; }
}

// --- COORDINATE CACHE FUNCTIONS ---
function normalizeForComparison(str: string): string {
    return String(str || '').toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[\s\u00A0.,-]+/g, ' ')
        .trim();
}

function isAddressInHistory(historyString: string, targetAddressNorm: string): boolean {
    if (!historyString) return false;
    // Split by || OR newline sequences, robust against messy Excel data
    const entries = historyString.split(/[\r\n]+|\s*\|\|\s*/);
    
    return entries.some(entry => {
        // Strip timestamps [Date] and prefix "Изменен адрес:"
        let addrPart = entry.replace(/^Изменен адрес:\s*/i, '');
        // Strip timestamp like [23.01.2026...]
        addrPart = addrPart.split('[')[0];
        // Clean up trailing punctuation just in case
        const cleanAddr = addrPart.trim().replace(/[,;]+$/, '');
        
        return normalizeForComparison(cleanAddr) === targetAddressNorm;
    });
}

// Updated to fetch Column F (Status)
export async function getFullCoordsCache(): Promise<Record<string, { address: string; lat?: number; lon?: number; history?: string; isDeleted?: boolean; isInvalid?: boolean; comment?: string; coordStatus?: string }[]>> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await callWithRetry(() => sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID }), 'getFullCoordsCache-meta') as any;
    const sheetTitles = spreadsheet.data.sheets?.map((s: any) => s.properties?.title).filter(Boolean) as string[] || [];
    if (sheetTitles.length === 0) return {};
    
    // Range A:F to include Status column
    const ranges = sheetTitles.map((title: string) => `'${title}'!A:F`); 
    const response = await callWithRetry(() => sheets.spreadsheets.values.batchGet({ spreadsheetId: CACHE_SPREADSHEET_ID, ranges }), 'getFullCoordsCache-data') as any;
    
    const cache: Record<string, any[]> = {};
    const BAD_STATUSES = ['не найдено', 'некорректный адрес'];
    
    response.data.valueRanges?.forEach((valueRange: any) => {
        let title = valueRange.range?.split('!')[0] || 'Unknown';
        if (title.startsWith("'") && title.endsWith("'")) title = title.substring(1, title.length - 1);
        const values = valueRange.values || [];
        
        if (values.length > 1) { 
            cache[title] = values.slice(1).map((row: any) => {
                const latStr = String(row[1] || '').trim(); const lonStr = String(row[2] || '').trim();
                const isDeleted = latStr === 'DELETED' || lonStr === 'DELETED';
                const isInvalid = BAD_STATUSES.some(status => latStr.toLowerCase().includes(status) || lonStr.toLowerCase().includes(status));
                const lat = (!isDeleted && !isInvalid && latStr) ? parseFloat(latStr.replace(',', '.')) : undefined;
                const lon = (!isDeleted && !isInvalid && lonStr) ? parseFloat(lonStr.replace(',', '.')) : undefined;
                
                return {
                    address: String(row[0] || '').trim(), lat, lon,
                    history: row[3] ? String(row[3]).trim() : undefined, isDeleted, isInvalid,
                    comment: row[4] ? String(row[4]).trim() : undefined,
                    coordStatus: row[5] ? String(row[5]).trim() : undefined // Column F
                };
            }).filter((item: any) => item.address); 
        }
    });
    return cache;
}

// Updated to ensure Column F exists header AND avoid duplication
async function ensureSheetExists(sheets: sheets_v4.Sheets, rmName: string): Promise<string> {
    const spreadsheet = await callWithRetry(() => sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID }), 'ensureSheetExists') as any;
    // Find sheet case-insensitively
    let sheetTitle = spreadsheet.data.sheets?.find((s: any) => s.properties?.title?.toLowerCase() === rmName.toLowerCase())?.properties?.title;
    
    if (!sheetTitle) {
        try {
            await callWithRetry(() => sheets.spreadsheets.batchUpdate({ spreadsheetId: CACHE_SPREADSHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: rmName } } }] } }), 'addSheet');
            sheetTitle = rmName;
        } catch (e: any) {
            // Handle race condition where sheet might be created between check and add
            if (e.message && e.message.includes('already exists')) {
                sheetTitle = rmName;
            } else {
                throw e;
            }
        }
    }

    // CRITICAL FIX: Check if header exists before appending!
    const headerCheck = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${sheetTitle}'!A1` }), 'checkHeader') as any;
    const headerVal = headerCheck.data.values?.[0]?.[0];
    
    if (headerVal !== 'Адрес ТТ') {
         await callWithRetry(() => sheets.spreadsheets.values.update({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${sheetTitle}'!A1`, valueInputOption: 'RAW', requestBody: { values: [['Адрес ТТ', 'lat', 'lon', 'История Изменений', 'Комментарии', 'Статус Координат']] } }), 'initSheetHeader');
    }
    
    return sheetTitle!; 
}

export async function appendToCache(rmName: string, rowsToAppend: (string | number | undefined)[][]): Promise<void> {
    if (rowsToAppend.length === 0) return;
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);
    const existing = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A2:A` }), 'checkExisting') as any;
    const existingAddresses = new Set(existing.data.values?.flat().map((a: any) => normalizeForComparison(String(a))) || []);
    
    // Append with status 'confirmed' since these come from manual file processing usually, or 'pending' if empty
    const enrichedRows = rowsToAppend.filter(row => row[0] && !existingAddresses.has(normalizeForComparison(String(row[0])))).map(row => {
        // [addr, lat, lon, history?, comment?, status?]
        const hasCoords = row[1] && row[2];
        return [...row, '', '', hasCoords ? 'confirmed' : 'pending'];
    });

    if (enrichedRows.length === 0) return;
    await callWithRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A1`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: enrichedRows } }), 'appendRows');
}

// Updated to write 'confirmed' status
export async function updateCacheCoords(rmName: string, updates: { address: string; lat: number; lon: number }[]): Promise<void> {
    if (updates.length === 0) return;
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);
    const response = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A:A` }), 'getAddrForUpdate') as any;
    const addressIndexMap = new Map<string, number>();
    (response.data.values?.flat() || []).forEach((addr: any, i: number) => { if(addr) addressIndexMap.set(normalizeForComparison(String(addr)), i + 1); });
    
    const data = updates.map(update => {
        const rowIndex = addressIndexMap.get(normalizeForComparison(update.address));
        if (!rowIndex) return null;
        // Update Lat, Lon (B, C) AND Status (F)
        return [
            { range: `'${actualSheetTitle}'!B${rowIndex}:C${rowIndex}`, values: [[update.lat, update.lon]] },
            { range: `'${actualSheetTitle}'!F${rowIndex}`, values: [['confirmed']] }
        ];
    }).flat().filter(Boolean) as any;
    
    if (data.length > 0) await callWithRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: CACHE_SPREADSHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data } }), 'batchUpdateCoords');
}

export async function updateAddressInCache(rmName: string, oldAddress: string, newAddress: string, comment?: string, lat?: number, lon?: number): Promise<{ success: boolean; data: any }> {
    if (!rmName) throw new Error("RM Name is required");
    const sheets = await getGoogleSheetsClient();
    
    // Ensure we are working with the correct sheet for this RM
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);
    
    // Check range across all columns to find the row
    const response = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A:F` }), 'getAddrForUpdate2') as any;
    const rows = response.data.values || [];
    
    const oldNorm = normalizeForComparison(oldAddress);
    const newNorm = normalizeForComparison(newAddress);
    
    // Strict search in Column A (Index 0) first, then history (Index 3)
    let rowIndex = rows.findIndex((r: any) => normalizeForComparison(r[0]) === oldNorm);
    if (rowIndex === -1) rowIndex = rows.findIndex((r: any) => isAddressInHistory(String(r[3] || ''), oldNorm));
    
    const timestamp = new Date().toLocaleString('ru-RU');
    
    let finalAddress = newAddress;
    let finalLat = lat;
    let finalLon = lon;
    let finalHistory = '';
    let finalComment = comment || "";
    let finalStatus = 'confirmed';

    // Create new entry (Append) if strictly not found
    if (rowIndex === -1) {
        let initialHistory = `${oldAddress} [${timestamp}]`;
        if (comment) initialHistory += `\nКомментарий: "${comment}"`;
        finalHistory = initialHistory;
        
        // If no coords provided, set status to pending and use empty strings
        if (lat === undefined || lon === undefined) {
            finalStatus = 'pending';
            finalLat = undefined;
            finalLon = undefined;
        }
        
        await callWithRetry(() => sheets.spreadsheets.values.append({ 
            spreadsheetId: CACHE_SPREADSHEET_ID, 
            range: `'${actualSheetTitle}'!A1`, 
            valueInputOption: 'USER_ENTERED', 
            requestBody: { values: [[finalAddress, finalLat ?? '', finalLon ?? '', finalHistory, finalComment, finalStatus]] } 
        }), 'appendNewUpdate');
        
        return { success: true, data: { address: finalAddress, lat: finalLat, lon: finalLon, comment: finalComment, history: finalHistory, coordStatus: finalStatus } };
    }

    // Update existing entry
    const row = rows[rowIndex];
    const rowNumber = rowIndex + 1; // 1-based index for API
    const currentStoredAddress = String(row[0] || '');
    const currentStoredHistory = String(row[3] || '');
    const currentStoredComment = String(row[4] || '');
    const currentStoredStatus = String(row[5] || '');
    
    const isAddressChanged = normalizeForComparison(currentStoredAddress) !== newNorm;
    const isCommentChanged = comment !== undefined && comment.trim() !== currentStoredComment.trim();
    
    let eventEntry = '';
    if (isAddressChanged && isCommentChanged) eventEntry = `Изменен адрес: ${currentStoredAddress || oldAddress}\nНовый комментарий: "${comment}" [${timestamp}]`;
    else if (isAddressChanged) eventEntry = `Изменен адрес: ${currentStoredAddress || oldAddress} [${timestamp}]`;
    else if (isCommentChanged) eventEntry = `Комментарий: "${comment}" [${timestamp}]`;

    finalHistory = currentStoredHistory;
    
    // Append to history. Use newline to separate from previous history.
    if (eventEntry) {
        if (finalHistory) {
            // Check if last char is newline
            if (!finalHistory.endsWith('\n')) finalHistory += '\n';
            finalHistory += `|| ${eventEntry}`; 
        } else {
            finalHistory = eventEntry;
        }
    }

    // IMPLICIT -> EXPLICIT LOGIC
    // If address changed and no manual coords, CLEAR coords (EMPTY STRING) and set status PENDING
    if (isAddressChanged && lat === undefined) {
        finalLat = undefined; 
        finalLon = undefined; 
        finalStatus = 'pending';
    } else {
        // Keep existing if not changed, or use new if manual
        finalLat = lat !== undefined ? lat : (row[1] ? parseFloat(row[1]) : undefined);
        finalLon = lon !== undefined ? lon : (row[2] ? parseFloat(row[2]) : undefined);
        
        if (lat !== undefined) {
             finalStatus = 'confirmed';
        } else {
             // Retain existing status if valid, else infer confirmed if coords exist
             finalStatus = currentStoredStatus || (finalLat && finalLon ? 'confirmed' : 'pending');
        }
    }
    
    if (comment === undefined) finalComment = currentStoredComment;

    await callWithRetry(() => sheets.spreadsheets.values.update({ 
        spreadsheetId: CACHE_SPREADSHEET_ID, 
        range: `'${actualSheetTitle}'!A${rowNumber}:F${rowNumber}`, 
        valueInputOption: 'USER_ENTERED', 
        requestBody: { 
            values: [[
                finalAddress, 
                finalLat !== undefined ? finalLat : "", // Ensure empty string if undefined
                finalLon !== undefined ? finalLon : "", // Ensure empty string if undefined
                finalHistory, 
                finalComment,
                finalStatus
            ]] 
        } 
    }), 'updateFullRow');

    return { 
        success: true, 
        data: { 
            address: finalAddress, 
            lat: finalLat, 
            lon: finalLon, 
            comment: finalComment, 
            history: finalHistory,
            coordStatus: finalStatus
        } 
    };
}

export async function deleteAddressFromCache(rmName: string, address: string): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);
    const response = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A:A` }), 'getAddrForDelete') as any;
    const rowIndex = (response.data.values?.flat() || []).findIndex((a: any) => normalizeForComparison(String(a)) === normalizeForComparison(address));
    if (rowIndex !== -1) {
        await callWithRetry(() => sheets.spreadsheets.values.update({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!B${rowIndex + 1}:C${rowIndex + 1}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [['DELETED', 'DELETED']] } }), 'markDeleted');
    }
}

export async function getAddressFromCache(rmName: string, address: string): Promise<any | null> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await callWithRetry(() => sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID }), 'getSpreadsheet') as any;
    const existingSheet = spreadsheet.data.sheets?.find((s: any) => s.properties?.title?.toLowerCase() === rmName.toLowerCase());
    if (!existingSheet) return null;
    
    const response = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${existingSheet.properties.title}'!A:F` }), 'getAddrData') as any;
    const values = response.data.values || [];
    const addressNorm = normalizeForComparison(address);
    let foundRow = values.find((row: any) => normalizeForComparison(row[0]) === addressNorm);
    if (!foundRow) foundRow = values.find((row: any) => isAddressInHistory(String(row[3] || ''), addressNorm));
    
    if (foundRow) {
        const latStr = String(foundRow[1] || '').trim(); const lonStr = String(foundRow[2] || '').trim();
        if (latStr === 'DELETED' || lonStr === 'DELETED') return null;
        const isInvalid = ['не найдено', 'некорректный адрес'].some(s => latStr.toLowerCase().includes(s));
        
        // Ensure lat/lon are not "lat" or "lon" text headers
        const lat = (!isInvalid && latStr && latStr.toLowerCase() !== 'lat') ? parseFloat(latStr.replace(',', '.')) : undefined;
        const lon = (!isInvalid && lonStr && lonStr.toLowerCase() !== 'lon') ? parseFloat(lonStr.replace(',', '.')) : undefined;

        // CRITICAL FIX: If coordinates exist, imply 'confirmed' status even if cell says 'pending'
        let coordStatus = String(foundRow[5] || '').trim();
        if (lat !== undefined && lon !== undefined && coordStatus !== 'invalid') {
            coordStatus = 'confirmed';
        }

        return {
            address: String(foundRow[0]),
            lat,
            lon,
            history: foundRow[3], 
            comment: foundRow[4], 
            coordStatus, // Returned implied confirmed status
            isInvalid
        };
    }
    return null;
}