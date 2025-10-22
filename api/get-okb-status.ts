import type { VercelRequest, VercelResponse } from '@vercel/node';

// URL веб-приложения Google Apps Script для получения данных
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyH3ArfrPFU7IoxpOMtlr5O14awqaaGR9qbdAcw2bKob3k3Z8ktBb2BZV1W0gxFOdPy7A/exec';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Добавляем параметр, чтобы Apps Script понял, какое действие нужно выполнить
        const urlWithAction = `${APPS_SCRIPT_URL}?action=getStatus`;
        console.log(`Fetching status from Google Apps Script: ${urlWithAction}`);
        
        const scriptResponse = await fetch(urlWithAction, {
            method: 'GET',
            redirect: 'follow' // Apps Script часто использует редиректы
        });

        if (!scriptResponse.ok) {
            const errorText = await scriptResponse.text();
            throw new Error(`Ошибка от Google Apps Script: ${scriptResponse.status} ${errorText}`);
        }
        
        const data = await scriptResponse.json();
        
        console.log('Successfully fetched status from Apps Script:', data);
        
        // Проверяем, что скрипт вернул ожидаемую структуру
        if (typeof data.rowCount !== 'number' || typeof data.modifiedTime !== 'string') {
             throw new Error('Получена некорректная структура данных от Apps Script.');
        }

        res.setHeader('Cache-Control', 'no-cache');
        res.status(200).json({ rowCount: data.rowCount, modifiedTime: data.modifiedTime });

    } catch (error: any) {
        console.error('CRITICAL Error in get-okb-status proxy:', error);
        res.status(500).json({ 
            error: 'Не удалось получить статус через Apps Script.', 
            details: error.message 
        });
    }
}
