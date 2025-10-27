
import { AggregatedDataRow } from "../types";

// The proxy URL should be configured in one place, but for simplicity, we define it here.
const PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL || '/api/gemini-proxy';

/**
 * Generates a prompt for Gemini based on a single client's data.
 * @param clientData - The data for a single aggregated client row.
 * @returns A string prompt for the AI.
 */
const createClientInsightPrompt = (clientData: AggregatedDataRow): string => {
    const formattedFact = new Intl.NumberFormat('ru-RU').format(clientData.fact);
    const formattedPotential = new Intl.NumberFormat('ru-RU').format(clientData.potential);
    const formattedGrowth = new Intl.NumberFormat('ru-RU').format(clientData.growthPotential);

    return `
        Проанализируй данные по клиенту и дай краткие, действенные рекомендации по увеличению продаж.
        Отвечай на русском языке. Ответ должен быть в формате Markdown, без заголовков.
        Используй списки для перечисления рекомендаций.

        **Данные о клиенте:**
        - **Клиент:** ${clientData.clientName}
        - **Город:** ${clientData.city}
        - **Бренд:** ${clientData.brand}
        - **Региональный менеджер (РМ):** ${clientData.rm}
        - **Текущие продажи (Факт):** ${formattedFact} кг/ед.
        - **Общий потенциал рынка:** ${formattedPotential} кг/ед.
        - **Потенциал роста:** ${formattedGrowth} кг/ед. (${clientData.growthPercentage.toFixed(1)}%)

        **Задача:**
        1.  Определи 2-3 ключевых фактора, которые могут способствовать росту.
        2.  Предложи 3-4 конкретных шага или тактики для РМ для реализации этого потенциала.
            Например: предложить новые продукты, провести обучение, запустить маркетинговую акцию и т.д.
        3.  Будь кратким и четким.
    `;
};


/**
 * Fetches AI-powered insights for a given client from the Gemini API via our proxy.
 * @param clientData - The data for the client to be analyzed.
 * @param onChunk - A callback function that receives streaming text chunks.
 * @param onError - A callback for handling errors.
 * @param signal - An AbortSignal to cancel the request.
 */
export const streamClientInsights = async (
    clientData: AggregatedDataRow,
    onChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    signal: AbortSignal
) => {
    try {
        const prompt = createClientInsightPrompt(clientData);

        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt }),
            signal, // Pass the abort signal to the fetch request
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Ошибка сервера: ${response.statusText}`);
        }

        if (!response.body) {
            throw new Error('Ответ не содержит тела.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            onChunk(decoder.decode(value, { stream: true }));
        }
    } catch (error) {
        if ((error as Error).name !== 'AbortError') {
             onError(error as Error);
        }
    }
};
