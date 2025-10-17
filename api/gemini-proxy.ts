import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

export const config = {
  maxDuration: 58, // Set max duration to 58 seconds
};

// --- Helper to get all available API keys from environment variables ---
function getApiKeys(): string[] {
    const keys = [process.env.API_KEY];
    let i = 2;
    // Check for API_KEY_2, API_KEY_3, etc.
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


export default async function handler(req: VercelRequest, res: VercelResponse) {
    // --- CORS Headers ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed.' });
    }

    const { model, contents, config } = req.body;
    if (!contents) {
        return res.status(400).json({ error: 'Missing required parameter: contents.' });
    }

    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) {
        return res.status(500).json({ error: 'API keys not configured on the server.' });
    }

    const shuffledKeys = shuffleArray(apiKeys);
    let lastError: any = null;

    for (const apiKey of shuffledKeys) {
        try {
            const ai = new GoogleGenAI({ apiKey });
            const responseStream = await ai.models.generateContentStream({ 
                model: model || 'gemini-2.5-flash', 
                contents, 
                config 
            });

            // If stream is initiated, we commit to this key and start streaming the response.
            console.info(`✅ Streaming with API key ...${apiKey.slice(-4)}`);
            
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            // FIX: The `generateContentStream` method returns an async generator directly.
            // It does not have a `.stream` property. The loop should iterate over `responseStream` itself.
            for await (const chunk of responseStream) {
                res.write(chunk.text);
            }

            res.end();
            return; // Successfully streamed, exit the handler.

        } catch (error: any) {
            console.warn(`API key ...${apiKey.slice(-4)} failed to initiate stream.`);
            lastError = error;
            const errorMessage = error.message?.toLowerCase() || '';
            
            // If it's a retriable error (like quota), try the next key.
            if (errorMessage.includes('quota') || errorMessage.includes('resource_exhausted') || errorMessage.includes('too many requests') || errorMessage.includes('failed to fetch') || errorMessage.includes('network')) {
                continue;
            }
            
            // For other errors (like invalid arguments), break immediately.
            break; 
        }
    }

    // This block is reached only if all keys failed to initiate a stream.
    console.error(`All API keys failed to initiate stream. Last error:`, lastError);
    const finalErrorMessage = lastError instanceof Error ? lastError.message : 'An unknown error occurred after trying all available keys.';
    if (!res.headersSent) {
       return res.status(500).json({ error: finalErrorMessage });
    }
}