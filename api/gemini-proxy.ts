
import { GoogleGenAI } from "@google/genai";

/**
 * Get all configured API keys from environment variables.
 * Checks API_KEY and API_KEY_1 ... API_KEY_20.
 */
function getAllKeys(): string[] {
    const keys: string[] = [];

    // Add main key if exists
    if (process.env.API_KEY) keys.push(process.env.API_KEY);

    // Add rotated keys API_KEY_1 to API_KEY_20
    for (let i = 1; i <= 20; i++) {
        const k = process.env[`API_KEY_${i}`];
        if (k && k.length > 0) keys.push(k);
    }

    return keys;
}

/**
 * Shuffle array in-place using Fisher-Yates algorithm.
 * This ensures load balancing across valid keys.
 */
function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { prompt, tools } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get all available keys and shuffle them for load balancing + retry pool
    const allKeys = getAllKeys();
    
    if (allKeys.length === 0) {
        return new Response(JSON.stringify({ error: "No API keys configured. Please set API_KEY in environment variables." }), { status: 500 });
    }
    
    // Shuffle keys so we don't always hammer the same first key in the list
    const keyPool = shuffle([...allKeys]);
    
    let streamIterator: any = null;
    let lastError: any = null;

    // Retry loop: Try connecting with each key until one works
    for (const apiKey of keyPool) {
        try {
            const ai = new GoogleGenAI({ apiKey });
            // Use 'gemini-3-flash-preview' for text tasks.
            const model = 'gemini-3-flash-preview';

            const generateParams: any = {
                model,
                contents: prompt,
                config: {
                    temperature: 0.7,
                }
            };

            // Attach tools if provided
            if (tools) {
                generateParams.config.tools = tools;
            }

            // Attempt to connect. This throws immediately if quota is hit (429) or invalid key.
            streamIterator = await ai.models.generateContentStream(generateParams);
            
            // If we reach here, connection is successful.
            break; 
        } catch (err: any) {
            lastError = err;
            const status = err.status || (err.response ? err.response.status : 0);
            const msg = err.message || String(err);
            
            console.warn(`[Gemini Proxy] Key ending in ...${apiKey.slice(-4)} failed (Status: ${status}). Msg: ${msg}`);
            
            // Continue loop to try next key
        }
    }

    if (!streamIterator) {
        // All keys failed
        const status = (lastError as any)?.status || 500;
        console.error('[Gemini Proxy] All keys exhausted.');
        return new Response(JSON.stringify({ error: 'Failed to connect to Gemini API after trying all available keys.', details: lastError?.message }), {
          status: status,
          headers: { 'Content-Type': 'application/json' },
        });
    }
    
    // Create a ReadableStream from the valid iterator
    const stream = new ReadableStream({
      async start(controller) {
        try {
            for await (const chunk of streamIterator) {
              const chunkText = chunk.text;
              if (chunkText) {
                controller.enqueue(new TextEncoder().encode(chunkText));
              }
            }
            controller.close();
        } catch (streamError) {
            console.error('[Gemini Proxy] Stream processing error:', streamError);
            controller.error(streamError);
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  } catch (error) {
    console.error('[Gemini Proxy] Critical error:', error);
    let errorMessage = 'An internal server error occurred.';
    let statusCode = 500;
    
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: errorMessage }), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
