// FIX: This entire file's content is a fix. The original file contained placeholder text
// which caused compilation errors. This implementation creates a serverless function
// that acts as a Telegram bot webhook handler. It processes incoming messages,
// calls the Google Gemini API for a response, and sends the result back to the user.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

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
 * Gets a response from the Gemini API for a given prompt.
 * @param prompt The user's prompt.
 * @returns The generated text from the AI.
 */
async function getGeminiResponse(prompt: string): Promise<string> {
    const apiKeys = [
        process.env.API_KEY_1,
        process.env.API_KEY_2,
        process.env.API_KEY_3,
        process.env.API_KEY_4,
    ].filter(Boolean) as string[];

    if (apiKeys.length === 0) {
      throw new Error('No Gemini API keys are configured on the server.');
    }
    
    // Select a random API key from the available pool for each request.
    const apiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
    
    try {
        const ai = new GoogleGenAI({ apiKey });
        // Select a suitable and cost-effective model for the text generation task.
        const model = 'gemini-2.5-flash';

        const response = await ai.models.generateContent({
            model,
            contents: prompt,
        });

        return response.text;
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        if (error instanceof Error) {
            return `Ошибка при обращении к Gemini API: ${error.message}`;
        }
        return 'Произошла неизвестная ошибка при вызове Gemini API.';
    }
}

/**
 * Handles incoming webhook requests from Telegram.
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
    // This allows the serverless function to return quickly while work continues.
    const geminiResponse = await getGeminiResponse(userPrompt);
    await sendTelegramMessage(geminiResponse);

  } catch (error) {
    console.error('Error in Telegram bot handler:', error);
    // The response has already been sent, so we just log the error.
    // We can optionally send an error message to the user if something went wrong.
    await sendTelegramMessage('Произошла внутренняя ошибка сервера. Пожалуйста, проверьте логи.');
  }
}
