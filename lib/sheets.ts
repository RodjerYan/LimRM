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
 * A helper function to find a header key case-insensitively from a list of possibilities.
 * @param header - The array of header strings.
 * @param possibilities - An array of possible header names to look for.
 * @returns The found header key or null.
 */
const findHeaderKey = (header: string[], possibilities: string[]): string | null => {
    const lowerPossibilities = possibilities.map(p => p.toLowerCase());
    for (const h of header) {
        if (h && lowerPossibilities.includes(h.toLowerCase())) {
            return h;
        }
    }
    return null;
};


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

  const latKey = findHeaderKey(header, ['широта', 'ширина', 'm']);
  const lonKey = findHeaderKey(header, ['долгота', 'l']);
  
  const okbData: OkbDataRow[] = dataRows
    .map(row => {
        if (row.every(cell => cell === null || cell === '' || cell === undefined)) return null;

        const rowData: { [key: string]: any } = {};
        header.forEach((key, index) => {
            if (key) rowData[key] = row[index] || null;
        });
        
        if (latKey && lonKey && rowData[latKey] && rowData[lonKey]) {
            const latStr = String(rowData[latKey]).replace(',', '.');
            const lonStr = String(rowData[lonKey]).replace(',', '.');
            const lat = parseFloat(latStr);
            const lon = parseFloat(lonStr);

            if (!isNaN(lat) && !isNaN(lon)) {
                rowData.lat = lat;
                rowData.lon = lon;
            }
        }

        if (Object.keys(rowData).length === 0) return null;
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