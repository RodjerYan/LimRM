// --- GLOBAL ERROR HANDLERS (Must be first) ---
process.on('uncaughtException', (err: any) => {
    console.error('\n\n================================================================');
    console.error('🚨 [DIAGNOSTIC ERROR REPORT] UNCAUGHT EXCEPTION');
    console.error('================================================================');
    console.error('Error Type:', err.name);
    console.error('Message:', err.message);
    console.error('Stack:', err.stack);
    
    if (err.message && err.message.includes('Dynamic require')) {
        console.error('\n💡 [POSSIBLE FIX]:');
        console.error('This "Dynamic require" error usually means bundled CommonJS code is running in an ESM environment.');
        console.error('CHECK: Make sure the build script includes "--packages=external" for esbuild.');
        console.error('ACTION: Re-run "npm run build" cleanly.');
    } else if (err.code === 'MODULE_NOT_FOUND') {
        console.error('\n💡 [POSSIBLE FIX]:');
        console.error('A file or dependency is missing.');
        console.error('CHECK: If it says "dist/index.html" is missing, ensure "vite build" ran successfully.');
        console.error('CHECK: If a library is missing, run "npm install".');
    } else if (err.code === 'EADDRINUSE') {
        console.error('\n💡 [POSSIBLE FIX]:');
        console.error('The port is already taken. Render usually handles PORT automatically.');
        console.error('CHECK: Ensure you are using process.env.PORT.');
    }

    console.error('================================================================\n');
    process.exit(1);
});

process.on('unhandledRejection', (reason: any, promise) => {
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

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

console.log(`[Server] Starting up in ${process.env.NODE_ENV || 'development'} mode...`);
console.log(`[Server] Node Version: ${process.version}`);

// Middleware
app.use(cors());
// Increase limit for data uploads
app.use(express.json({ limit: '50mb' }) as any);
app.use(express.text({ limit: '50mb' }) as any);

// --- Vercel/Netlify Function Adapter ---
const adapt = (handler: any) => async (req: any, res: any) => {
    try {
        await handler(req, res);
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
        const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
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
app.all('/api/start-data-update', adapt(startDataUpdate));
app.all('/api/check-update-status', adapt(checkUpdateStatus));
app.all('/api/check-rosstat-update', adapt(checkRosstat));
app.post('/api/gemini-proxy', adaptGemini(geminiProxy));

// --- Static Files Serving ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// When built with esbuild --packages=external, this file is located at dist-server/index.js
// The static files are in dist/ relative to project root.
const staticPath = path.join(__dirname, '..', 'dist');

console.log(`[Server] Serving static files from: ${staticPath}`);

// Safety check for static folder
import fs from 'fs';
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
});