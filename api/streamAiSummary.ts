import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// 🎨 Цвета для консоли
const colors = {
  reset: "\x1b[0m", gray: "\x1b[90m", red: "\x1b[31m", 
  green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m",
  magenta: "\x1b[35m", cyan: "\x1b[36m", bold: "\x1b[1m"
};

// --- Получение и перемешивание ключей API ---
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

const shuffleArray = <T>(array: T[]): T[] => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// --- Основной обработчик API ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  
  if (req.method === 'POST') {
    const { contents, systemInstruction } = req.body;
    if (!contents || typeof contents !== 'string') {
        return res.status(400).json({ error: 'В теле запроса отсутствует или некорректно поле "contents"' });
    }
    if (!systemInstruction || typeof systemInstruction !== 'string') {
        return res.status(400).json({ error: 'В теле запроса отсутствует или некорректно поле "systemInstruction"' });
    }

    const apiKeys = shuffleArray(getApiKeys());
    if (apiKeys.length === 0) {
        return res.status(500).json({ error: 'Ключи API не настроены на сервере' });
    }

    console.log(`${colors.cyan}${colors.bold}🧠 Начинаю потоковую передачу AI-аналитики...${colors.reset}`);
    const startTime = Date.now();
    let lastError: any = null;
    let handled = false;

    for (const apiKey of apiKeys) {
        const shortKey = apiKey.slice(-6);
        try {
            const ai = new GoogleGenAI({ apiKey });
            const streamResponse = await ai.models.generateContentStream({
                model: 'gemini-2.5-flash',
                contents,
                config: {
                    systemInstruction,
                },
            });

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.status(200);

            for await (const chunk of streamResponse) {
                const text = chunk.text;
                if (text) {
                    res.write(text);
                }
            }
            
            res.end();
            const duration = Date.now() - startTime;
            console.log(`${colors.green}✅ Ключ ...${shortKey}${colors.reset} успешно завершил стрим за ${duration} мс`);
            handled = true;
            break;

        } catch (err: any) {
            lastError = err;
            const msg = (err.message || '').toLowerCase();
            if (msg.includes('429') || msg.includes('quota') || msg.includes('too many requests')) {
                console.warn(`${colors.yellow}⛔ Ключ ...${shortKey} исчерпал лимит. Переключаюсь...${colors.reset}`);
                continue;
            }
            console.error(`${colors.red}❌ Неперехватываемая ошибка (ключ ...${shortKey}):${colors.reset} ${err.message}`);
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
    return;
  }

  return res.status(405).json({ error: 'Метод не разрешен' });
}