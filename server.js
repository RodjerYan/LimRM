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
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 10000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');

if (!fs.existsSync(indexPath)) {
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("FATAL ERROR: 'dist/index.html' not found.");
    console.error("This means the 'npm run build' command failed or was not run.");
    console.error("Check the build logs on Render for errors.");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    process.exit(1);
}

app.use(express.json());

// --- Упрощенный Прокси-сервер (только для GET) ---

const makeGoogleGetRequest = async (action, res, stream = false) => {
    const requestLogId = `[${Date.now()}]`;
    console.log(`${requestLogId} Initiating GET proxy to Google for action: ${action}`);
    try {
        const urlWithParams = new URL(GOOGLE_SCRIPT_URL);
        urlWithParams.searchParams.append('action', action);

        const googleResponse = await fetch(urlWithParams.toString(), {
            method: 'GET',
            redirect: 'follow', // Automatically follow redirects
        });

        console.log(`${requestLogId} Received response from Google. Status: ${googleResponse.status}.`);

        const contentType = googleResponse.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
            console.error(`${requestLogId} FATAL CONFIG ERROR: Google Apps Script returned an HTML page.`);
            return res.status(500).json({
                message: 'Ошибка конфигурации Google Apps Script',
                details: 'Сервер получил HTML-страницу вместо данных. Убедитесь, что веб-приложение опубликовано с доступом "Все" (Anyone) и вы используете URL из **нового развертывания**.'
            });
        }

        if (!googleResponse.ok) {
            const errorText = await googleResponse.text();
            console.error(`${requestLogId} Google API Error (Status: ${googleResponse.status}):`, errorText);
            return res.status(googleResponse.status).send(errorText);
        }
        
        res.setHeader('Content-Type', googleResponse.headers.get('content-type') || 'application/json');

        if (stream && googleResponse.body) {
            console.log(`${requestLogId} Piping stream to client.`);
            Readable.fromWeb(googleResponse.body).pipe(res);
        } else {
            const responseBody = await googleResponse.text();
            console.log(`${requestLogId} Buffered response finished. Length: ${responseBody.length}`);
            res.status(googleResponse.status).send(responseBody);
        }
    } catch (error) {
        console.error(`${requestLogId} Unhandled error in makeGoogleGetRequest:`, error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Internal server error during GET proxy.', details: error.message });
        }
    }
};

// --- API МАРШРУТЫ ---

app.get('/api/get-okb-status', (req, res) => {
    makeGoogleGetRequest('getStatus', res, false);
});

app.get('/api/get-okb', (req, res) => {
    makeGoogleGetRequest('getAllData', res, true);
});

app.post('/api/gemini-proxy', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required.' });

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
        Readable.fromWeb(geminiResponse.body).pipe(res);

    } catch (error) {
        console.error('Error proxying to Gemini:', error);
        res.status(500).json({ error: 'Failed to proxy request to Gemini.' });
    }
});

// --- РАЗДАЧА СТАТИЧЕСКИХ ФАЙЛОВ ---
app.use(express.static(distPath));
app.get('*', (req, res) => res.sendFile(indexPath));

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Service will be available at your Render URL once deployed.`);
});
