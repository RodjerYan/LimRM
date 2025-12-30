
import { google, sheets_v4, drive_v3 } from 'googleapis';
import { OkbDataRow } from '../../types.js';
import { Readable } from 'stream';

const SPREADSHEET_ID = '13HkruBN9a_Y5xF8nUGpoyo3N7nJxiTW3PPgqw8FsApI';
const CACHE_SPREADSHEET_ID = '1peEj55jcwLQMG9yN8uX5-0xtSCycNA0SA5UrAoF0OE8';
const SHEET_NAME = 'Base';
const MANIFEST_FILENAME = 'snapshot_manifest_v2.json';
const CHUNK_PREFIX = 'snapshot_chunk_v2_';
const JOB_STATE_FILENAME = 'processing_job_state_v1.json';
const TEMP_CHUNK_PREFIX = 'temp_proc_chunk_';

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
    return new google.auth.GoogleAuth({
        credentials,
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
            if (attempt > MAX_RETRIES || (!isRetryable && status >= 400 && status < 500)) throw error;
            const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// --- JOB STATE MANAGEMENT (For Background Processing) ---

export interface JobState {
    status: 'idle' | 'processing' | 'completed' | 'error';
    totalRows: number;
    processedRows: number;
    message: string;
    startTime: number;
    lastUpdated: number;
    error?: string;
    currentChunkIndex: number;
    totalChunksEstimate: number;
}

export async function getJobState(): Promise<JobState | null> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS['2025'];
    
    try {
        const listRes = await callWithRetry(() => drive.files.list({
            q: `name = '${JOB_STATE_FILENAME}' and '${folderId}' in parents and trashed = false`,
            fields: 'files(id)',
        }), 'findJobState') as any;

        const file = listRes.data.files?.[0];
        if (!file) return null;

        const res = await callWithRetry(() => drive.files.get({ fileId: file.id!, alt: 'media' }), 'dlJobState') as any;
        return res.data as JobState;
    } catch (e) {
        return null;
    }
}

export async function updateJobState(state: JobState): Promise<void> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS['2025'];
    
    // Check if file exists
    const listRes = await callWithRetry(() => drive.files.list({
        q: `name = '${JOB_STATE_FILENAME}' and '${folderId}' in parents and trashed = false`,
        fields: 'files(id)',
    }), 'findJobStateForUpdate') as any;
    
    const existingId = listRes.data.files?.[0]?.id;
    const media = { mimeType: 'application/json', body: JSON.stringify(state) };

    if (existingId) {
        await callWithRetry(() => drive.files.update({ fileId: existingId, media }), 'updateJobState');
    } else {
        await callWithRetry(() => drive.files.create({ 
            requestBody: { name: JOB_STATE_FILENAME, parents: [folderId] }, 
            media 
        }), 'createJobState');
    }
}

export async function saveTempChunk(index: number, data: any): Promise<void> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS['2025'];
    const filename = `${TEMP_CHUNK_PREFIX}${index}.json`;
    
    const media = { mimeType: 'application/json', body: JSON.stringify(data) };
    await callWithRetry(() => drive.files.create({ 
        requestBody: { name: filename, parents: [folderId] }, 
        media 
    }), 'saveTempChunk');
}

export async function clearTempChunks(): Promise<void> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS['2025'];
    
    let pageToken: string | undefined = undefined;
    do {
        const listRes: any = await callWithRetry(() => drive.files.list({
            q: `name contains '${TEMP_CHUNK_PREFIX}' and '${folderId}' in parents and trashed = false`,
            fields: 'nextPageToken, files(id)',
            pageToken
        }), 'listTempChunks');
        
        const files = listRes.data.files || [];
        // Delete in parallel
        await Promise.all(files.map((file: any) => 
            callWithRetry(() => drive.files.delete({ fileId: file.id! }), 'delTempChunk').catch(console.error)
        ));
        pageToken = listRes.data.nextPageToken;
    } while (pageToken);
}

export async function loadAllTempChunks(): Promise<any[]> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS['2025'];
    
    const listRes = await callWithRetry(() => drive.files.list({
        q: `name contains '${TEMP_CHUNK_PREFIX}' and '${folderId}' in parents and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1000
    }), 'listAllTempChunks') as any;

    const files = listRes.data.files || [];
    // Sort by index
    files.sort((a: any, b: any) => {
        const ia = parseInt(a.name.replace(TEMP_CHUNK_PREFIX, '').replace('.json', '') || '0');
        const ib = parseInt(b.name.replace(TEMP_CHUNK_PREFIX, '').replace('.json', '') || '0');
        return ia - ib;
    });

    const results = await Promise.all(files.map((f: any) => 
        callWithRetry(() => drive.files.get({ fileId: f.id!, alt: 'media' }), 'dlTempChunk')
            .then((r: any) => r.data)
            .catch(() => [])
    ));

    return results.flat();
}

// --- DISTRIBUTED SNAPSHOT LOGIC ---

// 1. Save a single chunk (overwrite if exists with same name, or create new)
export async function saveSnapshotChunk(filename: string, data: any): Promise<void> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS['2025'];
    
    // Check if file exists
    const listRes = await callWithRetry(() => drive.files.list({
        q: `name = '${filename}' and '${folderId}' in parents and trashed = false`,
        fields: 'files(id)',
    }), 'findChunk') as any;
    
    const existingId = listRes.data.files?.[0]?.id;
    const media = { mimeType: 'application/json', body: JSON.stringify(data) };

    if (existingId) {
        await callWithRetry(() => drive.files.update({ fileId: existingId, media }), 'updateChunk');
    } else {
        await callWithRetry(() => drive.files.create({ 
            requestBody: { name: filename, parents: [folderId] }, 
            media 
        }), 'createChunk');
    }
}

// 2. Clear old chunks (garbage collection before a full save)
export async function clearOldSnapshots(): Promise<void> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS['2025'];
    
    let pageToken: string | undefined = undefined;
    do {
        const listRes: any = await callWithRetry(() => drive.files.list({
            q: `name contains '${CHUNK_PREFIX}' and '${folderId}' in parents and trashed = false`,
            fields: 'nextPageToken, files(id)',
            pageToken
        }), 'listOldChunks');
        
        const files = listRes.data.files || [];
        for (const file of files) {
            if (file.id) {
                // Async delete without awaiting to speed up
                callWithRetry(() => drive.files.delete({ fileId: file.id! }), 'deleteChunk').catch(console.error);
            }
        }
        pageToken = listRes.data.nextPageToken;
    } while (pageToken);
}

// 3. Load distributed snapshot
export async function getDistributedSnapshot(): Promise<any | null> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS['2025'];
    if (!folderId) return null;

    // A. Get Manifest
    const manifestRes = await callWithRetry(() => drive.files.list({
        q: `name = '${MANIFEST_FILENAME}' and '${folderId}' in parents and trashed = false`,
        fields: 'files(id, modifiedTime)',
    }), 'findManifest') as any;
    
    const manifestFile = manifestRes.data.files?.[0];
    if (!manifestFile || !manifestFile.id) return null;

    let manifestData: any;
    try {
        const res = await callWithRetry(() => drive.files.get({ fileId: manifestFile.id!, alt: 'media' }), 'dlManifest') as any;
        manifestData = res.data;
    } catch (e) { return null; }

    // B. Get All Chunks
    const chunksRes = await callWithRetry(() => drive.files.list({
        q: `name contains '${CHUNK_PREFIX}' and '${folderId}' in parents and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 100 
    }), 'listChunks') as any;

    const chunkFiles = chunksRes.data.files || [];
    // Sort by index (snapshot_chunk_v2_0.json, snapshot_chunk_v2_1.json...)
    chunkFiles.sort((a: any, b: any) => {
        const idxA = parseInt(a.name.replace(CHUNK_PREFIX, '').replace('.json', '') || '0');
        const idxB = parseInt(b.name.replace(CHUNK_PREFIX, '').replace('.json', '') || '0');
        return idxA - idxB;
    });

    // C. Download all chunks in parallel
    const allAggregatedData: any[] = [];
    const downloadPromises = chunkFiles.map((file: any) => 
        callWithRetry(() => drive.files.get({ fileId: file.id!, alt: 'media' }), `dlChunk-${file.name}`)
            .then((res: any) => res.data)
            .catch((e) => { console.error(`Failed to download chunk ${file.name}`, e); return []; })
    );

    const results = await Promise.all(downloadPromises);
    results.forEach(chunkData => {
        if (Array.isArray(chunkData)) {
            allAggregatedData.push(...chunkData);
        }
    });

    // D. Reassemble
    return {
        data: {
            ...manifestData,
            aggregatedData: allAggregatedData
        },
        versionHash: manifestFile.modifiedTime,
        size: 0 // Size is irrelevant in distributed mode
    };
}

// Legacy support (redirects to distributed)
export async function getSnapshot(): Promise<any | null> {
    return getDistributedSnapshot();
}

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

export async function listFilesForMonth(year: string, month: number): Promise<{ id: string, name: string }[]> {
    const drive = await getGoogleDriveClient();
    const rootFolderId = ROOT_FOLDERS[year];
    if (!rootFolderId) throw new Error(`Folder for year ${year} not configured.`);
    const mName = RUSSIAN_MONTHS_ORDER[month - 1];
    const engMonthName = MONTH_MAP[mName];
    if (!engMonthName) return [];
    return callWithRetry(async () => {
        const folderListRes = await drive.files.list({ q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: 'files(id, name)', pageSize: 50 });
        const monthFolder = folderListRes.data.files?.find(f => f.name?.toLowerCase() === engMonthName.toLowerCase());
        if (!monthFolder || !monthFolder.id) return [];
        const fileListRes = await drive.files.list({ q: `'${monthFolder.id}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`, fields: 'files(id, name)', pageSize: 100 });
        return (fileListRes.data.files || []).map(f => ({ id: f.id!, name: f.name || 'Untitled' }));
    }, `listFilesForMonth-${year}-${month}`);
}

export async function listFilesForYear(year: string): Promise<{ id: string, name: string }[]> {
    const drive = await getGoogleDriveClient();
    const rootFolderId = ROOT_FOLDERS[year];
    if (!rootFolderId) throw new Error(`Папка для года ${year} не настроена.`);
    return callWithRetry(async () => {
        const folderListRes = await drive.files.list({ q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: 'files(id, name)', pageSize: 50 });
        const allFiles: { id: string, name: string }[] = [];
        for (const folder of (folderListRes.data.files || [])) {
            if (!folder.id) continue;
            const fileListRes = await drive.files.list({ q: `'${folder.id}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`, fields: 'files(id, name)', pageSize: 100 });
            allFiles.push(...(fileListRes.data.files || []).map(f => ({ id: f.id!, name: f.name || 'Untitled' })));
        }
        return allFiles;
    }, `listFilesForYear-${year}`);
}

export async function fetchFileContent(fileId: string, range: string = 'A:CZ'): Promise<any[][]> {
    const sheets = await getGoogleSheetsClient();
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: range, valueRenderOption: 'UNFORMATTED_VALUE' }), `fetchFileContent-${fileId}-${range}`) as any;
    return res.data.values || [];
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