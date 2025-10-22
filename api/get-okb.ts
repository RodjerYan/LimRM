import type { VercelRequest, VercelResponse } from '@vercel/node';

// URL веб-приложения Google Apps Script для получения ВСЕХ данных
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyH3ArfrPFU7IoxpOMtlr5O14awqaaGR9qbdAcw2bKob3k3Z8ktBb2BZV1W0gxFOdPy7A/exec';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Указываем действие 'getAllData', чтобы Apps Script вернул все строки
        const urlWithAction = `${APPS_SCRIPT_URL}?action=getAllData`;
        console.log(`Fetching all OKB data from Google Apps Script: ${urlWithAction}`);
        
        const scriptResponse = await fetch(urlWithAction, {
            method: 'GET',
            redirect: 'follow'
        });

        if (!scriptResponse.ok) {
            const errorText = await scriptResponse.text();
            throw new Error(`Ошибка от Google Apps Script: ${scriptResponse.status} ${errorText}`);
        }
        
        const contentType = scriptResponse.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const responseText = await scriptResponse.text();
            if (responseText.includes('<title>Google Accounts</title>')) {
                throw new Error('Apps Script вернул страницу входа Google. Проверьте настройки доступа: "Who has access" должно быть "Anyone".');
            }
            throw new Error(`Ожидался JSON, но получен ${contentType}. Проверьте, что Apps Script опубликован корректно.`);
        }

        const data = await scriptResponse.json();
        
        console.log(`Successfully fetched ${data.length} rows from Apps Script.`);
        
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        res.status(200).json(data);

    } catch (error: any) {
        console.error('CRITICAL API ERROR in get-okb proxy:', error);
        res.status(500).json({ 
            error: 'Failed to fetch data from Google Sheets via Apps Script.', 
            details: error.message 
        });
    }
}
