import { AggregatedDataRow } from "../types";
import { formatLargeNumber } from "../utils/dataUtils";

// This function now uses the robust task queue architecture.
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
    
    const POLLING_INTERVAL = 1500; // ms
    const MAX_ATTEMPTS = 40; // 1500ms * 40 = 60 seconds timeout

    try {
        // --- Step 1: Create the task ---
        const createTaskResponse = await fetch('/api/gemini-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemini-2.5-flash',
                contents: prompt,
            }),
        });

        if (!createTaskResponse.ok) {
            const errorText = await createTaskResponse.text();
            yield `### Ошибка\n\nНе удалось создать задачу для AI-аналитика. Статус: ${createTaskResponse.status}. ${errorText}`;
            return;
        }

        const { taskId } = await createTaskResponse.json();
        if (!taskId) {
            yield `### Ошибка\n\nСервер не вернул ID задачи.`;
            return;
        }

        // --- Step 2: Poll for the result ---
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            const statusResponse = await fetch(`/api/gemini-task?taskId=${taskId}`);
            if (!statusResponse.ok) {
                // If the status check fails, wait and retry.
                await new Promise(r => setTimeout(r, POLLING_INTERVAL));
                continue;
            }

            const taskStatus = await statusResponse.json();

            if (taskStatus.status === 'done') {
                const fullText = taskStatus.result?.text;
                 if (!fullText) {
                    yield `### Ошибка AI-Аналитика\n\nЗадача выполнена, но результат пуст.`;
                    return;
                }
                // Simulate typing effect
                const chunkSize = 15;
                for (let j = 0; j < fullText.length; j += chunkSize) {
                    yield fullText.substring(j, j + chunkSize);
                    await new Promise(r => setTimeout(r, 20));
                }
                return; // Success, end the generator
            }
            
            if (taskStatus.status === 'error') {
                yield `### Ошибка AI-Аналитика\n\nВо время обработки произошла ошибка: ${taskStatus.error}`;
                return; // Failure, end the generator
            }

            // If still pending, wait for the next poll
            await new Promise(r => setTimeout(r, POLLING_INTERVAL));
        }
        
        yield `### Ошибка\n\nВремя ожидания ответа от AI-аналитика истекло.`;

    } catch (err: any) {
        console.error("Gemini task process failed:", err);
        yield `### Критическая ошибка\n\nНе удалось подключиться к сервису аналитики. Проверьте ваше интернет-соединение. Ошибка: ${err.message}`;
    }
}