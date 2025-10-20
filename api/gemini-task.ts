import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';

// --- Простое "in-memory" хранилище для статусов задач ---
// ВНИМАНИЕ: Это подходит только для демонстрационных целей.
// В реальном продакшене следует использовать персистентное хранилище (Redis, Vercel KV, DB).
const tasks = new Map<string, { status: 'pending' | 'done' | 'error', result?: string, error?: string }>();

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
            // FIX: Using correct generateContent call as per guidelines
            const response: GenerateContentResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });
            
            // FIX: Using response.text to extract text as per guidelines
            const text = response.text;
            if (!text || text.trim() === '') throw new Error('Модель вернула пустой ответ.');

            return text; // Успех

        } catch (err: any) {
            lastError = err;
            const msg = (err.message || '').toLowerCase();
            // Если ошибка связана с квотой, пробуем следующий ключ
            if (msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota')) {
                console.warn(`Ключ ...${apiKey.slice(-4)} исчерпал лимит, пробую следующий.`);
                continue;
            }
            // Для других ошибок прекращаем попытки
            console.error(`Неперехватываемая ошибка с ключом ...${apiKey.slice(-4)}: ${err.message}`);
            break;
        }
    }

    // Если все ключи не сработали
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
    if (typeof taskId !== 'string' || !tasks.has(taskId)) {
        return res.status(404).json({ error: 'Задача не найдена.' });
    }
    const task = tasks.get(taskId);
    return res.status(200).json(task);
  }

  // --- POST: Создание новой задачи ---
  if (req.method === 'POST') {
    const { prompt } = req.body;
    if (!prompt) {
        return res.status(400).json({ error: 'Не указано поле "prompt".' });
    }

    const taskId = randomUUID();
    tasks.set(taskId, { status: 'pending' });

    // Запускаем асинхронную задачу без `await`
    runGeminiTask(prompt)
        .then(result => {
            tasks.set(taskId, { status: 'done', result });
        })
        .catch(error => {
            tasks.set(taskId, { status: 'error', error: error.message || 'Неизвестная ошибка выполнения задачи.' });
        })
        .finally(() => {
            // Очищаем старые задачи, чтобы избежать утечки памяти
            setTimeout(() => tasks.delete(taskId), 5 * 60 * 1000); // Удаляем через 5 минут
        });

    return res.status(202).json({ taskId });
  }

  // --- Метод не поддерживается ---
  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).json({ error: `Метод ${req.method} не разрешен.` });
}
