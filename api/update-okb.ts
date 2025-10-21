import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SHEET_NAME = 'Лист1';

/**
 * Настройка аутентификации через сервисный аккаунт
 */
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
                error: `Лист "${SHEET_NAME}" не найден.`,
                details: `В таблице Google отсутствует лист с названием "${SHEET_NAME}". Создайте его и убедитесь, что есть заголовки.` 
            });
        }

        // Загружаем заголовки
        await sheet.loadHeaderRow();
        if (!sheet.headerValues || sheet.headerValues.length === 0) {
            return res.status(500).json({
                error: 'Ошибка конфигурации таблицы.',
                details: `В листе "${SHEET_NAME}" отсутствуют заголовки в первой строке. Добавьте их.`
            });
        }

        // Логируем текущие заголовки и ключи данных
        console.log('Sheet headers:', sheet.headerValues);
        console.log('Keys in incoming rows:', rowsToAdd.map(r => Object.keys(r)));

        // Проверяем, что все ключи есть в заголовках
        const invalidKeys = rowsToAdd.flatMap(r => Object.keys(r)).filter(k => !sheet.headerValues.includes(k));
        if (invalidKeys.length > 0) {
            return res.status(400).json({
                error: 'Ошибка соответствия ключей заголовкам.',
                details: `Некоторые ключи данных отсутствуют в заголовках листа: ${[...new Set(invalidKeys)].join(', ')}`
            });
        }

        // Пакетное добавление строк
        const addedRows = await sheet.addRows(rowsToAdd);
        console.log(`Successfully added ${addedRows.length} rows.`);

        res.status(200).json({ 
            message: `База ОКБ успешно обновлена. Добавлено ${addedRows.length} строк.`,
            count: addedRows.length 
        });

    } catch (error: any) {
        console.error('CRITICAL Error in update-okb:', error);

        let statusCode = 500;
        let details = error.message || 'Не удалось обновить данные в таблице.';

        if (error.message.includes('403') || error.message.includes('permission denied')) {
            statusCode = 403;
            details = `Доступ запрещен. Убедитесь, что сервисный аккаунт имеет права "Редактора" для этой таблицы.`;
        } else if (error.message.includes('404') || error.message.includes('Requested entity was not found')) {
            statusCode = 404;
            details = `Таблица Google не найдена. Проверьте значение GOOGLE_SHEET_ID.`;
        } else if (error.message.includes('header')) {
            statusCode = 500;
            details = `Проблема с заголовками в таблице. Возможно, лист пуст или имеет неверный формат.`;
        }

        res.status(statusCode).json({ error: 'Не удалось записать данные в Google Sheets.', details });
    }
}