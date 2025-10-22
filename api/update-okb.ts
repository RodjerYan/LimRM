import type { VercelRequest, VercelResponse } from '@vercel/node';

// URL веб-приложения Google Apps Script для обновления данных
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyH3ArfrPFU7IoxpOMtlr5O14awqaaGR9qbdAcw2bKob3k3Z8ktBb2BZV1W0gxFOdPy7A/exec';

/**
 * Этот обработчик теперь выступает в роли прокси для Google Apps Script.
 * Он просто инициирует процесс обновления, который полностью выполняется на стороне Apps Script.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        console.log('Forwarding request to Google Apps Script for processing...');
        
        // Запускаем процесс в Apps Script. В теле запроса можно передавать параметры.
        // Здесь мы указываем действие 'updateGeocodes', чтобы скрипт знал, что делать.
        const scriptResponse = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'updateGeocodes' }),
            redirect: 'follow' // Apps Script требует следовать редиректам
        });
        
        const responseData = await scriptResponse.json();
        
        console.log('Response from Google Apps Script:', responseData);

        if (responseData && responseData.status === 'success') {
            res.status(200).json(responseData);
        } else {
            // Перенаправляем ошибку от Apps Script клиенту
            res.status(500).json({ 
                error: 'Выполнение Apps Script завершилось с ошибкой.', 
                details: responseData.message || 'Нет деталей от скрипта.' 
            });
        }

    } catch (error: any) {
        console.error('CRITICAL Error in update-okb proxy:', error);
        res.status(500).json({ 
            error: 'Не удалось запустить обновление через Google Apps Script.', 
            details: error.message 
        });
    }
}
