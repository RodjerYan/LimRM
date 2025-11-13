import { google, sheets_v4 } from 'googleapis';

const SPREADSHEET_ID = '1peEj55jcwLQMG9yN8uX5-0xtSCycNA0SA5UrAoF0OE8';
const OLD_SPREADSHEET_ID = '13HkruBN9a_Y5xF8nUGpoyo3N7nJxiTW3PPgqw8FsApI';

/**
 * Creates and returns an authenticated Google Sheets API client.
 * It uses service account credentials stored in an environment variable.
 */
async function getGoogleSheetsClient() {
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
 * Fetches the entire spreadsheet metadata, including the list of sheets.
 */
async function getSpreadsheet(spreadsheetId: string) {
    const sheets = await getGoogleSheetsClient();
    const res = await sheets.spreadsheets.get({ spreadsheetId });
    return res.data;
}

/**
 * Creates a new sheet (tab) within a spreadsheet.
 */
async function createSheet(spreadsheetId: string, title: string) {
    const sheets = await getGoogleSheetsClient();
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
            requests: [{ addSheet: { properties: { title } } }],
        },
    });
}

/**
 * Appends rows of data to a specific sheet.
 */
async function appendRows(spreadsheetId: string, range: string, values: any[][]) {
    const sheets = await getGoogleSheetsClient();
    await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
    });
}

/**
 * Fetches all data from a given sheet.
 */
async function getSheetData(spreadsheetId: string, range: string): Promise<any[][]> {
    const sheets = await getGoogleSheetsClient();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return res.data.values || [];
}


// --- New AKB-specific functions ---

const AKB_HEADERS = [
    'Дистрибьютор', 'Торговая марка', 'Уникальное наименование товара', 'Фасовка',
    'Вес, кг', 'Месяц', 'Адрес ТТ LimKorm', 'Канал продаж', 'РМ', 'lat', 'lon'
];
const AKB_ADDRESS_COLUMN_INDEX = AKB_HEADERS.indexOf('Адрес ТТ LimKorm');

/**
 * Manages the synchronization of sales data with the Active Client Base (AKB) Google Sheet.
 * It ensures sheets for each RM exist, finds new clients by address, and appends them.
 * Finally, it returns the complete, up-to-date data for all relevant RMs.
 * @param dataByRm - Data from the uploaded file, grouped by RM name.
 * @returns An object containing all current data from the synced sheets and a list of newly added addresses.
 */
export async function syncAkbAndFetch(dataByRm: { [rmName: string]: any[] }) {
    const sheets = await getGoogleSheetsClient();
    const spreadsheet = await getSpreadsheet(SPREADSHEET_ID);
    const existingSheetTitles = new Set(spreadsheet.sheets?.map(s => s.properties?.title || ''));
    const relevantRms = Object.keys(dataByRm);
    const newlyAddedAddresses: { [rmName: string]: string[] } = {};

    for (const rm of relevantRms) {
        if (!rm) continue;

        // 1. Ensure sheet exists
        if (!existingSheetTitles.has(rm)) {
            await createSheet(SPREADSHEET_ID, rm);
            await appendRows(SPREADSHEET_ID, rm, [AKB_HEADERS]);
            existingSheetTitles.add(rm);
        }

        // 2. Get existing addresses to prevent duplicates
        const sheetData = await getSheetData(SPREADSHEET_ID, `${rm}!G:G`); // Column G is 'Адрес ТТ LimKorm'
        const existingAddresses = new Set(sheetData.flat().map(addr => String(addr || '').trim()));

        // 3. Find and append new rows
        const rowsToAdd = dataByRm[rm].filter(row => {
            const address = row['Адрес ТТ LimKorm'] || '';
            return address && !existingAddresses.has(address.trim());
        });

        if (rowsToAdd.length > 0) {
            const values = rowsToAdd.map(row => AKB_HEADERS.map(header => row[header] || ''));
            await appendRows(SPREADSHEET_ID, rm, values);
            newlyAddedAddresses[rm] = rowsToAdd.map(row => row['Адрес ТТ LimKorm']);
        }
    }

    // 4. Fetch all data for the relevant RMs after updates
    const allData = await fetchFullDataForRms(relevantRms);
    
    return { allData, newlyAddedAddresses };
}

/**
 * Fetches the complete data for a list of RM sheets.
 * @param rms - An array of RM names (sheet titles).
 * @returns A flat array of all rows from the specified sheets, parsed into objects.
 */
export async function fetchFullDataForRms(rms: string[]) {
    if (rms.length === 0) return [];
    
    const sheets = await getGoogleSheetsClient();
    const ranges = rms.map(rm => `${rm}!A:K`); // A to K covers the 11 headers

    const response = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: SPREADSHEET_ID,
        ranges,
    });

    const allRows: any[] = [];
    response.data.valueRanges?.forEach(valueRange => {
        const rows = valueRange.values;
        if (!rows || rows.length < 2) return; // Skip if empty or only headers

        const headers = rows[0].map(h => String(h));
        const dataRows = rows.slice(1);
        
        dataRows.forEach(rowArray => {
             const rowObj: { [key: string]: any } = {};
             headers.forEach((key, index) => {
                 rowObj[key] = rowArray[index] || null;
             });
             allRows.push(rowObj);
        });
    });

    return allRows;
}

/**
 * Fetches specific rows from the AKB sheet, identified by RM and address.
 * Used for polling for updated coordinates.
 * @param addressesByRm - An object where keys are RM names and values are arrays of addresses to poll.
 * @returns A flat array of the found rows, parsed into objects.
 */
export async function pollCoordinates(addressesByRm: { [rmName: string]: string[] }) {
    const rms = Object.keys(addressesByRm);
    if (rms.length === 0) return [];

    const fullData = await fetchFullDataForRms(rms);
    const addressesToFind: { [rmName: string]: Set<string> } = {};
    for (const rm in addressesByRm) {
        addressesToFind[rm] = new Set(addressesByRm[rm]);
    }
    
    const foundRows = fullData.filter(row => {
        const rm = row['РМ'];
        const address = row['Адрес ТТ LimKorm'];
        return rm && address && addressesToFind[rm]?.has(address);
    });

    return foundRows;
}