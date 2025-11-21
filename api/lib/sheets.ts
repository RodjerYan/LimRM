import { google, sheets_v4 } from 'googleapis';
import { OkbDataRow } from '../../types';

const SPREADSHEET_ID = '13HkruBN9a_Y5xF8nUGpoyo3N7nJxiTW3PPgqw8FsApI';
const CACHE_SPREADSHEET_ID = '1peEj55jcwLQMG9yN8uX5-0xtSCycNA0SA5UrAoF0OE8';
const SHEET_NAME = 'Base';

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

        const latVal = row['lat'] || row['latitude'] || row['широта'] || row['Широта'];
        const lonVal = row['lon'] || row['longitude'] || row['долгота'] || row['Долгота'];

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


// --- NEW FUNCTIONS FOR COORDINATE CACHE ---

/**
 * Fetches all data from the coordinate cache spreadsheet.
 * @returns A record where keys are RM names (sheet titles) and values are arrays of cached data.
 */
export async function getFullCoordsCache(): Promise<Record<string, { address: string; lat?: number; lon?: number; correctedAddress?: string; isDeleted?: boolean }[]>> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
    });

    const sheetTitles = spreadsheet.data.sheets?.map(s => s.properties?.title).filter(Boolean) as string[] || [];
    if (sheetTitles.length === 0) return {};

    // Updated range to fetch Column D (Redirect/CorrectedAddress)
    const ranges = sheetTitles.map(title => `'${title}'!A:D`); // Address, lat, lon, correctedAddress
    const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        ranges,
    });
    
    const cache: Record<string, { address: string; lat?: number; lon?: number; correctedAddress?: string; isDeleted?: boolean }[]> = {};
    response.data.valueRanges?.forEach((valueRange) => {
        let title = valueRange.range?.split('!')[0] || 'Unknown';
        if (title.startsWith("'") && title.endsWith("'")) {
             title = title.substring(1, title.length - 1); // unquote if sheet name has spaces
        }
        const values = valueRange.values || [];
        if (values.length > 1) { // Skip header
            cache[title] = values.slice(1).map(row => {
                const latStr = String(row[1] || '').trim();
                const lonStr = String(row[2] || '').trim();
                
                // Check for soft delete flag
                const isDeleted = latStr === 'DELETED' || lonStr === 'DELETED';

                const lat = (!isDeleted && latStr) ? parseFloat(latStr.replace(',', '.')) : undefined;
                const lon = (!isDeleted && lonStr) ? parseFloat(lonStr.replace(',', '.')) : undefined;
                const correctedAddress = row[3] ? String(row[3]).trim() : undefined;

                return {
                    address: String(row[0] || '').trim(),
                    lat: (lat !== undefined && !isNaN(lat)) ? lat : undefined,
                    lon: (lon !== undefined && !isNaN(lon)) ? lon : undefined,
                    correctedAddress: correctedAddress,
                    isDeleted: isDeleted
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
    // Updated headers to include 'Redirect' column
    await sheets.spreadsheets.values.append({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${rmName}'!A1`,
        valueInputOption: 'RAW',
        requestBody: {
            values: [['Адрес ТТ', 'lat', 'lon', 'История Изменений']],
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

    const existingAddresses = new Set(existingAddressesResponse.data.values?.flat().map(a => String(a).trim().toLowerCase()) || []);

    const uniqueRowsToAppend = rowsToAppend.filter(row => {
        const address = String(row[0] || '').trim();
        return address && !existingAddresses.has(address.toLowerCase());
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
        if(addr) addressIndexMap.set(String(addr).trim(), i + 1)
    });

    const dataForUpdate = updates.map(update => {
        const rowIndex = addressIndexMap.get(String(update.address).trim());
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
 * KEEPS HISTORY: Appends the old address to Column D (History) instead of overwriting.
 * @param rmName The name of the Regional Manager (and the sheet).
 * @param oldAddress The address to be replaced (from the file).
 * @param newAddress The new, corrected address.
 */
export async function updateAddressInCache(rmName: string, oldAddress: string, newAddress: string): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A:A`,
    });

    const addressesInSheet = response.data.values?.flat() || [];
    const oldAddressTrimmedLower = oldAddress.trim().toLowerCase();
    const newAddressTrimmedLower = newAddress.trim().toLowerCase();

    let oldRowIndex = -1;
    let newRowIndex = -1;

    for (let i = 0; i < addressesInSheet.length; i++) {
        const currentVal = String(addressesInSheet[i]).trim().toLowerCase();
        if (currentVal === oldAddressTrimmedLower) oldRowIndex = i + 1; // 1-based index
        if (currentVal === newAddressTrimmedLower) newRowIndex = i + 1;
    }
    
    const timestamp = new Date().toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const historyEntry = `${oldAddress} [${timestamp}]`;

    if (oldRowIndex !== -1) {
        // Case 1: Old address exists.
        // Need to fetch current history to append to it.
        const historyResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: CACHE_SPREADSHEET_ID,
            range: `'${actualSheetTitle}'!D${oldRowIndex}`,
        });
        const currentHistory = historyResponse.data.values?.[0]?.[0] || '';
        
        // Use ' || ' as delimiter for robust splitting later
        const newHistory = currentHistory ? `${currentHistory} || ${historyEntry}` : historyEntry;

        // Col A (Address) -> newAddress
        // Col B (Lat) -> empty (re-geocode needed)
        // Col C (Lon) -> empty
        // Col D (History) -> newHistory
        await sheets.spreadsheets.values.update({
            spreadsheetId: CACHE_SPREADSHEET_ID,
            range: `'${actualSheetTitle}'!A${oldRowIndex}:D${oldRowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[newAddress, '', '', newHistory]],
            },
        });
    } else if (newRowIndex !== -1) {
        // Case 2: Old address NOT found, but New Address EXISTS.
        // Update the existing row's history to log this merge/redirect.
        const historyResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: CACHE_SPREADSHEET_ID,
            range: `'${actualSheetTitle}'!D${newRowIndex}`,
        });
        const currentHistory = historyResponse.data.values?.[0]?.[0] || '';
        const newHistory = currentHistory ? `${currentHistory} || ${historyEntry}` : historyEntry;

        await sheets.spreadsheets.values.update({
            spreadsheetId: CACHE_SPREADSHEET_ID,
            range: `'${actualSheetTitle}'!D${newRowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[newHistory]],
            },
        });
    } else {
        // Case 3: Neither exists. Fresh addition.
        await sheets.spreadsheets.values.append({
            spreadsheetId: CACHE_SPREADSHEET_ID,
            range: `'${actualSheetTitle}'!A1`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: [[newAddress, '', '', historyEntry]],
            },
        });
    }
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
    const addressTrimmedLower = address.trim().toLowerCase();
    for (let i = 0; i < addressesInSheet.length; i++) {
        if (String(addressesInSheet[i]).trim().toLowerCase() === addressTrimmedLower) {
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
 * Returns the full object including history from Column D.
 * @param rmName The name of the Regional Manager (and the sheet).
 * @param address The address to search for.
 * @returns An object with address, lat, lon, and history, or null if not found.
 */
export async function getAddressFromCache(rmName: string, address: string): Promise<{ address: string; lat?: number; lon?: number; history?: string } | null> {
    const sheets = await getGoogleSheetsClient();
    
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID });
    const lowerRmName = rmName.toLowerCase();
    const existingSheet = spreadsheet.data.sheets?.find(s => s.properties?.title?.toLowerCase() === lowerRmName);
    
    if (!existingSheet || !existingSheet.properties?.title) {
        return null; // Sheet doesn't exist
    }
    const actualSheetTitle = existingSheet.properties.title;

    // Fetch A:D to include history (Column D)
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A:D`,
    });

    const values = response.data.values || [];
    if (values.length < 2) {
        return null;
    }

    const trimmedAddress = address.trim().toLowerCase();
    const foundRow = values.find(row => String(row[0] || '').trim().toLowerCase() === trimmedAddress);

    if (foundRow) {
        const latStr = String(foundRow[1] || '').trim();
        const lonStr = String(foundRow[2] || '').trim();
        const history = foundRow[3] ? String(foundRow[3]).trim() : undefined;
        
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
            history: history
        };
    }

    return null;
}