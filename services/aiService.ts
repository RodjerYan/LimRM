import { AggregatedDataRow } from "../types";
import { formatLargeNumber } from "../utils/dataUtils";

// This function now uses a simple, robust proxy request.
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
    
    try {
        const response = await fetch('/api/gemini-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemini-2.5-flash',
                contents: prompt,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response.' }));
            const errorMessage = errorData.error || `Request failed with status ${response.status}`;
            yield `### Ошибка AI-Аналитика\n\n${errorMessage}`;
            return;
        }

        const result = await response.json();
        const fullText = result.text;
        
        if (!fullText) {
            yield `### Ошибка AI-Аналитика\n\nПолучен пустой ответ от сервиса.`;
            return;
        }

        // Simulate typing effect
        const chunkSize = 15;
        for (let i = 0; i < fullText.length; i += chunkSize) {
            yield fullText.substring(i, i + chunkSize);
            await new Promise(r => setTimeout(r, 20));
        }

    } catch (err: any) {
        console.error("Gemini fetch failed:", err);
        const errorMessage = err.message.toLowerCase().includes('failed to fetch')
            ? "Не удалось подключиться к сервису аналитики. Проверьте ваше интернет-соединение или статус развертывания на Vercel."
            : err.message;
        yield `### Критическая ошибка\n\n${errorMessage}`;
    }
}
