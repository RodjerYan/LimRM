
import { GoogleGenAI } from "@google/genai";

// Configure for Vercel Edge runtime for optimal streaming performance.
export const config = {
  runtime: 'edge',
};

/**
 * Handles POST requests to proxy Gemini API calls.
 * It takes a 'prompt' from the request body and streams a response from the Gemini API.
 * This version uses a pool of API keys for load balancing and redundancy.
 * @param {Request} req The incoming request object.
 * @returns {Response} A streaming response with the generated text or an error response.
 */
export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Read multiple API keys from environment variables and filter out any that are not set.
    const apiKeys = [
      process.env.API_KEY_1,
      process.env.API_KEY_2,
      process.env.API_KEY_3,
      process.env.API_KEY_4,
    ].filter(Boolean) as string[];

    if (apiKeys.length === 0) {
        const detailedErrorMessage = `Server configuration error: No Gemini API keys found in environment variables (API_KEY_1, etc.).`;
        console.error(detailedErrorMessage);
        return new Response(JSON.stringify({ error: detailedErrorMessage }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    
    // Select a random API key from the available pool for each request.
    const apiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
    
    // Initialize the GoogleGenAI client
    const ai = new GoogleGenAI({ apiKey });

    // Select a suitable and cost-effective model
    const model = 'gemini-2.5-flash';

    // Call the Gemini API to generate content as a stream.
    // FIX: Ensure contents is an array of objects with parts
    const responseStream = await ai.models.generateContentStream({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            temperature: 0.7,
            candidateCount: 1,
        }
    });
    
    // Create a new ReadableStream to pipe the response from Gemini back to the client.
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

    // Return the stream as the response.
    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  } catch (error) {
    console.error('Gemini proxy error:', error);
    let errorMessage = 'An internal server error occurred.';
    let statusCode = 500;
    
    if (error instanceof Error) {
        errorMessage = error.message;
        // Check if it is a GoogleGenAI specific error structure
        if ((error as any).status) {
             statusCode = (error as any).status;
        }
    }
    
    // Return a structured error response if something goes wrong.
    return new Response(JSON.stringify({ error: 'Failed to get response from Gemini API', details: errorMessage }), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
