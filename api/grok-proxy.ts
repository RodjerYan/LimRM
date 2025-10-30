// api/grok-proxy.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_URL = "https://api.x.ai/v1/chat/completions";

/**
 * Handles POST requests to proxy Grok API calls.
 * @param {VercelRequest} req The incoming request object.
 * @param {VercelResponse} res The outgoing response object.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROK_API_KEY is not configured on the server.' });
  }

  try {
    const { messages, model = "grok-4-latest" } = req.body;

    if (!messages) {
      return res.status(400).json({ error: 'The "messages" field is required.' });
    }

    const grokResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        stream: false,
      }),
    });

    const data = await grokResponse.json();

    if (!grokResponse.ok) {
      console.error('Grok API Error:', data);
      return res.status(grokResponse.status).json(data);
    }
    
    res.status(200).json(data);

  } catch (error) {
    console.error('Grok proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ error: 'Failed to get response from Grok API', details: errorMessage });
  }
}
