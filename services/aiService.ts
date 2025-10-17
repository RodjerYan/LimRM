import { AggregatedDataRow } from "../types";
import { formatLargeNumber } from "../utils/dataUtils";

const SYSTEM_INSTRUCTION = `
    Ты — опытный бизнес-аналитик в компании Limkorm, специализирующейся на кормах для животных.
    Твоя задача — предоставить краткую, но ёмкую аналитическую справку для регионального менеджера.
    Справка должна быть в формате markdown, структурирована, позитивна и мотивирующа.

    Структура ответа:
    1.  **Заголовок**: Создай четкий заголовок, например, "Анализ потенциала: г. [Город] / [Бренд]".
    2.  **Ключевые выводы (Executive Summary)**: Напиши 2-3 предложения с главной мыслью. Подчеркни основной потенциал роста.
    3.  **Сильные стороны**: Отметь текущие достижения (объем продаж).
    4.  **Зоны роста**: Укажи на разницу между фактом и потенциалом. Используй данные о количестве ТТ как обоснование для возможностей.
    5.  **Рекомендации**: Дай 1-2 конкретные, действенные рекомендации. Например, "Сфокусироваться на работе с новыми ветклиниками" или "Провести аудит представленности бренда в ключевых зоомагазинах".
    6.  **Заключение**: Закончи на позитивной и мотивирующей ноте.

    Стиль: деловой, но энергичный. Используй **жирный шрифт** для акцентов и списки для структурирования. Не используй длинных абзацев. Ответ должен быть только на русском языке.
`;

const createContents = (data: AggregatedDataRow): string => `
    Проанализируй следующие данные:
    - Город: ${data.city}
    - Региональный менеджер (РМ): ${data.rm}
    - Бренд: ${data.brand}
    - Текущие продажи (Факт): ${formatLargeNumber(data.fact)} кг/ед.
    - Прогнозный потенциал рынка: ${formatLargeNumber(data.potential)} кг/ед.
    - Потенциал роста: ${formatLargeNumber(data.growthPotential)} кг/ед. (${data.growthRate.toFixed(1)}%)
    - Количество потенциальных торговых точек (зоомагазины, ветклиники и т.д.) в городе: ${data.potentialTTs} шт.
    - Примеры потенциальных клиентов: ${data.potentialClients.slice(0, 3).map(c => c.name).join(', ')}.
`;


interface StreamCallbacks {
    onChunk: (chunk: string) => void;
    onComplete: () => void;
    onError: (error: string) => void;
}

/**
 * Initiates a streaming request for an AI summary using a stateless, two-step task pattern
 * to prevent serverless function timeouts.
 * @param data The data for the analysis.
 * @param callbacks Callbacks to handle stream events.
 * @returns A cleanup function to abort the request.
 */
export function streamAiSummary(data: AggregatedDataRow, callbacks: StreamCallbacks): () => void {
    const controller = new AbortController();

    const startStreaming = async () => {
        try {
            // STEP 1: Create a self-contained "task ID" by POSTing the prompt and system instruction.
            // This request is instant and avoids the initial timeout.
            const contents = createContents(data);
            const taskResponse = await fetch('/api/gemini-task', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents, systemInstruction: SYSTEM_INSTRUCTION }),
                signal: controller.signal,
            });

            if (!taskResponse.ok) {
                const errorData = await taskResponse.json().catch(() => ({ error: 'Failed to create analysis task.' }));
                throw new Error(errorData.error);
            }
            const { taskId } = await taskResponse.json();
            if (!taskId) {
                throw new Error("Did not receive a valid task ID from the server.");
            }

            // STEP 2: Start a streaming GET request using the task ID.
            // Vercel allows this connection to be held open for streaming.
            const streamResponse = await fetch(`/api/gemini-task?taskId=${taskId}`, {
                signal: controller.signal,
            });

            if (!streamResponse.ok || !streamResponse.body) {
                const errorData = await streamResponse.json().catch(() => ({ error: `Streaming failed with status ${streamResponse.status}` }));
                throw new Error(errorData.error || `Streaming failed with status ${streamResponse.status}`);
            }

            const reader = streamResponse.body.getReader();
            const decoder = new TextDecoder();

            // eslint-disable-next-line no-constant-condition
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    callbacks.onComplete();
                    break;
                }
                callbacks.onChunk(decoder.decode(value, { stream: true }));
            }
        } catch (error: any) {
            if (error.name !== 'AbortError') {
                console.error("AI summary streaming failed:", error);
                callbacks.onError(error instanceof Error ? error.message : String(error));
            }
        }
    };

    startStreaming();

    return () => {
        controller.abort();
    };
}