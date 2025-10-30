// FIX: Implemented robust Vercel serverless function for the Telegram bot webhook using the Gemini API.
// This version includes manual body parsing to handle raw JSON from Telegram, preventing `FUNCTION_INVOCATION_FAILED` errors.
// It also adds a GET handler for health checks and explicit environment variable checks to prevent build failures.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { Buffer } from 'buffer';

// Disable Vercel's default body parser to handle raw JSON from Telegram
export const config = {
  api: {
    bodyParser: false,
  },
};

export const maxDuration = 30; // Set max duration to 30 seconds for AI calls

/**
 * Sends a message reply back to the user on Telegram.
 */
async function sendTelegramMessage(chatId: number, text: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.error("TELEGRAM_BOT_TOKEN is not configured.");
        return; // Exit if the token is not set
    }
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown'
            })
        });
    } catch (error) {
        console.error('Failed to send message to Telegram:', error);
    }
}

/**
 * Handles incoming webhook requests from Telegram.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') {
        return res.status(200).send('✅ Gemini Bot is alive');
    }
    
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST', 'GET']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Manually parse the request body
        const buffers: Buffer[] = [];
        for await (const chunk of req) {
            buffers.push(chunk as Buffer);
        }
        const rawBody = Buffer.concat(buffers).toString('utf-8');
        
        if (!rawBody) {
            return res.status(200).send('OK: Empty body');
        }

        const { message } = JSON.parse(rawBody);

        // Acknowledge receipt to Telegram immediately
        res.status(200).send('OK');

        if (!message || !message.chat?.id) {
            console.log("Received a non-message update or update without chat ID, ignoring.");
            return;
        }

        const chatId = message.chat.id;
        const userPrompt = message.text ?? '';

        if (!userPrompt) {
            await sendTelegramMessage(chatId, 'Пожалуйста, отправьте текстовое сообщение.');
            return;
        }
        
        // FIX: Explicitly check for the API key to satisfy TypeScript's strict null checks.
        const apiKey = process.env.API_KEY_1; // Using one of the keys
        if (!apiKey) {
            console.error("API_KEY_1 is not configured.");
            await sendTelegramMessage(chatId, 'Ошибка: Gemini API ключ не настроен на сервере.');
            return;
        }

        const ai = new GoogleGenAI({ apiKey });
        const model = 'gemini-2.5-flash';

        const response = await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        });
        
        const geminiText = response.text;

        await sendTelegramMessage(chatId, geminiText);

    } catch (error) {
        console.error('Error in Gemini bot handler:', error);
        // Try to get chatId even on error, but handle potential undefined body
        const chatId = (req as any).body?.message?.chat?.id;
        if (chatId) {
            const errorMessage = error instanceof Error ? error.message : 'Произошла неизвестная ошибка.';
            await sendTelegramMessage(chatId, `*Ошибка* \nНе удалось обработать ваш запрос: \n\`${errorMessage}\``);
        }
    }
}