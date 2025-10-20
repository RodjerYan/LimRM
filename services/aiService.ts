import { AggregatedDataRow } from "../types";
import { formatLargeNumber } from "../utils/dataUtils";

const POLLING_INTERVAL = 1500; // ms
const MAX_POLLING_ATTEMPTS = 40; // 1500ms * 40 = 60 seconds timeout

/**
 * Generates an AI-powered summary for a given data row using an async task queue.
 *
 * @param data The aggregated data row for which to generate the summary.
 * @returns An async generator that yields the summary text in chunks.
 */
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

    let taskId: string;

    try {
        const initialResponse = await fetch('/api/gemini-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
        });

        if (!initialResponse.ok) {
            const errorData = await initialResponse.json().catch(() => ({ error: 'Не удалось создать задачу.' }));
            throw new Error(errorData.error || `Сервер ответил со статусом ${initialResponse.status}`);
        }
        
        const { taskId: newTaskId } = await initialResponse.json();
        if (!newTaskId) {
            throw new Error("Не удалось получить ID задачи от сервера.");
        }
        taskId = newTaskId;

    } catch (error: any) {
        yield `### Критическая ошибка\n\nНе удалось запустить задачу аналитики. Проверьте ваше интернет-соединение или настройки прокси. Ошибка: ${error.message}`;
        return;
    }

    // Polling for the result
    for (let i = 0; i < MAX_POLLING_ATTEMPTS; i++) {
        await new Promise(r => setTimeout(r, POLLING_INTERVAL));

        try {
            const statusResponse = await fetch(`/api/gemini-task?taskId=${taskId}`);
            if (!statusResponse.ok) {
                if (statusResponse.status === 404) {
                    throw new Error("Задача не найдена на сервере. Возможно, сервер был перезапущен.");
                }
                const errorData = await statusResponse.json().catch(() => ({ error: 'Не удалось проверить статус задачи.' }));
                throw new Error(errorData.error || `Ошибка при проверке статуса: ${statusResponse.status}`);
            }

            const taskStatus = await statusResponse.json();

            if (taskStatus.status === 'done') {
                const fullText = taskStatus.result || "";
                 // Simulate "typing" effect on the client side
                const chunkSize = 15;
                for (let i = 0; i < fullText.length; i += chunkSize) {
                    yield fullText.substring(i, i + chunkSize);
                    await new Promise(r => setTimeout(r, 20)); // Small delay for typing effect
                }
                return; // Success
            }

            if (taskStatus.status === 'error') {
                throw new Error(taskStatus.error || 'Неизвестная ошибка при обработке задачи.');
            }
            // If status is 'pending', continue polling
        } catch (error: any) {
            yield `### Ошибка AI-Аналитика\n\nНе удалось получить результат анализа. ${error.message}`;
            return;
        }
    }

    yield `### Ошибка: Превышено время ожидания\n\nАналитический сервис не ответил в течение ${MAX_POLLING_ATTEMPTS * POLLING_INTERVAL / 1000} секунд. Попробуйте снова.`;
}
