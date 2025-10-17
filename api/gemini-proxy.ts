import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// --- Управление ключами API ---
const getApiKeys = (): string[] => {
    const keys: string[] = [];
    if (process.env.API_KEY) {
        keys.push(process.env.API_KEY);
    }
    let i = 2;
    while (process.env[`API_KEY_${i}`]) {
        keys.push(process.env[`API_KEY_${i}`]!);
        i++;
    }
    return keys;
};

// Перемешивание массива по алгоритму Фишера-Йейтса для случайного порядка ключей
const shuffleArray = <T>(array: T[]): T[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};
// --- Конец управления ключами ---


export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Разрешаем CORS
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

    const shuffledKeys = shuffleArray(apiKeys);
    let lastError: any = null;
    let requestHandled = false;

    for (const apiKey of shuffledKeys) {
        if (!apiKey || !apiKey.startsWith('AIza')) {
            console.warn('Пропуск ключа API с неверным форматом.');
            continue;
        }

        try {
            const ai = new GoogleGenAI({ apiKey });
            
            if (config?.responseMimeType === 'application/json') {
                // --- Обработка НЕ-потокового JSON-запроса ---
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents,
                    config,
                });

                const jsonText = response.text?.trim();
                if (!jsonText) {
                    throw new Error('Получен пустой текстовый ответ от Gemini, возможно из-за фильтров безопасности.');
                }
                
                try {
                    const jsonData = JSON.parse(jsonText);
                    res.status(200).json(jsonData);
                } catch (parseError: any) {
                     throw new Error(`Не удалось разобрать JSON-ответ от Gemini: ${parseError.message}. Ответ: ${jsonText}`);
                }

            } else {
                // --- Обработка потокового текстового запроса ---
                const responseStream = await ai.models.generateContentStream({
                    model: "gemini-2.5-flash",
                    contents,
                    config,
                });

                const iterator = responseStream[Symbol.asyncIterator]();
                const firstChunkResult = await iterator.next();

                if (firstChunkResult.done) {
                    res.status(200).end();
                } else {
                    if (!res.headersSent) {
                        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                        res.setHeader('Cache-Control', 'no-cache');
                        res.setHeader('Connection', 'keep-alive');
                    }
                    
                    res.write(firstChunkResult.value.text);
                    
                    const streamTimeout = setTimeout(() => {
                        if (!res.writableEnded) {
                            console.warn(`Таймаут (60с) при чтении потока Gemini (ключ ...${apiKey.slice(-4)}). Завершение ответа.`);
                            res.end();
                        }
                    }, 60000);

                    try {
                        for await (const chunk of { [Symbol.asyncIterator]: () => iterator }) {
                            if (res.writableEnded) break;
                            res.write(chunk.text);
                        }
                    } finally {
                        clearTimeout(streamTimeout);
                        if (!res.writableEnded) {
                            res.end();
                        }
                    }
                }
            }
            
            console.info(`✅ Запрос успешно обработан ключом ...${apiKey.slice(-4)}.`);
            requestHandled = true;
            break; 

        } catch (error: any) {
            lastError = error;
            const errorMessage = (error.message || '').toLowerCase();
            
            if (errorMessage.includes('429') || errorMessage.includes('resource_exhausted') || errorMessage.includes('too many requests') || errorMessage.includes('failed to fetch')) {
                console.warn(`Ключ API (...${apiKey.slice(-4)}) столкнулся с лимитом или сетевой ошибкой. Пробуем следующий. Ошибка: ${error.message}`);
            } else {
                console.error('Невосстановимая ошибка Gemini API. Прерывание попыток.', error);
                break; 
            }
        }
    }

    if (!requestHandled && !res.headersSent) {
        console.error('Все ключи API не сработали. Последняя ошибка:', lastError);
        const errorDetails = lastError?.message || 'Неизвестная ошибка.';
        const finalMessage = `Все доступные ключи API исчерпали лимиты или произошла невосстановимая ошибка. Последняя ошибка: ${errorDetails}`;
        res.status(500).json({ error: 'Не удалось выполнить запрос к Gemini API', details: finalMessage });
    }
}