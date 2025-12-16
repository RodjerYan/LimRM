
import { google, sheets_v4, drive_v3 } from 'googleapis';
import { OkbDataRow } from '../../types';

// Основные таблицы (ОКБ и Кэш) остаются статичными, так как это справочники
const SPREADSHEET_ID = '13HkruBN9a_Y5xF8nUGpoyo3N7nJxiTW3PPgqw8FsApI';
const CACHE_SPREADSHEET_ID = '1peEj55jcwLQMG9yN8uX5-0xtSCycNA0SA5UrAoF0OE8';
const SHEET_NAME = 'Base';

// ID корневых папок с данными по годам (из вашего запроса)
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

async function getGoogleSheetsClient(): Promise<sheets_v4.Sheets> {
    const auth = await getAuthClient();
    return google.sheets({ version: 'v4', auth });
}

async function getGoogleDriveClient(): Promise<drive_v3.Drive> {
    const auth = await getAuthClient();
    return google.drive({ version: 'v3', auth });
}

/**
 * Fetches the entire OKB (Общая Клиентская База) from the Google Sheet.
 */
export async function getOKBData(): Promise<OkbDataRow[]> {
  const sheets = await getGoogleSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:P`, 
  });

  const rows = res.data.values;
  if (!rows || rows.length < 2) {
    return []; 
  }

  const header = rows[0].map(h => String(h || '').trim());
  const dataRows = rows.slice(1);

  const okbData: OkbDataRow[] = dataRows
    .map(rowArray => {
        if (rowArray.every(cell => cell === null || cell === '' || cell === undefined)) {
            return null;
        }

        const row: { [key: string]: any } = {};
        header.forEach((key, index) => {
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
    .filter((row): row is OkbDataRow => row !== null);

  return okbData;
}

export async function getOKBAddresses(): Promise<string[]> {
    const sheets = await getGoogleSheetsClient();
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!C2:C`,
    });

    const rows = res.data.values || [];
    return rows.flat().map(address => String(address || '').trim()).filter(Boolean);
}

export async function batchUpdateOKBStatus(updates: { rowIndex: number, status: string }[]) {
    if (updates.length === 0) return;

    const sheets = await getGoogleSheetsClient();

    const data = updates.map(update => ({
        range: `${SHEET_NAME}!F${update.rowIndex}`,
        values: [[update.status]],
    }));

    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
            valueInputOption: 'RAW',
            data: data,
        },
    });
}

/**
 * DYNAMICALLY fetches AKB data by traversing Google Drive folders.
 * Supports filtering by Year, Quarter, or specific Month index.
 */
export async function getAkbData(year?: string, quarter?: number, month?: number): Promise<any[][]> {
    const drive = await getGoogleDriveClient();
    const sheets = await getGoogleSheetsClient();
    
    const targetYear = year || '2025';
    const rootFolderId = ROOT_FOLDERS[targetYear];
    
    if (!rootFolderId) {
        throw new Error(`Папка для года ${targetYear} не настроена в системе.`);
    }

    // Determine target months based on Month param OR Quarter param
    let targetMonthNames: string[] = [];
    
    if (month && month >= 1 && month <= 12) {
        // Specific month requested (1 = January)
        const mName = RUSSIAN_MONTHS_ORDER[month - 1];
        if (mName) targetMonthNames = [mName];
    } else if (quarter) {
        // Fallback to quarter if month not specified
        const quarterMap: Record<number, string[]> = {
            1: ['Январь', 'Февраль', 'Март'],
            2: ['Апрель', 'Май', 'Июнь'],
            3: ['Июль', 'Август', 'Сентябрь'],
            4: ['Октябрь', 'Ноябрь', 'Декабрь']
        };
        targetMonthNames = quarterMap[quarter] || [];
    } else {
        // Fallback to all
        targetMonthNames = Object.keys(MONTH_MAP);
    }

    const allData: any[][] = [];
    let headersSet = false;
    const loadedFiles: string[] = [];

    // 1. List folders inside the Root Year Folder
    const folderListRes = await drive.files.list({
        q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 50
    });
    
    const yearFolders = folderListRes.data.files || [];
    
    // If we can't find the year folder structure at all, that's a config error.
    if (yearFolders.length === 0) {
        console.warn(`В папке ${targetYear} не найдено подпапок.`);
        return [];
    }

    // 2. Iterate through target months and find matching folders
    for (const rusMonth of targetMonthNames) {
        const engMonthName = MONTH_MAP[rusMonth];
        if (!engMonthName) continue;

        const monthFolder = yearFolders.find(f => f.name?.toLowerCase() === engMonthName.toLowerCase());
        
        if (monthFolder && monthFolder.id) {
            // 3. List Spreadsheets inside the Month Folder
            const fileListRes = await drive.files.list({
                q: `'${monthFolder.id}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
                fields: 'files(id, name)',
                pageSize: 50 
            });
            
            const spreadsheets = fileListRes.data.files || [];
            
            if (spreadsheets.length === 0) {
                continue;
            }

            // 4. Fetch data from each spreadsheet found in the folder
            const sheetPromises = spreadsheets.map(async (file) => {
                try {
                    // OPTIMIZATION: Use batchGet to fetch two specific ranges instead of one massive continuous range.
                    // Range 1: 'A:AM' (approx 40 cols) - Contains all main data (Client, Region, Product, Fact, etc.)
                    // Range 2: 'BQ:BR' (cols 69-70) - Contains PM and DM names specifically.
                    // This avoids fetching the empty/irrelevant columns between AM and BQ, reducing payload size by ~40-50%.
                    const res = await sheets.spreadsheets.values.batchGet({
                        spreadsheetId: file.id!,
                        ranges: ['A:AM', 'BQ:BR'], 
                        valueRenderOption: 'UNFORMATTED_VALUE',
                    });

                    const mainData = res.data.valueRanges?.[0]?.values || [];
                    const managerData = res.data.valueRanges?.[1]?.values || [];
                    
                    // Merge the two ranges into a single sparse row structure that matches the Worker's expectations.
                    // The worker expects PM at index 68 (BQ) and DM at index 69 (BR).
                    const mergedRows: any[][] = [];
                    const rowCount = Math.max(mainData.length, managerData.length);

                    for (let i = 0; i < rowCount; i++) {
                        const row = mainData[i] || [];
                        const mgr = managerData[i] || [];
                        
                        // Copy main data
                        // Using a sparse array approach: we just assign indices 68 and 69.
                        // We do NOT fill the gap with nulls to save memory.
                        if (mgr.length > 0) {
                            row[68] = mgr[0]; // BQ -> Index 68
                            row[69] = mgr[1]; // BR -> Index 69
                        }
                        mergedRows.push(row);
                    }

                    return { fileName: file.name, rows: mergedRows };
                } catch (e) {
                    console.error(`Error loading file ${file.name}:`, e);
                    return { fileName: file.name, rows: [] };
                }
            });
            
            const results = await Promise.all(sheetPromises);
            
            for (const { fileName, rows } of results) {
                if (rows.length === 0) continue;
                loadedFiles.push(fileName || 'Unknown');

                // FIX: Use explicit loop instead of spread operator to avoid stack overflow with large arrays
                if (!headersSet) {
                    // Include headers from the first file
                    for (let i = 0; i < rows.length; i++) {
                        allData.push(rows[i]);
                    }
                    headersSet = true;
                } else {
                    // Skip headers (row 0) for subsequent files
                    if (rows.length > 1) {
                        for (let i = 1; i < rows.length; i++) {
                            allData.push(rows[i]);
                        }
                    }
                }
            }
        }
    }

    // FIX: If no data found (e.g. future quarters), return empty array instead of throwing.
    if (allData.length === 0) {
        const timeFrame = month ? `Month ${month}` : (quarter ? `Q${quarter}` : 'All');
        console.warn(`[getAkbData] No data found for ${targetYear} ${timeFrame}. Returning empty.`);
        return [];
    }

    console.log(`[Cloud Load] Loaded ${loadedFiles.length} files from Drive folders.`);
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
    const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
    });

    const sheetTitles = spreadsheet.data.sheets?.map(s => s.properties?.title).filter(Boolean) as string[] || [];
    if (sheetTitles.length === 0) return {};

    const ranges = sheetTitles.map(title => `'${title}'!A:E`); 
    const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        ranges,
    });
    
    const cache: Record<string, { address: string; lat?: number; lon?: number; history?: string; isDeleted?: boolean; isInvalid?: boolean; comment?: string }[]> = {};
    const BAD_STATUSES = ['не найдено', 'некорректный адрес'];

    response.data.valueRanges?.forEach((valueRange) => {
        let title = valueRange.range?.split('!')[0] || 'Unknown';
        if (title.startsWith("'") && title.endsWith("'")) {
             title = title.substring(1, title.length - 1); 
        }
        const values = valueRange.values || [];
        if (values.length > 1) { 
            cache[title] = values.slice(1).map(row => {
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
            }).filter(item => item.address); 
        }
    });

    return cache;
}

async function ensureSheetExists(sheets: sheets_v4.Sheets, rmName: string): Promise<string> {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID });
    const lowerRmName = rmName.toLowerCase();
    const existingSheet = spreadsheet.data.sheets?.find(s => s.properties?.title?.toLowerCase() === lowerRmName);

    if (existingSheet && existingSheet.properties?.title) {
        return existingSheet.properties.title; 
    }
    
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        requestBody: {
            requests: [{ addSheet: { properties: { title: rmName } } }],
        },
    });
    
    await sheets.spreadsheets.values.append({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${rmName}'!A1`,
        valueInputOption: 'RAW',
        requestBody: {
            values: [['Адрес ТТ', 'lat', 'lon', 'История Изменений', 'Комментарии']],
        },
    });
    return rmName; 
}

export async function appendToCache(rmName: string, rowsToAppend: (string | number | undefined)[][]): Promise<void> {
    if (rowsToAppend.length === 0) return;
    
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);

    const existingAddressesResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A2:A`,
    });

    const existingAddresses = new Set(existingAddressesResponse.data.values?.flat().map(a => normalizeForComparison(String(a))) || []);

    const uniqueRowsToAppend = rowsToAppend.filter(row => {
        const address = String(row[0] || '').trim();
        return address && !existingAddresses.has(normalizeForComparison(address));
    });

    if (uniqueRowsToAppend.length === 0) {
        return;
    }

    await sheets.spreadsheets.values.append({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A1`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
            values: uniqueRowsToAppend,
        },
    });
}

export async function updateCacheCoords(rmName: string, updates: { address: string; lat: number; lon: number }[]): Promise<void> {
    if (updates.length === 0) return;
    
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);
    
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A:A`,
    });

    const addressesInSheet = response.data.values?.flat() || [];
    const addressIndexMap = new Map<string, number>();
    addressesInSheet.forEach((addr, i) => {
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
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: CACHE_SPREADSHEET_ID,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: dataForUpdate,
            },
        });
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

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A:E`,
    });

    const rows = response.data.values || [];
    const oldNorm = normalizeForComparison(oldAddress);
    const newNorm = normalizeForComparison(newAddress);

    let rowIndex = -1;
    rowIndex = rows.findIndex(r => normalizeForComparison(r[0]) === oldNorm);

    if (rowIndex === -1) {
        rowIndex = rows.findIndex(r => isAddressInHistory(String(r[3] || ''), oldNorm));
    }

    const timestamp = new Date().toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    if (rowIndex === -1) {
        await sheets.spreadsheets.values.append({
            spreadsheetId: CACHE_SPREADSHEET_ID,
            range: `'${actualSheetTitle}'!A1`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: [[newAddress, '', '', `${oldAddress} [${timestamp}]`, comment || ""]],
            },
        });
        return;
    }

    const row = rows[rowIndex];
    const currentAddress = String(row[0] || '');
    const currentHistory = row[3] ? String(row[3]) : '';
    const currentComment = row[4] ? String(row[4]) : '';
    const rowNumber = rowIndex + 1;

    if (normalizeForComparison(currentAddress) === newNorm) {
        if (comment !== undefined && comment !== currentComment) {
             await sheets.spreadsheets.values.update({
                spreadsheetId: CACHE_SPREADSHEET_ID,
                range: `'${actualSheetTitle}'!E${rowNumber}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[comment]] },
            });
        }
        return;
    }

    const valueToArchive = currentAddress || oldAddress;
    const historyEntry = `${valueToArchive} [${timestamp}]`;
    const newHistory = currentHistory ? `${currentHistory}\n${historyEntry}` : historyEntry;

    await sheets.spreadsheets.values.update({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A${rowNumber}:E${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: [[newAddress, "", "", newHistory, comment !== undefined ? comment : currentComment]], 
        },
    });
}

export async function deleteAddressFromCache(rmName: string, address: string): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A:A`,
    });

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
        await sheets.spreadsheets.values.update({
            spreadsheetId: CACHE_SPREADSHEET_ID,
            range: `'${actualSheetTitle}'!B${rowIndex}:C${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [['DELETED', 'DELETED']],
            },
        });
    }
}

export async function getAddressFromCache(rmName: string, address: string): Promise<{ address: string; lat?: number; lon?: number; history?: string; comment?: string } | null> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID });
    const lowerRmName = rmName.toLowerCase();
    const existingSheet = spreadsheet.data.sheets?.find(s => s.properties?.title?.toLowerCase() === lowerRmName);
    
    if (!existingSheet || !existingSheet.properties?.title) {
        return null; 
    }
    const actualSheetTitle = existingSheet.properties.title;

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A:E`,
    });

    const values = response.data.values || [];
    if (values.length < 2) {
        return null;
    }

    const addressNorm = normalizeForComparison(address);
    let foundRow = values.find(row => normalizeForComparison(row[0]) === addressNorm);

    if (!foundRow) {
        foundRow = values.find(row => isAddressInHistory(String(row[3] || ''), addressNorm));
    }

    if (foundRow) {
        const latStr = String(foundRow[1] || '').trim();
        const lonStr = String(foundRow[2] || '').trim();
        const history = foundRow[3] ? String(foundRow[3]).trim() : undefined;
        const comment = foundRow[4] ? String(foundRow[4]).trim() : undefined;
        
        if (latStr === 'DELETED' || lonStr === 'DELETED') {
             return null; 
        }

        const lat = latStr ? parseFloat(latStr.replace(',', '.')) : undefined;
        const lon = lonStr ? parseFloat(lonStr.replace(',', '.')) : undefined;
        
        return {
            address: String(foundRow[0]),
            lat: (lat !== undefined && !isNaN(lat)) ? lat : undefined,
            lon: (lon !== undefined && !isNaN(lon)) ? lon : undefined,
            history: history,
            comment: comment
        };
    }

    return null;
}
