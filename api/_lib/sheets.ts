
import { google, sheets_v4, drive_v3 } from 'googleapis';
import { OkbDataRow } from '../../types';

const SPREADSHEET_ID = '13HkruBN9a_Y5xF8nUGpoyo3N7nJxiTW3PPgqw8FsApI';
const CACHE_SPREADSHEET_ID = '1peEj55jcwLQMG9yN8uX5-0xtSCycNA0SA5UrAoF0OE8';
const SHEET_NAME = 'Base';
const SNAPSHOT_FILENAME = 'system_analytics_snapshot_v1.json';

const ROOT_FOLDERS: Record<string, string> = {
    '2025': '1uJX1deU3Xo29cGeaUsepvMdmDosCN-7u',
    '2026': '1S3O-kl_ct4dfh11uG8rLRDeNUVeF3o17'
};

async function getAuthClient() {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
        throw new Error('Variable GOOGLE_SERVICE_ACCOUNT_KEY is empty. Check Vercel Settings.');
    }

    let credentials;
    try {
        const trimmedKey = serviceAccountKey.trim();
        credentials = JSON.parse(trimmedKey);
        
        // Ensure the private key has correct line breaks for OpenSSL
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
    const MAX_RETRIES = 1; // Minimal retries for lambda to avoid timeout
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (error: any) {
            attempt++;
            const status = error.response?.status || error.code;
            console.error(`Error in ${context} (Attempt ${attempt}):`, error.message);
            
            if (attempt > MAX_RETRIES) {
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
        
        // Custom logic for column-based mapping
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

export async function saveSnapshot(data: any): Promise<void> {
    const drive = await getGoogleDriveClient();
    const folderId = ROOT_FOLDERS['2025'];
    const listRes = await drive.files.list({ q: `name = '${SNAPSHOT_FILENAME}' and '${folderId}' in parents`, fields: 'files(id)' }) as any;
    const fileId = listRes.data.files?.[0]?.id;
    const media = { mimeType: 'application/json', body: JSON.stringify(data) };
    if (fileId) await drive.files.update({ fileId, media });
    else await drive.files.create({ requestBody: { name: SNAPSHOT_FILENAME, parents: [folderId] }, media });
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
    if (!rootFolderId) return [];
    return [];
}

export async function listFilesForYear(year: string): Promise<{ id: string, name: string }[]> {
    return [];
}

export async function fetchFileContent(fileId: string, range: string = 'A:CZ'): Promise<any[][]> {
    const sheets = await getGoogleSheetsClient();
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: range, valueRenderOption: 'UNFORMATTED_VALUE' }), `fetchFileContent-${fileId}-${range}`) as any;
    return res.data.values || [];
}

export async function getFullCoordsCache(): Promise<Record<string, { address: string; lat?: number; lon?: number; history?: string; isDeleted?: boolean; isInvalid?: boolean; comment?: string }[]>> { return {}; }
export async function updateAddressInCache(rmName: string, oldAddress: string, newAddress: string, comment?: string): Promise<void> {}
export async function updateCacheCoords(rmName: string, updates: { address: string; lat: number; lon: number }[]): Promise<void> {}
export async function deleteAddressFromCache(rmName: string, address: string): Promise<void> {}
export async function getAddressFromCache(rmName: string, address: string): Promise<any | null> { return null; }
export async function appendToCache(rmName: string, rowsToAppend: (string | number | undefined)[][]): Promise<void> {}
export async function initResumableSnapshotUpload(): Promise<{ sessionUrl: string }> { return { sessionUrl: '' }; }
