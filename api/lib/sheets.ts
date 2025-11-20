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
export async function getFullCoordsCache(): Promise<Record<string, { address: string; lat?: number; lon?: number; correctedAddress?: string }[]>> {
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
    
    const cache: Record<string, { address: string; lat?: number; lon?: number; correctedAddress?: string }[]> = {};
    response.data.valueRanges?.forEach((valueRange) => {
        let title = valueRange.range?.split('!')[0] || 'Unknown';
        if (title.startsWith("'") && title.endsWith("'")) {
             title = title.substring(1, title.length - 1); // unquote if sheet name has spaces
        }
        const values = valueRange.values || [];
        if (values.length > 1) { // Skip header
            cache[title] = values.slice(1).map(row => {
                const latStr = String(row[1] || '').replace(',', '.').trim();
                const lonStr = String(row[2] || '').replace(',', '.').trim();
                const lat = latStr ? parseFloat(latStr) : undefined;
                const lon = lonStr ? parseFloat(lonStr) : undefined;
                const correctedAddress = row[3] ? String(row[3]).trim() : undefined;

                return {
                    address: String(row[0] || '').trim(),
                    lat: (lat !== undefined && !isNaN(lat)) ? lat : undefined,
                    lon: (lon !== undefined && !isNaN(lon)) ? lon : undefined,
                    correctedAddress: correctedAddress
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
            values: [['Адрес ТТ', 'lat', 'lon', 'Переадресация']],
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
 * Replaces an old address with a new one in the cache (case-insensitively) by setting a redirect.
 * Instead of overwriting the old address, we write the new address to column D (index 3) of the old row,
 * establishing a permanent redirect. Then we ensure the new address exists as a separate row.
 * @param rmName The name of the Regional Manager (and the sheet).
 * @param oldAddress The address to be replaced (source of redirect).
 * @param newAddress The new address (target of redirect).
 */
export async function updateAddressInCache(rmName: string, oldAddress: string, newAddress: string): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A:A`,
    });

    const addressesInSheet = response.data.values?.flat() || [];
    let rowIndex = -1;
    const oldAddressTrimmedLower = oldAddress.trim().toLowerCase();
    for (let i = 0; i < addressesInSheet.length; i++) {
        if (String(addressesInSheet[i]).trim().toLowerCase() === oldAddressTrimmedLower) {
            rowIndex = i + 1; // 1-based index
            break;
        }
    }
    
    if (rowIndex !== -1) {
        // If old address exists, add the new address as a redirect in Column D (index 3)
        // We use Column D because A=Address, B=Lat, C=Lon
        await sheets.spreadsheets.values.update({
            spreadsheetId: CACHE_SPREADSHEET_ID,
            range: `'${actualSheetTitle}'!D${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[newAddress]],
            },
        });
    }
    
    // Always ensure the new address is added to the list so it can have coordinates
    // appendToCache handles duplicate checks internally
    await appendToCache(rmName, [[newAddress, '', '']]);
}

/**
 * Retrieves a single address row from a specific RM's cache sheet (case-insensitively).
 * @param rmName The name of the Regional Manager (and the sheet).
 * @param address The address to search for.
 * @returns An object with address, lat, and lon, or null if not found.
 */
export async function getAddressFromCache(rmName: string, address: string): Promise<{ address: string; lat?: number; lon?: number } | null> {
    const sheets = await getGoogleSheetsClient();
    
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID });
    const lowerRmName = rmName.toLowerCase();
    const existingSheet = spreadsheet.data.sheets?.find(s => s.properties?.title?.toLowerCase() === lowerRmName);
    
    if (!existingSheet || !existingSheet.properties?.title) {
        return null; // Sheet doesn't exist, so the address can't be there.
    }
    const actualSheetTitle = existingSheet.properties.title;

    // Fetch A:D to include redirects, though this specific function mainly cares about coords
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
        const latStr = String(foundRow[1] || '').replace(',', '.').trim();
        const lonStr = String(foundRow[2] || '').replace(',', '.').trim();
        const lat = latStr ? parseFloat(latStr) : undefined;
        const lon = lonStr ? parseFloat(lonStr) : undefined;
        
        return {
            address: String(foundRow[0]),
            lat: (lat !== undefined && !isNaN(lat)) ? lat : undefined,
            lon: (lon !== undefined && !isNaN(lon)) ? lon : undefined,
        };
    }

    return null;
}
