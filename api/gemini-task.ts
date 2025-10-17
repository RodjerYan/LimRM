import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { nanoid } from 'nanoid';

interface Task {
  id: string;
  status: 'pending' | 'done' | 'error';
  result?: { text: string };
  error?: string;
}

// NOTE: This in-memory store is not suitable for production environments with multiple
// serverless instances. It will lose state on cold starts. For production, replace
// this with a persistent store like Vercel KV, Redis, or Firestore.
const tasks: Record<string, Task> = {};


// --- Helper to get all available API keys from environment variables ---
function getApiKeys(): string[] {
    const keys = [process.env.API_KEY];
    let i = 2;
    while (process.env[`API_KEY_${i}`]) {
        keys.push(process.env[`API_KEY_${i}`]);
        i++;
    }
    return keys.filter((key): key is string => typeof key === 'string' && key.startsWith('AIza'));
}

// --- Helper to shuffle an array ---
function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}


// This function runs in the background after the initial response is sent.
async function processTask(taskId: string, model: string, contents: any, config: any) {
    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) {
        tasks[taskId].status = 'error';
        tasks[taskId].error = 'API keys not configured on the server.';
        return;
    }

    const shuffledKeys = shuffleArray(apiKeys);
    let lastError: any = null;

    for (const apiKey of shuffledKeys) {
        try {
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({ model, contents, config });

            console.info(`✅ Task ${taskId}: Successfully used API key ...${apiKey.slice(-4)}`);
            tasks[taskId].status = 'done';
            tasks[taskId].result = { text: response.text };
            return; // Success, exit function

        } catch (error: any) {
            console.warn(`Task ${taskId}: API key ...${apiKey.slice(-4)} failed.`);
            lastError = error;
            const errorMessage = error.message?.toLowerCase() || '';

            if (errorMessage.includes('quota') || errorMessage.includes('resource_exhausted') || errorMessage.includes('too many requests')) {
                console.warn(`Quota exceeded for key ...${apiKey.slice(-4)}. Trying next key.`);
                continue;
            }
             if (errorMessage.includes('failed to fetch') || errorMessage.includes('network')) {
                console.warn(`Network error with key ...${apiKey.slice(-4)}, trying next.`);
                continue;
            }
            break; // Non-retriable error, break the loop
        }
    }

    // If loop finishes, all keys failed
    console.error(`Task ${taskId}: All API keys failed.`);
    tasks[taskId].status = 'error';
    tasks[taskId].error = lastError instanceof Error ? lastError.message : 'An unknown error occurred after trying all keys.';
}


export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    
    // --- POST: Create a new task ---
    if (req.method === 'POST') {
        const { model, contents, config } = req.body;
        if (!model || !contents) {
            return res.status(400).json({ error: 'Missing required parameters: model and contents.' });
        }
        
        const taskId = nanoid();
        tasks[taskId] = { id: taskId, status: 'pending' };

        // Start processing in the background. Note: Vercel might suspend execution
        // after the response is sent, but `maxDuration` gives it a better chance.
        processTask(taskId, model, contents, config);

        return res.status(202).json({ taskId }); // 202 Accepted
    }

    // --- GET: Check task status ---
    if (req.method === 'GET') {
        const { taskId } = req.query;
        if (!taskId || typeof taskId !== 'string') {
            return res.status(400).json({ error: '`taskId` query parameter is required.' });
        }

        const task = tasks[taskId];
        if (!task) {
            return res.status(404).json({ error: 'Task not found.' });
        }

        if (task.status === 'done' || task.status === 'error') {
            // Once the task is complete, remove it from memory to prevent memory leaks.
            // A small delay ensures the client has time to fetch the final result.
            setTimeout(() => {
                delete tasks[taskId];
            }, 5 * 60 * 1000); // Clean up after 5 minutes
        }

        return res.status(200).json(task);
    }

    res.status(405).json({ error: 'Method not allowed.' });
}