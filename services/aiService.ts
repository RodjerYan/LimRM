import { AggregatedDataRow } from "../types";
import { formatLargeNumber } from "./utils/dataUtils";

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
        // 1. Создаём задачу на сервере
        const createResponse = await fetch('/api/gemini-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
        });

        if (!createResponse.ok) {
            const errorData = await createResponse.json();
            yield `### Ошибка создания задачи\n\nНе удалось запустить AI-аналитика. Сервер ответил: ${errorData.error || 'Неизвестная ошибка'}`;
            return;
        }

        const { taskId } = await createResponse.json();
        if (!taskId) {
            yield "### Ошибка\n\nСервер не вернул идентификатор задачи.";
            return;
        }

        // 2. Опрашиваем статус задачи, пока она не будет выполнена
        let isFinished = false;
        const maxPolls = 60; // ~1 минута ожидания
        let polls = 0;

        while (!isFinished && polls < maxPolls) {
            const statusResponse = await fetch(`/api/gemini-task?taskId=${taskId}`);
            
            if (!statusResponse.ok) {
                // Если сам сервер опроса недоступен, прекращаем
                yield `### Ошибка сети\n\nНе удалось проверить статус задачи. Попробуйте снова.`;
                return;
            }

            const taskStatus = await statusResponse.json();

            if (taskStatus.status === 'done') {
                const fullText = taskStatus.result;
                // Симулируем "печатание" текста на клиенте
                const chunkSize = 15;
                for (let i = 0; i < fullText.length; i += chunkSize) {
                    yield fullText.substring(i, i + chunkSize);
                    await new Promise(r => setTimeout(r, 20));
                }
                isFinished = true;

            } else if (taskStatus.status === 'error') {
                yield `### Ошибка AI-Аналитика\n\nПроизошла ошибка при обработке вашего запроса: ${taskStatus.error}`;
                isFinished = true;

            } else {
                // Статус 'pending', ждем и пробуем снова
                await new Promise(r => setTimeout(r, 1500)); 
                polls++;
            }
        }

        if (!isFinished) {
            yield `### Ошибка: Время ожидания истекло\n\nАнализ занимает слишком много времени. Пожалуйста, попробуйте снова.`;
        }

    } catch (err: any) {
        yield `### Критическая ошибка\n\nНе удалось подключиться к сервису аналитики. Проверьте ваше интернет-соединение. Ошибка: ${err.message}`;
    }
}