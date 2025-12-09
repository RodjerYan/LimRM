
import { AggregatedDataRow, RMMetrics } from "../types";

const PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL || '/api/gemini-proxy';

// ... (keep createClientInsightPrompt same) ...
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
 * Generates a prompt that utilizes Google Search Grounding to find real competitor data.
 * Updated to use specific date range if available.
 */
const createRMInsightPrompt = (metrics: RMMetrics, baseRate: number, dateRange?: string): string => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const nextYear = currentYear + 1;
    const todayStr = now.toLocaleDateString('ru-RU');

    // Context for search window: Use specific range if available, otherwise default to recent history.
    const searchContext = dateRange 
        ? `за период ${dateRange}` 
        : `за последние 6 месяцев ${currentYear} года`;

    return `
        Ты — Коммерческий Директор. Сегодня ${todayStr}.
        
        **ЗАДАЧА №1 (Поиск в Интернете):**
        Используй Google Search, чтобы найти актуальные новости и активность конкурентов в регионе, за который отвечает менеджер **${metrics.rmName}** (обычно это привязано к крупнейшим городам его территории, если название РМ не является географическим, ищи общие тренды по рынку кормов для животных в РФ).
        
        **КРИТИЧНО:** Ищи информацию строго **${searchContext}**.
        
        Найди информацию о:
        1. Активности сетей (Магнит, X5, Четыре Лапы, Бетховен) в регионах РФ.
        2. Изменениях спроса на корма (премиум/эконом) в указанный период.
        
        **ЗАДАЧА №2 (Обоснование Плана):**
        Обоснуй план продаж на ${nextYear} год.
        
        **Вводные данные:**
        - **РМ:** ${metrics.rmName}
        - **Факт:** ${new Intl.NumberFormat('ru-RU').format(metrics.totalFact)}
        - **Доля Рынка (покрытие):** ${metrics.marketShare.toFixed(1)}%
        - **Индивидуальный план:** ${metrics.recommendedGrowthPct.toFixed(1)}% (База компании: ${baseRate}%)

        **Структура ответа (Markdown):**
        1.  **Рыночный Контекст (${searchContext}):** Кратко опиши 1-2 найденных факта о конкурентах или рынке именно за этот период, которые влияют на территорию.
        2.  **Обоснование Цифры:** Объясни план ${metrics.recommendedGrowthPct.toFixed(1)}%, связывая его с долей рынка (${metrics.marketShare < 40 ? "низкая база - нужно расти агрессивно" : "высокая база - удерживаем позиции"}).
        3.  **Фокус:** Одна конкретная задача на ${nextYear}.

        Будь кратким, используй найденные данные.
    `;
};

// ... (keep createPackagingInsightPrompt same) ...
const createPackagingInsightPrompt = (
    packagingName: string, 
    skuList: string[], 
    fact: number, 
    plan: number, 
    growthPct: number,
    region: string
): string => {
    const nextYear = new Date().getFullYear() + 1;
    const formattedFact = new Intl.NumberFormat('ru-RU').format(fact);
    const formattedPlan = new Intl.NumberFormat('ru-RU').format(plan);
    const growthStr = growthPct > 0 ? `+${growthPct.toFixed(1)}%` : `${growthPct.toFixed(1)}%`;
    const skuStr = skuList.length > 0 ? skuList.join(', ') : 'SKU не указаны';

    return `
        Ты — Коммерческий Директор федеральной компании.
        Твоя задача: Дать профессиональное заключение и СЦЕНАРНЫЙ ПРОГНОЗ продаж по сегменту **${packagingName}** в регионе **${region}**.
        Тон: Деловой, аналитический, жесткий.

        **Вводные данные:**
        - **Сегмент:** ${packagingName}
        - **Ассортимент:** ${skuStr}
        - **Факт:** ${formattedFact} кг
        - **План на ${nextYear}:** ${formattedPlan} кг
        - **Целевой Рост:** ${growthStr}

        **Структура твоего ответа (Markdown):**
        
        ### 1. Вердикт
        (Краткая оценка: "Драйвер роста", "Стабильная база", "Проблемная зона" и т.д. Оцени реалистичность роста ${growthStr} с учетом объема.)

        ### 2. Сценарное моделирование ${nextYear}
        (Создай Markdown таблицу с тремя сценариями. Рассчитай цифры приблизительно на основе Факта.)
        | Сценарий | Прогноз (кг) | Описание условий |
        | :--- | :--- | :--- |
        | **Пессимистичный** | (Факт + 0-5%) | (Опиши риски: потеря ключевых SKU, активность конкурентов) |
        | **Реалистичный** | (Факт + ${growthPct}%) | (Текущий утвержденный план. Условие: выполнение задач по дистрибуции) |
        | **Оптимистичный** | (Факт + ${(growthPct * 1.5).toFixed(0)}%) | (Условие: ввод новинок, удачные акции, перехват клиентов) |

        ### 3. Фокусные задачи
        (Дай 3 конкретных шага по работе с SKU из списка выше для достижения "Оптимистичного" сценария).
    `;
};

// ... (streamClientInsights same) ...
export const streamClientInsights = async (
    clientData: AggregatedDataRow,
    onChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    signal: AbortSignal
) => {
    return streamResponse(createClientInsightPrompt(clientData), onChunk, onError, signal);
};

// Updated: Uses tools for search and passes dateRange
export const streamRMInsights = async (
    metrics: RMMetrics,
    baseRate: number,
    onChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    signal: AbortSignal,
    dateRange?: string // Optional date range
) => {
    // Request Google Search Tool
    const tools = [{ googleSearch: {} }];
    return streamResponse(createRMInsightPrompt(metrics, baseRate, dateRange), onChunk, onError, signal, tools);
};

// ... (streamPackagingInsights same) ...
export const streamPackagingInsights = async (
    packagingName: string,
    skuList: string[],
    fact: number,
    plan: number,
    growthPct: number,
    region: string,
    onChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    signal: AbortSignal
) => {
    const prompt = createPackagingInsightPrompt(packagingName, skuList, fact, plan, growthPct, region);
    return streamResponse(prompt, onChunk, onError, signal);
};

// Updated: Accepts tools argument
async function streamResponse(
    prompt: string,
    onChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    signal: AbortSignal,
    tools?: any[] // Optional tools array
) {
    try {
        const body: any = { prompt };
        if (tools) body.tools = tools;

        const response = await fetch(PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
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
