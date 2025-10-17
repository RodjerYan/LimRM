import { AggregatedDataRow } from "../types";
import { formatLargeNumber } from "../utils/dataUtils";

// Helper function to poll for the task result
async function pollForTaskResult(taskId: string, timeout = 58000): Promise<string> {
    const startTime = Date.now();
    const pollInterval = 1500; // Poll every 1.5 seconds

    while (Date.now() - startTime < timeout) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        try {
            const res = await fetch(`/api/gemini-task?taskId=${taskId}`);
            
            if (!res.ok) {
                // Handle cases where the task might not be found on a cold start instance
                if (res.status === 404) {
                    console.warn(`Task ${taskId} not found, may be a cold start. Retrying...`);
                    continue; // Continue polling
                }
                const errorData = await res.json().catch(() => ({ error: 'Failed to parse error response from task endpoint.' }));
                throw new Error(`Task status check failed with status ${res.status}: ${errorData.error || res.statusText}`);
            }

            const data = await res.json();

            if (data.status === 'done') {
                return data.result;
            } else if (data.status === 'error') {
                throw new Error(`AI task failed: ${data.error}`);
            }
            // If status is 'pending', the loop continues
        } catch (error) {
            console.error('Polling error:', error);
            // Don't throw immediately, allow for retries within the timeout
        }
    }

    throw new Error("AI task timed out after waiting for a response.");
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
        // --- Step 1: Create the task ---
        const createTaskResponse = await fetch('/api/gemini-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
        });

        if (!createTaskResponse.ok) {
            const errorText = await createTaskResponse.text();
            throw new Error(`Failed to create AI task: ${errorText}`);
        }

        const { taskId } = await createTaskResponse.json();
        if (!taskId) {
            throw new Error('Did not receive a task ID from the server.');
        }
        
        // --- Step 2: Poll for the result ---
        const fullText = await pollForTaskResult(taskId);
        
        if (!fullText || fullText.trim() === '') {
            yield '### Ошибка\n\nМодель вернула пустой ответ. Возможно, сработал фильтр безопасности.';
            return;
        }
        
        // --- Step 3: Stream the result to the UI ---
        const chunkSize = 15;
        for (let i = 0; i < fullText.length; i += chunkSize) {
            yield fullText.substring(i, i + chunkSize);
            await new Promise(r => setTimeout(r, 20));
        }

    } catch (err: any) {
        yield `### Критическая ошибка\n\nНе удалось получить аналитическую справку. Проверьте ваше интернет-соединение или настройки сервера. Ошибка: ${err.message}`;
    }
}