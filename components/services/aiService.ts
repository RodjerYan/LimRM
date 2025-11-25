
import { AggregatedDataRow, MapPoint, RMMetrics } from "../../types";

// The proxy URL should be configured in one place, but for simplicity, we define it here.
const PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL || '/api/gemini-proxy';

/**
 * Generates a prompt for Gemini based on a client's data (individual or grouped).
 * @param clientData - The data for the client/group.
 * @returns A string prompt for the AI.
 */
const createClientInsightPrompt = (clientData: AggregatedDataRow): string => {
    const formattedFact = new Intl.NumberFormat('ru-RU').format(clientData.fact);
    const formattedPotential = new Intl.NumberFormat('ru-RU').format(clientData.potential);
    const formattedGrowth = new Intl.NumberFormat('ru-RU').format(clientData.growthPotential);

    const isGroup = !!clientData.clients && clientData.clients.length > 1;
    const subject = isGroup ? 'группе клиентов' : 'клиенту';
    const subjectDataHeader = isGroup ? 'Данные о группе' : 'Данные о клиенте';
    const clientIdentifier = isGroup ? 'Группа' : 'Клиент';
    const clientName = isGroup ? `${clientData.clientName} (РМ: ${clientData.rm})` : clientData.clientName;
    
    const clientListInfo = isGroup && clientData.clients
    ? `\n        - **Клиенты в группе (${clientData.clients.length} ТТ). Примеры:**\n${clientData.clients.slice(0, 5).map(c => `          - ${c.address.trim()}`).join('\n')}`
    : '';

    return `
        Проанализируй данные по ${subject} и дай краткие, действенные рекомендации по увеличению продаж.
        Отвечай на русском языке. Ответ должен быть в формате Markdown, без заголовков.
        Используй списки для перечисления рекомендаций.

        **${subjectDataHeader}:**
        - **${clientIdentifier}:** ${clientName}
        - **Город:** ${clientData.city}
        - **Бренд:** ${clientData.brand}
        - **Региональный менеджер (РМ):** ${clientData.rm}
        - **Текущие продажи (Факт):** ${formattedFact} кг/ед.
        - **Общий потенциал рынка:** ${formattedPotential} кг/ед.
        - **Потенциал роста:** ${formattedGrowth} кг/ед. (${clientData.growthPercentage.toFixed(1)}%)
        ${clientListInfo}

        **Задача:**
        1.  Определи 2-3 ключевых фактора, которые могут способствовать росту для этой ${isGroup ? 'группы' : 'ТТ'}.
        2.  Предложи 3-4 конкретных шага или тактики для РМ для реализации этого потенциала.
            Например: предложить новые продукты, провести обучение, запустить маркетинговую акцию и т.д.
        3.  Будь кратким и четким.
    `;
};

/**
 * Generates a prompt to justify the calculated sales plan for an RM.
 */
const createRMInsightPrompt = (metrics: RMMetrics, baseRate: number): string => {
    // Determine current time context dynamically
    const now = new Date();
    const currentYear = now.getFullYear();
    const nextYear = currentYear + 1;
    const todayStr = now.toLocaleDateString('ru-RU');

    const share = metrics.marketShare.toFixed(1);
    const plan = metrics.recommendedGrowthPct.toFixed(1);
    const fact = new Intl.NumberFormat('ru-RU').format(metrics.totalFact);
    const potential = new Intl.NumberFormat('ru-RU').format(metrics.totalPotential);
    const nextPlan = new Intl.NumberFormat('ru-RU').format(metrics.nextYearPlan);

    return `
        Ты — Коммерческий Директор. Сегодня ${todayStr}.
        Твоя задача — обосновать индивидуальный план продаж на ${nextYear} год для Регионального Менеджера (РМ).
        РМ может быть недоволен цифрой, поэтому нужно четко и аргументированно объяснить, почему выставлен именно такой процент.

        **Вводные данные:**
        - **РМ:** ${metrics.rmName}
        - **Факт ${currentYear}:** ${fact}
        - **Общий Потенциал территории:** ${potential}
        - **Текущая Доля Рынка (Насыщенность):** ${share}%
        - **Базовая ставка повышения для всех:** ${baseRate}%
        - **Индивидуальный план (рассчитанный):** ${plan}%
        - **План в цифрах на ${nextYear}:** ${nextPlan}

        **Логика расчета ("Умное планирование"):**
        1. Если Доля Рынка низкая (< 35-40%), значит территория пустая. Мы требуем рост ВЫШЕ базового (${baseRate}%), так как расти с нуля легко.
        2. Если Доля Рынка высокая (> 45%), значит территория насыщена. Расти на ${baseRate}% нереально без демпинга. Мы СНИЖАЕМ план, чтобы он был выполнимым.
        3. Если Доля Рынка средняя (~40%), план близок к базовому.

        **Твоя задача:**
        Напиши короткое, структурированное обоснование для РМ (на русском языке, Markdown).
        
        **Структура ответа:**
        1.  **Анализ ситуации:** Оцени текущую долю рынка (${share}%). Это много (потолок) или мало (голубой океан)?
        2.  **Обоснование цифры:** Объясни, почему план именно ${plan}% (выше или ниже базового). Используй фразы вроде "С учетом низкой базы..." или "Учитывая высокую насыщенность...".
        3.  **Резюме:** Мотивирующая фраза. Например: "План амбициозный, но с твоим потенциалом реальный" или "План консервативный, задача — удержать позиции".

        Будь убедителен, краток и профессионален. Не используй сложные формулы, объясняй суть.
        Обязательно используй актуальные годы (${currentYear} -> ${nextYear}) в ответе.
    `;
};


/**
 * Fetches AI-powered insights for a given client from the Gemini API via our proxy.
 */
export const streamClientInsights = async (
    clientData: AggregatedDataRow,
    onChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    signal: AbortSignal
) => {
    return streamResponse(createClientInsightPrompt(clientData), onChunk, onError, signal);
};

/**
 * Fetches AI justification for an RM's sales plan.
 */
export const streamRMInsights = async (
    metrics: RMMetrics,
    baseRate: number,
    onChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    signal: AbortSignal
) => {
    return streamResponse(createRMInsightPrompt(metrics, baseRate), onChunk, onError, signal);
};

/**
 * Shared helper to call the proxy
 */
async function streamResponse(
    prompt: string,
    onChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    signal: AbortSignal
) {
    try {
        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
            signal,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Ошибка сервера: ${response.statusText}`);
        }

        if (!response.body) throw new Error('Ответ не содержит тела.');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            onChunk(decoder.decode(value, { stream: true }));
        }
    } catch (error) {
        if ((error as Error).name !== 'AbortError') {
             onError(error as Error);
        }
    }
}