import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Разрешаем CORS для воркера и локальной разработки
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Метод не разрешен' });
        return;
    }

    const { contents, config } = req.body;

    if (!contents) {
        res.status(400).json({ error: 'Тело запроса должно содержать поле "contents"' });
        return;
    }

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        res.status(500).json({ error: 'Ключ API не настроен', details: 'Переменная окружения `API_KEY` не установлена на сервере.' });
        return;
    }

    if (!apiKey.startsWith('AIza')) {
        res.status(500).json({ 
            error: 'Неверный формат ключа API на сервере', 
            details: 'Предоставленный API_KEY на сервере выглядит некорректным. Он должен начинаться с "AIza". Пожалуйста, перепроверьте, что вы не перепутали значения API_KEY и VITE_GEMINI_API_KEY в настройках Vercel, а затем перезапустите развертывание.' 
        });
        return;
    }

    try {
        const ai = new GoogleGenAI({ apiKey });
        
        // Непотоковый JSON-запрос (для воркера)
        if (config?.responseMimeType === 'application/json') {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents,
                config,
            });

            const jsonText = response.text?.trim();
            if (!jsonText) {
                console.error('Gemini API вернул ответ без текстового содержимого. Возможно, из-за фильтров безопасности.');
                res.status(500).json({ 
                    error: 'Получен пустой текстовый ответ от Gemini', 
                    details: 'Это может произойти, если ответ модели был заблокирован фильтрами безопасности или если не удалось сгенерировать контент.'
                });
                return;
            }

            try {
                const jsonData = JSON.parse(jsonText);
                res.status(200).json(jsonData);
            } catch (parseError: any) {
                 console.error('Ошибка разбора JSON-ответа от Gemini:', parseError);
                 console.error('Необработанный текстовый ответ от Gemini:', jsonText);
                 res.status(500).json({ error: 'Не удалось разобрать JSON-ответ от Gemini', details: parseError.message, raw: jsonText });
            }
            return;
        }

        // Потоковый текстовый запрос по умолчанию (для AI-Аналитика)
        const responseStream = await ai.models.generateContentStream({
            model: "gemini-2.5-flash",
            contents: contents,
            config: config,
        });
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        for await (const chunk of responseStream) {
            res.write(chunk.text);
        }
        res.end();

    } catch (error: any) {
        console.error('Ошибка Gemini API:', error);
        if (!res.headersSent) {
             res.status(500).json({ error: 'Ошибка при запросе к Gemini API', details: error.message });
        } else {
             res.end();
        }
    }
}