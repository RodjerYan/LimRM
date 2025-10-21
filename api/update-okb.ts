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
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { rows: rowsToAdd } = req.body;

        if (!Array.isArray(rowsToAdd) || rowsToAdd.length === 0) {
            console.warn('Update attempt with no data.');
            return res.status(400).json({ 
                error: 'Некорректный запрос.',
                details: 'Тело запроса должно содержать непустой массив "rows".'
            });
        }

        const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
        if (!SPREADSHEET_ID) {
            throw new Error("Переменная окружения GOOGLE_SHEET_ID не установлена.");
        }

        const serviceAccountAuth = getAuth();
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

        await doc.loadInfo();
        const sheet = doc.sheetsByTitle[SHEET_NAME];

        if (!sheet) {
             return res.status(404).json({ 
                error: 'Лист для записи не найден.',
                details: `В таблице Google отсутствует лист с названием "${SHEET_NAME}".`
            });
        }

        await sheet.loadHeaderRow();
        if (!sheet.headerValues || sheet.headerValues.length === 0) {
            console.error('CRITICAL: Cannot add rows because header row is missing.');
            return res.status(500).json({
                error: 'Ошибка конфигурации таблицы.',
                details: 'Невозможно добавить данные, так как в таблице отсутствуют заголовки.'
            });
        }

        console.log(`Attempting to add ${rowsToAdd.length} new rows to the sheet.`);
        const addedRows = await sheet.addRows(rowsToAdd);
        console.log(`Successfully added ${addedRows.length} rows.`);

        return res.status(200).json({ 
            message: `База ОКБ успешно обновлена. Добавлено ${addedRows.length} строк.`,
            count: addedRows.length 
        });

    } catch (error: any) {
        console.error('CRITICAL Error in update-okb:', error);
        
        let details = 'Не удалось обновить данные в таблице.';
        let statusCode = 500;
        
        const message = error.message || '';

        if (message.includes('403') || message.includes('permission denied')) {
            statusCode = 403;
            const serviceAccountEmail = process.env.GOOGLE_CLIENT_EMAIL || '[email не найден]';
            details = `Доступ запрещен. У сервисного аккаунта ('${serviceAccountEmail}') нет прав на редактирование таблицы.`;
        } else if (message.includes('404')) {
            statusCode = 404;
            details = `Таблица Google не найдена. Убедитесь, что GOOGLE_SHEET_ID указан верно.`;
        }

        res.status(statusCode).json({ 
            error: 'Не удалось записать данные в Google Sheets.', 
            details: details 
        });
    }
}
