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
        return res.status(405).json({ error: 'Method Not Allowed. Please use POST.' });
    }
    
    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) {
        return res.status(500).json({ error: 'API keys not configured on the server.' });
    }

    // Shuffle keys to distribute load
    const shuffledKeys = shuffleArray(apiKeys);
    
    const { model, contents, config } = req.body;
    if (!model || !contents) {
        return res.status(400).json({ error: 'Missing required parameters: model and contents.' });
    }

    let lastError: any = null;
    let requestHandled = false;

    for (const apiKey of shuffledKeys) {
        try {
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({ model, contents, config });
            
            // Success! Send the response and stop iterating.
            console.info(`✅ Successfully used API key ending in ...${apiKey.slice(-4)}`);
            res.status(200).json({ text: response.text });
            requestHandled = true;
            break; // Exit the loop on success

        } catch (error: any) {
            console.warn(`API key ...${apiKey.slice(-4)} failed.`);
            lastError = error;
            const errorMessage = error.message?.toLowerCase() || '';

            // Check for quota-related errors to continue to the next key
            if (errorMessage.includes('quota') || errorMessage.includes('resource_exhausted') || errorMessage.includes('too many requests')) {
                console.warn(`Quota exceeded for key ...${apiKey.slice(-4)}. Trying next key.`);
                continue; // Try the next key
            }
             // Also retry on generic network failures
            if (errorMessage.includes('failed to fetch') || errorMessage.includes('network')) {
                console.warn(`Network error with key ...${apiKey.slice(-4)}, trying next.`);
                continue;
            }

            // If it's a different kind of error (e.g., bad request), stop and report it.
            break;
        }
    }
    
    // If the loop finished and the request was not handled, it means all keys failed.
    if (!requestHandled) {
        console.error("All API keys failed.", lastError);
        const errorMessage = lastError instanceof Error ? lastError.message : 'An unknown error occurred after trying all keys.';
        res.status(500).json({ 
            error: 'All available API keys failed to process the request.', 
            details: errorMessage 
        });
    }
}
