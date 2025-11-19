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
 * A robust helper to find an address value within a data row.
 */
const findAddressInRow = (row: { [key: string]: any }): string | null => {
    if (!row) return null;
    const rowKeys = Object.keys(row);
    const prioritizedKeys = ['адрес тт limkorm', 'юридический адрес', 'адрес'];
    for (const pKey of prioritizedKeys) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim() === pKey);
        if (foundKey && row[foundKey]) return String(row[foundKey]);
    }
    const addressKey = rowKeys.find(key => key.toLowerCase().includes('адрес'));
    if (addressKey && row[addressKey]) return String(row[addressKey]);
    return null;
};


/**
 * Updates a single row in the OKB Google Sheet.
 * It finds the row based on a unique identifier (like ИНН) or a composite key of other fields,
 * then updates the address column.
 * @param updatedRow The full row data object containing the updated address.
 */
export async function updateOkbRow(updatedRow: { [key: string]: any }): Promise<void> {
    const sheets = await getGoogleSheetsClient();
    const range = `${SHEET_NAME}!A:Z`;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });

    const rows = res.data.values;
    if (!rows || rows.length < 2) throw new Error("OKB sheet is empty or inaccessible.");

    const header = rows[0].map(h => String(h || '').trim());
    const dataRows = rows.slice(1);
    
    // Find the column index for the address.
    const addressHeader = header.find(h => h.toLowerCase().trim().includes('адрес'));
    if (!addressHeader) throw new Error("Could not find an 'address' column in the OKB sheet.");
    const addressColIndex = header.indexOf(addressHeader);
    const addressColLetter = String.fromCharCode('A'.charCodeAt(0) + addressColIndex);

    // Find a unique key to identify the row. ИНН is a good candidate.
    const innKey = Object.keys(updatedRow).find(k => k.toLowerCase().trim() === 'инн');
    const innValue = innKey ? updatedRow[innKey] : null;
    const innHeaderIndex = innKey ? header.indexOf(innKey) : -1;

    let rowIndexToUpdate = -1;

    if (innValue && innHeaderIndex !== -1) {
        // Find row by ИНН (more reliable)
        for (let i = 0; i < dataRows.length; i++) {
            if (dataRows[i][innHeaderIndex] === innValue) {
                rowIndexToUpdate = i + 2; // +1 for header, +1 for 0-based index
                break;
            }
        }
    }

    if (rowIndexToUpdate === -1) {
        // Fallback: find row by exact match of all other fields if ИНН is not available/found
        const oldAddress = findAddressInRow(updatedRow); // We need the address *before* it was updated
        for (let i = 0; i < dataRows.length; i++) {
            const sheetRowAddress = dataRows[i][addressColIndex];
            if (sheetRowAddress === oldAddress) {
                 rowIndexToUpdate = i + 2;
                 break;
            }
        }
    }

    if (rowIndexToUpdate === -1) {
        throw new Error(`Could not find the row to update in Google Sheets. Tried matching by ИНН and by original address.`);
    }

    const newAddress = findAddressInRow(updatedRow);

    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!${addressColLetter}${rowIndexToUpdate}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: [[newAddress]],
        },
    });
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
export async function getFullCoordsCache(): Promise<Record<string, { address: string; lat?: number; lon?: number }[]>> {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
    });

    const sheetTitles = spreadsheet.data.sheets?.map(s => s.properties?.title).filter(Boolean) as string[] || [];
    if (sheetTitles.length === 0) return {};

    const ranges = sheetTitles.map(title => `'${title}'!A:C`); // Address, lat, lon
    const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        ranges,
    });
    
    const cache: Record<string, { address: string; lat?: number; lon?: number }[]> = {};
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
                return {
                    address: String(row[0] || '').trim(),
                    lat: (lat !== undefined && !isNaN(lat)) ? lat : undefined,
                    lon: (lon !== undefined && !isNaN(lon)) ? lon : undefined,
                };
            }).filter(item => item.address); // Only include items with an address
        }
    });

    return cache;
}

/**
 * Ensures a sheet exists for an RM and creates it with headers if not.
 * @param sheets The Google Sheets API client.
 * @param rmName The name of the sheet.
 */
async function ensureSheetExists(sheets: sheets_v4.Sheets, rmName: string) {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: CACHE_SPREADSHEET_ID });
    const sheetExists = spreadsheet.data.sheets?.some((s: sheets_v4.Schema$Sheet) => s.properties?.title === rmName);

    if (!sheetExists) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: CACHE_SPREADSHEET_ID,
            requestBody: {
                requests: [{ addSheet: { properties: { title: rmName } } }],
            },
        });
        await sheets.spreadsheets.values.append({
            spreadsheetId: CACHE_SPREADSHEET_ID,
            range: `${rmName}!A1`,
            valueInputOption: 'RAW',
            requestBody: {
                values: [['Адрес ТТ', 'lat', 'lon']],
            },
        });
    }
}

/**
 * Appends new rows to a specific RM's sheet in the cache. Creates the sheet if it doesn't exist.
 * This version also checks for existing addresses to avoid duplicates.
 * @param rmName The name of the Regional Manager (and the sheet).
 * @param rowsToAppend An array of rows to add, where each row is an array of strings/numbers.
 */
export async function appendToCache(rmName: string, rowsToAppend: (string | number | undefined)[][]): Promise<void> {
    if (rowsToAppend.length === 0) return;
    
    const sheets = await getGoogleSheetsClient();
    await ensureSheetExists(sheets, rmName);

    const existingAddressesResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${rmName}'!A2:A`,
    });
    const existingAddresses = new Set(existingAddressesResponse.data.values?.flat().map(a => String(a).trim()) || []);

    const uniqueRowsToAppend = rowsToAppend.filter(row => {
        const address = String(row[0] || '').trim();
        return address && !existingAddresses.has(address);
    });

    if (uniqueRowsToAppend.length === 0) {
        return;
    }

    await sheets.spreadsheets.values.append({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${rmName}'!A1`,
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
    await ensureSheetExists(sheets, rmName);
    
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${rmName}'!A:A`,
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
            range: `'${rmName}'!B${rowIndex}:C${rowIndex}`,
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
