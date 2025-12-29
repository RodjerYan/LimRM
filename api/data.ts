
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from "@google/genai";
import * as XLSX from 'xlsx';
import { Buffer } from 'buffer';
import { 
    getOKBData, 
    getOKBAddresses, 
    batchUpdateOKBStatus, 
    listFilesForYear, 
    listFilesForMonth,
    fetchFileContent, 
    getGoogleDriveClient,
    loadMasterSnapshot,
    saveMasterSnapshot,
    getFullCoordsCache,
    getAddressFromCache,
    appendToCache,
    updateCacheCoords,
    updateAddressInCache,
    deleteAddressFromCache
} from './_lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const action = (req.query.action as string) || '';

    try {
        if (action === 'gemini-proxy') {
            if (req.method !== 'POST') return res.status(405).end();
            const { prompt, tools } = req.body;
            if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const model = 'gemini-3-flash-preview';

            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Transfer-Encoding', 'chunked');

            const responseStream = await ai.models.generateContentStream({
                model,
                contents: prompt,
                config: { temperature: 0.7, tools: tools || [] }
            });

            for await (const chunk of responseStream) {
                const text = chunk.text;
                if (text) res.write(text);
            }
            return res.end();
        }

        switch (action) {
            case 'get-okb':
                return res.status(200).json(await getOKBData());
            
            case 'get-okb-status': {
                if (req.method !== 'POST') return res.status(405).end();
                const okbAddresses = await getOKBAddresses();
                const buffer = Buffer.from(req.body.fileBase64, 'base64');
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                const akbData: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
                const akbAddresses = new Set(akbData.flat().map((cell: any) => String(cell || '').trim()));
                const updates = okbAddresses.map((addr: string, idx: number) => ({
                    rowIndex: idx + 2,
                    status: akbAddresses.has(addr) ? 'Совпадение' : 'Не найдено'
                }));
                await batchUpdateOKBStatus(updates);
                return res.status(200).json({ success: true });
            }

            case 'get-akb': {
                const year = (req.query.year as string) || '2025';
                const mode = req.query.mode as string;
                if (mode === 'metadata') {
                    const drive = await getGoogleDriveClient();
                    const monthStr = req.query.month as string;
                    const files = monthStr ? await listFilesForMonth(year, parseInt(monthStr, 10)) : await listFilesForYear(year);
                    if (files.length === 0) return res.status(200).json({ version: 'none' });
                    const meta = await drive.files.get({ fileId: files[0].id, fields: 'modifiedTime, size' });
                    return res.status(200).json({ versionHash: `${meta.data.modifiedTime}-${meta.data.size}-${files.length}` });
                }
                if (mode === 'list') {
                    const monthStr = req.query.month as string;
                    return res.status(200).json(monthStr ? await listFilesForMonth(year, parseInt(monthStr, 10)) : await listFilesForYear(year));
                }
                if (req.query.fileId) {
                    const offset = parseInt(req.query.offset as string || '0', 10);
                    const limit = parseInt(req.query.limit as string || '5000', 10);
                    const chunk = await fetchFileContent(req.query.fileId as string, `A${offset + 1}:CZ${offset + limit}`);
                    return res.status(200).json({ rows: chunk, hasMore: chunk.length >= limit });
                }
                return res.status(400).json({ error: 'Invalid mode' });
            }

            case 'snapshot':
                if (req.method === 'GET') return res.status(200).json(await loadMasterSnapshot());
                if (req.method === 'POST') return res.status(200).json({ success: true, fileId: await saveMasterSnapshot(req.body) });
                return res.status(405).end();

            case 'full-cache':
                return res.status(200).json(await getFullCoordsCache());

            case 'get-cached-address':
                return res.status(200).json(await getAddressFromCache(req.query.rmName as string, req.query.address as string));

            case 'add-to-cache':
                await appendToCache(req.body.rmName, req.body.rows.map((r: any) => [r.address, r.lat ?? '', r.lon ?? '']));
                return res.status(200).json({ success: true });

            case 'update-coords':
                await updateCacheCoords(req.body.rmName, req.body.updates);
                return res.status(200).json({ success: true });

            case 'update-address':
                await updateAddressInCache(req.body.rmName, req.body.oldAddress, req.body.newAddress, req.body.comment);
                return res.status(200).json({ success: true });

            case 'delete-address':
                await deleteAddressFromCache(req.body.rmName, req.query.address as string);
                return res.status(200).json({ success: true });

            case 'geocode': {
                const q = req.query.address as string;
                const gRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`, { headers: { 'User-Agent': 'LimRM/1.1' } });
                const gData = await gRes.json() as any[];
                if (gData?.length > 0) return res.status(200).json({ lat: parseFloat(gData[0].lat), lon: parseFloat(gData[0].lon) });
                return res.status(404).json({ error: 'Not found' });
            }

            case 'get-conflict-zones':
                return res.status(200).json({ type: "FeatureCollection", features: [] });

            default:
                return res.status(400).json({ error: `Unknown action: ${action}` });
        }
    } catch (e: any) {
        console.error('API Error:', e);
        if (!res.headersSent) res.status(500).json({ error: e.message });
        else res.end();
    }
}
