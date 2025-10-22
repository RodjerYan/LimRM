import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import https from 'https';
import { URL } from 'url';

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
const PORT = process.env.PORT || 10000;
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

const makeGoogleRequest = (req, res, stream = false) => {
    const requestLogId = `[${Date.now()}]`;
    console.log(`${requestLogId} Initiating ${stream ? 'streaming' : 'buffered'} proxy request to Google Apps Script.`);
    
    try {
        const postData = JSON.stringify(req.body);
        const googleUrl = new URL(GOOGLE_SCRIPT_URL);

        const options = {
            hostname: googleUrl.hostname,
            path: googleUrl.pathname + googleUrl.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 300000 // 5-минутный таймаут
        };

        const proxyReq = https.request(options, (proxyRes) => {
            console.log(`${requestLogId} Received response from Google. Status: ${proxyRes.statusCode}.`);
            const contentType = proxyRes.headers['content-type'];

            if (contentType && contentType.includes('text/html')) {
                console.error(`${requestLogId} FATAL PERMISSION ERROR: Google Apps Script returned an HTML page.`);
                 proxyRes.resume(); // Consume response data to free up memory
                return res.status(500).json({
                    message: 'Ошибка конфигурации Google Apps Script',
                    details: 'Сервер получил HTML-страницу вместо данных. Убедитесь, что веб-приложение опубликовано с доступом "Все" (Anyone).'
                });
            }
            
            res.writeHead(proxyRes.statusCode, proxyRes.headers);

            if (stream) {
                console.log(`${requestLogId} Piping stream to client.`);
                proxyRes.pipe(res);
            } else {
                let responseBody = '';
                proxyRes.setEncoding('utf8');
                proxyRes.on('data', (chunk) => { responseBody += chunk; });
                proxyRes.on('end', () => {
                    console.log(`${requestLogId} Buffered response finished. Body length: ${responseBody.length}`);
                    res.end(responseBody);
                });
            }
        });

        proxyReq.on('timeout', () => {
            console.error(`${requestLogId} Request to Google timed out.`);
            proxyReq.destroy();
            if (!res.headersSent) {
                res.status(504).json({ message: 'Request to Google Apps Script timed out.' });
            }
        });

        proxyReq.on('error', (e) => {
            console.error(`${requestLogId} Proxy request error:`, e);
            if (!res.headersSent) {
                res.status(500).json({ message: 'Failed to proxy request to Google.', details: e.message });
            }
        });
        
        console.log(`${requestLogId} Writing data to Google request:`, req.body);
        proxyReq.write(postData);
        proxyReq.end();
        console.log(`${requestLogId} Request sent to Google.`);

    } catch (error) {
        console.error(`${requestLogId} Unhandled error in makeGoogleRequest:`, error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Internal server error during proxy setup.', details: error.message });
        }
    }
};

app.post('/api/update-okb', (req, res) => makeGoogleRequest(req, res, false));
app.get('/api/get-okb-status', (req, res) => {
    console.log(`[${new Date().toISOString()}] Received request for /api/get-okb-status`);
    makeGoogleRequest({ body: { action: 'getStatus' } }, res, false);
});
app.get('/api/get-okb', (req, res) => makeGoogleRequest({ body: { action: 'getAllData' } }, res, true));


// Потоковый прокси для Gemini AI (оставляем fetch, т.к. он тут стабилен для SSE)
app.post('/api/gemini-proxy', async (req, res) => {
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
