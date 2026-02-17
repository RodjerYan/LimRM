import { GoogleGenAI } from "@google/genai";

/**
 * Helper to select a random API key from available environment variables.
 * Supports API_KEY and API_KEY_1 through API_KEY_20.
 */
function getRandomKey(): string {
    const keys: string[] = [];

    // Add main key if exists
    if (process.env.API_KEY) keys.push(process.env.API_KEY);

    // Add rotated keys API_KEY_1 to API_KEY_20
    const rotatedKeys = [
        process.env.API_KEY_1, process.env.API_KEY_2, process.env.API_KEY_3, process.env.API_KEY_4, 
        process.env.API_KEY_5, process.env.API_KEY_6, process.env.API_KEY_7, process.env.API_KEY_8, 
        process.env.API_KEY_9, process.env.API_KEY_10, process.env.API_KEY_11, process.env.API_KEY_12,
        process.env.API_KEY_13, process.env.API_KEY_14, process.env.API_KEY_15, process.env.API_KEY_16,
        process.env.API_KEY_17, process.env.API_KEY_18, process.env.API_KEY_19, process.env.API_KEY_20
    ];

    rotatedKeys.forEach(k => {
        if (k && k.length > 0) keys.push(k);
    });

    if (keys.length === 0) {
        throw new Error("No API keys configured. Please set API_KEY or API_KEY_1...N in environment variables.");
    }

    // Pick a random key
    return keys[Math.floor(Math.random() * keys.length)];
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

    // Use rotation logic to get a key
    const apiKey = getRandomKey();
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

    const responseStream = await ai.models.generateContentStream(generateParams);
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
            for await (const chunk of responseStream) {
              const chunkText = chunk.text;
              if (chunkText) {
                controller.enqueue(new TextEncoder().encode(chunkText));
              }
            }
            controller.close();
        } catch (streamError) {
            console.error('Stream processing error:', streamError);
            controller.error(streamError);
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  } catch (error) {
    console.error('Gemini proxy error:', error);
    let errorMessage = 'An internal server error occurred.';
    let statusCode = 500;
    
    if (error instanceof Error) {
        errorMessage = error.message;
        if ((error as any).status) {
             statusCode = (error as any).status;
        }
    }
    
    return new Response(JSON.stringify({ error: 'Failed to get response from Gemini API', details: errorMessage }), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}