
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Buffer } from 'node:buffer';
import { google } from 'googleapis';
import type { sheets_v4, drive_v3 } from 'googleapis';
import { Readable } from 'stream';

// --- EMBEDDED SHEET LIB LOGIC ---

interface OkbDataRow {
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

async function getAuthClient() {
    const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!rawKey) {
        console.error('CRITICAL: GOOGLE_SERVICE_ACCOUNT_KEY is missing from environment variables.');
        throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set.');
    }
    
    let credentials;
    try {
        // 1. Clean the input string
        let keyString = rawKey.trim();

        // 2. Remove accidental outer quotes (common Vercel/Terminal copy-paste artifact)
        if ((keyString.startsWith('"') && keyString.endsWith('"')) || 
            (keyString.startsWith("'") && keyString.endsWith("'"))) {
            keyString = keyString.slice(1, -1);
        }

        // 3. Detect and decode Base64
        // If it doesn't start with '{', it's extremely likely to be Base64
        if (!keyString.startsWith('{')) {
            try {
                // Buffer.from handles whitespace in base64 strings gracefully usually, 
                // but explicit stripping of newlines inside the base64 string helps.
                const base64Clean = keyString.replace(/[\r\n\s]/g, '');
                const decoded = Buffer.from(base64Clean, 'base64').toString('utf-8');
                
                // If decoding resulted in a JSON-like string, use it
                if (decoded.trim().startsWith('{')) {
                    keyString = decoded.trim();
                }
            } catch (e) {
                // If decoding fails, assume it's a malformed raw string and proceed to try parsing it as is
                console.warn('Tried Base64 decoding but failed, attempting raw parse.');
            }
        }

        // 4. Handle escaped newlines
        // Vercel UI often escapes '\n' to '\\n' when pasting multi-line strings. 
        // We fix this for the 'private_key' field specifically later, or globally here.
        keyString = keyString.replace(/\\n/g, '\n');
        
        // 5. Parse JSON
        credentials = JSON.parse(keyString);
        
        // 6. Double-check if the value was double-stringified (JSON inside a string)
        if (typeof credentials === 'string') {
             credentials = JSON.parse(credentials);
        }

    } catch (e: any) {
        console.error('CRITICAL: Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY JSON.');
        console.error('Error details:', e.message);
        // Log a safe prefix to help debugging (first 10 chars)
        console.error(`Key prefix received: ${rawKey.substring(0, 10)}...`);
        throw new Error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY. Ensure it is a valid JSON string or Base64 encoded JSON.');
    }

    return new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    });
}

async function getGoogleSheetsClient(): Promise<sheets_v4.Sheets> {
    const auth = await getAuthClient();
    return google.sheets({ version: 'v4', auth });
}

async function getGoogleDriveClient(): Promise<drive_v3.Drive> {
    const auth = await getAuthClient();
    return google.drive({ version: 'v3', auth });
}

async function loadMasterSnapshot(): Promise<any | null> {
    try {
        const drive = await getGoogleDriveClient();
        const files = await drive.files.list({
            q: `'${SNAPSHOT_FOLDER_ID}' in parents and name = '${SNAPSHOT_FILENAME}' and trashed = false`,
            fields: 'files(id, name, modifiedTime)'
        });
        if (!files.data.files || files.data.files.length === 0) return null;
        const res = await drive.files.get({ fileId: files.data.files[0].id!, alt: 'media' });
        return res.data;
    } catch (e: any) {
        console.error('Error loading master snapshot:', e.message);
        if (e.message?.includes('insufficient authentication scopes') || e.code === 403) {
             throw new Error(`Service Account lacks permission. Share folder ${SNAPSHOT_FOLDER_ID} with client_email.`);
        }
        throw e;
    }
}

async function saveMasterSnapshot(data: any): Promise<string> {
    try {
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
    } catch (e) {
        console.error('Error saving master snapshot:', e);
        throw e;
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
            console.warn(`API call failed (attempt ${attempt}):`, error.message);
            
            if (status === 403 || (error.message && error.message.includes('permission'))) {
                 throw new Error('Google API Permission Error. Ensure Service Account has Editor access.');
            }

            if (attempt > 3 || (status !== 429 && status < 500)) throw error;
            await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
        }
    }
}

async function getOKBData(): Promise<OkbDataRow[]> {
  try {
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
  } catch (e) {
      console.error('Error fetching OKB data:', e);
      throw e;
  }
}

async function getOKBAddresses(): Promise<string[]> {
    const sheets = await getGoogleSheetsClient();
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${SHEET_NAME}!C2:C` })) as any;
    return (res.data.values || []).flat().map((address: any) => String(address || '').trim()).filter(Boolean);
}

async function batchUpdateOKBStatus(updates: { rowIndex: number, status: string }[]) {
    if (updates.length === 0) return;
    const sheets = await getGoogleSheetsClient();
    const data = updates.map(u => ({ range: `${SHEET_NAME}!F${u.rowIndex}`, values: [[u.status]] }));
    await callWithRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { valueInputOption: 'RAW', data } }));
}

async function listFilesForYear(year: string): Promise<{ id: string, name: string }[]> {
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

async function listFilesForMonth(year: string, month: number): Promise<{ id: string, name: string }[]> {
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

async function fetchFileContent(fileId: string, range: string = 'A:CZ'): Promise<any[][]> {
    const sheets = await getGoogleSheetsClient();
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: fileId, range, valueRenderOption: 'UNFORMATTED_VALUE' })) as any;
    return res.data.values || [];
}

function norm(str: string): string { return String(str || '').toLowerCase().replace(/[^а-я0-9]/g, '').trim(); }

async function getFullCoordsCache(): Promise<any> {
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

async function appendToCache(rmName: string, rowsToAppend: any[][]) {
    const sheets = await getGoogleSheetsClient();
    await callWithRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A1`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: rowsToAppend } }));
}

async function updateCacheCoords(rmName: string, updates: any[]) {
    const sheets = await getGoogleSheetsClient();
    const response = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A:A` })) as any;
    const addrs = (response.data.values || []).flat().map((a: any) => norm(String(a)));
    const data = updates.map((u: any) => {
        const idx = addrs.indexOf(norm(u.address));
        return idx === -1 ? null : { range: `'${rmName}'!B${idx+1}:C${idx+1}`, values: [[u.lat, u.lon]] };
    }).filter(Boolean) as any[];
    if (data.length) await callWithRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: CACHE_SPREADSHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data } }));
}

async function updateAddressInCache(rmName: string, oldAddress: string, newAddress: string, comment?: string) {
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

async function deleteAddressFromCache(rmName: string, address: string) {
    const sheets = await getGoogleSheetsClient();
    const res = await callWithRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!A:A` })) as any;
    const addrs = (res.data.values || []).flat().map((a: any) => norm(String(a)));
    const idx = addrs.indexOf(norm(address));
    if (idx !== -1) await callWithRetry(() => sheets.spreadsheets.values.update({ spreadsheetId: CACHE_SPREADSHEET_ID, range: `'${rmName}'!B${idx+1}:C${idx+1}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [['DELETED', 'DELETED']] } }));
}

async function getAddressFromCache(rmName: string, address: string) {
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

// --- END EMBEDDED SHEET LIB ---

export const runtime = 'nodejs';

export const config = {
  maxDuration: 60,
  memory: 1024,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string) || '';

  // Unified CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    switch (action) {
      case 'get-okb':
        return res.status(200).json(await getOKBData());

      case 'get-okb-status': {
        if (req.method !== 'POST') return res.status(405).end();
        if (!req.body.fileBase64) return res.status(400).json({ error: 'File is required' });

        // Limit file size to 10 MB
        const fileBuffer = Buffer.from(req.body.fileBase64, 'base64');
        if (fileBuffer.length > 10 * 1024 * 1024) {
          return res.status(413).json({ error: 'File too large. Max 10MB' });
        }

        // Dynamic import of XLSX to reduce cold start time
        const XLSX = await import('xlsx');

        const okbAddresses = await getOKBAddresses();
        let workbook;
        try {
          workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        } catch (e: any) {
          return res.status(400).json({ error: 'Invalid Excel file', details: e.message });
        }

        const akbData: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
        const akbAddresses = new Set(akbData.flat().map((cell: any) => String(cell || '').trim()));

        const updates = okbAddresses.map((addr: string, idx: number) => ({
          rowIndex: idx + 2,
          status: akbAddresses.has(addr) ? 'Совпадение' : 'Не найдено'
        }));

        await batchUpdateOKBStatus(updates);
        return res.status(200).json({ success: true });
      }

      case 'get-akb': {
        const year = (req.query.year as string) || '2025';
        const mode = req.query.mode as string;
        const monthStr = req.query.month as string;

        const drive = await getGoogleDriveClient();

        if (mode === 'metadata') {
          const files = monthStr ? await listFilesForMonth(year, parseInt(monthStr, 10)) : await listFilesForYear(year);
          if (files.length === 0) return res.status(200).json({ version: 'none' });
          const meta = await drive.files.get({ fileId: files[0].id!, fields: 'modifiedTime, size' });
          return res.status(200).json({ versionHash: `${meta.data.modifiedTime}-${meta.data.size}-${files.length}` });
        }

        if (mode === 'list') {
          return res.status(200).json(monthStr ? await listFilesForMonth(year, parseInt(monthStr, 10)) : await listFilesForYear(year));
        }

        if (req.query.fileId) {
          const offset = parseInt(req.query.offset as string || '0', 10);
          const limit = parseInt(req.query.limit as string || '5000', 10);
          const chunk = await fetchFileContent(req.query.fileId as string, `A${offset + 1}:CZ${offset + limit}`);
          return res.status(200).json({ rows: chunk, hasMore: chunk.length >= limit });
        }

        return res.status(400).json({ error: 'Invalid mode' });
      }

      case 'snapshot':
        if (req.method === 'GET') return res.status(200).json(await loadMasterSnapshot());
        if (req.method === 'POST') return res.status(200).json({ success: true, fileId: await saveMasterSnapshot(req.body) });
        return res.status(405).end();

      case 'full-cache':
        return res.status(200).json(await getFullCoordsCache());

      case 'get-cached-address':
        return res.status(200).json(await getAddressFromCache(req.query.rmName as string, req.query.address as string));

      case 'add-to-cache':
        await appendToCache(req.body.rmName, req.body.rows.map((r: any) => [r.address, r.lat ?? '', r.lon ?? '']));
        return res.status(200).json({ success: true });

      case 'update-coords':
        await updateCacheCoords(req.body.rmName, req.body.updates);
        return res.status(200).json({ success: true });

      case 'update-address':
        await updateAddressInCache(req.body.rmName, req.body.oldAddress, req.body.newAddress, req.body.comment);
        return res.status(200).json({ success: true });

      case 'delete-address':
        await deleteAddressFromCache(req.body.rmName, req.query.address as string);
        return res.status(200).json({ success: true });

      case 'geocode':
        return res.status(404).json({ error: 'Not found' });

      case 'get-conflict-zones':
        return res.status(200).json({ type: "FeatureCollection", features: [] });

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (e: any) {
    console.error('API Error:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Internal Server Error' });
    else res.end();
  }
}
