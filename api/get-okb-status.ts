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
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
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
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle[SHEET_NAME];
        
        if (!sheet) {
            console.warn(`Sheet "${SHEET_NAME}" not found in spreadsheet.`);
            return res.status(404).json({ 
                error: 'Лист с данными не найден.',
                details: `В таблице Google отсутствует лист с названием "${SHEET_NAME}".`
            });
        }
        
        // Строгая проверка наличия заголовков
        await sheet.loadHeaderRow();
        if (!sheet.headerValues || sheet.headerValues.length === 0) {
            console.error('CRITICAL: Header row is missing in the Google Sheet.');
            return res.status(500).json({ 
                error: 'Ошибка конфигурации таблицы.',
                details: 'В таблице отсутствуют обязательные заголовки. Пожалуйста, заполните первую строку названиями колонок.'
            });
        }

        const rows = await sheet.getRows();
        const data = rows.map(row => row.toObject());

        res.setHeader('Cache-Control', 'no-cache');
        res.status(200).json(data);

    } catch (error: any) {
        console.error('CRITICAL Error in get-okb-status:', error);
        
        let details = 'Не удалось получить данные из таблицы.';
        let statusCode = 500;
        
        const message = error.message || '';

        if (message.includes('403')) {
            statusCode = 403;
            const serviceAccountEmail = process.env.GOOGLE_CLIENT_EMAIL || '[email не найден]';
            details = `Доступ запрещен. У сервисного аккаунта ('${serviceAccountEmail}') нет прав на просмотр таблицы. Пожалуйста, поделитесь таблицей с этим email.`;
        } else if (message.includes('404')) {
            statusCode = 404;
            details = `Таблица Google не найдена. Убедитесь, что переменная окружения GOOGLE_SHEET_ID указана верно.`;
        } else if (message.includes('permission denied')) {
            statusCode = 403;
            const serviceAccountEmail = process.env.GOOGLE_CLIENT_EMAIL || '[email не найден]';
            details = `Доступ запрещен. У сервисного аккаунта ('${serviceAccountEmail}') нет прав на просмотр таблицы.`;
        }

        res.status(statusCode).json({ 
            error: 'Не удалось получить данные из Google Sheets.', 
            details: details 
        });
    }
}
