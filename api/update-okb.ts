import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleSpreadsheet, GoogleSpreadsheetRow } from 'google-spreadsheet';
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

/**
 * Функция для геокодирования адреса через Nominatim (OpenStreetMap).
 * @param address - Адрес для поиска.
 * @returns Объект с lat и lon или null.
 */
const geocodeAddress = async (address: string): Promise<{ lat: number; lon: number } | null> => {
    // Политика Nominatim требует осмысленный User-Agent
    const userAgent = 'Geo-Analiz-Rynka-Limkorm/1.0 (https://ai.studio)';
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&countrycodes=ru&limit=1`;
    try {
        const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
        if (!response.ok) return null;
        const data = await response.json();
        if (data && data.length > 0 && data[0].lat && data[0].lon) {
            return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
        }
        return null;
    } catch (error) {
        console.error(`Ошибка геокодирования для адреса: ${address}`, error);
        return null;
    }
};

/**
 * Основной обработчик API, который запускает фоновый процесс обновления координат.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // --- ШАГ 1: Немедленно отвечаем клиенту ---
    // Это критически важно для Vercel, чтобы избежать таймаута запроса.
    // Клиент получит этот ответ, а сервер продолжит выполнение кода ниже.
    res.status(202).json({ message: 'Процесс обновления координат запущен в фоновом режиме.' });

    // --- ШАГ 2: Запускаем фоновую обработку ---
    try {
        console.log('Starting background geocoding process...');
        const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
        if (!SPREADSHEET_ID) {
            throw new Error("Переменная окружения GOOGLE_SHEET_ID не установлена.");
        }

        const serviceAccountAuth = getAuth();
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo();

        const sheet = doc.sheetsByTitle[SHEET_NAME];
        if (!sheet) {
            throw new Error(`Лист "${SHEET_NAME}" не найден.`);
        }
        
        await sheet.loadHeaderRow();
        if(!sheet.headerValues.includes('Широта') || !sheet.headerValues.includes('Долгота')) {
             throw new Error(`В таблице отсутствуют необходимые колонки 'Широта' и/или 'Долгота'.`);
        }

        const rows = await sheet.getRows();

        // Находим строки, где есть адрес, но нет координат
        const rowsToUpdate = rows.filter(row => {
            const address = row.get('Адрес');
            const lat = row.get('Широта');
            return address && !lat; // Проверяем только широту, т.к. они должны быть вместе
        });
        
        console.log(`Найдено ${rowsToUpdate.length} записей для обновления координат.`);
        if (rowsToUpdate.length === 0) {
             console.log('Нет записей для обновления. Фоновый процесс завершен.');
             return;
        }

        // Обрабатываем ограниченное количество записей за один запуск, чтобы не превысить лимиты Vercel
        const BATCH_SIZE = 20; 
        for (let i = 0; i < Math.min(rowsToUpdate.length, BATCH_SIZE); i++) {
            const row = rowsToUpdate[i] as GoogleSpreadsheetRow<any>;
            const address = row.get('Адрес');
            if (!address) continue;
            
            console.log(`[${i+1}/${BATCH_SIZE}] Геокодирование адреса: "${address}"`);
            
            const coords = await geocodeAddress(address);
            if (coords) {
                row.set('Широта', coords.lat);
                row.set('Долгота', coords.lon);
                row.set('Дата обновления базы', new Date().toISOString());
                await row.save();
                console.log(`Успешно обновлена строка ${row.rowNumber} с координатами:`, coords);
            } else {
                 console.warn(`Не удалось найти координаты для адреса: "${address}"`);
                 row.set('Широта', 'FAILED'); // Помечаем как неуспешную попытку
                 row.set('Долгота', 'FAILED');
                 await row.save();
            }
            // Задержка для соблюдения политики Nominatim (не более 1 запроса в секунду)
            await new Promise(resolve => setTimeout(resolve, 1100)); 
        }
        
        console.log('Фоновый процесс геокодирования для этой пачки завершен.');

    } catch (error: any) {
        // Этот лог появится в Vercel уже после того, как ответ был отправлен клиенту
        console.error('КРИТИЧЕСКАЯ ОШИБКА в фоновом процессе update-okb:', error);
    }
}