import { google } from 'googleapis';
import { OkbDataRow } from '../types';

const SPREADSHEET_ID = '13HkruBN9a_Y5xF8nUGpoyo3N7nJxiTW3PPgqw8FsApI';
const SHEET_NAME = 'Base';

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

  const originalHeader = rows[0].map(h => String(h || '').trim());
  const lowerCaseHeader = originalHeader.map(h => h.toLowerCase());
  const dataRows = rows.slice(1);

  // Find column indices directly. This is more robust than matching string keys later.
  const latIndex = lowerCaseHeader.findIndex(h => ['широта', 'ширина', 'lat', 'm'].includes(h));
  const lonIndex = lowerCaseHeader.findIndex(h => ['долгота', 'lon', 'l'].includes(h));
  
  const okbData: OkbDataRow[] = dataRows
    .map(row => {
        // Skip rows that are completely empty to avoid processing useless data.
        if (row.every(cell => cell === null || cell === '' || cell === undefined)) {
            return null;
        }

        // Create the base row object by mapping original headers to row values.
        const rowData: { [key: string]: any } = {};
        originalHeader.forEach((key, index) => {
            if (key) { // Only add properties for columns with a header
                rowData[key] = row[index] || null;
            }
        });
        
        // Now, robustly parse coordinates using the determined indices.
        // This logic is now independent of the `rowData` object's keys.
        if (latIndex !== -1 && lonIndex !== -1 && row[latIndex] && row[lonIndex]) {
            const latStr = String(row[latIndex]).replace(',', '.').trim();
            const lonStr = String(row[lonIndex]).replace(',', '.').trim();

            const lat = parseFloat(latStr);
            const lon = parseFloat(lonStr);

            // Only add coordinates if they are valid numbers.
            if (!isNaN(lat) && !isNaN(lon)) {
                rowData.lat = lat;
                rowData.lon = lon;
            }
        }

        if (Object.keys(rowData).length === 0) {
            return null;
        }
        return rowData as OkbDataRow;
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
        range: `${SHEET_NAME}!C2:C`, // FIX: Fetch from column C (Юридический адрес)
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
        range: `${SHEET_NAME}!F${update.rowIndex}`, // FIX: Column F is 'Статус'
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