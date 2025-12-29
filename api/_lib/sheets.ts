
import { Readable } from 'stream';
import type { sheets_v4, drive_v3 } from 'googleapis';

// Интерфейс для строки данных из таблицы
export interface OkbDataRow {
    [key: string]: any;
}

const SPREADSHEET_ID = '13HkruBN9a_Y5xF8nUGpoyo3N7nJxiTW3PPgqw8FsApI';
const CACHE_SPREADSHEET_ID = '1peEj55jcwLQMG9yN8uX5-0xtSCycNA0SA5UrAoF0OE8';
const SHEET_NAME = 'Base';

const SNAPSHOT_FOLDER_ID = '15Mu4ByeDhObf2PBzDykTjHWV00AtfRT8';
const SNAPSHOT_FILENAME = 'akb_master_snapshot.json';

const ROOT_FOLDERS: Record<string, string> = {
    '2025': '1uJX1deU3Xo29cGeaUsepvMdmDosCN-7u',
    '2026': '1S3O-kl_ct4dfh11uG8rLRDeNUVeF3o17'
};

// Lazy load googleapis to prevent cold start timeouts
async function getGoogleLib() {
    try {
        const mod = await import('googleapis');
        return mod.google;
    } catch (e) {
        throw new Error('Failed to load googleapis library. Check dependencies.');
    }
}

async function getAuthClient() {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set.');
    
    let credentials;
    try {
        credentials = typeof serviceAccountKey === 'string' ? JSON.parse(serviceAccountKey) : serviceAccountKey;
    } catch (e) {
        throw new Error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY');
    }

    const google = await getGoogleLib();
    return new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    });
}

export async function getGoogleSheetsClient(): Promise<sheets_v4.Sheets> {
    const auth = await getAuthClient();
    const google = await getGoogleLib();
    return google.sheets({ version: 'v4', auth });
}

export async function getGoogleDriveClient(): Promise<drive_v3.Drive> {
    const auth = await getAuthClient();
    const google = await getGoogleLib();
    return google.drive({ version: 'v3', auth });
}

export async function loadMasterSnapshot(): Promise<any | null> {
    const drive = await getGoogleDriveClient();
    const files = await drive.files.list({
        q: `'${SNAPSHOT_FOLDER_ID}' in parents and name = '${SNAPSHOT_FILENAME}' and trashed = false`,
        fields: 'files(id, name, modifiedTime)'
    });
    if (!files.data.files || files.data.files.length === 0) return null;
    const res = await drive.files.get({ fileId: files.data.files[0].id!, alt: 'media' });
    return res.data;
}

export async function saveMasterSnapshot(data: any): Promise<string> {
    const drive = await getGoogleDriveClient();
    const files = await drive.files.list({
        q: `'${SNAPSHOT_FOLDER_ID}' in parents and name = '${SNAPSHOT_FILENAME}' and trashed = false`,
        fields: 'files(id)'
    });
    const content = JSON.stringify(data);
    const media = { mimeType: 'application/json', body: Readable.from([content]) };
    if (files.data.files && files.data.files.length > 0) {
        await drive.files.update({ fileId: files.data.files[0].id!, media });
        return files.data.files[0].id!;
    } else {
        const res = await drive.files.create({
            requestBody: { name: SNAPSHOT_FILENAME, parents: [SNAPSHOT_FOLDER_ID], mimeType: 'application/json' },
            media: media,
            fields: 'id'
        });
        return res.data.id!;
    }
}

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (error: any) {
            attempt++;
            const status = error.response?.status || error.code;
            if (attempt > 3 || (status !== 429 && status < 500)) throw error;
            await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
        }
    }
}

export async function getOKBData(): Promise<OkbDataRow[]> {
  const sheets = await getGoogleSheetsClient();
  const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!A:P` })) as any;
  const rows = res.data.values;
  if (!rows || rows.length < 2) return [];
  const header = rows[0].map((h: any) => String(h || '').trim());
  return rows.slice(1).map((rowArray: any[]) => {
    if (!rowArray || rowArray.length === 0) return null;
    const row: any = {};
    header.forEach((key: string, index: number) => { if (key) row[key] = rowArray[index] || null; });
    return row as OkbDataRow;
  }).filter((row: any): row is OkbDataRow => row !== null);
}

export async function getOKBAddresses(): Promise<string[]> {
    const sheets = await getGoogleSheetsClient();
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!C2:C` })) as any;
    return (res.data.values || []).flat().map((address: any) => String(address || '').trim()).filter(Boolean);
}

export async function batchUpdateOKBStatus(updates: { rowIndex: number, status: string }[]) {
    if (updates.length === 0) return;
    const sheets = await getGoogleSheetsClient();
    const data = updates.map(u => ({ range: `${SHEET_NAME}!F${u.rowIndex}`, values: [[u.status]] }));
    await callWithRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { valueInputOption: 'RAW', data } }));
}

export async function listFilesForYear(year: string): Promise<{ id: string, name: string }[]> {
    const drive = await getGoogleDriveClient();
    const rootFolderId = ROOT_FOLDERS[year];
    if (!rootFolderId) return [];
    const folderListRes = await drive.files.list({ q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: 'files(id, name)' });
    const allFiles: { id: string, name: string }[] = [];
    for (const folder of (folderListRes.data.files || [])) {
        if (!folder.id) continue;
        const fileListRes = await drive.files.list({ q: `'${folder.id}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`, fields: 'files(id, name)' });
        allFiles.push(...(fileListRes.data.files || []).map(f => ({ id: f.id!, name: f.name || 'Untitled' })));
    }
    return allFiles;
}

export async function listFilesForMonth(year: string, month: number): Promise<{ id: string, name: string }[]> {
    const drive = await getGoogleDriveClient();
    const rootFolderId = ROOT_FOLDERS[year];
    if (!rootFolderId) return [];
    const folderListRes = await drive.files.list({ q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: 'files(id, name)' });
    const monthStr = month.toString().padStart(2, '0');
    const targetFolder = (folderListRes.data.files || []).find(f => f.name?.startsWith(monthStr) || f.name?.includes(monthStr));
    if (!targetFolder || !targetFolder.id) return [];
    const fileListRes = await drive.files.list({ q: `'${targetFolder.id}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`, fields: 'files(id, name)' });
    return (fileListRes.data.files || []).map(f => ({ id: f.id!, name: f.name || 'Untitled' }));
}

export async function fetchFileContent(fileId: string, range: string = 'A:CZ'): Promise<any[][]> {
    const sheets = await getGoogleSheetsClient();
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: fileId, range, valueRenderOption: 'UNFORMATTED_VALUE' })) as any;
    return res.data.values || [];
}

function norm(str: string): string { return String(str || '').toLowerCase().replace(/[^а-я0-9]/g, '').trim(); }

export async function getFullCoordsCache(): Promise<any> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await callWithRetry(() => sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID })) as any;
    const sheetTitles = (spreadsheet.data.sheets?.map((s: any) => s.properties?.title).filter(Boolean) as string[]) || [];
    if (sheetTitles.length === 0) return {};
    const ranges = sheetTitles.map((title: string) => `'${title}'!A:E`); 
    const response = await callWithRetry(() => sheets.spreadsheets.values.batchGet({ spreadsheetId: CACHE_SPREADSHEET_ID, ranges })) as any;
    const cache: any = {};
    response.data.valueRanges?.forEach((valueRange: any) => {
        let title = valueRange.range?.split('!')[0].replace(/'/g, '') || 'Unknown';
        const values = valueRange.values || [];
        if (values.length > 1) {
            cache[title] = values.slice(1).map((row: any) => ({
                address: String(row[0] || '').trim(),
                lat: row[1] ? parseFloat(String(row[1]).replace(',', '.')) : undefined,
                lon: row[2] ? parseFloat(String(row[2]).replace(',', '.')) : undefined,
                history: row[3], comment: row[4]
            })).filter((item: any) => item.address);
        }
    });
    return cache;
}

export async function appendToCache(rmName: string, rowsToAppend: any[][]) {
    const sheets = await getGoogleSheetsClient();
    await callWithRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A1`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: rowsToAppend } }));
}

export async function updateCacheCoords(rmName: string, updates: any[]) {
    const sheets = await getGoogleSheetsClient();
    const response = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A:A` })) as any;
    const addrs = (response.data.values || []).flat().map((a: any) => norm(String(a)));
    const data = updates.map((u: any) => {
        const idx = addrs.indexOf(norm(u.address));
        return idx === -1 ? null : { range: `'${rmName}'!B${idx+1}:C${idx+1}`, values: [[u.lat, u.lon]] };
    }).filter(Boolean) as any[];
    if (data.length) await callWithRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: CACHE_SPREADSHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data } }));
}

export async function updateAddressInCache(rmName: string, oldAddress: string, newAddress: string, comment?: string) {
    const sheets = await getGoogleSheetsClient();
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A:E` })) as any;
    const rows = res.data.values || [];
    const oldN = norm(oldAddress);
    let idx = rows.findIndex((r: any[]) => norm(r[0]) === oldN);
    const ts = new Date().toLocaleString('ru-RU');
    if (idx === -1) {
        await callWithRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[newAddress, '', '', `${oldAddress} [${ts}]`, comment || ""]] } }));
    } else {
        const r = rows[idx];
        const newHist = r[3] ? `${r[3]}\n${r[0]} [${ts}]` : `${r[0]} [${ts}]`;
        await callWithRetry(() => sheets.spreadsheets.values.update({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A${idx+1}:E${idx+1}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[newAddress, "", "", newHist, comment || r[4] || ""]] } }));
    }
}

export async function deleteAddressFromCache(rmName: string, address: string) {
    const sheets = await getGoogleSheetsClient();
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A:A` })) as any;
    const addrs = (res.data.values || []).flat().map((a: any) => norm(String(a)));
    const idx = addrs.indexOf(norm(address));
    if (idx !== -1) await callWithRetry(() => sheets.spreadsheets.values.update({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!B${idx+1}:C${idx+1}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [['DELETED', 'DELETED']] } }));
}

export async function getAddressFromCache(rmName: string, address: string) {
    const sheets = await getGoogleSheetsClient();
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A:E` })) as any;
    const rows = res.data.values || [];
    const n = norm(address);
    const found = rows.find((r: any[]) => norm(r[0]) === n);
    if (found && found[1] !== 'DELETED') {
        return { address: found[0], lat: parseFloat(String(found[1]).replace(',', '.')), lon: parseFloat(String(found[2]).replace(',', '.')), history: found[3], comment: found[4] };
    }
    return null;
}
