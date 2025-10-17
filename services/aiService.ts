import { AggregatedDataRow } from "../types";
import { formatLargeNumber } from "../utils/dataUtils";

const GEMINI_PROXY_URL = '/api/gemini-proxy';

/**
 * Выполняет fetch-запрос с несколькими попытками в случае сбоя сети или серверных ошибок.
 * @param url - URL для запроса.
 * @param options - Опции для fetch.
 * @param retries - Количество попыток.
 * @param delay - Начальная задержка между попытками.
 * @returns Промис с объектом Response.
 */
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delay = 500): Promise<Response> {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.status === 429 || response.status >= 500) { // Повтор при ограничении скорости или ошибках сервера
                throw new Error(`Ошибка сервера: ${response.status}`);
            }
            return response;
        } catch (error) {
            if (i < retries - 1) {
                await new Promise(res => setTimeout(res, delay * (i + 1))); // Экспоненциальная задержка
            } else {
                console.error(`Последняя попытка для ${url} не удалась:`, error);
                throw error;
            }
        }
    }
    // Этот код не должен быть достижим, но необходим для TypeScript.
    throw new Error("Fetch с повторами неожиданно завершился неудачей.");
}

export async function* generateAiSummaryStream(data: AggregatedDataRow): AsyncGenerator<string> {
    const prompt = `
    Ты — опытный бизнес-аналитик в компании Limkorm, специализирующейся на кормах для животных.
    Твоя задача — предоставить краткую, но ёмкую аналитическую справку для регионального менеджера (${data.rm}) по городу ${data.city} и бренду ${data.brand}.
    Справка должна быть в формате markdown, структурирована, позитивна и мотивирующа.

    Входные данные:
    - Город: ${data.city}
    - Региональный менеджер (РМ): ${data.rm}
    - Бренд: ${data.brand}
    - Текущие продажи (Факт): ${formatLargeNumber(data.fact)} кг/ед.
    // FIX: Corrected a typo in the function name from 'formatLarge_number' to 'formatLargeNumber'.
    - Прогнозный потенциал рынка: ${formatLargeNumber(data.potential)} кг/ед.
    - Потенциал роста: ${formatLargeNumber(data.growthPotential)} кг/ед. (${data.growthRate.toFixed(1)}%)
    - Количество потенциальных торговых точек (зоомагазины, ветклиники и т.д.) в городе: ${data.potentialTTs} шт.
    - Примеры потенциальных клиентов: ${data.potentialClients.slice(0, 3).map(c => c.name).join(', ')}.

    Твоя задача:
    1.  **Заголовок**: Создай четкий заголовок, например, "Анализ потенциала: г. ${data.city} / ${data.brand}".
    2.  **Ключевые выводы (Executive Summary)**: Напиши 2-3 предложения с главной мыслью. Подчеркни основной потенциал роста.
    3.  **Сильные стороны**: Отметь текущие достижения (объем продаж).
    4.  **Зоны роста**: Укажи на разницу между фактом и потенциалом. Используй данные о количестве ТТ как обоснование для возможностей.
    5.  **Рекомендации**: Дай 1-2 конкретные, действенные рекомендации. Например, "Сфокусироваться на работе с новыми ветклиниками" или "Провести аудит представленности бренда в ключевых зоомагазинах".
    6.  **Заключение**: Закончи на позитивной и мотивирующей ноте.

    Стиль: деловой, но энергичный. Используй **жирный шрифт** для акцентов и списки для структурирования. Не используй длинных абзацев. Ответ должен быть только на русском языке.
    `;
    
    // Используем абсолютный URL для надежности
    const absoluteProxyUrl = `${window.location.origin}${GEMINI_PROXY_URL}`;

    try {
        const response = await fetchWithRetry(absoluteProxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: prompt }),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Не удалось прочитать тело ответа.');
            throw new Error(`Ошибка сети или сервера (${response.status}): ${errorText}`);
        }

        const fullText = await response.text();
        
        // Симулируем "печатание" текста на клиенте для лучшего UX
        const chunkSize = 15;
        for (let i = 0; i < fullText.length; i += chunkSize) {
            yield fullText.substring(i, i + chunkSize);
            await new Promise(r => setTimeout(r, 20));
        }

    } catch (err: any) {
        console.error("AI summary generation failed:", err);
        const errorMessage = (err.message || '').toLowerCase().includes('failed to fetch')
            ? `Критическая сетевая ошибка: Не удалось подключиться к AI-сервису. Проверьте ваше интернет-соединение или настройки Vercel (особенно таймауты).`
            : `Ошибка AI-сервиса: ${err.message}`;
        yield `### Ошибка Аналитики\n\n${errorMessage}`;
    }
}