
import { google, sheets_v4, drive_v3 } from 'googleapis';
import * as XLSX from 'xlsx';
import type { OkbDataRow } from '../../types';

const SPREADSHEET_ID = '13HkruBN9a_Y5xF8nUGpoyo3N7nJxiTW3PPgqw8FsApI';
const CACHE_SPREADSHEET_ID = '1peEj55jcwLQMG9yN8uX5-0xtSCycNA0SA5UrAoF0OE8';
const SHEET_NAME = 'Base';
const SNAPSHOT_SHEET_TITLE = 'System_Snapshot';

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
    if (!serviceAccountKey) {
        throw new Error('Variable GOOGLE_SERVICE_ACCOUNT_KEY is empty. Check Vercel Settings.');
    }

    let credentials;
    try {
        const trimmedKey = serviceAccountKey.trim();
        credentials = JSON.parse(trimmedKey);
        
        if (credentials.private_key) {
            credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        } else {
             throw new Error('JSON key is valid, but private_key property is missing.');
        }
    } catch (error) {
        throw new Error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY. Make sure it is valid JSON string.');
    }

    return new google.auth.GoogleAuth({
        credentials,
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets', 
            'https://www.googleapis.com/auth/drive'
        ],
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

async function callWithRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
    const MAX_RETRIES = 1;
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (error: any) {
            attempt++;
            const status = error.response?.status || error.code;
            
            const isSnapshotMissing = context === 'readSnapshot' && (error.message?.includes('Unable to parse range') || status === 400);
            if (!isSnapshotMissing) {
                console.error(`Error in ${context} (Attempt ${attempt}):`, error.message);
            }
            
            if (attempt > MAX_RETRIES || isSnapshotMissing) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

export async function getOKBData(): Promise<OkbDataRow[]> {
  const sheets = await getGoogleSheetsClient();
  const res = await callWithRetry(() => sheets.spreadsheets.values.get({ 
      spreadsheetId: SPREADSHEET_ID, 
      range: `${SHEET_NAME}!A:P`,
      valueRenderOption: 'FORMATTED_VALUE'
  }), 'getOKBData') as any;
  
  if (!res || !res.data || !res.data.values) {
      console.warn('Sheets API returned empty or no values.');
      return [];
  }
  
  const rows = res.data.values;
  if (rows.length < 2) return [];
  
  const header = rows[0].map((h: any) => String(h || '').trim());
  return rows.slice(1).map((rowArray: any[]) => {
        if (!rowArray || rowArray.length === 0 || rowArray.every(cell => !cell)) return null;
        const row: { [key: string]: any } = {};
        header.forEach((key: string, index: number) => { 
            if (key) row[key] = rowArray[index] !== undefined ? rowArray[index] : null; 
        });
        
        let latVal = row['lat'] || row['latitude'];
        let lonVal = row['lon'] || row['longitude'];
        
        if (rowArray.length > 12) {
             const rawLon = rowArray[11]; const rawLat = rowArray[12];
             if (rawLat && rawLon) { latVal = rawLat; lonVal = rawLon; }
        }
        
        if (latVal && lonVal) {
            const lat = parseFloat(String(latVal).replace(',', '.').trim());
            const lon = parseFloat(String(lonVal).replace(',', '.').trim());
            if (!isNaN(lat) && !isNaN(lon)) { row.lat = lat; row.lon = lon; }
        }
        return row as OkbDataRow;
    }).filter((row: any): row is OkbDataRow => row !== null);
}

// --- SHEET-BASED SNAPSHOT STORAGE ---

async function ensureSnapshotSheet(sheets: sheets_v4.Sheets) {
    const meta = await callWithRetry(() => sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID }), 'getMeta') as any;
    const exists = meta.data.sheets?.some((s: any) => s.properties?.title === SNAPSHOT_SHEET_TITLE);
    if (!exists) {
        await callWithRetry(() => sheets.spreadsheets.batchUpdate({
            spreadsheetId: CACHE_SPREADSHEET_ID,
            requestBody: { requests: [{ addSheet: { properties: { title: SNAPSHOT_SHEET_TITLE } } }] }
        }), 'createSnapshotSheet');
    }
}

// Legacy single-shot save (kept for backward compat, but likely hits 4.5MB limit)
export async function saveSnapshot(data: any): Promise<void> {
    if (!data || !data.aggregatedData || data.aggregatedData.length === 0) {
        console.warn("Attempted to save empty snapshot. Operation skipped.");
        return;
    }
    await initSnapshot();
    await appendSnapshot(JSON.stringify(data));
}

// New Chunked Upload Handlers
export async function initSnapshot(): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    await ensureSnapshotSheet(sheets);
    await callWithRetry(() => sheets.spreadsheets.values.clear({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${SNAPSHOT_SHEET_TITLE}'!A:A`
    }), 'clearSnapshot');
}

export async function appendSnapshot(chunk: string): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    // Google Sheets cell limit is 50,000 chars. We chunk the incoming string.
    const CHUNK_SIZE = 45000; 
    const values: string[][] = [];
    
    for (let i = 0; i < chunk.length; i += CHUNK_SIZE) {
        values.push([chunk.substring(i, i + CHUNK_SIZE)]);
    }
    
    await callWithRetry(() => sheets.spreadsheets.values.append({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${SNAPSHOT_SHEET_TITLE}'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values }
    }), 'appendSnapshot');
}

export async function getSnapshot(): Promise<any | null> {
    const sheets = await getGoogleSheetsClient();
    try {
        const res = await callWithRetry(() => sheets.spreadsheets.values.get({
            spreadsheetId: CACHE_SPREADSHEET_ID,
            range: `'${SNAPSHOT_SHEET_TITLE}'!A:A`
        }), 'readSnapshot') as any;
        
        if (!res.data.values || res.data.values.length === 0) return null;
        
        const fullJson = res.data.values.map((row: any[]) => row[0]).join('');
        const parsed = JSON.parse(fullJson);
        
        return { 
            data: parsed, 
            versionHash: parsed.versionHash || `sheet_${Date.now()}`, 
            size: fullJson.length 
        };
    } catch (e) {
        return null; 
    }
}

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

// --- FILE LISTING FUNCTIONS (UPDATED FOR EXCEL & RECURSION) ---

const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export async function listFilesForMonth(year: string, month: number): Promise<{ id: string, name: string, mimeType: string }[]> {
    const drive = await getGoogleDriveClient();
    const rootFolderId = ROOT_FOLDERS[year];
    if (!rootFolderId) throw new Error(`Folder for year ${year} not configured.`);
    
    const mName = RUSSIAN_MONTHS_ORDER[month - 1];
    const engMonthName = MONTH_MAP[mName];
    if (!engMonthName) return [];

    return callWithRetry(async () => {
        // Try finding folder
        const folderListRes = await drive.files.list({
            q: `'${rootFolderId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 50
        }) as any;
        
        const monthFolder = folderListRes.data.files?.find((f: any) => f.name?.toLowerCase() === engMonthName.toLowerCase());
        
        if (monthFolder && monthFolder.id) {
             const fileListRes = await drive.files.list({
                q: `'${monthFolder.id}' in parents and (mimeType = '${SPREADSHEET_MIME}' or mimeType = '${EXCEL_MIME}') and trashed = false`,
                fields: 'files(id, name, mimeType)',
                pageSize: 100
            }) as any;
            return (fileListRes.data.files || []).map((f: any) => ({ id: f.id!, name: f.name || 'Untitled', mimeType: f.mimeType }));
        }

        return [];
    }, `listFilesForMonth-${year}-${month}`);
}

export async function listFilesForYear(year: string): Promise<{ id: string, name: string, mimeType: string }[]> {
    const drive = await getGoogleDriveClient();
    const rootFolderId = ROOT_FOLDERS[year];
    if (!rootFolderId) throw new Error(`Папка для года ${year} не настроена.`);

    return callWithRetry(async () => {
        const allFiles: { id: string, name: string, mimeType: string }[] = [];

        // 1. Search for files DIRECTLY in the year folder
        const directFilesRes = await drive.files.list({
            q: `'${rootFolderId}' in parents and (mimeType = '${SPREADSHEET_MIME}' or mimeType = '${EXCEL_MIME}') and trashed = false`,
            fields: 'files(id, name, mimeType)',
            pageSize: 100
        }) as any;
        
        if (directFilesRes.data.files) {
            allFiles.push(...directFilesRes.data.files.map((f: any) => ({ id: f.id!, name: f.name || 'Untitled', mimeType: f.mimeType })));
        }

        // 2. Search in SUBFOLDERS (e.g. Month folders)
        const folderListRes = await drive.files.list({
            q: `'${rootFolderId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 50
        }) as any;

        const folders = folderListRes.data.files || [];
        
        const folderPromises = folders.map(async (folder: any) => {
            if (!folder.id) return [];
            const subFilesRes = await drive.files.list({
                q: `'${folder.id}' in parents and (mimeType = '${SPREADSHEET_MIME}' or mimeType = '${EXCEL_MIME}') and trashed = false`,
                fields: 'files(id, name, mimeType)',
                pageSize: 100
            }) as any;
            return subFilesRes.data.files?.map((f: any) => ({ id: f.id!, name: f.name || 'Untitled', mimeType: f.mimeType })) || [];
        });

        const subFiles = await Promise.all(folderPromises);
        subFiles.forEach(files => allFiles.push(...files));

        return allFiles;
    }, `listFilesForYear-${year}`);
}

export async function fetchFileContent(fileId: string, range: string = 'A:CZ', mimeType?: string): Promise<any[][]> {
    if (mimeType === EXCEL_MIME || mimeType === 'application/vnd.ms-excel') {
        const drive = await getGoogleDriveClient();
        return callWithRetry(async () => {
            const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' }) as any;
            const workbook = XLSX.read(res.data, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
            const match = range.match(/[A-Z]+(\d+):[A-Z]+(\d+)/);
            if (match) {
                const startRow = parseInt(match[1], 10) - 1;
                const endRow = parseInt(match[2], 10);
                return rows.slice(startRow, endRow);
            }
            return rows;
        }, `fetchExcel-${fileId}`);
    }

    const sheets = await getGoogleSheetsClient();
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: range, valueRenderOption: 'UNFORMATTED_VALUE' }), `fetchFileContent-${fileId}-${range}`) as any;
    return res.data.values || [];
}

export async function getFullCoordsCache(): Promise<Record<string, { address: string; lat?: number; lon?: number; history?: string; isDeleted?: boolean; isInvalid?: boolean; comment?: string }[]>> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await callWithRetry(() => sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID }), 'getFullCoordsCache-meta') as any;
    const sheetTitles = spreadsheet.data.sheets?.map((s: any) => s.properties?.title).filter(Boolean) as string[] || [];
    if (sheetTitles.length === 0) return {};
    const ranges = sheetTitles.map((title: string) => `'${title}'!A:E`); 
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
                    comment: row[4] ? String(row[4]).trim() : undefined
                };
            }).filter((item: any) => item.address); 
        }
    });
    return cache;
}

async function ensureSheetExists(sheets: sheets_v4.Sheets, rmName: string): Promise<string> {
    const spreadsheet = await callWithRetry(() => sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID }), 'ensureSheetExists') as any;
    const existingSheet = spreadsheet.data.sheets?.find((s: any) => s.properties?.title?.toLowerCase() === rmName.toLowerCase());
    if (existingSheet) return existingSheet.properties!.title!;
    await callWithRetry(() => sheets.spreadsheets.batchUpdate({ spreadsheetId: CACHE_SPREADSHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: rmName } } }] } }), 'addSheet');
    await callWithRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A1`, valueInputOption: 'RAW', requestBody: { values: [['Адрес ТТ', 'lat', 'lon', 'История Изменений', 'Комментарии']] } }), 'initSheetHeader');
    return rmName; 
}

export async function appendToCache(rmName: string, rowsToAppend: (string | number | undefined)[][]): Promise<void> {
    if (rowsToAppend.length === 0) return;
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);
    const existing = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A2:A` }), 'checkExisting') as any;
    const existingAddresses = new Set(existing.data.values?.flat().map((a: any) => normalizeForComparison(String(a))) || []);
    const unique = rowsToAppend.filter(row => row[0] && !existingAddresses.has(normalizeForComparison(String(row[0]))));
    if (unique.length === 0) return;
    await callWithRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A1`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: unique } }), 'appendRows');
}

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
        return { range: `'${actualSheetTitle}'!B${rowIndex}:C${rowIndex}`, values: [[update.lat, update.lon]] };
    }).filter(Boolean) as any;
    if (data.length > 0) await callWithRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: CACHE_SPREADSHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data } }), 'batchUpdateCoords');
}

export async function updateAddressInCache(rmName: string, oldAddress: string, newAddress: string, comment?: string): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);
    const response = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A:E` }), 'getAddrForUpdate2') as any;
    const rows = response.data.values || [];
    const oldNorm = normalizeForComparison(oldAddress);
    const newNorm = normalizeForComparison(newAddress);
    let rowIndex = rows.findIndex((r: any) => normalizeForComparison(r[0]) === oldNorm);
    if (rowIndex === -1) rowIndex = rows.findIndex((r: any) => isAddressInHistory(String(r[3] || ''), oldNorm));
    const timestamp = new Date().toLocaleString('ru-RU');
    if (rowIndex === -1) {
        await callWithRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[newAddress, '', '', `${oldAddress} [${timestamp}]`, comment || ""]] } }), 'appendNewUpdate');
        return;
    }
    const row = rows[rowIndex]; const rowNumber = rowIndex + 1;
    if (normalizeForComparison(String(row[0] || '')) === newNorm) {
        if (comment !== undefined) await callWithRetry(() => sheets.spreadsheets.values.update({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!E${rowNumber}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[comment]] } }), 'updateComment');
        return;
    }
    const historyEntry = `${String(row[0] || oldAddress)} [${timestamp}]`;
    const newHistory = row[3] ? `${row[3]}\n${historyEntry}` : historyEntry;
    await callWithRetry(() => sheets.spreadsheets.values.update({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A${rowNumber}:E${rowNumber}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[newAddress, "", "", newHistory, comment !== undefined ? comment : (row[4] || '')]] } }), 'updateFullRow');
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
    const response = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${existingSheet.properties.title}'!A:E` }), 'getAddrData') as any;
    const values = response.data.values || [];
    const addressNorm = normalizeForComparison(address);
    let foundRow = values.find((row: any) => normalizeForComparison(row[0]) === addressNorm);
    if (!foundRow) foundRow = values.find((row: any) => isAddressInHistory(String(row[3] || ''), addressNorm));
    if (foundRow) {
        const latStr = String(foundRow[1] || '').trim(); const lonStr = String(foundRow[2] || '').trim();
        if (latStr === 'DELETED' || lonStr === 'DELETED') return null;
        const isInvalid = ['не найдено', 'некорректный адрес'].some(s => latStr.toLowerCase().includes(s));
        return {
            address: String(foundRow[0]),
            lat: (!isInvalid && latStr) ? parseFloat(latStr.replace(',', '.')) : undefined,
            lon: (!isInvalid && lonStr) ? parseFloat(lonStr.replace(',', '.')) : undefined,
            history: foundRow[3], comment: foundRow[4], isInvalid
        };
    }
    return null;
}

// --- COORDINATE CACHE FUNCTIONS ---
function normalizeForComparison(str: string): string {
    return String(str || '').toLowerCase().replace(/\u00A0/g, ' ').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isAddressInHistory(historyString: string, targetAddressNorm: string): boolean {
    if (!historyString) return false;
    const entries = historyString.split(/\r?\n|\s*\|\|\s*/);
    return entries.some(entry => {
        const addrPart = entry.split('[')[0];
        return normalizeForComparison(addrPart) === targetAddressNorm;
    });
}
