import type { VercelRequest, VercelResponse } from '@vercel/node';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyH3ArfrPFU7IoxpOMtlr5O14awqaaGR9qbdAcw2bKob3k3Z8ktBb2BZV1W0gxFOdPy7A/exec';

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

    try {
        // Тело запроса от фронтенда содержит действие и начальный индекс для батча
        const requestBody = req.body;
        console.log('Proxying request to Google Apps Script with body:', requestBody);

        const scriptResponse = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            redirect: 'follow'
        });

        const contentType = scriptResponse.headers.get('content-type');
        if (!scriptResponse.ok || !contentType || !contentType.includes('application/json')) {
            const errorText = await scriptResponse.text();
            console.error('Error response from Google Apps Script:', {
                status: scriptResponse.status,
                contentType: contentType,
                body: errorText,
            });
            // Попытка извлечь более читаемую ошибку, если GAS вернул HTML
             if (errorText.includes('<title>Google Accounts</title>')) {
                throw new Error('Apps Script вернул страницу входа Google. Проверьте настройки доступа: "Who has access" должно быть "Anyone".');
            }
            throw new Error(`Google Apps Script вернул ошибку или не-JSON ответ. Детали: ${errorText}`);
        }

        const data = await scriptResponse.json();
        console.log('Received response from Google Apps Script:', data);
        
        // Пересылаем успешный JSON-ответ от GAS обратно клиенту
        res.status(200).json(data);

    } catch (error: any) {
        console.error('CRITICAL Error in update-okb proxy:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Не удалось обработать обновление через прокси Google Apps Script.', 
            details: error.message 
        });
    }
}
