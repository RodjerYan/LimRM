
import { google, sheets_v4, drive_v3 } from 'googleapis';
import { OkbDataRow } from '../../types';

const SPREADSHEET_ID = '13HkruBN9a_Y5xF8nUGpoyo3N7nJxiTW3PPgqw8FsApI';
const CACHE_SPREADSHEET_ID = '1peEj55jcwLQMG9yN8uX5-0xtSCycNA0SA5UrAoF0OE8';
const SHEET_NAME = 'Base';
const ROOT_FOLDER_ID = '1pZebU-HglA8mTSFizHnp87vNMUQ-70iZ'; // Root folder containing Year folders

/**
 * Creates and returns an authenticated Google Auth client.
 * Shared between Sheets and Drive APIs.
 */
async function getGoogleAuth() {
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error('The GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set.');
  }
  
  let credentials;
  try {
    credentials = JSON.parse(serviceAccountKey);
  } catch (error) {
    console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:", error);
    throw new Error(
      'Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY. Ensure it is a valid JSON string.'
    );
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.metadata.readonly' // Allow reading folder structure
    ],
  });
}

async function getGoogleSheetsClient(): Promise<sheets_v4.Sheets> {
  const auth = await getGoogleAuth();
  return google.sheets({ version: 'v4', auth });
}

async function getGoogleDriveClient(): Promise<drive_v3.Drive> {
    const auth = await getGoogleAuth();
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
 * Dynamically discovers and fetches AKB data from Google Drive.
 * Structure: Root Folder -> Year Folder (e.g. "2025") -> Month Folders -> Spreadsheet Files
 * 
 * @param year - Year string (e.g. "2025") to find the specific year folder.
 * @param quarter - Optional quarter number (1-4) to filter month folders.
 */
export async function getAkbData(year?: string, quarter?: number): Promise<any[][]> {
    const sheets = await getGoogleSheetsClient();
    const drive = await getGoogleDriveClient();
    
    const targetYear = year || '2025';
    const allData: any[][] = [];
    let headersSet = false;
    const errors: string[] = [];

    // 1. Find the Folder for the requested Year
    const yearFolderRes = await drive.files.list({
        q: `'${ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${targetYear}' and trashed = false`,
        fields: 'files(id, name)',
    });

    const yearFolderId = yearFolderRes.data.files?.[0]?.id;
    if (!yearFolderId) {
        throw new Error(`Папка для года "${targetYear}" не найдена в корневой директории Google Drive.`);
    }

    // 2. List all Month sub-folders inside the Year folder
    const monthFoldersRes = await drive.files.list({
        q: `'${yearFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 100 // Should cover 12 months easily
    });

    let monthFolders = monthFoldersRes.data.files || [];

    // 3. Filter Month Folders by Quarter (if provided)
    if (quarter) {
        const monthMap: Record<number, string[]> = {
            1: ['january', 'february', 'march', 'январь', 'февраль', 'март', '01', '02', '03'],
            2: ['april', 'may', 'june', 'апрель', 'май', 'июнь', '04', '05', '06'],
            3: ['july', 'august', 'september', 'июль', 'август', 'сентябрь', '07', '08', '09'],
            4: ['october', 'november', 'december', 'октябрь', 'ноябрь', 'декабрь', '10', '11', '12']
        };
        const targetMonths = monthMap[quarter];
        if (targetMonths) {
            monthFolders = monthFolders.filter(f => {
                const nameLower = (f.name || '').toLowerCase();
                return targetMonths.some(m => nameLower.includes(m));
            });
        }
    }

    if (monthFolders.length === 0) {
        throw new Error(`Нет папок месяцев для ${targetYear} Q${quarter || 'All'}`);
    }

    // 4. Find all spreadsheet files inside the selected month folders
    // We do this in parallel for all selected months
    const sourcesToFetch: { id: string; month: string }[] = [];

    await Promise.all(monthFolders.map(async (folder) => {
        if (!folder.id) return;
        const filesRes = await drive.files.list({
            q: `'${folder.id}' in parents and (mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 50 // Accommodate split files (e.g. January, January_1)
        });
        
        filesRes.data.files?.forEach(file => {
            if (file.id) {
                sourcesToFetch.push({
                    id: file.id,
                    month: folder.name || 'Unknown'
                });
            }
        });
    }));

    if (sourcesToFetch.length === 0) {
        throw new Error(`Не найдено файлов таблиц в папках за ${targetYear} Q${quarter || 'All'}`);
    }

    console.log(`Found ${sourcesToFetch.length} files to fetch for ${targetYear} Q${quarter || 'All'}`);

    // 5. Fetch content from all found spreadsheets
    const fetchPromises = sourcesToFetch.map(async (source) => {
        try {
            const res = await sheets.spreadsheets.values.get({
                spreadsheetId: source.id,
                range: 'A:Z', 
                valueRenderOption: 'UNFORMATTED_VALUE',
            });
            return res.data.values || [];
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`Error fetching file ${source.id} (${source.month}):`, msg);
            errors.push(`${source.month}: ${msg}`);
            return [];
        }
    });

    const batchResults = await Promise.all(fetchPromises);

    // 6. Aggregate results
    for (const rows of batchResults) {
        if (!rows || rows.length === 0) continue;

        if (!headersSet) {
            // First successful fetch: take headers and data
            for (let r = 0; r < rows.length; r++) {
                allData.push(rows[r]);
            }
            headersSet = true;
        } else {
            // Subsequent fetches: skip header (row 0), take data
            if (rows.length > 1) {
                for (let r = 1; r < rows.length; r++) {
                    allData.push(rows[r]);
                }
            }
        }
    }

    if (allData.length === 0) {
        let email = "unknown";
        try {
             const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}');
             email = key.client_email;
        } catch(e) {}
        
        throw new Error(
            `Не удалось загрузить данные ни из одной таблицы (всего найдено: ${sourcesToFetch.length}). \n` +
            `Вероятно, у сервисного аккаунта нет доступа к файлам внутри папок. \n` +
            `ПРОВЕРЬТЕ: Вы должны открыть доступ "Редактор" к корневой папке и всем вложенным папкам/файлам для email: \n${email}\n\n` +
            `Детали ошибок: ${errors.slice(0, 3).join('; ')}...`
        );
    }

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
        console.log(`[updateAddressInCache] Row not found for "${oldAddress}". Appending new row.`);
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
                requestBody: {
                    values: [[comment]], 
                },
            });
        }
        return;
    }

    const valueToArchive = currentAddress || oldAddress;
    const historyEntry = `${valueToArchive} [${timestamp}]`;
    
    const newHistory = currentHistory
        ? `${currentHistory}\n${historyEntry}`
        : historyEntry;

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
