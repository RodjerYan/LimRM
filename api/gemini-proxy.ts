import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

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
    if (!model || !contents) {
        return res.status(400).json({ error: 'Missing required parameters: model and contents.' });
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
            const response = await ai.models.generateContent({ model, contents, config });

            console.info(`✅ Successfully used API key ...${apiKey.slice(-4)}`);
            return res.status(200).json({ text: response.text });

        } catch (error: any) {
            console.warn(`API key ...${apiKey.slice(-4)} failed.`);
            lastError = error;
            const errorMessage = error.message?.toLowerCase() || '';
            
            // If it's a quota or network error, try the next key
            if (errorMessage.includes('quota') || errorMessage.includes('resource_exhausted') || errorMessage.includes('too many requests') || errorMessage.includes('failed to fetch') || errorMessage.includes('network')) {
                console.warn(`Retriable error: "${errorMessage}". Trying next key.`);
                continue;
            }
            
            // For other errors (like invalid arguments), break immediately
            break; 
        }
    }

    console.error(`All API keys failed. Last error:`, lastError);
    const finalErrorMessage = lastError instanceof Error ? lastError.message : 'An unknown error occurred after trying all available keys.';
    return res.status(500).json({ error: finalErrorMessage });
}
