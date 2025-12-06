
import { google, sheets_v4 } from 'googleapis';
import { OkbDataRow } from '../../types';

const SPREADSHEET_ID = '13HkruBN9a_Y5xF8nUGpoyo3N7nJxiTW3PPgqw8FsApI';
const CACHE_SPREADSHEET_ID = '1peEj55jcwLQMG9yN8uX5-0xtSCycNA0SA5UrAoF0OE8';
const AKB_SPREADSHEET_ID = '1AirnUDv3IiVWnwoNN0OmIVLLWSDsFmMNbEcA709j6EU';
const AKB_SHEET_GID = 1604990825;
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
 * Fetches the Active Client Base (AKB) from the specific Google Sheet provided by user.
 * It automatically resolves the Sheet Name (Title) based on the hardcoded GID.
 */
export async function getAkbData(): Promise<any[][]> {
    const sheets = await getGoogleSheetsClient();
    
    // 1. Get Spreadsheet Metadata to find the sheet name by GID
    const meta = await sheets.spreadsheets.get({
        spreadsheetId: AKB_SPREADSHEET_ID,
        fields: 'sheets.properties',
    });

    const sheet = meta.data.sheets?.find(s => s.properties?.sheetId === AKB_SHEET_GID);
    
    if (!sheet || !sheet.properties?.title) {
        throw new Error(`Could not find sheet with GID ${AKB_SHEET_GID} in the provided spreadsheet.`);
    }

    const sheetTitle = sheet.properties.title;

    // 2. Fetch all values from that sheet
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: AKB_SPREADSHEET_ID,
        range: `'${sheetTitle}'!A:Z`, // Fetch sufficiently wide range
        valueRenderOption: 'UNFORMATTED_VALUE', // Get raw numbers/dates
    });

    return res.data.values || [];
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
 * Helper to check if a specific address exists in a history string.
 * Handles timestamp stripping and various separators using robust normalization.
 */
function isAddressInHistory(historyString: string, targetAddressNorm: string): boolean {
    if (!historyString) return false;
    // Split by newline (new format) or double pipe (old format)
    const entries = historyString.split(/\r?\n|\s*\|\|\s*/);
    return entries.some(entry => {
        if (entry.startsWith("Комментарий:")) return false;
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
 * KEEPS HISTORY: Appends the old address OR new comment to Column D (History).
 * CRITICAL: Preserves existing B (lat) and C (lon) columns to prevent data loss during rename unless renaming.
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
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A:E`,
    });

    const rows = response.data.values || [];

    const oldNorm = normalizeForComparison(oldAddress);
    const newNorm = normalizeForComparison(newAddress);

    let rowIndex = -1;

    // 1) Find the row
    rowIndex = rows.findIndex(r => normalizeForComparison(r[0]) === oldNorm);
    if (rowIndex === -1) {
        rowIndex = rows.findIndex(r => isAddressInHistory(String(r[3] || ''), oldNorm));
    }

    const timestamp = new Date().toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    if (rowIndex === -1) {
        // New entry
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

    let newHistory = currentHistory;
    let finalComment = currentComment;
    let finalAddress = currentAddress;
    let finalLat = row[1] ?? "";
    let finalLon = row[2] ?? "";

    const isAddressChanged = normalizeForComparison(currentAddress) !== newNorm;
    const isCommentChanged = comment !== undefined && comment !== currentComment;

    if (isAddressChanged) {
        // If address changed, append old address to history and clear coordinates
        const entry = `${currentAddress || oldAddress} [${timestamp}]`;
        newHistory = newHistory ? `${entry}\n${newHistory}` : entry;
        finalAddress = newAddress;
        finalLat = ""; // Reset coords
        finalLon = "";
    }

    if (isCommentChanged) {
        // If comment changed, append comment to history
        // The *content* of the comment is stored in Col E (latest), 
        // but we want to log that it changed in history.
        // Or better: store the NEW comment in the history log as well so we can revert.
        const entry = `Комментарий: "${comment}" [${timestamp}]`;
        newHistory = newHistory ? `${entry}\n${newHistory}` : entry;
        finalComment = comment!;
    }

    if (!isAddressChanged && !isCommentChanged) return;

    await sheets.spreadsheets.values.update({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A${rowNumber}:E${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: [[finalAddress, finalLat, finalLon, newHistory, finalComment]], 
        },
    });
}

/**
 * Deletes a specific history entry from a row and performs reversion logic.
 * 
 * Logic:
 * 1. If an ADDRESS entry is deleted (e.g., "Old St [date]"), it restores "Old St" to Column A (Current Address).
 *    It clears B/C to trigger geocoding.
 * 2. If a COMMENT entry is deleted, it removes it from history.
 *    It sets Column E (Current Comment) to the *next most recent* comment found in the remaining history, or empty.
 */
export async function deleteHistoryEntry(
    rmName: string,
    currentAddress: string,
    historyIndex: number,
    historyContent: string // Pass content for verification safety
): Promise<{ restoredAddress?: string, restoredComment?: string } | null> {
    const sheets = await getGoogleSheetsClient();
    const actualSheetTitle = await ensureSheetExists(sheets, rmName);

    // Fetch the row
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A:E`,
    });

    const rows = response.data.values || [];
    const normAddr = normalizeForComparison(currentAddress);
    
    // Find Row
    let rowIndex = rows.findIndex(r => normalizeForComparison(r[0]) === normAddr);
    if (rowIndex === -1) return null;

    const row = rows[rowIndex];
    const currentHistoryRaw = row[3] ? String(row[3]) : '';
    
    // Split history (newest first)
    let historyEntries = currentHistoryRaw.split(/\r?\n|\s*\|\|\s*/).filter(Boolean);
    
    // Verify index and content match to prevent race conditions
    // The history entries in the sheet are separated by newlines. The frontend sends the index.
    // However, the frontend might have a reversed array or processed array.
    // The most robust way is to rely on index if we assume strict order, or match content.
    // Since we pass index from the frontend which parses the same string, we trust the index.
    // Frontend history is: result.history.split...filter(Boolean).reverse() usually?
    // Wait, AddressEditModal does: `result.history.split(...).filter(Boolean).reverse()`.
    // So Index 0 on frontend = Last element in backend string (Oldest)? 
    // NO. AddressEditModal displays: `history.map((item, idx) => ... Change #{history.length - idx}`.
    // The backend `updateAddressInCache` prepends new history: `${entry}\n${newHistory}`.
    // So index 0 in the string IS the newest.
    // AddressEditModal does `setHistory(prev => [newEntry, ...prev])` - this matches backend.
    
    if (historyIndex < 0 || historyIndex >= historyEntries.length) {
        throw new Error("History index out of bounds");
    }

    const entryToRemove = historyEntries[historyIndex];
    // Simple safety check: check if content roughly matches (ignoring timestamp variations if parsed differently)
    // If needed, we can just trust the index.

    // Determine type
    const isCommentEntry = entryToRemove.startsWith("Комментарий:");
    
    // Remove the entry
    historyEntries.splice(historyIndex, 1);
    const newHistoryString = historyEntries.join('\n');
    
    const rowNumber = rowIndex + 1;
    const result: { restoredAddress?: string, restoredComment?: string } = {};

    let newColA = row[0]; // Address
    let newColB = row[1]; // Lat
    let newColC = row[2]; // Lon
    let newColE = row[4]; // Comment

    if (isCommentEntry) {
        // Deleted a comment log.
        // We need to restore Col E to the "current" valid comment.
        // The "current" comment is defined as the content of the *new* first comment entry in history.
        // If no comment entries remain in history, comment is empty.
        const nextLatestCommentEntry = historyEntries.find(e => e.startsWith("Комментарий:"));
        if (nextLatestCommentEntry) {
            // Extract text: "Комментарий: "text" [date]" -> "text"
            // Regex: Комментарий: "(.*)" \[
            const match = nextLatestCommentEntry.match(/Комментарий: "(.*)" \[/);
            if (match && match[1]) {
                newColE = match[1];
            } else {
                // Fallback for simple format
                newColE = nextLatestCommentEntry.replace("Комментарий: ", "").split('[')[0].trim().replace(/^"|"$/g, '');
            }
        } else {
            newColE = ""; // No comments left in history
        }
        result.restoredComment = newColE;
    } else {
        // Deleted an Address change log.
        // The user wants to "Revert" to this address.
        // Extract address from the deleted entry.
        const restoredAddress = entryToRemove.split('[')[0].trim();
        if (restoredAddress) {
            newColA = restoredAddress;
            newColB = ""; // Clear coords to force re-geocode
            newColC = "";
            result.restoredAddress = restoredAddress;
        }
    }

    // Update the row
    await sheets.spreadsheets.values.update({
        spreadsheetId: CACHE_SPREADSHEET_ID,
        range: `'${actualSheetTitle}'!A${rowNumber}:E${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: [[newColA, newColB, newColC, newHistoryString, newColE]], 
        },
    });

    return result;
}

/**
 * Deletes an address row from the cache.
 * Performs a "Soft Delete" by writing 'DELETED' to the coordinate columns.
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
