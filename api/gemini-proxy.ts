
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

    // Fix: Using process.env.API_KEY exclusively as per GenAI guidelines.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

    // Fix: Use 'gemini-3-flash-preview' for text tasks as per model selection guidelines.
    const model = 'gemini-3-flash-preview';

    // Fix: Simplified content structure for text tasks as per GenAI guidelines.
    const generateParams: any = {
        model,
        contents: prompt,
        config: {
            temperature: 0.7,
        }
    };

    // Attach tools if provided (e.g. { googleSearch: {} })
    if (tools) {
        generateParams.config.tools = tools;
    }

    const responseStream = await ai.models.generateContentStream(generateParams);
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
            for await (const chunk of responseStream) {
              // Fix: Access the .text property directly instead of calling a method.
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
