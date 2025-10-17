import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { nanoid } from 'nanoid';

// 🎨 Цвета для консоли
const colors = {
  reset: "\x1b[0m", gray: "\x1b[90m", red: "\x1b[31m", 
  green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m",
  magenta: "\x1b[35m", cyan: "\x1b[36m", bold: "\x1b[1m"
};

// --- Типы и хранилище задач ---
interface AiTask {
    id: string;
    status: 'pending' | 'done' | 'error';
    resultText: string;
    error?: string;
    createdAt: number;
}
const tasks = new Map<string, AiTask>();

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

// --- Фоновая обработка задачи Gemini ---
async function processGeminiTask(taskId: string, prompt: string) {
    const task = tasks.get(taskId);
    if (!task) return;

    const apiKeys = shuffleArray(getApiKeys());
    if (apiKeys.length === 0) {
        tasks.set(taskId, { ...task, status: 'error', error: 'Ключи API не настроены на сервере' });
        return;
    }

    let lastError: any = null;
    let handled = false;

    for (const apiKey of apiKeys) {
        try {
            const shortKey = apiKey.slice(-6);
            console.log(`${colors.blue}🤖 Запуск стрима для задачи ${taskId} с ключом ...${shortKey}${colors.reset}`);
            
            const ai = new GoogleGenAI({ apiKey });
            const streamResponse = await ai.models.generateContentStream({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            for await (const chunk of streamResponse) {
                const text = chunk.text;
                if (text) {
                    const currentTask = tasks.get(taskId);
                    if (currentTask) {
                        currentTask.resultText += text;
                    }
                }
            }
            
            const finalTask = tasks.get(taskId);
            if(finalTask) {
                finalTask.status = 'done';
            }
            console.log(`${colors.green}✅ Стрим для задачи ${taskId} (ключ ...${shortKey}) завершен.${colors.reset}`);
            handled = true;
            break; 

        } catch (err: any) {
            lastError = err;
            const msg = (err.message || '').toLowerCase();
            const shortKey = apiKey.slice(-6);

            if (msg.includes('429') || msg.includes('quota') || msg.includes('too many requests')) {
                console.warn(`${colors.yellow}⛔ Ключ ...${shortKey} для задачи ${taskId} исчерпал лимит.${colors.reset}`);
                continue;
            }
            
            console.error(`${colors.red}❌ Ошибка стрима для задачи ${taskId} (ключ ...${shortKey}):${colors.reset} ${err.message}`);
            break; 
        }
    }

    if (!handled) {
        const finalTask = tasks.get(taskId);
        if(finalTask) {
            finalTask.status = 'error';
            finalTask.error = lastError?.message || 'Не удалось выполнить запрос к Gemini API после нескольких попыток.';
        }
        console.error(`${colors.red}${colors.bold}💥 Все ключи для задачи ${taskId} не сработали.${colors.reset}`);
    }
}

// --- Основной обработчик API ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // POST: Создать новую задачу
  if (req.method === 'POST') {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'В теле запроса отсутствует поле "prompt"' });

    const taskId = nanoid(12);
    const newTask: AiTask = {
      id: taskId,
      status: 'pending',
      resultText: '',
      createdAt: Date.now(),
    };
    tasks.set(taskId, newTask);

    // Запускаем обработку в фоне, НЕ ожидая ее завершения
    processGeminiTask(taskId, prompt);

    console.log(`${colors.cyan}✨ Новая задача Gemini создана:${colors.reset} ${taskId}`);
    return res.status(202).json({ taskId });
  }

  // GET: Получить статус задачи
  if (req.method === 'GET') {
    const { taskId } = req.query;
    if (!taskId || typeof taskId !== 'string') return res.status(400).json({ error: 'Отсутствует параметр "taskId"' });

    const task = tasks.get(taskId);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });

    return res.status(200).json({
      status: task.status,
      resultText: task.resultText,
      error: task.error,
    });
  }

  return res.status(405).json({ error: 'Метод не разрешен' });
}


// --- Очистка старых задач ---
setInterval(() => {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    for (const [key, task] of tasks.entries()) {
        if (now - task.createdAt > tenMinutes) {
            tasks.delete(key);
            console.log(`${colors.gray}🗑️ Очищена старая задача Gemini:${colors.reset} ${key}`);
        }
    }
}, 60 * 1000);
