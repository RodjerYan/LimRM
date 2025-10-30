// FIX: Implemented robust Vercel serverless function for the Telegram bot webhook using the Grok API.
// This version includes manual body parsing to handle raw JSON from Telegram, preventing `FUNCTION_INVOCATION_FAILED` errors.
// It also adds a GET handler for health checks.

import type { VercelRequest, VercelResponse } from '@vercel/node';
// FIX: Import the `GrokMessage` type to ensure type safety for API calls.
import { callGrokApi, GrokMessage } from '../lib/grok';
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
        return;
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
 * Handles incoming webhook requests from Telegram, processed by Grok.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method === 'GET') {
        return res.status(200).send('✅ Grok Bot is alive');
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
        
        if (!process.env.GROK_API_KEY) {
            await sendTelegramMessage(chatId, 'Ошибка: Grok API ключ не настроен на сервере.');
            return;
        }

        // FIX: Explicitly type the `messages` array to match the `GrokMessage` interface,
        // resolving the TypeScript error where `string` was not assignable to the union type for `role`.
        const messages: GrokMessage[] = [
            { role: 'system', content: 'You are a helpful and slightly witty assistant.' },
            { role: 'user', content: userPrompt }
        ];

        const grokText = await callGrokApi(messages);
        
        await sendTelegramMessage(chatId, grokText);

    } catch (error) {
        console.error('Error in Grok bot handler:', error);
        const chatId = (req as any).body?.message?.chat?.id;
        if (chatId) {
            const errorMessage = error instanceof Error ? error.message : 'Произошла неизвестная ошибка.';
            await sendTelegramMessage(chatId, `*Ошибка* \nНе удалось обработать ваш запрос: \n\`${errorMessage}\``);
        }
    }
}
