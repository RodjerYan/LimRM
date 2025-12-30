
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
        throw new Error('Environment variable GOOGLE_SERVICE_ACCOUNT_KEY is not set');
    }

    let credentials;
    try {
        // Remove possible whitespace/hidden chars from env variable
        credentials = JSON.parse(serviceAccountKey.trim());
        if (credentials.private_key) {
            // Ensure private key has actual newlines
            credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        }
    } catch (error) {
        throw new Error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY JSON: ' + (error as Error).message);
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
    // Reduced retries to avoid Vercel timeout (Hobby limit 10s)
    const MAX_RETRIES = 2;
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (error: any) {
            attempt++;
            const status = error.response?.status || error.code;
            const isRetryable = status === 429 || (status >= 500 && status <= 504);
            
            if (attempt > MAX_RETRIES || !isRetryable) {
                console.error(`Critical API Error in ${context}:`, error.message);
                throw error;
            }
            // Small delay for retry
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
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
  
  if (!res || !res.data || !res.data.values) return [];
  
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
    if (!rootFolderId) throw new Error(`Folder for year ${year} not configured.`);
    return []; // Placeholder for CIS specific logic
}

export async function listFilesForYear(year: string): Promise<{ id: string, name: string }[]> {
    return []; // Placeholder
}

export async function fetchFileContent(fileId: string, range: string = 'A:CZ'): Promise<any[][]> {
    const sheets = await getGoogleSheetsClient();
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: range, valueRenderOption: 'UNFORMATTED_VALUE' }), `fetchFileContent-${fileId}-${range}`) as any;
    return res.data.values || [];
}

export async function getFullCoordsCache(): Promise<Record<string, { address: string; lat?: number; lon?: number; history?: string; isDeleted?: boolean; isInvalid?: boolean; comment?: string }[]>> {
    return {}; // Placeholder
}

export async function updateAddressInCache(rmName: string, oldAddress: string, newAddress: string, comment?: string): Promise<void> {}
export async function updateCacheCoords(rmName: string, updates: { address: string; lat: number; lon: number }[]): Promise<void> {}
export async function deleteAddressFromCache(rmName: string, address: string): Promise<void> {}
export async function getAddressFromCache(rmName: string, address: string): Promise<any | null> { return null; }
export async function appendToCache(rmName: string, rowsToAppend: (string | number | undefined)[][]): Promise<void> {}
export async function initResumableSnapshotUpload(): Promise<{ sessionUrl: string }> { return { sessionUrl: '' }; }
