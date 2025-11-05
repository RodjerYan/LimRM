import { google } from 'googleapis';
import { OkbDataRow } from '../types';
import { Buffer } from 'buffer';

const SPREADSHEET_ID = '13HkruBN9a_Y5xF8nUGpoyo3N7nJxiTW3PPgqw8FsApI';
const SHEET_NAME = 'Base';

/**
 * Creates and returns an authenticated Google Sheets API client.
 * This version is hardened with multiple layers of validation for the service account key
 * to prevent catastrophic crashes on Vercel and provide clear error messages.
 */
async function getGoogleSheetsClient() {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
        throw new Error('Критическая ошибка: Переменная окружения GOOGLE_SERVICE_ACCOUNT_KEY не установлена на сервере.');
    }

    try {
        let credentialsJson;
        try {
            credentialsJson = Buffer.from(serviceAccountKey, 'base64').toString('utf-8');
        } catch (e) {
            throw new Error('Не удалось декодировать ключ из Base64. Убедитесь, что переменная окружения содержит корректную Base64-строку.');
        }

        if (!credentialsJson) {
            throw new Error('Декодированный ключ оказался пустой строкой. Проверьте правильность Base64-кодирования.');
        }

        let credentials;
        try {
            credentials = JSON.parse(credentialsJson);
        } catch (e) {
            throw new Error('Не удалось разобрать декодированный ключ как JSON. Base64-строка может не представлять собой валидный JSON-объект.');
        }

        if (!credentials.client_email || !credentials.private_key) {
            throw new Error('Разобранный JSON-ключ не содержит обязательных полей: "client_email" и/или "private_key". Проверьте целостность исходного JSON-файла перед кодированием.');
        }

        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        return google.sheets({ version: 'v4', auth });

    } catch (error) {
        console.error("--- КРИТИЧЕСКАЯ ОШИБКА АУТЕНТИФИКАЦИИ В GOOGLE SHEETS ---");
        console.error(error);
        // Re-throw a clear, consolidated error message to be caught by the API handler.
        throw new Error(`Ошибка аутентификации Google Sheets: ${(error as Error).message}`);
    }
}


/**
 * Fetches the entire OKB (Общая Клиентская База) from the Google Sheet.
 */
export async function getOKBData(): Promise<OkbDataRow[]> {
  const sheets = await getGoogleSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:J`,
  });

  const rows = res.data.values;
  if (!rows || rows.length < 2) {
    return [];
  }

  const header = rows[0].map(h => String(h || '').trim());
  const dataRows = rows.slice(1);

  return dataRows
    .map(row => {
        if (row.every(cell => cell === null || cell === '' || cell === undefined)) {
            return null;
        }
        const rowData: { [key: string]: any } = {};
        header.forEach((key, index) => {
            if (key) {
                rowData[key] = row[index] || null;
            }
        });
        if (Object.keys(rowData).length === 0) {
            return null;
        }
        return rowData as OkbDataRow;
    })
    .filter((row): row is OkbDataRow => row !== null);
}

/**
 * Fetches only the client addresses from column C of the Google Sheet.
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
 * Updates client statuses in the Google Sheet in a single batch request.
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