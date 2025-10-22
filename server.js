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

// Надежный прокси для небольших JSON-ответов (статусы, команды)
const bufferedProxyToGoogleScript = async (req, res) => {
    console.log(`Buffered proxy request to Google Apps Script with body:`, req.body);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000); // 5-минутный таймаут

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            redirect: 'follow'
        });

        clearTimeout(timeout);
        
        const contentType = response.headers.get('content-type');

        // КРИТИЧЕСКАЯ ПРОВЕРКА: Если Google возвращает страницу входа (HTML), значит права доступа неверны.
        if (contentType && contentType.includes('text/html')) {
            console.error('FATAL PERMISSION ERROR: Google Apps Script returned an HTML page instead of JSON. This almost certainly means the script is not shared correctly ("Who has access" should be "Anyone").');
            return res.status(500).json({
                message: 'Ошибка конфигурации Google Apps Script',
                details: 'Сервер получил HTML-страницу для входа вместо ожидаемых данных. Убедитесь, что ваше веб-приложение в Google Apps Script опубликовано с правом доступа "Все" (Anyone) и вы используете корректный URL развертывания.'
            });
        }
        
        const data = await response.json();
        console.log(`Received buffered response from Google. Status: ${response.status}`);
        
        res.status(response.status).json(data);

    } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
            console.error('Request to Google Apps Script timed out after 5 minutes.');
            return res.status(504).json({ 
                message: 'Request to Google Apps Script timed out.', 
                details: 'The operation took longer than 5 minutes and was terminated by the server proxy.' 
            });
        }
        console.error('Error in buffered proxy to Google Apps Script:', error);
        res.status(500).json({ 
            message: 'Failed to proxy request to Google Apps Script.', 
            details: error.message 
        });
    }
};


// Эффективный потоковый прокси для больших объемов данных (скачивание всей базы)
const streamProxyToGoogleScript = async (req, res) => {
    console.log(`Streaming proxy request to Google Apps Script with body:`, req.body);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000); // 5-минутный таймаут

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            redirect: 'follow'
        });

        clearTimeout(timeout);
        
        const contentType = response.headers.get('content-type');
        // Такая же проверка на HTML для потокового запроса
        if (contentType && contentType.includes('text/html')) {
            console.error('FATAL PERMISSION ERROR on streaming endpoint: Google Apps Script returned an HTML page.');
             return res.status(500).json({
                message: 'Ошибка конфигурации Google Apps Script',
                details: 'Сервер получил HTML-страницу для входа вместо потока данных. Убедитесь, что ваше веб-приложение в Google Apps Script опубликовано с правом доступа "Все" (Anyone).'
            });
        }

        if (!response.body) {
             const data = await response.json();
             console.log(`Received non-streamable response from Google. Status: ${response.status}`);
             return res.status(response.status).json(data);
        }
        
        console.log(`Streaming response from Google Apps Script. Status: ${response.status}`);
        
        res.setHeader('Content-Type', response.headers.get('Content-Type') || 'application/json');
        res.status(response.status);

        // Передаем тело ответа напрямую клиенту, минимизируя использование памяти на сервере.
        Readable.fromWeb(response.body).pipe(res);

    } catch (error) {
        clearTimeout(timeout);
        if (error.name === 'AbortError') {
            console.error('Request to Google Apps Script timed out after 5 minutes.');
            return res.status(504).json({ 
                message: 'Request to Google Apps Script timed out.', 
                details: 'The operation took longer than 5 minutes and was terminated by the server proxy.' 
            });
        }
        console.error('Error proxying to Google Apps Script:', error);
        res.status(500).json({ 
            message: 'Failed to proxy request to Google Apps Script.', 
            details: error.message 
        });
    }
};

// Применяем правильный прокси к каждому маршруту
app.post('/api/update-okb', bufferedProxyToGoogleScript);
app.get('/api/get-okb-status', (req, res) => bufferedProxyToGoogleScript({ body: { action: 'getStatus' } }, res));
app.get('/api/get-okb', (req, res) => streamProxyToGoogleScript({ body: { action: 'getAllData' } }, res));


// Потоковый прокси для Gemini AI
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