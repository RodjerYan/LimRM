import type { VercelRequest, VercelResponse } from '@vercel/node';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyH3ArfrPFU7IoxpOMtlr5O14awqaaGR9qbdAcw2bKob3k3Z8ktBb2BZV1W0gxFOdPy7A/exec';
const FETCH_TIMEOUT = 14000; // Таймаут чуть меньше лимита Vercel (~15с)

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

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
            signal: controller.signal,
        });
        
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
        clearTimeout(timeoutId);
        
        // ИЗМЕНЕНО: Обрабатываем таймаут не как ошибку, а как сигнал для клиента повторить запрос.
        if (error.name === 'AbortError') {
            console.warn('Request to Google Apps Script timed out. Instructing client to poll.');
            // Возвращаем статус 200, чтобы фронтенд не считал это фатальной ошибкой.
            // Передаем специальный статус и тот же 'action', чтобы клиент мог его повторить.
            res.status(200).json({
                status: 'processing_timeout',
                message: `Сервер обрабатывает запрос... Ожидаем завершения.`,
                nextAction: req.body, 
            });
            return;
        }

        // Обрабатываем все остальные, настоящие ошибки
        console.error('CRITICAL Error in update-okb proxy:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Не удалось обработать обновление через прокси Google Apps Script.',
            details: error.message 
        });
    }
}
