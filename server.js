
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

// --- Глобальные обработчики для предотвращения падения сервера ---
process.on('uncaughtException', (err, origin) => {
    console.error(`CRITICAL: Uncaught exception at: ${origin}`, err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

// --- Проверка КРИТИЧЕСКИХ переменных окружения ---
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
const GEMINI_API_KEY = process.env.API_KEY;

if (!GOOGLE_SCRIPT_URL || !GEMINI_API_KEY) {
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("FATAL ERROR: Missing critical environment variables.");
    if (!GOOGLE_SCRIPT_URL) {
        console.error("- GOOGLE_SCRIPT_URL is not set. This is required to connect to the Google Sheet database.");
    }
    if (!GEMINI_API_KEY) {
        console.error("- API_KEY is not set. This is required for the AI Analyst feature.");
    }
    console.error("Please add these variables in your hosting provider's settings (e.g., Render) and redeploy.");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    process.exit(1); // Завершаем процесс с ошибкой, чтобы деплой провалился
}


const app = express();
const PORT = process.env.PORT || 10000; // Render использует порт 10000 по умолчанию
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');

// --- Проверка наличия сборки перед запуском ---
if (!fs.existsSync(indexPath)) {
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("FATAL ERROR: 'dist/index.html' not found.");
    console.error("This means the 'npm run build' command failed or was not run.");
    console.error("Check the build logs on Render for errors, likely missing VITE_ environment variables.");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    process.exit(1);
}

app.use(express.json());

// --- API МАРШРУТЫ ---

// Универсальный прокси для Google Apps Script
const proxyToGoogleScript = async (req, res) => {
    // Переменная GOOGLE_SCRIPT_URL уже проверена при старте
    console.log(`Proxying request to Google Apps Script with body:`, req.body);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000); // 35-секундный таймаут

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            redirect: 'follow'
        });

        clearTimeout(timeout);
        const data = await response.json();
        console.log(`Received response from Google Apps Script. Status: ${response.status}`);
        res.status(response.status).json(data);
        
    } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
            console.error('Request to Google Apps Script timed out after 35s.');
            return res.status(504).json({ message: 'Request to Google Apps Script timed out.' });
        }
        console.error('Error proxying to Google Apps Script:', error);
        res.status(500).json({ message: 'Failed to proxy request to Google Apps Script.' });
    }
};

// Маршруты, использующие прокси
app.post('/api/update-okb', proxyToGoogleScript);
app.get('/api/get-okb-status', (req, res) => proxyToGoogleScript({ body: { action: 'getStatus' } }, res));
app.get('/api/get-okb', (req, res) => proxyToGoogleScript({ body: { action: 'getAllData' } }, res));

// Потоковый прокси для Gemini AI
app.post('/api/gemini-proxy', async (req, res) => {
    // Переменная GEMINI_API_KEY уже проверена при старте
    const { prompt } = req.body;
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required.' });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`;
    
    try {
        const geminiResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!geminiResponse.ok || !geminiResponse.body) {
            const errorText = await geminiResponse.text();
            console.error('Gemini API Error:', errorText);
            return res.status(geminiResponse.status).send(errorText);
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        Readable.fromWeb(geminiResponse.body).pipe(res);

    } catch (error) {
        console.error('Error proxying to Gemini:', error);
        res.status(500).json({ error: 'Failed to proxy request to Gemini.' });
    }
});


// --- РАЗДАЧА СТАТИЧЕСКИХ ФАЙЛОВ ---
app.use(express.static(distPath));

// Для всех остальных запросов отдаем index.html (для роутинга на клиенте)
app.get('*', (req, res) => {
    res.sendFile(indexPath);
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Service will be available at your Render URL once deployed.`);
});