import { google, sheets_v4, drive_v3 } from 'googleapis';
import { OkbDataRow } from '../../types';

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
    const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!keyRaw) {
        throw new Error('Критическая ошибка: Переменная GOOGLE_SERVICE_ACCOUNT_KEY не установлена в Vercel.');
    }

    let credentials;
    try {
        const cleanedKey = keyRaw.trim();
        credentials = JSON.parse(cleanedKey);
    } catch (error) {
        console.error('JSON Parse Error for GOOGLE_SERVICE_ACCOUNT_KEY:', error);
        throw new Error('Критическая ошибка: GOOGLE_SERVICE_ACCOUNT_KEY имеет неверный формат JSON.');
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
    return google.sheets({ version: 'v4', auth });
}

export async function getGoogleDriveClient(): Promise<drive_v3.Drive> {
    const auth = await getAuthClient();
    return google.drive({ version: 'v3', auth });
}

// FIX: Added normalization helper for coordinate cache matching
function normalizeForComparison(str: string): string {
    return String(str || '').toLowerCase().replace(/\u00A0/g, ' ').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
}

// FIX: Added history check helper for coordinate cache updates
function isAddressInHistory(historyString: string, targetAddressNorm: string): boolean {
    if (!historyString) return false;
    const entries = historyString.split(/\r?\n|\s*\|\|\s*/);
    return entries.some(entry => {
        const addrPart = entry.split('[')[0];
        return normalizeForComparison(addrPart) === targetAddressNorm;
    });
}

// FIX: Added sheet existence ensure helper
async function ensureSheetExists(sheets: sheets_v4.Sheets, rmName: string): Promise<string> {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID });
    const existingSheet = spreadsheet.data.sheets?.find((s: any) => s.properties?.title?.toLowerCase() === rmName.toLowerCase());
    if (existingSheet) return existingSheet.properties!.title!;
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: CACHE_SPREADSHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: rmName } } }] } });
    await sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A1`, valueInputOption: 'RAW', requestBody: { values: [['Адрес ТТ', 'lat', 'lon', 'История Изменений', 'Комментарии']] } });
    return rmName; 
}

// --- УПРАВЛЕНИЕ СОСТОЯНИЕМ ЗАДАЧИ ---

export interface JobState {
    status: 'idle' | 'processing' | 'completed' | 'error';
    totalRows: number;
    processedRows: number;
    message: string;
    startTime: number;
    lastUpdated: number;
    error?: string;
    currentChunkIndex: number;
}

export async function getJobState(): Promise<JobState | null> {
    try {
        const drive = await getGoogleDriveClient();
        const folderId = ROOT_FOLDERS['2025'];
        const listRes = await drive.files.list({
            q: `name = '${JOB_STATE_FILENAME}' and '${folderId}' in parents and trashed = false`,
            fields: 'files(id)',
        });

        const file = listRes.data.files?.[0];
        if (!file?.id) return null;

        const res = await drive.files.get({ fileId: file.id, alt: 'media' });
        return res.data as JobState;
    } catch (e) {
        return null;
    }
}

export async function updateJobState(state: JobState): Promise<void> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS['2025'];
    
    const listRes = await drive.files.list({
        q: `name = '${JOB_STATE_FILENAME}' and '${folderId}' in parents and trashed = false`,
        fields: 'files(id)',
    });
    
    const existingId = listRes.data.files?.[0]?.id;
    const media = { mimeType: 'application/json', body: JSON.stringify(state) };

    if (existingId) {
        await drive.files.update({ fileId: existingId, media });
    } else {
        await drive.files.create({ 
            requestBody: { name: JOB_STATE_FILENAME, parents: [folderId] }, 
            media 
        });
    }
}

export async function saveTempChunk(index: number, data: any): Promise<void> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS['2025'];
    const filename = `${TEMP_CHUNK_PREFIX}${index}.json`;
    const media = { mimeType: 'application/json', body: JSON.stringify(data) };
    
    await drive.files.create({ 
        requestBody: { name: filename, parents: [folderId] }, 
        media 
    });
}

export async function clearTempChunks(): Promise<void> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS['2025'];
    const listRes = await drive.files.list({
        q: `name contains '${TEMP_CHUNK_PREFIX}' and '${folderId}' in parents and trashed = false`,
        fields: 'files(id)',
    });
    const files = listRes.data.files || [];
    await Promise.all(files.map(f => drive.files.delete({ fileId: f.id! }).catch(() => {})));
}

export async function loadAllTempChunks(): Promise<any[]> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS['2025'];
    const listRes = await drive.files.list({
        q: `name contains '${TEMP_CHUNK_PREFIX}' and '${folderId}' in parents and trashed = false`,
        fields: 'files(id, name)',
    });

    const files = (listRes.data.files || []).sort((a, b) => a.name!.localeCompare(b.name!));
    const results = await Promise.all(files.map(f => 
        drive.files.get({ fileId: f.id!, alt: 'media' }).then(r => r.data).catch(() => null)
    ));
    return results.filter(Boolean);
}

// --- РАБОТА СО СНЭПШОТАМИ ---

export async function saveSnapshotChunk(filename: string, data: any): Promise<void> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS['2025'];
    const listRes = await drive.files.list({
        q: `name = '${filename}' and '${folderId}' in parents and trashed = false`,
        fields: 'files(id)',
    });
    const existingId = listRes.data.files?.[0]?.id;
    const media = { mimeType: 'application/json', body: JSON.stringify(data) };

    if (existingId) {
        await drive.files.update({ fileId: existingId, media });
    } else {
        await drive.files.create({ requestBody: { name: filename, parents: [folderId] }, media });
    }
}

export async function clearOldSnapshots(): Promise<void> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS['2025'];
    const listRes = await drive.files.list({
        q: `name contains '${CHUNK_PREFIX}' and '${folderId}' in parents and trashed = false`,
        fields: 'files(id)',
    });
    const files = listRes.data.files || [];
    await Promise.all(files.map(f => drive.files.delete({ fileId: f.id! }).catch(() => {})));
}

export async function getDistributedSnapshot(): Promise<any | null> {
    try {
        const drive = await getGoogleDriveClient();
        const folderId = ROOT_FOLDERS['2025'];
        
        const manifestRes = await drive.files.list({
            q: `name = '${MANIFEST_FILENAME}' and '${folderId}' in parents and trashed = false`,
            fields: 'files(id, modifiedTime)',
        });
        if (!manifestRes.data.files?.length) return null;

        const chunksRes = await drive.files.list({
            q: `name contains '${CHUNK_PREFIX}' and '${folderId}' in parents and trashed = false`,
            fields: 'files(id, name)',
        });

        const chunkFiles = (chunksRes.data.files || []).sort((a, b) => a.name!.localeCompare(b.name!));
        const allData = await Promise.all(chunkFiles.map(f => 
            drive.files.get({ fileId: f.id!, alt: 'media' }).then(r => r.data)
        ));

        const manifest = await drive.files.get({ fileId: manifestRes.data.files[0].id!, alt: 'media' });
        
        return {
            data: {
                ...manifest.data,
                aggregatedData: allData.flat()
            },
            versionHash: manifestRes.data.files[0].modifiedTime
        };
    } catch (e) {
        return null;
    }
}

// --- ОКБ И КЭШ ---

export async function getOKBData(): Promise<OkbDataRow[]> {
  const sheets = await getGoogleSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!A:P` });
  const rows = res.data.values;
  if (!rows || rows.length < 2) return [];
  const header = rows[0].map((h: any) => String(h || '').trim());
  return rows.slice(1).map((rowArray: any[]) => {
        const row: { [key: string]: any } = {};
        header.forEach((key: string, index: number) => { if (key) row[key] = rowArray[index] || null; });
        return row as OkbDataRow;
    }).filter(row => row['Наименование']);
}

// FIX: Added getOKBAddresses for status check functionality
export async function getOKBAddresses(): Promise<string[]> {
    const sheets = await getGoogleSheetsClient();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!C2:C` });
    return (res.data.values || []).flat().map((address: any) => String(address || '').trim()).filter(Boolean);
}

// FIX: Added batchUpdateOKBStatus for status check functionality
export async function batchUpdateOKBStatus(updates: { rowIndex: number, status: string }[]) {
    if (updates.length === 0) return;
    const sheets = await getGoogleSheetsClient();
    const data = updates.map(update => ({ range: `${SHEET_NAME}!F${update.rowIndex}`, values: [[update.status]] }));
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { valueInputOption: 'RAW', data } });
}

export async function getFullCoordsCache(): Promise<Record<string, { address: string; lat?: number; lon?: number; history?: string; isDeleted?: boolean; isInvalid?: boolean; comment?: string }[]>> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID });
    const sheetTitles = spreadsheet.data.sheets?.map((s: any) => s.properties?.title).filter(Boolean) as string[] || [];
    if (sheetTitles.length === 0) return {};
    const ranges = sheetTitles.map((title: string) => `'${title}'!A:E`); 
    const response = await sheets.spreadsheets.values.batchGet({ spreadsheetId: CACHE_SPREADSHEET_ID, ranges });
    const cache: Record<string, any[]> = {};
    const BAD_STATUSES = ['не найдено', 'некорректный адрес'];
    response.data.valueRanges?.forEach((vr: any) => {
        let title = vr.range?.split('!')[0].replace(/'/g, '') || 'Unknown';
        const values = vr.values || [];
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

// FIX: Added getAddressFromCache for coordinate editing
export async function getAddressFromCache(rmName: string, address: string): Promise<any | null> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID });
    const existingSheet = spreadsheet.data.sheets?.find((s: any) => s.properties?.title?.toLowerCase() === rmName.toLowerCase());
    if (!existingSheet) return null;
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${existingSheet.properties!.title!}'!A:E` });
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

// FIX: Added appendToCache for coordinate cache updates
export async function appendToCache(rmName: string, rowsToAppend: (string | number | undefined)[][]): Promise<void> {
    if (rowsToAppend.length === 0) return;
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);
    const existing = await sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A2:A` });
    const existingAddresses = new Set(existing.data.values?.flat().map((a: any) => normalizeForComparison(String(a))) || []);
    const unique = rowsToAppend.filter(row => row[0] && !existingAddresses.has(normalizeForComparison(String(row[0]))));
    if (unique.length === 0) return;
    await sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A1`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: unique } });
}

// FIX: Added updateCacheCoords for coordinate cache updates
export async function updateCacheCoords(rmName: string, updates: { address: string; lat: number; lon: number }[]): Promise<void> {
    if (updates.length === 0) return;
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A:A` });
    const addressIndexMap = new Map<string, number>();
    (response.data.values?.flat() || []).forEach((addr: any, i: number) => { if(addr) addressIndexMap.set(normalizeForComparison(String(addr)), i + 1); });
    const data = updates.map(update => {
        const rowIndex = addressIndexMap.get(normalizeForComparison(update.address));
        if (!rowIndex) return null;
        return { range: `'${actualSheetTitle}'!B${rowIndex}:C${rowIndex}`, values: [[update.lat, update.lon]] };
    }).filter(Boolean) as any;
    if (data.length > 0) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: CACHE_SPREADSHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data } });
}

// FIX: Added updateAddressInCache for coordinate cache updates
export async function updateAddressInCache(rmName: string, oldAddress: string, newAddress: string, comment?: string): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A:E` });
    const rows = response.data.values || [];
    const oldNorm = normalizeForComparison(oldAddress);
    const newNorm = normalizeForComparison(newAddress);
    let rowIndex = rows.findIndex((r: any) => normalizeForComparison(r[0]) === oldNorm);
    if (rowIndex === -1) rowIndex = rows.findIndex((r: any) => isAddressInHistory(String(r[3] || ''), oldNorm));
    const timestamp = new Date().toLocaleString('ru-RU');
    if (rowIndex === -1) {
        await sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[newAddress, '', '', `${oldAddress} [${timestamp}]`, comment || ""]] } });
        return;
    }
    const row = rows[rowIndex]; const rowNumber = rowIndex + 1;
    if (normalizeForComparison(String(row[0] || '')) === newNorm) {
        if (comment !== undefined) await sheets.spreadsheets.values.update({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!E${rowNumber}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[comment]] } });
        return;
    }
    const historyEntry = `${String(row[0] || oldAddress)} [${timestamp}]`;
    const newHistory = row[3] ? `${row[3]}\n${historyEntry}` : historyEntry;
    await sheets.spreadsheets.values.update({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A${rowNumber}:E${rowNumber}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[newAddress, "", "", newHistory, comment !== undefined ? comment : (row[4] || '')]] } });
}

// FIX: Added deleteAddressFromCache for coordinate cache updates
export async function deleteAddressFromCache(rmName: string, address: string): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A:A` });
    const rowIndex = (response.data.values?.flat() || []).findIndex((a: any) => normalizeForComparison(String(a)) === normalizeForComparison(address));
    if (rowIndex !== -1) {
        await sheets.spreadsheets.values.update({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!B${rowIndex + 1}:C${rowIndex + 1}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [['DELETED', 'DELETED']] } });
    }
}

export async function fetchFileContent(fileId: string, range: string): Promise<any[][]> {
    const sheets = await getGoogleSheetsClient();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range, valueRenderOption: 'UNFORMATTED_VALUE' });
    return res.data.values || [];
}

// FIX: Added listFilesForMonth for file listing by period
export async function listFilesForMonth(year: string, month: number): Promise<{ id: string, name: string }[]> {
    const drive = await getGoogleDriveClient();
    const rootFolderId = ROOT_FOLDERS[year];
    if (!rootFolderId) throw new Error(`Folder for year ${year} not configured.`);
    const mName = RUSSIAN_MONTHS_ORDER[month - 1];
    const engMonthName = MONTH_MAP[mName];
    if (!engMonthName) return [];
    
    const folderListRes = await drive.files.list({ q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: 'files(id, name)', pageSize: 50 });
    const monthFolder = folderListRes.data.files?.find(f => f.name?.toLowerCase() === engMonthName.toLowerCase());
    if (!monthFolder || !monthFolder.id) return [];
    const fileListRes = await drive.files.list({ q: `'${monthFolder.id}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`, fields: 'files(id, name)', pageSize: 100 });
    return (fileListRes.data.files || []).map(f => ({ id: f.id!, name: f.name || 'Untitled' }));
}

export async function listFilesForYear(year: string): Promise<{ id: string, name: string }[]> {
    const drive = await getGoogleDriveClient();
    const rootId = ROOT_FOLDERS[year];
    const foldersRes = await drive.files.list({ q: `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder'`, fields: 'files(id, name)' });
    
    const allFiles: { id: string, name: string }[] = [];
    for (const folder of (foldersRes.data.files || [])) {
        const filesRes = await drive.files.list({ q: `'${folder.id}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet'`, fields: 'files(id, name)' });
        allFiles.push(...(filesRes.data.files || []).map(f => ({ id: f.id!, name: f.name! })));
    }
    return allFiles;
}
