import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    const { prompt } = req.body;

    if (!prompt) {
        res.status(400).json({ error: 'Prompt is required' });
        return;
    }

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        res.status(500).json({ error: 'API key is not configured', details: 'The `API_KEY` environment variable is not set on the server.' });
        return;
    }

    try {
        const ai = new GoogleGenAI({ apiKey });
        
        const stream = await ai.models.generateContentStream({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        for await (const chunk of stream) {
            res.write(chunk.text);
        }
        res.end();

    } catch (error: any) {
        console.error('Gemini API Error:', error);
        if (!res.headersSent) {
             res.status(500).json({ error: 'Failed to fetch from Gemini API', details: error.message });
        } else {
             res.end();
        }
    }
}
