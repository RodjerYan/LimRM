import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// --- Key Rotation ---
const getApiKeys = (): string[] => {
    const keys: string[] = [];
    // Check for the primary API_KEY first
    if (process.env.API_KEY) {
        keys.push(process.env.API_KEY);
    }
    // Check for numbered keys like API_KEY_2, API_KEY_3, etc.
    let i = 2;
    while (process.env[`API_KEY_${i}`]) {
        keys.push(process.env[`API_KEY_${i}`]!);
        i++;
    }
    return keys;
};

let keyIndex = 0;
const getNextApiKey = (keys: string[]): string | undefined => {
    if (keys.length === 0) return undefined;
    const key = keys[keyIndex];
    keyIndex = (keyIndex + 1) % keys.length; // Use round-robin to cycle through keys
    return key;
};
// --- End Key Rotation ---


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

    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) {
        res.status(500).json({ error: 'Ключи API не настроены', details: 'Ни одна из переменных окружения `API_KEY`, `API_KEY_2`,... не установлена на сервере.' });
        return;
    }

    const apiKey = getNextApiKey(apiKeys);

    if (!apiKey) {
        res.status(500).json({ error: 'Не удалось получить ключ API из пула' });
        return;
    }

    if (!apiKey.startsWith('AIza')) {
        res.status(500).json({ 
            error: 'Неверный формат ключа API на сервере', 
            details: 'Один из предоставленных ключей API (API_KEY, API_KEY_2, ...) выглядит некорректным. Он должен начинаться с "AIza". Пожалуйста, проверьте ключи в настройках Vercel.'
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