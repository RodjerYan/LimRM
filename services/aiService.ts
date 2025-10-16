import { AggregatedDataRow } from "../types";
import { formatLargeNumber } from "../utils/dataUtils";

// This service is now refactored to use the Google Gemini API via a proxy.
export async function* generateAiSummaryStream(data: AggregatedDataRow): AsyncGenerator<string> {
    // FIX: Use correctly typed `import.meta.env` now that the global types are fixed.
    const proxyUrl = import.meta.env.VITE_GEMINI_PROXY_URL;

    if (!proxyUrl) {
        yield "### Ошибка Конфигурации\n\nПрокси-сервер не настроен. Пожалуйста, установите переменную окружения `VITE_GEMINI_PROXY_URL` в настройках Vercel на значение `/api/gemini-proxy` и перезапустите развертывание.";
        return;
    }
    
    const fullUrl = `${proxyUrl}`;

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

    const requestBody = {
        contents: prompt,
        stream: true
    };

    try {
        const response = await fetch(fullUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let detailedError = "Неизвестная ошибка сервера.";
            let isApiKeyError = false;

            try {
                const errorJson = JSON.parse(errorText);
                const errorMessage = errorJson.error || '';
                detailedError = errorJson.details || errorMessage || errorText;
                if (typeof errorMessage === 'string' && errorMessage.includes('API key is not configured')) {
                    isApiKeyError = true;
                }
            } catch (e) {
                detailedError = errorText;
            }

            if (isApiKeyError) {
                yield `### 🚨 **Критическая Ошибка Конфигурации Сервера**\n\n` +
                      `**Проблема:** Ключ API для Google Gemini **не найден на сервере**.\n\n` +
                      `Это означает, что переменная окружения с именем \`API_KEY\` отсутствует или неверно настроена в вашем проекте на Vercel.\n\n` +
                      `--- \n` +
                      `#### 🔍 **Важное замечание (частая ошибка):** \n` +
                      `Пожалуйста, убедитесь, что вы создали переменную с именем ровно **\`API_KEY\`**, а не \`VITE_GEMINI_API_KEY\`. \n\n`+
                      `*   \`VITE_GEMINI_API_KEY\` — это **клиентская** переменная. Она нужна только для того, чтобы приложение запустилось. \n` +
                      `*   \`API_KEY\` — это **серверная** переменная. Именно она содержит сам ключ и используется для запросов к AI. **Именно её сейчас не хватает.**\n\n` +
                      `--- \n` +
                      `**Как исправить:**\n` +
                      `1.  Перейдите в настройки вашего проекта на **Vercel**.\n` +
                      `2.  Найдите раздел **Settings → Environment Variables**.\n` +
                      `3.  Создайте **новую** переменную с именем (Key) **\`API_KEY\`**.\n` +
                      `4.  В поле значения (Value) вставьте ваш ключ API от **Google Gemini**.\n` +
                      `5.  Убедитесь, что переменная доступна для всех окружений (Production, Preview, Development).\n` +
                      `6.  Сохраните и **перезапустите развертывание (Redeploy)**.\n\n` +
                      `*Эта функция не заработает, пока вы не выполните эти шаги.*`;
                return;
            }

            yield `### Ошибка API\n\nПрокси-сервер вернул ошибку от Google Gemini.\n**Статус:** ${response.status}\n**Ответ:** \`${detailedError}\``;
            return;
        }

        if (!response.body) {
            yield "### Ошибка\n\nОтвет от сервера не содержит данных для потоковой передачи.";
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            yield decoder.decode(value, { stream: true });
        }
        
        const finalChunk = decoder.decode();
        if (finalChunk) {
           yield finalChunk;
        }

    } catch (error) {
        console.error("Gemini fetch stream error:", error);
        let errorMessage = `### 🚨 Ошибка сети\n\nНе удалось подключиться к серверу аналитики (\`${proxyUrl}\`).\n\n` +
                           `Это критическая ошибка, которая обычно вызвана одной из двух причин:\n\n` +
                           `**1. Изменения не вступили в силу.**\n` +
                           `Если вы только что добавили или изменили переменные окружения (например, \`API_KEY\`) в настройках Vercel, вам **необходимо перезапустить развертывание (Redeploy)**.\n` +
                           `*Перейдите в ваш проект на Vercel → Deployments → выберите последнее развертывание и нажмите "Redeploy".*\n\n` +
                           `**2. Проблема с ключом API на стороне Google.**\n` +
                           `Даже если ключ скопирован верно, он может быть неактивен. Проверьте в [Google AI Studio](https://aistudio.google.com/app/apikey) или [Google Cloud Console](https://console.cloud.google.com/): \n` +
                           `*   Что ключ API **активен (enabled)**.\n` +
                           `*   Что для проекта **включен биллинг (billing)**, если это требуется.\n\n` +
                           `Пожалуйста, проверьте эти два пункта. После перезапуска развертывания проблема должна исчезнуть.`;

        if (error instanceof Error && !error.message.toLowerCase().includes('failed to fetch')) {
             errorMessage = `### Внутренняя ошибка\n\nПроизошла ошибка при обработке запроса: ${error.message}`;
        }
        yield errorMessage;
    }
};