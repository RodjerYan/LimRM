import { google } from 'googleapis';
import { OkbDataRow } from '../types';

const SPREADSHEET_ID = '1peEj55jcwLQMG9yN8uX5-0xtSCycNA0SA5UrAoF0OE8';

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
    throw new Error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY. Ensure it is valid JSON.');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

export async function getAllSheetTitles(): Promise<string[]> {
    const sheets = await getGoogleSheetsClient();
    const res = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        fields: 'sheets.properties.title',
    });
    return res.data.sheets?.map(s => s.properties?.title || '').filter(Boolean) || [];
}

export async function ensureSheetExists(title: string, existingTitles: string[], headers: string[]) {
    if (existingTitles.includes(title)) {
        return; // Sheet already exists
    }

    const sheets = await getGoogleSheetsClient();
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
            requests: [{
                addSheet: {
                    properties: { title }
                }
            }]
        }
    });

    // Add headers to the new sheet
    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${title}!A1`,
        valueInputOption: 'RAW',
        requestBody: {
            values: [headers],
        },
    });
}

export async function getSheetDataWithHeaders(sheetName: string): Promise<OkbDataRow[]> {
    const sheets = await getGoogleSheetsClient();
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:Z`,
    });

    const rows = res.data.values;
    if (!rows || rows.length < 2) {
        return [];
    }

    const header = rows[0];
    const dataRows = rows.slice(1);

    return dataRows.map(rowArray => {
        const rowObject: { [key: string]: any } = {};
        header.forEach((key, index) => {
            rowObject[key] = rowArray[index] || null;
        });

        // Parse lat/lon
        const latVal = rowObject['lat'] || rowObject['latitude'] || rowObject['широта'];
        const lonVal = rowObject['lon'] || rowObject['longitude'] || rowObject['долгота'];

        if (latVal && lonVal) {
            const lat = parseFloat(String(latVal).replace(',', '.').trim());
            const lon = parseFloat(String(lonVal).replace(',', '.').trim());
            if (!isNaN(lat) && !isNaN(lon)) {
                rowObject.lat = lat;
                rowObject.lon = lon;
            }
        }
        return rowObject as OkbDataRow;
    });
}

export async function appendRows(sheetName: string, rows: any[][]) {
    if (rows.length === 0) return;
    const sheets = await getGoogleSheetsClient();
    await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: rows,
        },
    });
}
