import { AggregatedDataRow, GeminiAnalysisResult } from "../types";
import { formatLargeNumber } from "../utils/dataUtils";

/**
 * Generates an AI-powered summary for a given data row by making a direct,
 * synchronous-like call to a stateless proxy. This approach is reliable for
 * serverless environments like Vercel.
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

    try {
        const response = await fetch('/api/gemini-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: prompt }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Сервер ответил со статусом ${response.status}` }));
            throw new Error(errorData.error || errorData.details || `HTTP ошибка: ${response.status}`);
        }

        const fullText = await response.text();

        // Simulate a "typing" effect on the client side for a better user experience,
        // even though we received the full response at once.
        const chunkSize = 15;
        for (let i = 0; i < fullText.length; i += chunkSize) {
            yield fullText.substring(i, i + chunkSize);
            await new Promise(r => setTimeout(r, 20)); // Small delay for typing effect
        }
    } catch (error: any) {
        console.error("AI summary generation failed:", error);
        yield `### Ошибка AI-Аналитика\n\nНе удалось получить результат анализа. Ошибка: ${error.message}`;
    }
}


/**
 * Sends raw CSV data to the backend for a full sales analysis by Gemini.
 * @param csvData The raw string content of the uploaded CSV file.
 * @returns A promise that resolves to the structured Gemini analysis result.
 */
export async function getGeminiSalesAnalysis(csvData: string): Promise<GeminiAnalysisResult> {
    const response = await fetch('/api/gemini-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvData }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
            error: `Сервер анализа продаж ответил со статусом ${response.status}` 
        }));
        throw new Error(errorData.error || errorData.details || 'Неизвестная ошибка от сервера анализа');
    }

    return response.json();
}

/**
 * Generates a conversational AI response based on a user prompt and current data context.
 * @param userPrompt The user's question.
 * @param dataContext The currently filtered data from the main table.
 * @returns An async generator that yields the response text in chunks.
 */
export async function* getAiChatResponseStream(userPrompt: string, dataContext: AggregatedDataRow[]): AsyncGenerator<string> {
    if (dataContext.length === 0) {
        yield "Нет данных для анализа. Пожалуйста, сначала загрузите файл и убедитесь, что фильтры не пусты.";
        return;
    }

    // Convert data to a simplified CSV string to use as context
    const headers = "РМ,Бренд,Регион,Факт (кг),Новый План (кг),Рост (кг),Рост (%)\n";
    const csvContext = dataContext.slice(0, 100).map(d => { // Limit to 100 rows to save tokens
        const growthPotential = (d.newPlan || d.fact) - d.fact;
        const growthRate = d.fact > 0 ? (growthPotential / d.fact) * 100 : 0;
        return [
            `"${d.rm}"`,
            `"${d.brand}"`,
            `"${d.city}"`,
            d.fact.toFixed(1),
            (d.newPlan || 0).toFixed(1),
            growthPotential.toFixed(1),
            growthRate.toFixed(1)
        ].join(',');
    }).join('\n');

    const fullPrompt = `
    Ты — AI-ассистент-аналитик в компании Limkorm. Тебе предоставлен срез данных о продажах.
    Твоя задача — кратко и по делу отвечать на вопросы пользователя, основываясь **только на предоставленных данных**.
    
    Правила:
    - Будь кратким и четким.
    - Не придумывай данные, которых нет в таблице.
    - Если вопрос нельзя beantworten на основе данных, вежливо сообщи об этом.
    - Ответ должен быть на русском языке.

    Вот данные (в формате CSV):
    ---
    ${headers}${csvContext}
    ---

    Вопрос пользователя: "${userPrompt}"
    `;

    try {
        const response = await fetch('/api/gemini-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: fullPrompt }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Ошибка сервера" }));
            throw new Error(errorData.error || errorData.details);
        }

        const fullText = await response.text();
        const chunkSize = 10;
        for (let i = 0; i < fullText.length; i += chunkSize) {
            yield fullText.substring(i, i + chunkSize);
            await new Promise(r => setTimeout(r, 15));
        }
    } catch (error: any) {
        console.error("AI chat failed:", error);
        yield `Произошла ошибка при обращении к AI: ${error.message}`;
    }
}