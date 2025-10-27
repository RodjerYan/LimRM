// FIX: This entire file's content is a fix. The original file contained placeholder text
// which caused compilation errors like "Cannot find name 'full'". This implementation
// creates a serverless function that acts as a secure proxy to the Google Gemini API.
// It handles POST requests, retrieves the API key from server-side environment variables,
// calls the Gemini streaming API, and pipes the response back to the client, following all SDK guidelines.
import { GoogleGenAI } from "@google/genai";

// Configure for Vercel Edge runtime for optimal streaming performance.
export const config = {
  runtime: 'edge',
};

/**
 * Handles POST requests to proxy Gemini API calls.
 * It takes a 'prompt' from the request body and streams a response from the Gemini API.
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

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      // This error message is specifically crafted to be caught by the client-side error handler.
      return new Response(JSON.stringify({ error: 'API key is not configured' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Initialize the GoogleGenAI client with the API key from environment variables.
    const ai = new GoogleGenAI({ apiKey });

    // Select a suitable and cost-effective model for the text generation task.
    const model = 'gemini-2.5-flash';

    // Call the Gemini API to generate content as a stream.
    const responseStream = await ai.models.generateContentStream({
        model,
        contents: prompt,
    });
    
    // Create a new ReadableStream to pipe the response from Gemini back to the client.
    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of responseStream) {
          // Extract the text part of the chunk.
          const chunkText = chunk.text;
          if (chunkText) {
            // Encode the text chunk and enqueue it to the stream.
            controller.enqueue(new TextEncoder().encode(chunkText));
          }
        }
        controller.close();
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
    }
    
    // Return a structured error response if something goes wrong.
    return new Response(JSON.stringify({ error: 'Failed to get response from Gemini API', details: errorMessage }), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
