// api/telegram-bot.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import TelegramBot from 'node-telegram-bot-api';
import { callGrokApi } from '../lib/grok';

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatIdStr = process.env.TELEGRAM_CHAT_ID;

// A simple function to format JSON for better readability in Telegram
const formatJsonForTelegram = (jsonString: string): string => {
    try {
        const obj = JSON.parse(jsonString);
        // Using MarkdownV2, so we need to escape special characters
        const formatted = JSON.stringify(obj, null, 2);
        return '```json\n' + formatted.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&') + '\n```';
    } catch {
        // If it's not JSON, just escape the string
        return jsonString.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Basic validation
    if (!token || !chatIdStr) {
        console.error("Bot environment variables are not configured.");
        return res.status(500).json({ error: "Bot token or chat ID is not configured on the server." });
    }

    const bot = new TelegramBot(token);
    const chatId = parseInt(chatIdStr, 10);
    if (isNaN(chatId)) {
        console.error("TELEGRAM_CHAT_ID is not a valid number.");
        return res.status(500).json({ error: "TELEGRAM_CHAT_ID is not a valid number." });
    }

    try {
        const update = req.body;

        // Check if the update is a message, from the correct chat, and has text
        if (update && update.message && update.message.chat.id === chatId && update.message.text) {
            const text = update.message.text;
            
            try {
                // Expecting the message to be a JSON with a 'prompt'
                const { prompt } = JSON.parse(text);

                if (typeof prompt !== 'string' || !prompt) {
                    throw new Error("Invalid format. JSON must contain a 'prompt' string.");
                }
                
                await bot.sendMessage(chatId, "⏳ Получил ваш запрос, отправляю в Grok...");

                // Call Grok API using the shared library
                const grokResult = await callGrokApi([
                    { role: "system", content: "You are a helpful data analyst. Respond in Markdown format." },
                    { role: "user", content: prompt }
                ]);

                // Send the result back to Telegram
                // Grok might return JSON or Markdown, so we format it for safety
                const formattedResult = formatJsonForTelegram(grokResult);
                await bot.sendMessage(chatId, formattedResult, { parse_mode: 'MarkdownV2' });

            } catch (parseOrGrokError) {
                const errorMessage = parseOrGrokError instanceof Error ? parseOrGrokError.message : "An unknown error occurred.";
                await bot.sendMessage(chatId, `❌ Ошибка обработки запроса: ${errorMessage}`);
            }
        }
    } catch (error) {
        console.error('Critical error in Telegram bot handler:', error);
        // Avoid sending detailed errors to the chat for security
    }

    // Always respond with 200 OK to Telegram to acknowledge receipt of the update
    res.status(200).send('OK');
}
