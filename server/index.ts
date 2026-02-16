
// --- GLOBAL ERROR HANDLERS (Must be first) ---
(process as any).on('uncaughtException', (err: any) => {
    console.error('\n\n================================================================');
    console.error('🚨 [DIAGNOSTIC ERROR REPORT] UNCAUGHT EXCEPTION');
    console.error('================================================================');
    console.error('Error Type:', err.name);
    console.error('Message:', err.message);
    console.error('Stack:', err.stack);
    console.error('================================================================\n');
    (process as any).exit(1);
});

(process as any).on('unhandledRejection', (reason: any, promise: any) => {
    console.error('\n\n================================================================');
    console.error('🚨 [DIAGNOSTIC ERROR REPORT] UNHANDLED PROMISE REJECTION');
    console.error('================================================================');
    console.error('Reason:', reason);
    if (reason instanceof Error) {
        console.error('Stack:', reason.stack);
    }
    console.error('================================================================\n');
});

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';

// Import existing API handlers
// @ts-ignore
import getAkb from '../api/get-akb.ts';
// @ts-ignore
import getFullCache from '../api/get-full-cache.ts';
// @ts-ignore
import getHistory from '../api/get-history.ts';
// @ts-ignore
import syncGoogle from '../api/sync-google.ts';
// @ts-ignore
import startDataUpdate from '../api/start-data-update.ts';
// @ts-ignore
import checkUpdateStatus from '../api/check-update-status.ts';
// @ts-ignore
import checkRosstat from '../api/check-rosstat-update.ts';
// @ts-ignore
import geminiProxy from '../api/gemini-proxy.ts';
// @ts-ignore
import keepAlive from '../api/keep-alive.ts';
// @ts-ignore
import runEtl from '../api/run-etl.ts';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

console.log(`[Server] Starting up in ${process.env.NODE_ENV || 'development'} mode...`);
console.log(`[Server] Node Version: ${(process as any).version}`);

// Middleware
app.use(cors());
// Increase limit for data uploads
app.use(express.json({ limit: '50mb' }) as any);
app.use(express.text({ limit: '50mb' }) as any);

// --- Vercel/Netlify Function Adapter (FIXED FOR INVALID URL) ---
const adapt = (handler: any) => async (req: any, res: any) => {
    try {
        // CRITICAL FIX: Construct full URL
        const protocol = req.protocol || 'http';
        const host = req.get('host') || `localhost:${PORT}`;
        const fullUrl = `${protocol}://${host}${req.originalUrl}`;

        const webReq = new Request(fullUrl, {
            method: req.method,
            headers: req.headers as any,
            body: (req.method !== 'GET' && req.method !== 'HEAD') ? JSON.stringify(req.body) : undefined,
        });

        const webRes = await handler(webReq);

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
        console.error("API Error in adapter:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'Internal Server Error', stack: process.env.NODE_ENV === 'development' ? error.stack : undefined });
        }
    }
};

// --- Special Adapter for Gemini Proxy ---
const adaptGemini = (handler: any) => async (req: any, res: any) => {
    try {
        const protocol = req.protocol || 'http';
        const host = req.get('host') || `localhost:${PORT}`;
        const fullUrl = `${protocol}://${host}${req.originalUrl}`;
        
        const webReq = new Request(fullUrl, {
            method: req.method,
            headers: req.headers as any,
            body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
        });

        const webRes = await handler(webReq);

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

// --- API Routes ---
app.all('/api/get-akb', adapt(getAkb));
app.all('/api/get-full-cache', adapt(getFullCache));

// Routes for address management (redirect to getFullCache logic)
app.all('/api/get-cached-address', adapt(getFullCache));
app.all('/api/update-address', adapt(getFullCache));
app.all('/api/delete-address', adapt(getFullCache));
app.all('/api/snapshot', adapt(getFullCache)); // Legacy/Alias

// NEW ROUTES
app.all('/api/get-history', adapt(getHistory));
app.all('/api/sync-google', adapt(syncGoogle));
app.all('/api/run-etl', adapt(runEtl)); // ETL Route

app.all('/api/start-data-update', adapt(startDataUpdate));
app.all('/api/check-update-status', adapt(checkUpdateStatus));
app.all('/api/check-rosstat-update', adapt(checkRosstat));
app.post('/api/gemini-proxy', adaptGemini(geminiProxy));
app.all('/api/keep-alive', adapt(keepAlive)); // Keep-Alive route

// --- Static Files Serving ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// When built with esbuild --packages=external, this file is located at dist-server/index.js
// The static files are in dist/ relative to project root.
const staticPath = path.join(__dirname, '..', 'dist');

console.log(`[Server] Serving static files from: ${staticPath}`);

if (!fs.existsSync(staticPath)) {
    console.error(`\n⚠️  WARNING: Static folder not found at ${staticPath}`);
    console.error(`   The frontend will not load. Ensure 'vite build' ran successfully.\n`);
}

app.use(express.static(staticPath) as any);

// Catch-all handler for React Router
app.get('*', (req: any, res: any) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    
    if (req.path.startsWith('/assets/') || req.path.endsWith('.js') || req.path.endsWith('.css')) {
        return res.status(404).send('Not found');
    }

    const indexPath = path.join(staticPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('Application not built. Please run npm run build.');
    }
});

app.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
    console.log(`[Server] Health Check: OK`);

    // --- SELF-PING MECHANISM FOR RENDER (PREVENT SLEEP) ---
    // Render free tier sleeps after 15 minutes of inactivity.
    // We ping the EXTERNAL URL to simulate incoming traffic.
    const SELF_PING_INTERVAL = 14 * 60 * 1000; // 14 minutes (safe buffer before 15m timeout)
    
    // RENDER_EXTERNAL_URL is automatically set by Render
    const pingHost = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    const pingUrl = `${pingHost}/api/keep-alive`;

    console.log(`[Server] Starting Keep-Alive Trigger to ${pingUrl} every ${SELF_PING_INTERVAL/60000} minutes...`);
    
    const triggerKeepAlive = () => {
        const timestamp = new Date().toISOString();
        fetch(pingUrl)
            .then(res => {
                if (res.ok) {
                    // console.debug(`[Keep-Alive] Success at ${timestamp}`);
                } else {
                    console.warn(`[Keep-Alive] Warning: Received status ${res.status} at ${timestamp}`);
                }
            })
            .catch(err => {
                console.error(`[Keep-Alive] Error at ${timestamp}: ${err.message}`);
            });
    };

    // Initial ping after startup (delay to ensure server is ready)
    setTimeout(triggerKeepAlive, 10000);

    // Periodic ping
    setInterval(triggerKeepAlive, SELF_PING_INTERVAL);
});
