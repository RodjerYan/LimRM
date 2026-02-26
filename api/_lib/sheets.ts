
import { google, sheets_v4, drive_v3 } from 'googleapis';
import { OkbDataRow } from '../../types.js';
import { Readable } from 'stream';

const SPREADSHEET_ID = '13HkruBN9a_Y5xF8nUGpoyo3N7nJxiTW3PPgqw8FsApI';
const CACHE_SPREADSHEET_ID = '1peEj55jcwLQMG9yN8uX5-0xtSCycNA0SA5UrAoF0OE8';
const SHEET_NAME = 'Base';
const SNAPSHOT_FILENAME = 'system_analytics_snapshot_v1.json';

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
    try { 
        // Remove whitespace/newlines that might wrap the JSON
        const cleanedKey = serviceAccountKey.trim();
        credentials = JSON.parse(cleanedKey);
        
        // CRITICAL FIX: Sanitize private_key to handle escaped newlines
        if (credentials.private_key) {
            credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        }
    } catch (error) { 
        console.error("JSON Parse Error for Service Account Key:", error);
        throw new Error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY JSON.'); 
    }

    // Reverted: Removed 'subject' to fix 401 error for personal Gmail accounts
    return new google.auth.JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
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

export async function saveSnapshot(data: any): Promise<void> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS['2025'];
    if (!folderId) throw new Error("Folder ID for 2025 not configured.");
    const listRes = await callWithRetry(() => drive.files.list({
        q: `name = '${SNAPSHOT_FILENAME}' and '${folderId}' in parents and trashed = false`,
        fields: 'files(id)',
    }), 'checkSnapshot') as any;
    const fileId = listRes.data.files?.[0]?.id;
    const media = { mimeType: 'application/json', body: JSON.stringify(data) };
    if (fileId) {
        await callWithRetry(() => drive.files.update({ fileId, media }), 'updateSnapshot');
    } else {
        await callWithRetry(() => drive.files.create({ requestBody: { name: SNAPSHOT_FILENAME, parents: [folderId] }, media }), 'createSnapshot');
    }
}

export async function getSnapshot(): Promise<any | null> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS['2025'];
    if (!folderId) return null;
    const listRes = await callWithRetry(() => drive.files.list({
        q: `name = '${SNAPSHOT_FILENAME}' and '${folderId}' in parents and trashed = false`,
        fields: 'files(id, modifiedTime, size)',
    }), 'findSnapshot') as any;
    const file = listRes.data.files?.[0];
    if (!file || !file.id) return null;
    try {
        const res = await callWithRetry(() => drive.files.get({ fileId: file.id!, alt: 'media' }), 'downloadSnapshot') as any;
        return { data: res.data, versionHash: file.modifiedTime, size: file.size };
    } catch (e) { return null; }
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
    const ranges = sheetTitles.map((title: string) => `'${title}'!A:G`); 
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
                const isDeleted = String(row[6] || '').toUpperCase() === 'TRUE';
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
    const cleanRmName = rmName.trim();
    const spreadsheet = await callWithRetry(() => sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID }), 'ensureSheetExists') as any;
    const existingSheet = spreadsheet.data.sheets?.find((s: any) => s.properties?.title?.toLowerCase() === cleanRmName.toLowerCase());
    if (existingSheet) return existingSheet.properties!.title!;
    await callWithRetry(() => sheets.spreadsheets.batchUpdate({ spreadsheetId: CACHE_SPREADSHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: cleanRmName } } }] } }), 'addSheet');
    await callWithRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${cleanRmName}'!A1`, valueInputOption: 'RAW', requestBody: { values: [['Адрес ТТ', 'lat', 'lon', 'История Изменений', 'Комментарии', 'Статус Координат', 'Удален']] } }), 'initSheetHeader');
    return cleanRmName; 
}

export async function appendToCache(rmName: string, rowsToAppend: (string | number | undefined)[][]): Promise<void> {
    if (rowsToAppend.length === 0) return;
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);
    const existing = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A2:A` }), 'checkExisting') as any;
    const existingAddresses = new Set(existing.data.values?.flat().map((a: any) => normalizeForComparison(String(a))) || []);
    const unique = rowsToAppend.filter(row => row[0] && !existingAddresses.has(normalizeForComparison(String(row[0]))));
    if (unique.length === 0) return;
    const enrichedUnique = unique.map(row => [...row, '', '', 'pending', 'FALSE']);
    await callWithRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A1`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: enrichedUnique } }), 'appendRows');
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
        return [
            { range: `'${actualSheetTitle}'!B${rowIndex}:C${rowIndex}`, values: [[update.lat, update.lon]] },
            { range: `'${actualSheetTitle}'!F${rowIndex}`, values: [['confirmed']] }
        ];
    }).flat().filter(Boolean) as any;
    if (data.length > 0) await callWithRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: CACHE_SPREADSHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data } }), 'batchUpdateCoords');
}

export async function updateAddressInCache(
    rmName: string, 
    oldAddress: string, 
    newAddress: string, 
    comment?: string,
    lat?: number,
    lon?: number,
    skipHistory?: boolean,
    userName?: string
): Promise<{ success: boolean }> {
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);
    const response = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A:G` }), 'getAddrForUpdate2') as any;
    const rows = response.data.values || [];
    const oldNorm = normalizeForComparison(oldAddress);
    const newNorm = normalizeForComparison(newAddress);
    let rowIndex = rows.findIndex((r: any) => normalizeForComparison(r[0]) === oldNorm);
    if (rowIndex === -1) rowIndex = rows.findIndex((r: any) => isAddressInHistory(String(r[3] || ''), oldNorm));
    const timestamp = new Date().toLocaleString('ru-RU');
    const author = userName || 'Система';
    
    const newLat = lat !== undefined ? lat : '';
    const newLon = lon !== undefined ? lon : '';
    const coordStatus = (lat !== undefined && lon !== undefined) ? 'confirmed' : 'pending';

    if (rowIndex === -1) {
        // If the address isn't found yet in cache, we still want a meaningful history entry.
        // Previously we logged the *address* as if it was the change text, which made the UI
        // show the address instead of "Комментарий: ...".
        let historyText = '';
        if (!skipHistory) {
            const parts: string[] = [];
            if (oldNorm && newNorm && oldNorm !== newNorm) parts.push(`Адрес: ${oldAddress} → ${newAddress}`);
            if (lat !== undefined && lon !== undefined) parts.push(`Координаты: ${lat}, ${lon}`);
            if (comment !== undefined) parts.push(`Комментарий: ${String(comment).trim()}`);
            historyText = `${author}: ${(parts.length ? parts.join(' | ') : newAddress)} [${timestamp}]`;
        }
        await callWithRetry(() => sheets.spreadsheets.values.append({ 
            spreadsheetId: CACHE_SPREADSHEET_ID, 
            range: `'${actualSheetTitle}'!A1`, 
            valueInputOption: 'USER_ENTERED', 
            requestBody: { values: [[newAddress, newLat, newLon, historyText, comment || "", coordStatus, 'FALSE']] } 
        }), 'appendNewUpdate');
        return { success: true };
    }

    const row = rows[rowIndex]; const rowNumber = rowIndex + 1;
    if (normalizeForComparison(String(row[0] || '')) === newNorm) {
        const updates: any[] = [];
        if (comment !== undefined) updates.push({ range: `'${actualSheetTitle}'!E${rowNumber}`, values: [[comment]] });
        if (lat !== undefined && lon !== undefined) {
             updates.push({ range: `'${actualSheetTitle}'!B${rowNumber}:C${rowNumber}`, values: [[lat, lon]] });
             updates.push({ range: `'${actualSheetTitle}'!F${rowNumber}`, values: [['confirmed']] });
        }

        // --- HISTORY LOGGING FOR IN-PLACE UPDATES ---
        if (!skipHistory) {
            let logParts: string[] = [];
            
            // Check if coords changed
            if (lat !== undefined && lon !== undefined) {
                const oldLat = parseFloat(String(row[1] || '0').replace(',', '.'));
                const oldLon = parseFloat(String(row[2] || '0').replace(',', '.'));
                if (Math.abs(oldLat - lat) > 0.000001 || Math.abs(oldLon - lon) > 0.000001) {
                    logParts.push(`Координаты: ${lat}, ${lon}`);
                }
            }

            // Check if comment changed
            if (comment !== undefined) {
                const oldComment = String(row[4] || '').trim();
                const newComment = String(comment).trim();
                // Always log if comment is provided and different, OR if it's a new comment on an empty field
                if (oldComment !== newComment) {
                    logParts.push(`Комментарий: ${newComment}`);
                }
            }

            if (logParts.length > 0) {
                const historyEntry = `${author}: ${logParts.join('; ')} [${timestamp}]`;
                const currentHistory = String(row[3] || '');
                const newHistory = currentHistory ? `${currentHistory}\n${historyEntry}` : historyEntry;
                updates.push({ range: `'${actualSheetTitle}'!D${rowNumber}`, values: [[newHistory]] });
            }
        }
        
        if (updates.length > 0) {
            await callWithRetry(() => sheets.spreadsheets.values.batchUpdate({ 
                spreadsheetId: CACHE_SPREADSHEET_ID, 
                requestBody: { valueInputOption: 'USER_ENTERED', data: updates } 
            }), 'updateAddressFields');
        }
        return { success: true };
    }
    
    const historyEntry = `${author}: ${String(row[0] || oldAddress)} [${timestamp}]`;
    const newHistory = (row[3] && !skipHistory) ? `${row[3]}\n${historyEntry}` : (skipHistory ? (row[3] || '') : historyEntry);
    
    await callWithRetry(() => sheets.spreadsheets.values.update({ 
        spreadsheetId: CACHE_SPREADSHEET_ID, 
        range: `'${actualSheetTitle}'!A${rowNumber}:G${rowNumber}`, 
        valueInputOption: 'USER_ENTERED', 
        requestBody: { values: [[newAddress, newLat, newLon, newHistory, comment !== undefined ? comment : (row[4] || ''), coordStatus, 'FALSE']] } 
    }), 'updateFullRow');
    return { success: true };
}

export async function deleteAddressFromCache(rmName: string, address: string): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);
    const response = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A:A` }), 'getAddrForDelete') as any;
    const rowIndex = (response.data.values?.flat() || []).findIndex((a: any) => normalizeForComparison(String(a)) === normalizeForComparison(address));
    if (rowIndex !== -1) {
        await callWithRetry(() => sheets.spreadsheets.values.batchUpdate({ 
            spreadsheetId: CACHE_SPREADSHEET_ID, 
            requestBody: { 
                valueInputOption: 'USER_ENTERED',
                data: [
                    { range: `'${actualSheetTitle}'!B${rowIndex + 1}:C${rowIndex + 1}`, values: [['', '']] },
                    { range: `'${actualSheetTitle}'!G${rowIndex + 1}`, values: [['TRUE']] }
                ]
            }
        }), 'markDeleted');
    }
}

export async function deleteHistoryEntryFromCache(
    rmName: string, 
    address: string, 
    entryText?: string, 
    timestamp?: number, 
    commentText?: string
): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);
    const response = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${actualSheetTitle}'!A:D` }), 'getAddrForHistoryDelete') as any;
    const rows = response.data.values || [];
    const addressNorm = normalizeForComparison(address);
    const rowIndex = rows.findIndex((r: any) => normalizeForComparison(r[0]) === addressNorm);
    
    if (rowIndex !== -1) {
        const rowNumber = rowIndex + 1;
        const currentHistory = String(rows[rowIndex][3] || '');
        if (!currentHistory) return;

        const entries = currentHistory.split(/\r?\n/);
        const newEntries = entries.filter(e => {
            const trimmedEntry = e.trim();
            if (!trimmedEntry) return false;

            // 1. Exact match (for string-based history items)
            if (entryText && trimmedEntry === entryText.trim()) return false;

            // 2. Timestamp/Text match (for object-based history items)
            if (timestamp && commentText) {
                // Check if entry contains the comment text
                if (trimmedEntry.includes(commentText)) {
                    // Try to parse date from entry: "User: Text [Date]"
                    const dateMatch = trimmedEntry.match(/\[([^\]]+)\]$/);
                    if (dateMatch) {
                        const dateStr = dateMatch[1];
                        // Parse "DD.MM.YYYY, HH:mm:ss" or just "DD.MM.YYYY"
                        // If just date, we can't match timestamp accurately, so rely on text match + date match (day)
                        
                        // Let's try to parse full date time first
                        const parts = dateStr.split(', ');
                        if (parts.length === 2) {
                            const [dPart, tPart] = parts;
                            const [day, month, year] = dPart.split('.').map(Number);
                            const [hours, minutes, seconds] = tPart.split(':').map(Number);
                            
                            if (!isNaN(day) && !isNaN(month) && !isNaN(year) && !isNaN(hours) && !isNaN(minutes)) {
                                const entryDate = new Date(year, month - 1, day, hours, minutes, seconds || 0);
                                const entryTs = entryDate.getTime();
                                
                                // Allow 2 minute tolerance for execution delay / clock skew
                                if (Math.abs(entryTs - timestamp) < 120000) {
                                    return false; // Delete match
                                }
                            }
                        } else {
                            // Only date part? Check if date matches timestamp's date
                            const [day, month, year] = dateStr.split('.').map(Number);
                            const tsDate = new Date(timestamp);
                            if (tsDate.getDate() === day && (tsDate.getMonth() + 1) === month && tsDate.getFullYear() === year) {
                                // Same day, same text -> delete
                                return false;
                            }
                        }
                    }
                }
            }
            
            return true;
        });
        
        if (newEntries.length !== entries.length) {
            const newHistory = newEntries.join('\n');
            await callWithRetry(() => sheets.spreadsheets.values.update({ 
                spreadsheetId: CACHE_SPREADSHEET_ID, 
                range: `'${actualSheetTitle}'!D${rowNumber}`, 
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[newHistory]] }
            }), 'updateHistoryAfterDelete');
        }
    }
}

export async function getAddressFromCache(rmName: string, address: string): Promise<any | null> {
    const cleanRmName = rmName.trim();
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await callWithRetry(() => sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID }), 'getSpreadsheet') as any;
    const existingSheet = spreadsheet.data.sheets?.find((s: any) => s.properties?.title?.toLowerCase() === cleanRmName.toLowerCase());
    if (!existingSheet) return null;
    
    const response = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${existingSheet.properties.title}'!A:G` }), 'getAddrData') as any;
    const values = response.data.values || [];
    const addressNorm = normalizeForComparison(address);
    let foundRow = values.find((row: any) => normalizeForComparison(row[0]) === addressNorm);
    if (!foundRow) foundRow = values.find((row: any) => isAddressInHistory(String(row[3] || ''), addressNorm));
    
    if (foundRow) {
        const isDeleted = String(foundRow[6] || '').toUpperCase() === 'TRUE';
        if (isDeleted) return null;

        const latStr = String(foundRow[1] || '').trim(); const lonStr = String(foundRow[2] || '').trim();
        const isInvalid = ['не найдено', 'некорректный адрес'].some(s => latStr.toLowerCase().includes(s));
        
        return {
            address: String(foundRow[0]),
            lat: (!isInvalid && latStr && latStr !== 'lat') ? parseFloat(latStr.replace(',', '.')) : undefined,
            lon: (!isInvalid && lonStr && lonStr !== 'lon') ? parseFloat(lonStr.replace(',', '.')) : undefined,
            history: foundRow[3], 
            comment: foundRow[4], 
            coordStatus: foundRow[5],
            isInvalid
        };
    }
    return null;
}