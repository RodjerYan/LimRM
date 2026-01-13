
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    getFullCoordsCache, 
    getAddressFromCache, 
    appendToCache, 
    deleteAddressFromCache, 
    updateAddressInCache, 
    updateCacheCoords,
    getGoogleSheetsClient,
    saveSnapshot,
    getSnapshot,
    initSnapshot,
    appendSnapshot
} from './_lib/sheets.js';

export const config = {
    maxDuration: 60,
    api: { bodyParser: false },
};

const SPREADSHEET_ID = '1jiC-jbWz6LYpOn1FTuDdlbC7hEevJ8gJkDFwra3shag';
const SNAPSHOT_SHEET_TITLE = 'System_Snapshot';

async function getRawBody(req: VercelRequest): Promise<Buffer> {
    const buffers = [];
    for await (const chunk of req) { buffers.push(chunk); }
    return Buffer.concat(buffers);
}

// Ensure snapshot sheet utility
async function ensureSnapshotSheetExists(sheets: any) {
    try {
        await sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID,
            ranges: [SNAPSHOT_SHEET_TITLE]
        });
    } catch (e) {
        try {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                requestBody: { requests: [{ addSheet: { properties: { title: SNAPSHOT_SHEET_TITLE } } }] }
            });
        } catch (createError) { }
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=5');
    const action = req.query.action as string;

    try {
        const sheets = await getGoogleSheetsClient();

        // --- SECURITY CHECK FOR MUTATIONS ---
        if (req.method === 'POST') {
            const apiKey = req.headers['x-api-key'];
            if (process.env.API_SECRET_KEY && apiKey !== process.env.API_SECRET_KEY) {
                return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
            }
        }

        if (req.method === 'GET') {
            if (action === 'get-snapshot-meta') {
                try {
                    const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `'${SNAPSHOT_SHEET_TITLE}'!B1` });
                    if (response.data.values && response.data.values.length > 0 && response.data.values[0][0]) {
                        return res.json(JSON.parse(response.data.values[0][0]));
                    }
                    return res.json({ versionHash: 'none' });
                } catch (e) { return res.json({ versionHash: 'none' }); }
            }

            if (action === 'get-snapshot') {
                try {
                    const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `'${SNAPSHOT_SHEET_TITLE}'!A:A` });
                    if (!response.data.values || response.data.values.length === 0) return res.status(404).json({ error: 'Snapshot empty' });
                    const fullJson = response.data.values.map((row: any) => row[0]).join('');
                    try { return res.json(JSON.parse(fullJson)); } catch (e) { return res.send(fullJson); }
                } catch (e) { return res.status(404).json({ error: 'Snapshot not found' }); }
            }
            
            if (action === 'get-full-cache' || !action) return res.json(await getFullCoordsCache());
            if (action === 'get-cached-address') {
                const { rmName, address } = req.query;
                const cached = await getAddressFromCache(rmName as string, address as string);
                return cached ? res.json(cached) : res.status(404).json({ error: 'Not found' });
            }
        }

        if (req.method === 'POST') {
            let body: any;
            try {
                const raw = await getRawBody(req);
                if (raw.length > 0) body = JSON.parse(raw.toString('utf8'));
            } catch (e) { }

            if (action === 'init-snapshot') {
                await ensureSnapshotSheetExists(sheets);
                await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: `'${SNAPSHOT_SHEET_TITLE}'!A:B` });
                return res.json({ success: true });
            }

            if (action === 'append-snapshot') {
                const { chunk } = body; 
                if (!chunk) return res.status(400).json({ error: 'No chunk' });
                await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: `'${SNAPSHOT_SHEET_TITLE}'!A:A`, valueInputOption: 'RAW', requestBody: { values: [[chunk]] } });
                return res.json({ success: true });
            }

            if (action === 'save-meta') {
                await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `'${SNAPSHOT_SHEET_TITLE}'!B1`, valueInputOption: 'RAW', requestBody: { values: [[JSON.stringify(body)]] } });
                return res.json({ success: true });
            }

            if (action === 'add-to-cache') { const { rmName, rows } = body; await appendToCache(rmName, rows.map((r: any) => [r.address, r.lat||'', r.lon||''])); return res.json({success:true}); }
            if (action === 'update-address') { await updateAddressInCache(body.rmName, body.oldAddress, body.newAddress, body.comment); return res.json({success:true}); }
            if (action === 'update-coords') { await updateCacheCoords(body.rmName, body.updates); return res.json({success:true}); }
            if (action === 'delete-address') { await deleteAddressFromCache(body.rmName, body.address); return res.json({success:true}); }
        }

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: (error as Error).message });
    }
    return res.status(400).json({ error: 'Invalid action' });
}
