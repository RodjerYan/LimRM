import type { VercelRequest, VercelResponse } from '@vercel/node';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyH3ArfrPFU7IoxpOMtlr5O14awqaaGR9qbdAcw2bKob3k3Z8ktBb2BZV1W0gxFOdPy7A/exec';
// ИЗМЕНЕНО: Таймаут уменьшен до 14 секунд, чтобы быть меньше лимита Vercel (~15с)
const FETCH_TIMEOUT = 14000; 

/**
 * Этот обработчик является прокси для Google Apps Script, поддерживающим пакетную обработку.
 * Он принимает от клиента action ('startUpdate' или 'continueUpdate') и startIndex,
 * передает их в GAS, дожидается обработки одного пакета данных и возвращает результат
 * обратно клиенту для оркестрации следующего шага.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Добавляем AbortController для контроля таймаута
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
        const requestBody = req.body;
        console.log('Proxying request to Google Apps Script with body:', requestBody);

        const scriptResponse = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            redirect: 'follow',
            signal: controller.signal // Привязываем контроллер к запросу
        });
        
        // Очищаем таймаут, если запрос выполнился вовремя
        clearTimeout(timeoutId);

        const contentType = scriptResponse.headers.get('content-type');
        if (!scriptResponse.ok || !contentType || !contentType.includes('application/json')) {
            const errorText = await scriptResponse.text();
            console.error('Error response from Google Apps Script:', {
                status: scriptResponse.status,
                contentType: contentType,
                body: errorText,
            });
            if (errorText.includes('<title>Google Accounts</title>')) {
                throw new Error('Apps Script вернул страницу входа Google. Проверьте настройки доступа: "Who has access" должно быть "Anyone".');
            }
            throw new Error(`Google Apps Script вернул ошибку или не-JSON ответ. Детали: ${errorText}`);
        }

        const data = await scriptResponse.json();
        console.log('Received response from Google Apps Script:', data);
        
        res.status(200).json(data);

    } catch (error: any) {
        // Очищаем таймаут в случае других ошибок
        clearTimeout(timeoutId);
        
        console.error('CRITICAL Error in update-okb proxy:', error);
        
        let message = 'Не удалось обработать обновление через прокси Google Apps Script.';
        // Если ошибка вызвана нашим таймаутом, даем более понятное сообщение
        if (error.name === 'AbortError') {
            message = `Запрос к Google Apps Script занял слишком много времени (>${FETCH_TIMEOUT / 1000}с) и был прерван. Это может быть вызвано медленным ответом от Gemini API. Процесс продолжится автоматически.`;
        }

        res.status(500).json({ 
            status: 'error',
            message: message,
            details: error.message 
        });
    }
}