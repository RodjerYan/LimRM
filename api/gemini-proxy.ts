
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

export const runtime = 'nodejs';

export const config = {
    maxDuration: 60,
    memory: 1024,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Unified CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') return res.status(405).end();

    try {
        const { prompt, tools } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        const keys = [
            process.env.API_KEY,
            process.env.API_KEY_1,
            process.env.API_KEY_2,
            process.env.API_KEY_3,
            process.env.API_KEY_4
        ].filter(Boolean);

        const randomKey = keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : process.env.API_KEY;

        if (!randomKey) {
            console.error("API Keys missing in environment variables");
            return res.status(500).json({ error: 'Server configuration error: API Keys not found.' });
        }

        // Correct SDK usage for @google/genai v1.2.0+
        const ai = new GoogleGenAI({ apiKey: randomKey as string });
        const model = 'gemini-3-flash-preview';

        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: { temperature: 0.7, tools: tools || [] }
        });

        // Use the .text getter
        return res.status(200).json({ text: response.text });

    } catch (e: any) {
        console.error('Gemini Proxy Error:', e);
        return res.status(500).json({ error: e.message || 'Internal AI Error' });
    }
}