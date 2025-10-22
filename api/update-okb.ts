import type { VercelRequest, VercelResponse } from '@vercel/node';

// URL веб-приложения Google Apps Script для обновления данных
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyH3ArfrPFU7IoxpOMtlr5O14awqaaGR9qbdAcw2bKob3k3Z8ktBb2BZV1W0gxFOdPy7A/exec';

/**
 * Этот обработчик теперь выступает в роли прокси для Google Apps Script.
 * Он просто инициирует процесс обновления, который полностью выполняется на стороне Apps Script.
 * ВАЖНО: Мы НЕ ждем (await) ответа от fetch, так как процесс в Apps Script очень долгий
 * и вызовет таймаут на Vercel. Мы запускаем его и сразу возвращаем ответ.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        console.log('Initiating asynchronous update process via Google Apps Script...');
        
        // Запускаем процесс в Apps Script. В теле запроса можно передавать параметры.
        // Здесь мы указываем действие 'updateGeocodes', чтобы скрипт знал, что делать.
        fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'updateGeocodes' }),
            redirect: 'follow'
        }).then(scriptResponse => {
            // Мы можем логировать ответ от скрипта, когда он придет, но не блокируем основной ответ
            if (!scriptResponse.ok) {
                scriptResponse.text().then(text => {
                    console.error('Error from Google Apps Script (async):', scriptResponse.status, text);
                });
            } else {
                 scriptResponse.json().then(data => {
                    console.log('Google Apps Script process finished (async):', data);
                 });
            }
        }).catch(error => {
            // Логируем ошибку, если запрос даже не удалось отправить
            console.error('Failed to send request to Google Apps Script (async):', error);
        });
        
        // Немедленно отвечаем клиенту, что процесс запущен
        res.status(202).json({ 
            status: 'success', 
            message: 'Процесс обновления запущен в фоновом режиме. Обновление статуса займет несколько минут.' 
        });

    } catch (error: any) {
        console.error('CRITICAL Error in update-okb proxy initiator:', error);
        res.status(500).json({ 
            error: 'Не удалось запустить обновление через Google Apps Script.', 
            details: error.message 
        });
    }
}
