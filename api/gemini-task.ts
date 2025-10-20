import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SALES_ANALYSIS_PROMPT } from '../prompts/salesPrompt';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не разрешён' });
  }

  const { csvData } = req.body;
  if (!csvData || typeof csvData !== 'string') {
    return res.status(400).json({ error: 'Не переданы данные CSV в поле "csvData"' });
  }

  const apiKeys = shuffleArray(getApiKeys());
  if (apiKeys.length === 0) {
    return res.status(500).json({ error: 'Ключи API не настроены' });
  }

  console.log(`${colors.cyan}${colors.bold}📈 Запрос на анализ продаж. Найдено ${apiKeys.length} ключ(ей).${colors.reset}`);
  
  // Ограничиваем объем данных для экономии токенов и ускорения ответа
  const csvLines = csvData.split('\n');
  const csvHeader = csvLines[0];
  const csvBody = csvLines.slice(1, 301).join('\n'); // Заголовок + 300 строк
  const truncatedCsvData = `${csvHeader}\n${csvBody}`;

  const fullPrompt = `${SALES_ANALYSIS_PROMPT}\n\nВот данные в формате CSV для анализа:\n---\n${truncatedCsvData}`;
  
  let lastError: any = null;
  for (const apiKey of apiKeys) {
      const shortKey = apiKey.slice(-6);
      try {
        const ai = new GoogleGenAI({ 
            apiKey
        });
        
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: fullPrompt,
          config: {
            responseMimeType: 'application/json',
          }
        });

        // FIX: Per @google/genai guidelines, response.text is a non-nullable getter.
        const text = response.text.trim();
        if (!text) throw new Error('Модель вернула пустой ответ');

        try {
            const json = JSON.parse(text);
            console.log(`${colors.green}✅ Ключ ...${shortKey} успешно выполнил анализ продаж.${colors.reset}`);
            return res.status(200).json(json);
        } catch (e) {
            console.error(`${colors.red}⚠️ Ошибка парсинга JSON от Gemini при ключе ...${shortKey}:${colors.reset}`, text);
            lastError = new Error('Ошибка парсинга JSON ответа модели');
            // Don't continue here, the model responded but the format is wrong. Retrying with another key won't help.
            break; 
        }

      } catch (err: any) {
        lastError = err;
        const msg = (err.message || '').toLowerCase();
        
        if (msg.includes('429') || msg.includes('quota') || msg.includes('too many requests')) {
            console.warn(`${colors.yellow}⛔ Ключ ...${shortKey} исчерпал лимит (ошибка квоты). Переключаюсь.${colors.reset}`);
            continue;
        }

        if (msg.includes('failed to fetch')) {
            console.warn(`${colors.yellow}🌐 Сетевая ошибка с ключом ...${shortKey}. Переключаюсь.${colors.reset}`);
            continue;
        }

        console.error(`${colors.red}❌ Неперехватываемая ошибка при ключе ...${shortKey}:${colors.reset} ${err.message}`);
        break;
      }
  }

  console.error(`${colors.red}${colors.bold}💥 Все ключи не сработали. Последняя ошибка:${colors.reset}`, lastError?.message);
  return res.status(500).json({
    error: 'Не удалось выполнить AI-анализ продаж',
    details: lastError?.message || 'Неизвестная ошибка.',
  });
}