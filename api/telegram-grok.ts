// FIX: This entire file's content is a fix. The original file contained placeholder text
// which caused compilation errors. This implementation creates a serverless function
// that acts as a Telegram bot webhook handler. It processes incoming messages,
// calls the Grok API for a response, and sends the result back to the user.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callGrokApi, GrokMessage } from '../lib/grok'; // Import from shared library

export const maxDuration = 30; // Set max duration to 30 seconds for this function

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Sends a message back to the specified Telegram chat.
 * @param text The message text to send.
 */
async function sendTelegramMessage(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error('Telegram environment variables (BOT_TOKEN, CHAT_ID) are not set.');
    return;
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
        parse_mode: 'Markdown',
      }),
    });
    if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to send message to Telegram:', errorData);
    }
  } catch (error) {
    console.error('Error sending message to Telegram:', error);
  }
}

/**
 * Gets a response from the Grok API for a given prompt.
 * @param prompt The user's prompt.
 * @returns The generated text from the AI.
 */
async function getGrokResponse(prompt: string): Promise<string> {
    const messages: GrokMessage[] = [
        { role: 'user', content: prompt }
    ];
    try {
        // Use the shared library function to call the Grok API
        const response = await callGrokApi(messages);
        return response;
    } catch (error) {
        console.error('Error calling Grok API:', error);
        if (error instanceof Error) {
            return `Ошибка при обращении к Grok API: ${error.message}`;
        }
        return 'Произошла неизвестная ошибка при вызове Grok API.';
    }
}

/**
 * Handles incoming webhook requests from Telegram, intended for Grok.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { message } = req.body;

    // Basic validation of the incoming message
    if (!message || !message.text || !message.chat || !message.chat.id) {
      // Acknowledge webhook but do nothing if it's not a message we can handle.
      return res.status(200).send('OK');
    }

    // Security: Only respond to messages from the configured chat ID
    if (String(message.chat.id) !== CHAT_ID) {
      console.warn(`Received message from unauthorized chat ID: ${message.chat.id}`);
      return res.status(200).send('OK');
    }

    const userPrompt = message.text;
    
    // Acknowledge the request immediately to prevent Telegram from resending it
    res.status(200).send('OK');

    // Asynchronously get the response and send it back
    const grokResponse = await getGrokResponse(userPrompt);
    await sendTelegramMessage(grokResponse);

  } catch (error) {
    console.error('Error in Telegram Grok bot handler:', error);
    // The response has already been sent, so we just log the error.
    await sendTelegramMessage('Произошла внутренняя ошибка сервера. Пожалуйста, проверьте логи.');
  }
}