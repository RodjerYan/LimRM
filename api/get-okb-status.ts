import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SHEET_NAME = 'Лист1'; 

const getAuth = () => {
    const client_email = process.env.GOOGLE_CLIENT_EMAIL;
    const private_key = process.env.GOOGLE_PRIVATE_KEY;

    if (!client_email || !private_key) {
        throw new Error('Переменные окружения GOOGLE_CLIENT_EMAIL и GOOGLE_PRIVATE_KEY не установлены.');
    }
    
    return new JWT({
        email: client_email,
        key: private_key.replace(/\\n/g, '\n'),
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets.readonly',
            'https://www.googleapis.com/auth/drive.metadata.readonly' // Scope для получения метаданных файла
        ],
    });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
        if (!SPREADSHEET_ID) {
            throw new Error("Переменная окружения GOOGLE_SHEET_ID не установлена.");
        }

        const serviceAccountAuth = getAuth();
        
        // --- 1. Получаем информацию о листе ---
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle[SHEET_NAME];
        
        let rowCount = 0;
        if (sheet) {
            // sheet.rowCount включает строку заголовка, поэтому вычитаем 1, если она есть
            const headers = await sheet.headerValues;
            rowCount = headers && headers.length > 0 ? sheet.rowCount - 1 : sheet.rowCount;
        }

        // --- 2. Получаем дату изменения файла через Google Drive API ---
        const tokenResponse = await serviceAccountAuth.getAccessToken();
        const token = tokenResponse.token;
        if (!token) {
            throw new Error('Не удалось получить токен доступа для Google Drive API.');
        }

        const driveApiUrl = `https://www.googleapis.com/drive/v3/files/${SPREADSHEET_ID}?fields=modifiedTime`;
        const driveResponse = await fetch(driveApiUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!driveResponse.ok) {
            const errorText = await driveResponse.text();
            throw new Error(`Ошибка Google Drive API: ${driveResponse.status} ${errorText}`);
        }
        
        const fileMeta = await driveResponse.json();
        const modifiedTime = fileMeta.modifiedTime;

        // --- 3. Отправляем ответ ---
        res.setHeader('Cache-Control', 'no-cache');
        res.status(200).json({ rowCount, modifiedTime });

    } catch (error: any) {
        console.error('CRITICAL Error in get-okb-status:', error);
        
        let details = 'Не удалось получить статус таблицы.';
        let statusCode = 500;
        const message = error.message || '';

        if (message.includes('403') || message.includes('permission denied')) {
            statusCode = 403;
            const serviceAccountEmail = process.env.GOOGLE_CLIENT_EMAIL || '[email не найден]';
            details = `Доступ запрещен. У сервисного аккаунта ('${serviceAccountEmail}') нет прав на просмотр таблицы/файла.`;
        } else if (message.includes('404')) {
            statusCode = 404;
            details = `Таблица Google не найдена. Убедитесь, что GOOGLE_SHEET_ID указан верно.`;
        }

        res.status(statusCode).json({ 
            error: 'Не удалось получить статус из Google Sheets.', 
            details: details 
        });
    }
}