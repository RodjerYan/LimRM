import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { kv } from '@vercel/kv';

// --- Хранилище задач теперь работает на Vercel KV ---
// Это персистентное хранилище, которое гарантирует сохранность
// статуса задач между вызовами serverless-функций.

interface Task {
  status: 'pending' | 'done' | 'error';
  result?: string;
  error?: string;
}

// --- Получение ключей API (аналогично gemini-proxy) ---
const getApiKeys = (): string[] => {
  const keys: string[] = [];
  if (process.env.API_KEY) keys.push(process.env.API_KEY);
  let i = 2;
  while (process.env[`API_KEY_${i}`]) {
    keys.push(process.env[`API_KEY_${i}`]!);
    i++;
  }
  return keys.filter(Boolean);
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

// --- Асинхронное выполнение запроса к Gemini ---
const runGeminiTask = async (prompt: string) => {
    const apiKeys = shuffleArray(getApiKeys());
    if (apiKeys.length === 0) {
        throw new Error('Ключи API не настроены на сервере.');
    }

    let lastError: any = null;

    for (const apiKey of apiKeys) {
        try {
            const ai = new GoogleGenAI({ apiKey });
            const response: GenerateContentResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });
            
            const text = response.text;
            if (!text || text.trim() === '') throw new Error('Модель вернула пустой ответ.');

            return text; // Успех

        } catch (err: any) {
            lastError = err;
            const msg = (err.message || '').toLowerCase();
            if (msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota')) {
                console.warn(`Ключ ...${apiKey.slice(-4)} исчерпал лимит, пробую следующий.`);
                continue;
            }
            console.error(`Неперехватываемая ошибка с ключом ...${apiKey.slice(-4)}: ${err.message}`);
            break;
        }
    }
    throw lastError || new Error('Не удалось выполнить запрос ко всем доступным ключам Gemini API.');
};


export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- CORS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // --- GET: Проверка статуса задачи ---
  if (req.method === 'GET') {
    const { taskId } = req.query;
    if (typeof taskId !== 'string') {
        return res.status(400).json({ error: 'Некорректный taskId.' });
    }
    const task: Task | null = await kv.get(taskId);
    if (!task) {
        return res.status(404).json({ error: 'Задача не найдена или срок ее хранения истек.' });
    }
    return res.status(200).json(task);
  }

  // --- POST: Создание новой задачи ---
  if (req.method === 'POST') {
    const { prompt } = req.body;
    if (!prompt) {
        return res.status(400).json({ error: 'Не указано поле "prompt".' });
    }

    const taskId = randomUUID();
    // Устанавливаем начальный статус с временем жизни 5 минут
    await kv.set(taskId, { status: 'pending' }, { ex: 300 });

    // Запускаем асинхронную задачу без `await`
    runGeminiTask(prompt)
        .then(result => {
            // Обновляем задачу с результатом и тем же временем жизни
            kv.set(taskId, { status: 'done', result }, { ex: 300 });
        })
        .catch(error => {
            // Обновляем задачу с ошибкой
            kv.set(taskId, { status: 'error', error: error.message || 'Неизвестная ошибка выполнения задачи.' }, { ex: 300 });
        });

    return res.status(202).json({ taskId });
  }

  // --- Метод не поддерживается ---
  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).json({ error: `Метод ${req.method} не разрешен.` });
}