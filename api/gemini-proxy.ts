import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// 🎨 Цвета для консоли
const colors = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m"
};

// --- Получение ключей API ---
const getApiKeys = (): string[] => {
  const keys: string[] = [];
  if (process.env.API_KEY) keys.push(process.env.API_KEY);
  let i = 2;
  while (process.env[`API_KEY_${i}`]) {
    keys.push(process.env[`API_KEY_${i}`]!);
    i++;
  }
  return keys;
};

// --- Перемешивание массива (Фишер-Йейтс) ---
const shuffleArray = <T>(array: T[]): T[] => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// --- Основной обработчик ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- Прямая обработка CORS для надежности ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Метод не разрешён' });
    return;
  }

  const { contents, config } = req.body;
  if (!contents) {
    res.status(400).json({ error: 'Не указано поле "contents" в теле запроса' });
    return;
  }

  const apiKeys = shuffleArray(getApiKeys());
  if (apiKeys.length === 0) {
    res.status(500).json({ error: 'Ключи API не настроены' });
    return;
  }

  console.log(`${colors.cyan}${colors.bold}🧠 Найдено ${apiKeys.length} ключ(ей) Gemini. Начинаю обработку...${colors.reset}`);
  const startTime = Date.now();

  let lastError: any = null;
  let handled = false;
  let attempts = 0;

  for (const apiKey of apiKeys) {
    attempts++;
    const shortKey = apiKey.slice(-6);
    console.log(`${colors.blue}🚀 Попытка #${attempts}${colors.reset} — ${colors.gray}ключ ...${shortKey}${colors.reset}`);

    try {
      const ai = new GoogleGenAI({ 
        apiKey
      });
      const isJsonRequest = config?.responseMimeType === 'application/json';

      // Для стабильности на Vercel, всегда получаем полный ответ от Gemini, избегая прямого стриминга клиенту.
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config,
      });

      const text = response.text?.trim();
      if (!text) throw new Error('Пустой ответ модели');
      
      const duration = Date.now() - startTime;

      if (isJsonRequest) {
        try {
          const json = JSON.parse(text);
          console.log(`${colors.green}✅ Ключ ...${shortKey}${colors.reset} успешно выполнил JSON-запрос за ${duration} мс`);
          res.status(200).json(json);
        } catch (e) {
          console.error(`${colors.red}⚠️ Ошибка парсинга JSON при ключе ...${shortKey}:${colors.reset}`, e);
          res.status(500).json({ error: 'Ошибка парсинга JSON', raw: text });
        }
      } else {
        // Для текстовых запросов, отправляем полный текст. Клиент симулирует стрим.
        console.log(`${colors.green}✅ Ключ ...${shortKey}${colors.reset} выполнил текстовый запрос за ${duration} мс`);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.status(200).send(text);
      }
      
      handled = true;
      break;

    } catch (err: any) {
      lastError = err;
      const msg = (err.message || '').toLowerCase();

      if (
        msg.includes('429') ||
        msg.includes('resource_exhausted') ||
        msg.includes('quota') ||
        msg.includes('too many requests')
      ) {
         console.warn(`${colors.yellow}⛔ Ключ ...${shortKey} исчерпал лимит (ошибка квоты). Переключаюсь на следующий.${colors.reset}`);
         continue;
      }
      
      if (
        msg.includes('failed to fetch') ||
        msg.includes('connection')
      ) {
        console.warn(`${colors.yellow}🌐 Сетевая ошибка с ключом ...${shortKey}. Пробую следующий. (Детали: ${err.message})${colors.reset}`);
        continue;
      }

      console.error(`${colors.red}❌ Неперехватываемая ошибка при ключе ...${shortKey}:${colors.reset} ${err.message}`);
      break;
    }
  }

  if (!handled && !res.headersSent) {
    console.error(`${colors.red}${colors.bold}💥 Все ключи не сработали. Последняя ошибка:${colors.reset}`, lastError?.message);
    res.status(500).json({
      error: 'Не удалось выполнить запрос к Gemini API',
      details: lastError?.message || 'Неизвестная ошибка.',
    });
  }

  if (handled) {
    const totalTime = Date.now() - startTime;
    console.log(`${colors.magenta}⏱️ Всего времени: ${totalTime} мс (${attempts} попыток).${colors.reset}`);
  }
}