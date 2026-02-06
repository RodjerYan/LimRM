import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Import existing API handlers
// @ts-ignore
import getAkb from '../api/get-akb.ts';
// @ts-ignore
import getFullCache from '../api/get-full-cache.ts';
// @ts-ignore
import startDataUpdate from '../api/start-data-update.ts';
// @ts-ignore
import checkUpdateStatus from '../api/check-update-status.ts';
// @ts-ignore
import checkRosstat from '../api/check-rosstat-update.ts';
// @ts-ignore
import geminiProxy from '../api/gemini-proxy.ts';

// Load environment variables from .env file in the same directory as the executable
dotenv.config();

const app = express();
// Render assigns a port dynamically to process.env.PORT
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
// Increase limit for data uploads
app.use(express.json({ limit: '50mb' }) as any);
app.use(express.text({ limit: '50mb' }) as any);

// --- Vercel/Netlify Function Adapter ---
// Converts Express req/res to Vercel-like signature where needed
const adapt = (handler: any) => async (req: any, res: any) => {
    try {
        await handler(req, res);
    } catch (error: any) {
        console.error("API Error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'Internal Server Error' });
        }
    }
};

// --- Special Adapter for Gemini Proxy (Web Standard Response) ---
// gemini-proxy.ts returns a 'new Response()', which Express doesn't handle natively.
const adaptGemini = (handler: any) => async (req: any, res: any) => {
    try {
        // Construct a Web Standard Request from Express Req
        const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const webReq = new Request(fullUrl, {
            method: req.method,
            headers: req.headers as any,
            body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
        });

        // Call the handler
        const webRes = await handler(webReq);

        // Map Web Response back to Express Res
        res.status(webRes.status);
        webRes.headers.forEach((value: string, key: string) => {
            res.setHeader(key, value);
        });

        if (webRes.body) {
            const reader = webRes.body.getReader();
            const stream = async () => {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        res.end();
                        break;
                    }
                    res.write(value);
                }
            };
            stream();
        } else {
            res.end();
        }

    } catch (error: any) {
        console.error("Gemini Proxy Adapter Error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
};

// --- API Routes Mapping ---
app.all('/api/get-akb', adapt(getAkb));
app.all('/api/get-full-cache', adapt(getFullCache));
app.all('/api/start-data-update', adapt(startDataUpdate));
app.all('/api/check-update-status', adapt(checkUpdateStatus));
app.all('/api/check-rosstat-update', adapt(checkRosstat));
app.post('/api/gemini-proxy', adaptGemini(geminiProxy));

// --- Static Files Serving (Frontend) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In production (Render), index.js is in /dist-server, frontend is in /dist
// So we go up one level to find dist
const staticPath = path.join(__dirname, '..', 'dist');

app.use(express.static(staticPath));

// Catch-all handler for React Router (SPA)
app.get('*', (req: any, res: any) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(staticPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
});