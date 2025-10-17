import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- CORS Headers ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // --- Preflight request ---
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // --- Method Check ---
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Please use POST.' });
  }

  // --- API Key Check ---
  if (!process.env.API_KEY) {
    return res.status(500).json({ error: 'API key not configured on the server.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    // Body can be anything compatible with GenerateContentParameters
    const { model, contents, config } = req.body;
    
    if (!model || !contents) {
      return res.status(400).json({ error: 'Missing required parameters: model and contents.' });
    }
    
    const response = await ai.models.generateContent({ model, contents, config });

    // To ensure the client gets a simple, usable response, we explicitly extract
    // the text and send it in a JSON object.
    res.status(200).json({ text: response.text });
  } catch (error) {
    console.error('Gemini proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ error: 'Error calling Gemini API', details: errorMessage });
  }
}
