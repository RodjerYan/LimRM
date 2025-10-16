import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Allow CORS for worker and local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    const { contents, config } = req.body;

    if (!contents) {
        res.status(400).json({ error: 'Payload must contain "contents"' });
        return;
    }

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        res.status(500).json({ error: 'API key is not configured', details: 'The `API_KEY` environment variable is not set on the server.' });
        return;
    }

    // Add the better key validation from the other proxy file
    if (!apiKey.startsWith('AIza')) {
        res.status(500).json({ 
            error: 'Invalid API Key Format on Server', 
            details: 'The provided API_KEY on the server seems to be incorrect. It should start with "AIza". Please double-check that you have not swapped the values for API_KEY and VITE_GEMINI_API_KEY in your Vercel settings and then redeploy.' 
        });
        return;
    }

    try {
        const ai = new GoogleGenAI({ apiKey });
        
        // Non-streaming JSON request (for worker)
        if (config?.responseMimeType === 'application/json') {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents,
                config,
            });

            const jsonText = response.text?.trim();
            if (!jsonText) {
                console.error('Gemini API returned a response with no text content. This might be due to safety filters.');
                res.status(500).json({ 
                    error: 'Received an empty text response from Gemini', 
                    details: 'This can happen if the model\'s response was blocked by safety filters or if it failed to generate content.'
                });
                return;
            }

            try {
                const jsonData = JSON.parse(jsonText);
                res.status(200).json(jsonData);
            } catch (parseError: any) {
                 console.error('Gemini JSON response parsing error:', parseError);
                 console.error('Raw Gemini response text:', jsonText);
                 res.status(500).json({ error: 'Failed to parse JSON response from Gemini', details: parseError.message, raw: jsonText });
            }
            return;
        }

        // Default to streaming text request (for AI Analyst)
        const responseStream = await ai.models.generateContentStream({
            model: "gemini-2.5-flash",
            contents: contents,
            config: config,
        });
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        for await (const chunk of responseStream) {
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
