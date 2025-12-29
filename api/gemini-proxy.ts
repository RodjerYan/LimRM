
import type { VercelRequest, VercelResponse } from '@vercel/node';

// CRITICAL: Force Node.js runtime for Google GenAI compatibility
export const runtime = 'nodejs';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') return res.status(405).end();

    try {
        const { prompt, tools } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        // Dynamic import to ensure proper bundling in Node.js runtime
        const { GoogleGenAI } = await import('@google/genai');

        const keys = [
            process.env.API_KEY,
            process.env.API_KEY_1,
            process.env.API_KEY_2,
            process.env.API_KEY_3,
            process.env.API_KEY_4
        ].filter(Boolean);

        const randomKey = keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : process.env.API_KEY;

        if (!randomKey) {
            return res.status(500).json({ error: 'API Keys are not configured.' });
        }

        const ai = new GoogleGenAI({ apiKey: randomKey as string });
        const model = 'gemini-3-flash-preview';

        // Standard generation (No Streaming for Vercel Serverless Stability)
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: { temperature: 0.7, tools: tools || [] }
        });

        return res.status(200).json({ text: response.text });

    } catch (e: any) {
        console.error('Gemini Proxy Error:', e);
        return res.status(500).json({ error: e.message || 'Internal AI Error' });
    }
}
