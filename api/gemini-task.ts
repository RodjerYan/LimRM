import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { nanoid } from 'nanoid';

// 🎨 Цвета для консоли
const colors = {
  reset: "\x1b[0m", gray: "\x1b[90m", red: "\x1b[31m", 
  green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m",
  magenta: "\x1b[35m", cyan: "\x1b[36m", bold: "\x1b[1m"
};

interface Task {
  id: string;
  prompt: string;
  status: 'pending' | 'done' | 'error';
  result?: string;
  error?: string;
  createdAt: number;
}

// -----------------------------------------------------------------------------
// ВНИМАНИЕ: Хранилище задач в памяти.
// Это простое решение для демонстрации. В продакшене задачи будут теряться
// при перезапуске serverless-функции. Для настоящих приложений используйте
// Vercel KV, Redis, Firestore или другую персистентную базу данных.
// -----------------------------------------------------------------------------
const tasks = new Map<string, Task>();

// --- Получение и перемешивание ключей API (скопировано из gemini-proxy.ts) ---
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

// --- Фоновая обработка задачи ---
async function processTask(taskId: string) {
    const task = tasks.get(taskId);
    if (!task) return;

    const apiKeys = shuffleArray(getApiKeys());
    if (apiKeys.length === 0) {
        tasks.set(taskId, { ...task, status: 'error', error: 'Ключи API не настроены на сервере' });
        return;
    }

    let lastError: any = null;

    for (const apiKey of apiKeys) {
        try {
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: task.prompt,
            });

            const text = response.text?.trim();
            if (!text) throw new Error('Модель вернула пустой ответ');

            tasks.set(taskId, { ...task, status: 'done', result: text });
            return; // Успешно, выходим

        } catch (err: any) {
            lastError = err;
            const msg = (err.message || '').toLowerCase();
            if (msg.includes('429') || msg.includes('quota') || msg.includes('too many requests')) {
                // Если лимит исчерпан, просто пробуем следующий ключ
                continue;
            }
            // Для других ошибок прекращаем попытки
            break; 
        }
    }

    // Если все ключи не сработали
    const errorMessage = lastError?.message || 'Неизвестная ошибка при запросе к Gemini API.';
    tasks.set(taskId, { ...task, status: 'error', error: errorMessage });
}

// --- Основной обработчик API ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS заголовки
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // POST /api/gemini-task -> Создать задачу
  if (req.method === 'POST') {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'В теле запроса отсутствует поле "prompt"' });
    }

    const taskId = nanoid(10);
    const newTask: Task = {
      id: taskId,
      prompt,
      status: 'pending',
      createdAt: Date.now(),
    };
    tasks.set(taskId, newTask);

    // Запускаем обработку асинхронно, не дожидаясь ее завершения
    processTask(taskId);

    console.log(`${colors.cyan}✨ Новая задача создана:${colors.reset} ${taskId}`);
    return res.status(202).json({ taskId }); // 202 Accepted
  }

  // GET /api/gemini-task?taskId=... -> Проверить статус
  if (req.method === 'GET') {
    const { taskId } = req.query;

    if (!taskId || typeof taskId !== 'string') {
      return res.status(400).json({ error: 'Необходим параметр "taskId"' });
    }

    const task = tasks.get(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Задача не найдена' });
    }
    
    // Возвращаем только публичные данные, не сам промпт
    const { prompt: _, ...publicTaskData } = task;
    return res.status(200).json(publicTaskData);
  }

  return res.status(405).json({ error: 'Метод не разрешен' });
}

// Простая очистка старых задач, чтобы избежать утечки памяти
setInterval(() => {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    for (const [key, task] of tasks.entries()) {
        if (now - task.createdAt > tenMinutes) {
            tasks.delete(key);
            console.log(`${colors.gray}🗑️ Очищена старая задача:${colors.reset} ${key}`);
        }
    }
}, 60 * 1000);
