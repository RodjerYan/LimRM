// api/grok-proxy.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callGrokApi } from '../lib/grok'; // Use the new shared library

export const maxDuration = 30; // Set max duration to 30 seconds for this function

/**
 * Handles POST requests to proxy Grok API calls for the web UI.
 * @param {VercelRequest} req The incoming request object.
 * @param {VercelResponse} res The outgoing response object.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, model } = req.body;

    if (!messages) {
      return res.status(400).json({ error: 'The "messages" field is required.' });
    }

    // Use the shared library function to call the Grok API
    const grokContent = await callGrokApi(messages, model);
    
    // The web UI expects the full API response structure, so we simulate it.
    res.status(200).json({
      choices: [{
        message: {
          content: grokContent
        }
      }]
    });

  } catch (error) {
    console.error('Grok proxy error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ error: 'Failed to get response from Grok API', details: errorMessage });
  }
}