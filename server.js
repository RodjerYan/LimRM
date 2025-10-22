// server.js
import express from 'express';
import path from 'path';
import fs from 'fs'; // Импортируем модуль для работы с файловой системой
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

// --- КОНФИГУРАЦИЯ ---
const app = express();
const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyH3ArfrPFU7IoxpOMtlr5O14awqaaGR9qbdAcw2bKob3k3Z8ktBb2BZV1W0gxFOdPy7A/exec';

// --- MIDDLEWARE ---
app.use(express.json());


// --- API МАРШРУТЫ ---

// 1. Прокси для Gemini AI
app.post('/api/gemini-proxy', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const apiKey = process.env.API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key is not configured' });
    
    try {
        const ai = new GoogleGenAI({ apiKey });
        const stream = await ai.models.generateContentStream({ model: "gemini-2.5-flash", contents: prompt });
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        for await (const chunk of stream) {
            res.write(chunk.text);
        }
        res.end();
    } catch (error) {
        console.error('Gemini API Error:', error);
        if (!res.headersSent) {
             res.status(500).json({ error: 'Failed to fetch from Gemini API', details: error.message });
        }
    }
});

// 2. Получение статуса ОКБ из Google Sheets
app.get('/api/get-okb-status', async (req, res) => {
    try {
        const urlWithAction = `${APPS_SCRIPT_URL}?action=getStatus`;
        const scriptResponse = await fetch(urlWithAction, { method: 'GET', redirect: 'follow' });

        if (!scriptResponse.ok) throw new Error(`Google Apps Script Error: ${scriptResponse.status}`);
        
        const data = await scriptResponse.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('Error in get-okb-status proxy:', error);
        res.status(500).json({ error: 'Failed to fetch status', details: error.message });
    }
});

// 3. Получение ВСЕХ данных ОКБ
app.get('/api/get-okb', async (req, res) => {
     try {
        const urlWithAction = `${APPS_SCRIPT_URL}?action=getAllData`;
        const scriptResponse = await fetch(urlWithAction, { method: 'GET', redirect: 'follow' });

        if (!scriptResponse.ok) throw new Error(`Google Apps Script Error: ${scriptResponse.status}`);
        
        const data = await scriptResponse.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('Error in get-okb proxy:', error);
        res.status(500).json({ error: 'Failed to fetch all data', details: error.message });
    }
});

// 4. Прокси для Nominatim (геокодирование)
app.get('/api/nominatim-proxy', async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') return res.status(400).json({ error: 'Query "q" is required' });

    const userAgent = 'Geo-Analiz-Rynka-Limkorm/1.0 (https://ai.studio)';
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=ru&limit=1`;

    try {
        const nominatimResponse = await fetch(url, { headers: { 'User-Agent': userAgent } });
        if (!nominatimResponse.ok) throw new Error(`Nominatim API error: ${nominatimResponse.status}`);
        
        const data = await nominatimResponse.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('Nominatim Proxy Error:', error);
        res.status(500).json({ error: 'Failed to fetch from Nominatim', details: error.message });
    }
});

// 5. Запуск/продолжение обновления ОКБ
app.post('/api/update-okb', async (req, res) => {
    try {
        const scriptResponse = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            redirect: 'follow',
        });

        if (!scriptResponse.ok) {
             const errorText = await scriptResponse.text();
             throw new Error(`Google Apps Script returned an error: ${errorText}`);
        }
        
        const data = await scriptResponse.json();
        res.status(200).json(data);
    } catch (error) {
        console.error('CRITICAL Error in update-okb proxy:', error);
        res.status(500).json({ status: 'error', message: 'Proxy server failed', details: error.message });
    }
});


// --- РАЗДАЧА ФРОНТЕНДА ---
const staticPath = path.join(__dirname, 'dist');

// КРИТИЧЕСКАЯ ПРОВЕРКА: Убедимся, что сборка прошла успешно
if (!fs.existsSync(path.join(staticPath, 'index.html'))) {
    console.error('---------------------------------------------------------');
    console.error('CRITICAL ERROR: Файл "dist/index.html" не найден!');
    console.error('Это означает, что команда "npm run build" не выполнилась успешно.');
    console.error('Наиболее вероятная причина - отсутствующие переменные окружения VITE_...');
    console.error('Пожалуйста, проверьте переменные в настройках Render и перезапустите deploy.');
    console.error('---------------------------------------------------------');
    process.exit(1); // Завершаем процесс с ошибкой, чтобы это было видно в логах
}

app.use(express.static(staticPath));

app.get('*', (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
});


// --- ЗАПУСК СЕРВЕРА ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});