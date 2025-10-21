import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SHEET_NAME = 'Лист1';

/**
 * Шаг 1: Настройка аутентификации через сервисный аккаунт.
 * Эта функция создает JWT-клиент для аутентификации запросов к Google API.
 * Она использует переменные окружения для безопасности и запрашивает права на редактирование таблиц.
 */
const getAuth = () => {
    const client_email = process.env.GOOGLE_CLIENT_EMAIL;
    const private_key = process.env.GOOGLE_PRIVATE_KEY;

    // Проверяем, что учетные данные заданы в переменных окружения
    if (!client_email || !private_key) {
        throw new Error('Переменные окружения GOOGLE_CLIENT_EMAIL и GOOGLE_PRIVATE_KEY не установлены.');
    }
    
    // Возвращаем JWT-клиент с правами на редактирование таблиц
    return new JWT({
        email: client_email,
        key: private_key.replace(/\\n/g, '\n'), // Заменяем `\n` на реальные переносы строк
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Проверяем, что используется метод POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Шаг 2: Валидация входящих данных
        const { rows: rowsToAdd } = req.body;

        // Убеждаемся, что тело запроса содержит непустой массив `rows`
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

        // Шаг 3: Подключение к таблице и проверка листа/заголовков
        const serviceAccountAuth = getAuth();
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

        await doc.loadInfo(); // Загружаем информацию о документе
        const sheet = doc.sheetsByTitle[SHEET_NAME];

        // Проверяем, существует ли лист с нужным названием
        if (!sheet) {
             return res.status(404).json({ 
                error: `Лист "${SHEET_NAME}" не найден.`,
                details: `В таблице Google отсутствует лист с названием "${SHEET_NAME}". Пожалуйста, создайте его.`
            });
        }

        // КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: Загружаем заголовки, чтобы убедиться, что они существуют
        await sheet.loadHeaderRow();
        if (!sheet.headerValues || sheet.headerValues.length === 0) {
            console.error('CRITICAL: Cannot add rows because header row is missing.');
            return res.status(500).json({
                error: 'Ошибка конфигурации таблицы.',
                details: `Невозможно добавить данные, так как в листе "${SHEET_NAME}" отсутствуют заголовки.`
            });
        }

        // Шаг 4: Пакетное добавление строк для максимальной производительности
        console.log(`Attempting to add ${rowsToAdd.length} new rows to the sheet in a single batch.`);
        // Используем пакетный метод sheet.addRows вместо цикла
        const addedRows = await sheet.addRows(rowsToAdd);
        console.log(`Successfully added ${addedRows.length} rows.`);

        // Шаг 5: Отправка успешного ответа
        return res.status(200).json({ 
            message: `База ОКБ успешно обновлена. Добавлено ${addedRows.length} строк.`,
            count: addedRows.length 
        });

    } catch (error: any) {
        console.error('CRITICAL Error in update-okb:', error);
        
        // Шаг 6: Детальная обработка ошибок
        let details = 'Не удалось обновить данные в таблице.';
        let statusCode = 500;
        
        const message = error.message || '';

        // Обработка ошибки "Доступ запрещен"
        if (message.includes('403') || message.includes('permission denied')) {
            statusCode = 403;
            const serviceAccountEmail = process.env.GOOGLE_CLIENT_EMAIL || '[email не найден]';
            details = `Доступ запрещен. Убедитесь, что сервисный аккаунт ('${serviceAccountEmail}') имеет права "Редактора" для этой таблицы.`;
        } 
        // Обработка ошибки "Не найдено"
        else if (message.includes('404') || message.includes('Requested entity was not found')) {
            statusCode = 404;
            details = `Таблица Google не найдена. Убедитесь, что GOOGLE_SHEET_ID указан верно.`;
        }

        res.status(statusCode).json({ 
            error: 'Не удалось записать данные в Google Sheets.', 
            details: details 
        });
    }
}
