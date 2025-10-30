// FIX: This file's content was placeholder text, leading to multiple "Cannot find name" errors. This fix implements a complete Vercel serverless function to serve as a Telegram bot powered by Grok. The function handles webhook POST requests from Telegram, validates the chat ID, calls the Grok API via the shared `callGrokApi` library function, and sends the AI-generated response back to the user.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callGrokApi, GrokMessage } from '../lib/grok';

// Base URL for the Telegram Bot API
const TELEGRAM_API_BASE_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

/**
 * Sends a message back to the specified Telegram chat.
 * @param chatId The ID of the chat to send the message to.
 * @param text The text of the message to send.
 */
async function sendTelegramMessage(chatId: string, text: string) {
    const url = `${TELEGRAM_API_BASE_URL}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown',
            }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Failed to send Telegram message:', errorData);
        }
    } catch (error) {
        console.error('Error sending Telegram message:', error);
    }
}

/**
 * The main handler for the Vercel serverless function.
 * It processes incoming webhook updates from Telegram and responds using Grok.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, GROK_API_KEY } = process.env;
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.error('Telegram environment variables are not set.');
        return res.status(200).send('OK');
    }
    if (!GROK_API_KEY) {
        console.error('GROK_API_KEY is not set.');
        // Acknowledge the request to Telegram before sending the error message.
        res.status(200).send('OK');
        await sendTelegramMessage(TELEGRAM_CHAT_ID, 'Server-side error: The Grok API key is not configured.');
        return;
    }

    try {
        const { message } = req.body;
        if (!message || !message.text || !message.chat) {
            return res.status(200).send('OK');
        }

        const chatId = message.chat.id.toString();
        const prompt = message.text;

        if (chatId !== TELEGRAM_CHAT_ID) {
            console.warn(`Received message from unauthorized chat ID: ${chatId}`);
            await sendTelegramMessage(chatId, 'Sorry, I am a private bot.');
            return res.status(200).send('OK');
        }

        // Acknowledge Telegram immediately.
        res.status(200).send('OK');

        // --- Call Grok API ---
        const messages: GrokMessage[] = [{ role: 'user', content: prompt }];
        const grokText = await callGrokApi(messages);

        // --- Send Grok's response back to the user ---
        if (grokText) {
            await sendTelegramMessage(chatId, grokText);
        } else {
            await sendTelegramMessage(chatId, 'I received your message, but I did not get a valid response from Grok.');
        }

    } catch (error) {
        console.error('Error processing Telegram/Grok update:', error);
        if (process.env.TELEGRAM_CHAT_ID) {
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
            await sendTelegramMessage(process.env.TELEGRAM_CHAT_ID, `An internal error occurred with Grok: ${errorMessage}`);
        }
    }
}
