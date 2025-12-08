
import { GoogleGenAI } from "@google/genai";

// Configure for Vercel Edge runtime for optimal streaming performance.
export const config = {
  runtime: 'edge',
};

/**
 * Handles POST requests to proxy Gemini API calls.
 * It takes a 'prompt' and optional 'tools' from the request body.
 */
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

    // Read multiple API keys from environment variables
    const apiKeys = [
      process.env.API_KEY_1,
      process.env.API_KEY_2,
      process.env.API_KEY_3,
      process.env.API_KEY_4,
    ].filter(Boolean) as string[];

    if (apiKeys.length === 0) {
        return new Response(JSON.stringify({ error: 'Server configuration error: No Gemini API keys found.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    
    const apiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
    const ai = new GoogleGenAI({ apiKey });

    // Ensure model supports tools if requested
    const model = 'gemini-2.5-flash';

    const generateConfig: any = {
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            temperature: 0.7,
            candidateCount: 1,
        }
    };

    // Attach tools if provided (e.g. { googleSearch: {} })
    if (tools) {
        generateConfig.config.tools = tools;
    }

    const responseStream = await ai.models.generateContentStream(generateConfig);
    
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
