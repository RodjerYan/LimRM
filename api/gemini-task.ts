import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// This is a simple in-memory store for demonstration purposes.
// WARNING: This is not suitable for production in a stateless serverless environment.
// A real-world application should use a persistent store like Vercel KV, Redis, or a database.
const tasks = new Map<string, { status: 'pending' | 'done' | 'error', result?: string, error?: string }>();

// Clean up old tasks to prevent memory leaks in a long-running dev server instance.
// In a true serverless environment, this is less of an issue as instances are short-lived.
setInterval(() => {
    // This is a naive cleanup. A better approach would be TTL on tasks.
    if (tasks.size > 100) {
        // Clear oldest 50 tasks
        const keys = Array.from(tasks.keys()).slice(0, 50);
        for (const key of keys) {
            tasks.delete(key);
        }
    }
}, 60 * 1000);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- CORS Headers ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // --- Preflight request ---
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // --- API Key Check ---
  if (!process.env.API_KEY) {
    console.error("API_KEY environment variable not set.");
    return res.status(500).json({ error: 'Сервер не настроен: отсутствует ключ API.' });
  }

  // --- Initialize Gemini Client ---
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // --- POST: Create a new analysis task ---
  if (req.method === 'POST') {
    try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Необходим параметр "prompt".' });
      }

      const taskId = crypto.randomUUID();
      tasks.set(taskId, { status: 'pending' });

      // Start the generation process but do not await it.
      // This allows us to return the taskId to the client immediately.
      (async () => {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', // As per guidelines for text tasks
            contents: prompt,
          });

          // Once done, update the task status with the result.
          tasks.set(taskId, { status: 'done', result: response.text });
        } catch (error) {
          console.error(`[Task ${taskId}] Gemini API error:`, error);
          const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка при вызове AI-модели.';
          tasks.set(taskId, { status: 'error', error: errorMessage });
        }
      })();
      
      return res.status(202).json({ taskId });

    } catch (error) {
      console.error('Error creating Gemini task:', error);
      return res.status(500).json({ error: 'Внутренняя ошибка сервера при создании задачи.' });
    }
  }

  // --- GET: Check the status of a task ---
  if (req.method === 'GET') {
    try {
      const { taskId } = req.query;
      if (!taskId || typeof taskId !== 'string') {
        return res.status(400).json({ error: 'Необходим параметр "taskId".' });
      }

      const task = tasks.get(taskId);

      if (!task) {
        return res.status(404).json({ error: 'Задача не найдена.' });
      }
      
      res.setHeader('Cache-Control', 'no-cache');
      return res.status(200).json(task);

    } catch (error) {
      console.error('Error fetching Gemini task status:', error);
      return res.status(500).json({ error: 'Внутренняя ошибка сервера при проверке статуса задачи.' });
    }
  }

  // --- Method not allowed ---
  return res.status(405).json({ error: 'Метод не разрешен.' });
}
