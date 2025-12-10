
import { google, sheets_v4 } from 'googleapis';
import { OkbDataRow } from '../../types';

const SPREADSHEET_ID = '13HkruBN9a_Y5xF8nUGpoyo3N7nJxiTW3PPgqw8FsApI';
const CACHE_SPREADSHEET_ID = '1peEj55jcwLQMG9yN8uX5-0xtSCycNA0SA5UrAoF0OE8';
const SHEET_NAME = 'Base';

// List of all monthly AKB source sheets (Jan 2025 - Dec 2026)
const AKB_SOURCES = [
    { month: 'Январь 2025', id: '1AirnUDv3IiVWnwoNN0OmIVLLWSDsFmMNbEcA709j6EU' },
    { month: 'Февраль 2025', id: '1MuWT53aC3-yKA57JjpWk3m1vj56bQHpNlBTZDUdFdjA' },
    { month: 'Март 2025', id: '1dny_bp6wkXLJVXRJ3eFgCA0VMncaR_QtEEKkipSX7VY' },
    { month: 'Апрель 2025', id: '1zWCHx1ESVs30cUi267qdbQ7uBjoLJxVMgKx9XMdZaVg' },
    { month: 'Май 2025', id: '1PpKTF8gkA2Y-kt_6u6__LTNHyTLn0vOemKsPqMr5CVE' },
    { month: 'Июнь 2025', id: '1mgBu2oD2R5FIcPEQRhg71C709bYrLppsGiv56of97Fk' },
    { month: 'Июль 2025', id: '1z4hHi-e-nh28VQUAi1xwcH1KcRvdUB2r03Kp_YWqLJo' },
    { month: 'Август 2025', id: '11eThOSwdltdcJEh6_zqTg_ZCk1w54ZHEF7TUCCyByyQ' },
    { month: 'Сентябрь 2025', id: '1R-Ljp1RzIqRPX6O3PagepcI8Nmp3MdP-yzKrdS9dLN0' },
    { month: 'Октябрь 2025', id: '1BfkwMXI_AJGykEWtNvhc3pECo23YQk327WmoGyEbPO8' },
    { month: 'Ноябрь 2025', id: '18LU8W5a0edXEWwU-90TgPQPvYUmmL2HBFR-ndCkd5-Q' },
    { month: 'Декабрь 2025', id: '17z9GEBxUl_moMabtTHKzl8ewPkSpEjb4U15W60A1rbM' },
    { month: 'Январь 2026', id: '1L55_oeifyaLJNfUYbxTaOEEFN44YV6aKarWYNKF1hqs' },
    { month: 'Февраль 2026', id: '1IB4h81Y0zv46Qw4HQ9PCAwu-hgbkbhjyRR_9TjwE4ns' },
    { month: 'Март 2026', id: '1ENhibgwC04NBHqjT_nOvoMzHQoWGNEW7s9Q9pSK-IM8' },
    { month: 'Апрель 2026', id: '1q71Yw-NVa08_dsqWxBzTZgVLEajQmkHP5leYSOWYYME' },
    { month: 'Май 2026', id: '1S_J-u_mNchmQdIxUC8Ed5FNFrOEk5GhBJH5m-F5FtPM' },
    { month: 'Июнь 2026', id: '1gaRZdfdHUGiKUVhkfiqSA__Qiu-A1qeIRCm-oJ7KgBo' },
    { month: 'Июль 2026', id: '1-U4CppHolhOirbAAwZeh8ayraXBZu5JOlaWCOfthca0' },
    { month: 'Август 2026', id: '1i5JSpM-EItiRhrVWjjPMLlvfNBDYKv66dFRY1MpMp74' },
    { month: 'Сентябрь 2026', id: '1_tEPTqqsL1AVkWHRZvQkbnaz0gtGYN2uAvlDptFaHo0' },
    { month: 'Октябрь 2026', id: '1bG4h2qNzBybwMKa3j9liRziBUE9O8LW5KH8trmRMuPo' },
    { month: 'Ноябрь 2026', id: '1LpCYKO0M1uX2y3yXkXL809uG9NFHRYX_BcwqI9hMpCY' },
    { month: 'Декабрь 2026', id: '1LqwBn8px0-KU8otKDSUV4yfYsLHzkM2I46bth_e5P40' }
];

/**
 * Creates and returns an authenticated Google Sheets API client.
 * It uses service account credentials stored in an environment variable.
 */
async function getGoogleSheetsClient(): Promise<sheets_v4.Sheets> {
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
      'Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY. Ensure it is a valid JSON string without extra characters or line breaks. Check your Vercel environment variable settings.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  return sheets;
}

/**
 * Fetches the entire OKB (Общая Клиентская База) from the Google Sheet.
 * It parses the data into an array of structured objects compatible with the application's types.
 * This version includes robust parsing to handle empty rows and headers gracefully.
 * @returns {Promise<OkbDataRow[]>} A promise that resolves to an array of OKB data rows.
 */
export async function getOKBData(): Promise<OkbDataRow[]> {
  const sheets = await getGoogleSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:P`, // Fetch a wider range to include potential coordinate columns
  });

  const rows = res.data.values;
  if (!rows || rows.length < 2) {
    return []; // No data or only a header row
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

        // STRICT COLUMN MAPPING CONFIRMED BY SCREENSHOTS:
        // OKB Sheet "Base for RM": 
        // Column L (Index 11) = "Долгота" (Longitude)
        // Column M (Index 12) = "Широта" (Latitude)
        // 0-based index: A=0 ... K=10, L=11, M=12
        
        let latVal = row['lat'] || row['latitude'] || row['широта'] || row['Широта'];
        let lonVal = row['lon'] || row['longitude'] || row['долгота'] || row['Долгота'];

        // Force override from specific columns if headers failed or just to be safe
        // We check if the row has enough columns to contain L and M
        if (rowArray.length > 12) {
             const rawLon = rowArray[11]; // Column L is Longitude (Index 11)
             const rawLat = rowArray[12]; // Column M is Latitude (Index 12)
             
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

/**
 * Fetches only the client addresses from column C of the Google Sheet, skipping the header.
 * @returns {Promise<string[]>} A promise that resolves to an array of address strings.
 */
export async function getOKBAddresses(): Promise<string[]> {
    const sheets = await getGoogleSheetsClient();
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!C2:C`,
    });

    const rows = res.data.values || [];
    return rows.flat().map(address => String(address || '').trim()).filter(Boolean);
}


/**
 * Updates client statuses in the Google Sheet in a single batch request for efficiency.
 * @param {Array<{rowIndex: number, status: string}>} updates - An array of update objects.
 */
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
 * Fetches the Active Client Base (AKB) from multiple Google Sheets (Jan 2025 - Dec 2026).
 * It aggregates data from all provided source sheets into a single dataset.
 * It ensures only one header row is preserved at the top.
 * 
 * @param year - Optional year string (e.g. "2025" or "2026") to filter which sheets to load.
 */
export async function getAkbData(year?: string): Promise<any[][]> {
    const sheets = await getGoogleSheetsClient();
    const allData: any[][] = [];
    let headersSet = false;
    const errors: string[] = [];

    // Filter sources based on requested year to reduce load
    let sourcesToFetch = AKB_SOURCES;
    if (year) {
        sourcesToFetch = AKB_SOURCES.filter(source => source.month.includes(year));
    }

    if (sourcesToFetch.length === 0) {
        throw new Error(`Нет данных для выбранного года: ${year}`);
    }

    // Helper function to fetch data from a batch of sources
    const processBatch = async (batch: typeof AKB_SOURCES) => {
        const promises = batch.map(async (source) => {
            try {
                // Optimization: Directly request range 'A:Z' which typically works for the first sheet.
                // This avoids an extra API call to get sheet metadata/name.
                const res = await sheets.spreadsheets.values.get({
                    spreadsheetId: source.id,
                    range: 'A:Z', 
                    valueRenderOption: 'UNFORMATTED_VALUE', // Get raw numbers/dates
                });

                return res.data.values || [];
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                console.error(`Error fetching AKB data for ${source.month}:`, msg);
                errors.push(`${source.month}: ${msg}`);
                // Return empty array to allow other sheets to proceed even if one fails
                return [];
            }
        });
        return Promise.all(promises);
    };

    // Process in larger chunks to speed up (parallelize more)
    // Decreased chunk size to 3 to effectively prevent 500 errors on Vercel Hobby plan timeouts
    const chunkSize = 3; 
    for (let i = 0; i < sourcesToFetch.length; i += chunkSize) {
        const batch = sourcesToFetch.slice(i, i + chunkSize);
        const batchResults = await processBatch(batch);

        for (const rows of batchResults) {
            if (rows.length === 0) continue;

            if (!headersSet) {
                // First successful fetch: take headers and data
                allData.push(...rows);
                headersSet = true;
            } else {
                // Subsequent fetches: skip header (row 0), take data
                if (rows.length > 1) {
                    allData.push(...rows.slice(1));
                }
            }
        }
        
        // Small delay between batches to respect rate limits
        if (i + chunkSize < sourcesToFetch.length) {
             await new Promise(resolve => setTimeout(resolve, 200)); 
        }
    }

    if (allData.length === 0) {
        let email = "unknown";
        try {
             const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}');
             email = key.client_email;
        } catch(e) {}
        
        throw new Error(
            `Не удалось загрузить данные ни из одной таблицы за ${year || 'все годы'}. \n` +
            `Вероятно, у сервисного аккаунта нет доступа. \n` +
            `ПРОВЕРЬТЕ: Вы должны открыть доступ "Редактор" к этим таблицам для email: \n${email}\n\n` +
            `Детали ошибок: ${errors.slice(0, 3).join('; ')}...`
        );
    }

    return allData;
}


// --- NEW FUNCTIONS FOR COORDINATE CACHE ---

/**
 * Robust string normalizer for comparison logic.
 * Handles non-breaking spaces, multiple whitespaces, and casing.
 */
function normalizeForComparison(str: string): string {
    return String(str || '')
        .toLowerCase()
        .replace(/\u00A0/g, ' ') // Replace non-breaking space
        .replace(/[.,]/g, ' ')   // Replace common punctuation to avoid mismatches on typos
        .replace(/\s+/g, ' ')    // Collapse multiple spaces
        .trim();
}

/**
 * Helper function to check if a specific address exists in a history string.
 * Handles timestamp stripping and various separators using robust normalization.
 */
function isAddressInHistory(historyString: string, targetAddressNorm: string): boolean {
    if (!historyString) return false;
    // Split by newline (new format) or double pipe (old format)
    const entries = historyString.split(/\r?\n|\s*\|\|\s*/);
    return entries.some(entry => {
        // Remove the timestamp part: " [DD.MM.YYYY HH:mm]"
        const addrPart = entry.split('[')[0];
        return normalizeForComparison(addrPart) === targetAddressNorm;
    });
}

/**
 * Fetches all data from the coordinate cache spreadsheet.
 * @returns A record where keys are RM names (sheet titles) and values are arrays of cached data.
 */
export async function getFullCoordsCache(): Promise<Record<string, { address: string; lat?: number; lon?: number; history?: string; isDeleted?: boolean; isInvalid?: boolean; comment?: string }[]>> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
    });

    const sheetTitles = spreadsheet.data.sheets?.map(s => s.properties?.title).filter(Boolean) as string[] || [];
    if (sheetTitles.length === 0) return {};

    // Updated range to fetch Column E (Comments)
    const ranges = sheetTitles.map(title => `'${title}'!A:E`); // Address, lat, lon, history/redirect, comment
    const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        ranges,
    });
    
    const cache: Record<string, { address: string; lat?: number; lon?: number; history?: string; isDeleted?: boolean; isInvalid?: boolean; comment?: string }[]> = {};
    const BAD_STATUSES = ['не найдено', 'некорректный адрес'];

    response.data.valueRanges?.forEach((valueRange) => {
        let title = valueRange.range?.split('!')[0] || 'Unknown';
        if (title.startsWith("'") && title.endsWith("'")) {
             title = title.substring(1, title.length - 1); // unquote if sheet name has spaces
        }
        const values = valueRange.values || [];
        if (values.length > 1) { // Skip header
            cache[title] = values.slice(1).map(row => {
                // AKB CACHE MAPPING CONFIRMED BY SCREENSHOTS "AKB base active":
                // Column A (Index 0): Address
                // Column B (Index 1): Latitude (lat)
                // Column C (Index 2): Longitude (lon)
                // Column D (Index 3): History/Old address
                // Column E (Index 4): Comments (New)
                
                const latStr = String(row[1] || '').trim(); 
                const lonStr = String(row[2] || '').trim();
                const latStrLower = latStr.toLowerCase();
                const lonStrLower = lonStr.toLowerCase();
                
                // Check for soft delete flag
                const isDeleted = latStr === 'DELETED' || lonStr === 'DELETED';
                
                // Check for explicit error statuses in the cache sheet
                const isInvalid = BAD_STATUSES.some(status => latStrLower.includes(status) || lonStrLower.includes(status));

                const lat = (!isDeleted && !isInvalid && latStr) ? parseFloat(latStr.replace(',', '.')) : undefined;
                const lon = (!isDeleted && !isInvalid && lonStr) ? parseFloat(lonStr.replace(',', '.')) : undefined;
                
                // Return raw history string. The worker will parse it to build the redirect map.
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
            }).filter(item => item.address); // Only include items with an address
        }
    });

    return cache;
}

/**
 * Ensures a sheet exists for a given RM name (case-insensitively).
 * If it exists, returns the actual sheet title with its original casing.
 * If not, it creates a new sheet with the provided RM name and headers.
 * @param sheets The authenticated Google Sheets API client.
 * @param rmName The name of the sheet (RM name) to find or create.
 * @returns The actual title of the existing or newly created sheet.
 */
async function ensureSheetExists(sheets: sheets_v4.Sheets, rmName: string): Promise<string> {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID });
    const lowerRmName = rmName.toLowerCase();
    const existingSheet = spreadsheet.data.sheets?.find(s => s.properties?.title?.toLowerCase() === lowerRmName);

    if (existingSheet && existingSheet.properties?.title) {
        return existingSheet.properties.title; // Return the existing, correctly-cased title
    }
    
    // If not exists, create it with the provided rmName casing
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        requestBody: {
            requests: [{ addSheet: { properties: { title: rmName } } }],
        },
    });
    // Add headers to the new sheet
    // Updated headers to include 'Комментарии' column
    await sheets.spreadsheets.values.append({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${rmName}'!A1`,
        valueInputOption: 'RAW',
        requestBody: {
            values: [['Адрес ТТ', 'lat', 'lon', 'История Изменений', 'Комментарии']],
        },
    });
    return rmName; // The new sheet has this title
}


/**
 * Appends new rows to a specific RM's sheet in the cache. Creates the sheet if it doesn't exist.
 * This version performs a case-insensitive check to avoid adding duplicate addresses.
 * @param rmName The name of the Regional Manager (and the sheet).
 * @param rowsToAppend An array of rows to add, where each row is an array of strings/numbers.
 */
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


/**
 * Updates coordinates for existing addresses in a specific RM's sheet.
 * @param rmName The name of the Regional Manager (and the sheet).
 * @param updates An array of objects containing the address and new coordinates.
 */
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

/**
 * Replaces an old address with a new one in the cache by updating the existing row.
 * Optionally updates the comment in Column E.
 * KEEPS HISTORY: Appends the old address to Column D (History).
 * CRITICAL: Preserves existing B (lat) and C (lon) columns to prevent data loss during rename unless renaming.
 * 
 * @param rmName The name of the Regional Manager (and the sheet).
 * @param oldAddress The address to be replaced (from the file or current UI state).
 * @param newAddress The new, corrected address.
 * @param comment Optional comment to save in Column E.
 */
export async function updateAddressInCache(
    rmName: string,
    oldAddress: string,
    newAddress: string,
    comment?: string
): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);

    // Fetch A:E to check current addresses, coordinates, history, and comments
    // We must include header check or skip it. Assuming row 1 is header.
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A:E`,
    });

    const rows = response.data.values || [];

    const oldNorm = normalizeForComparison(oldAddress);
    const newNorm = normalizeForComparison(newAddress);

    let rowIndex = -1;

    // 1) First, find the row by looking for the Old Address in Column A (Current Address)
    // This covers the most common case: renaming the current active entry.
    rowIndex = rows.findIndex(r => normalizeForComparison(r[0]) === oldNorm);

    // 2) If not found in A, search in History (Column D)
    // This covers cases where the UI might be stale, or we are correcting an address that was already renamed once.
    if (rowIndex === -1) {
        rowIndex = rows.findIndex(r => isAddressInHistory(String(r[3] || ''), oldNorm));
    }

    const timestamp = new Date().toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    if (rowIndex === -1) {
        console.log(`[updateAddressInCache] Row not found for "${oldAddress}" (norm: ${oldNorm}). Appending new row.`);
        // Case: The row doesn't exist at all (neither current nor history).
        // Treat as a new entry.
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

    // Row found. Get current data to preserve it.
    const row = rows[rowIndex];
    const currentAddress = String(row[0] || '');
    // Preserve coordinates!
    const currentLat = row[1] ?? ''; 
    const currentLon = row[2] ?? '';
    // Handle history: check if row[3] exists, otherwise empty string.
    const currentHistory = row[3] ? String(row[3]) : '';
    // Handle current comment
    const currentComment = row[4] ? String(row[4]) : '';

    const rowNumber = rowIndex + 1;

    // 3) Check if address actually changed
    if (normalizeForComparison(currentAddress) === newNorm) {
        // Address matches. Check if we need to update comment.
        if (comment !== undefined && comment !== currentComment) {
             console.log(`[updateAddressInCache] Updating comment for "${currentAddress}".`);
             // Only update Column E
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

    // 4) Address Changed: Construct new history
    const valueToArchive = currentAddress || oldAddress;
    const historyEntry = `${valueToArchive} [${timestamp}]`;
    
    const newHistory = currentHistory
        ? `${currentHistory}\n${historyEntry}`
        : historyEntry;

    // 5) Update the row (A, B, C, D, E). 
    // CRITICAL UPDATE: Clear existing coordinates (Col B, C) when the address (Col A) changes.
    // Update Comment (Col E).
    
    console.log(`[updateAddressInCache] Updating Row ${rowNumber}. Old: "${currentAddress}" -> New: "${newAddress}". Clearing Coords. Updating Comment.`);

    await sheets.spreadsheets.values.update({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A${rowNumber}:E${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            // Set Col B (Lat) and Col C (Lon) to empty strings. Update History and Comment.
            // Use fallback to currentComment if comment param is undefined.
            values: [[newAddress, "", "", newHistory, comment !== undefined ? comment : currentComment]], 
        },
    });
}

/**
 * Deletes an address row from the cache.
 * Performs a "Soft Delete" by writing 'DELETED' to the coordinate columns.
 * This preserves the address in Col A (and potentially history in Col D) but marks it as ignored.
 * @param rmName The name of the Regional Manager (and the sheet).
 * @param address The address to be deleted.
 */
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
            rowIndex = i + 1; // 1-based index
            break;
        }
    }

    if (rowIndex !== -1) {
        // Update columns B and C (coords) to 'DELETED'
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


/**
 * Retrieves a single address row from a specific RM's cache sheet (case-insensitively).
 * Returns the full object including history from Column D and comment from Column E.
 * Supports finding the row even if the requested 'address' is in the history (renamed).
 * @param rmName The name of the Regional Manager (and the sheet).
 * @param address The address to search for.
 * @returns An object with address, lat, lon, history, and comment, or null if not found.
 */
export async function getAddressFromCache(rmName: string, address: string): Promise<{ address: string; lat?: number; lon?: number; history?: string; comment?: string } | null> {
    const sheets = await getGoogleSheetsClient();
    
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID });
    const lowerRmName = rmName.toLowerCase();
    const existingSheet = spreadsheet.data.sheets?.find(s => s.properties?.title?.toLowerCase() === lowerRmName);
    
    if (!existingSheet || !existingSheet.properties?.title) {
        return null; // Sheet doesn't exist
    }
    const actualSheetTitle = existingSheet.properties.title;

    // Fetch A:E to include history (Column D) and comment (Column E)
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A:E`,
    });

    const values = response.data.values || [];
    if (values.length < 2) {
        return null;
    }

    const addressNorm = normalizeForComparison(address);
    
    // 1. Try exact match in Column A (Current Address)
    let foundRow = values.find(row => normalizeForComparison(row[0]) === addressNorm);

    // 2. If not found, search in Column D (History) to see if this address was renamed
    if (!foundRow) {
        foundRow = values.find(row => isAddressInHistory(String(row[3] || ''), addressNorm));
    }

    if (foundRow) {
        const latStr = String(foundRow[1] || '').trim();
        const lonStr = String(foundRow[2] || '').trim();
        const history = foundRow[3] ? String(foundRow[3]).trim() : undefined;
        const comment = foundRow[4] ? String(foundRow[4]).trim() : undefined;
        
        // Check if marked as deleted
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
