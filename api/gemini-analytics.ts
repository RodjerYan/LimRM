import { GoogleGenAI, GenerateContentResponse, Type } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// --- Получение и перемешивание ключей API ---
const getApiKeys = (): string[] => {
  const keys: string[] = [];
  // Основной ключ из переменной, используемой в остальном приложении
  if (process.env.API_KEY) keys.push(process.env.API_KEY);
  
  let i = 2;
  while (process.env[`API_KEY_${i}`]) {
    keys.push(process.env[`API_KEY_${i}`]!);
    i++;
  }
  return keys;
};

const shuffleArray = <T>(array: T[]): T[] => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// --- Схема для структурированного ответа от Gemini ---
const responseSchema = {
    type: Type.OBJECT,
    properties: {
        summary: {
            type: Type.STRING,
            description: "Краткий вывод по общим показателям продаж на 1-2 предложения (например, 'Продажи выросли на 12% за квартал, основной драйвер - регион Москва.'). Ответ должен быть на русском языке."
        },
        insights: {
            type: Type.ARRAY,
            description: "Список (массив) из 2-4 ключевых наблюдений или инсайтов по данным. Каждый инсайт - это строка. Например, 'РМ Иванов демонстрирует рост 18% по бренду LimKorm Premium.'. Ответ должен быть на русском языке.",
            items: { type: Type.STRING }
        },
        forecasts: {
            type: Type.ARRAY,
            description: "Список (массив) из 1-3 прогнозов на будущий период (квартал/месяц). Каждый прогноз - это строка. Например, 'Ожидаемый рост в следующем квартале: +9%.'. Ответ должен быть на русском языке.",
            items: { type: Type.STRING }
        }
    },
    required: ['summary', 'insights', 'forecasts']
};


export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не разрешён' });
  }

  const { tableData, whatIfPrompt } = req.body;
  if (!tableData || !Array.isArray(tableData) || tableData.length === 0) {
      return res.status(400).json({ error: 'Необходимо передать непустой массив "tableData".' });
  }

  // Упрощаем данные для экономии токенов
  const simplifiedData = tableData.map((row: any) => ({
      rm: row.rm, city: row.city, brand: row.brand,
      fact: row.fact, potential: row.potential
  }));

  const basePrompt = `
      Ты — ведущий AI-аналитик в компании Limkorm. Проанализируй предоставленные данные о продажах.
      Твоя задача — выявить ключевые тренды, аномалии, точки роста и составить краткий, но содержательный аналитический отчет.
      Сфокусируйся на:
      1.  Общей картине: Есть ли общий рост или спад? Что является главным драйвером?
      2.  Лидерах и отстающих: Какие РМ, регионы или бренды показывают наилучшую динамику?
      3.  Скрытых возможностях: Где самый большой нереализованный потенциал?
      4.  Прогнозах: Какие можно сделать краткосрочные прогнозы?
      ${whatIfPrompt ? `\nОсобое внимание удели сценарию: "${whatIfPrompt}"\n` : ''}
      Предоставь ответ СТРОГО в формате JSON, соответствующем указанной схеме. Не добавляй никаких пояснений или \`\`\`json\`\`\` оберток. Ответ должен быть на русском языке.
      Данные для анализа (в кг/ед):
      ${JSON.stringify(simplifiedData.slice(0, 500))}
  `;

  const apiKeys = shuffleArray(getApiKeys());
  if (apiKeys.length === 0) {
    return res.status(500).json({ error: 'Ключи API не настроены на сервере.' });
  }
  
  let lastError: any = null;

  for (const apiKey of apiKeys) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: basePrompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema,
        },
      });
      
      const text = response.text;
      if (!text || text.trim() === '') throw new Error('Пустой ответ модели');
      
      const json = JSON.parse(text);
      return res.status(200).json(json);

    } catch (err: any) {
      lastError = err;
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('429') || msg.includes('quota')) {
        continue; // Попробуем следующий ключ
      }
      break; // Неперехватываемая ошибка, прекращаем
    }
  }

  res.status(500).json({
    error: 'Не удалось выполнить запрос к Gemini API для аналитики.',
    details: lastError?.message || 'Неизвестная ошибка.',
  });
}