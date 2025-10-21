import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SHEET_NAME = 'Лист1'; 

// Шаг 1: Настройка аутентификации через сервисный аккаунт
// Эта функция создает JWT-клиент для аутентификации запросов к Google API.
// Она использует переменные окружения для безопасности.
const getAuth = () => {
    const client_email = process.env.GOOGLE_CLIENT_EMAIL;
    const private_key = process.env.GOOGLE_PRIVATE_KEY;

    if (!client_email || !private_key) {
        throw new Error('Переменные окружения GOOGLE_CLIENT_EMAIL и GOOGLE_PRIVATE_KEY не установлены.');
    }
    
    // Возвращаем JWT-клиент с необходимыми правами доступа (scopes)
    return new JWT({
        email: client_email,
        key: private_key.replace(/\\n/g, '\n'),
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets.readonly', // Только чтение для таблиц
            'https://www.googleapis.com/auth/drive.metadata.readonly' // Только чтение метаданных файлов (для даты изменения)
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
        
        // --- Шаг 2: Получаем информацию о листе и количестве строк ---
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo(); // Загружаем основную информацию о документе
        const sheet = doc.sheetsByTitle[SHEET_NAME];
        
        let rowCount = 0;
        if (sheet) {
            // КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: Загружаем заголовки перед их использованием.
            // Это решает ошибку "Header values are not yet loaded".
            await sheet.loadHeaderRow(); 

            // Корректно считаем количество строк данных, исключая заголовок.
            // sheet.rowCount - это общее количество строк, включая заголовок.
            if (sheet.headerValues && sheet.headerValues.length > 0) {
                 rowCount = sheet.rowCount > 0 ? sheet.rowCount - 1 : 0;
            } else {
                 // Если заголовков нет, считаем все строки как данные.
                 rowCount = sheet.rowCount;
            }
        }

        // --- Шаг 3: Получаем дату последнего изменения файла через Google Drive API ---
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

        // --- Шаг 4: Отправляем успешный ответ ---
        console.log(`Successfully fetched status for sheet ${SPREADSHEET_ID}: ${rowCount} rows, last modified ${modifiedTime}`);
        res.setHeader('Cache-Control', 'no-cache');
        res.status(200).json({ rowCount, modifiedTime });

    } catch (error: any) {
        console.error('CRITICAL Error in get-okb-status:', error);
        
        // --- Шаг 5: Детальная обработка ошибок ---
        let details = 'Не удалось получить статус таблицы.';
        let statusCode = 500;
        const message = error.message || '';

        // Обработка ошибки "Доступ запрещен"
        if (message.includes('403') || message.includes('permission denied')) {
            statusCode = 403;
            const serviceAccountEmail = process.env.GOOGLE_CLIENT_EMAIL || '[email не найден]';
            details = `Доступ запрещен. Убедитесь, что сервисный аккаунт ('${serviceAccountEmail}') имеет права "Читателя" для этой таблицы.`;
        } 
        // Обработка ошибки "Не найдено"
        else if (message.includes('404') || message.includes('Requested entity was not found')) {
            statusCode = 404;
            details = `Таблица Google не найдена. Убедитесь, что GOOGLE_SHEET_ID указан верно.`;
        }
        // Обработка ошибки с заголовками
         else if (message.includes('header')) {
            statusCode = 500;
            details = `Проблема с заголовками в таблице. Возможно, лист пуст или имеет неверный формат.`;
        }

        res.status(statusCode).json({ 
            error: 'Не удалось получить статус из Google Sheets.', 
            details: details 
        });
    }
}