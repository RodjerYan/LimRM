
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { 
    getFullCoordsCache, 
    getAddressFromCache, 
    appendToCache, 
    deleteAddressFromCache, 
    updateAddressInCache, 
    updateCacheCoords,
    getGoogleSheetsClient 
} from './_lib/sheets.js';

// Allow larger payloads (20mb) and longer execution time (5 min) for the snapshot upload
export const config = {
    maxDuration: 300, 
    api: { bodyParser: { sizeLimit: '20mb' } },
};

// ID of the Spreadsheet to store snapshots. 
// Using the ID provided in the instruction.
const SPREADSHEET_ID = '1jiC-jbWz6LYpOn1FTuDdlbC7hEevJ8gJkDFwra3shag';
const SNAPSHOT_SHEET_TITLE = 'System_Snapshot';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=5');
    const action = req.query.action as string;

    try {
        const sheets = await getGoogleSheetsClient();

        if (req.method === 'GET') {
            // 1. Read Metadata (Cell B1)
            if (action === 'get-snapshot-meta') {
                try {
                    const response = await sheets.spreadsheets.values.get({
                        spreadsheetId: SPREADSHEET_ID,
                        range: `'${SNAPSHOT_SHEET_TITLE}'!B1`
                    });
                    if (response.data.values && response.data.values.length > 0) {
                        return res.json(JSON.parse(response.data.values[0][0]));
                    }
                    return res.json({ versionHash: 'none' });
                } catch (e) { 
                    // Sheet might not exist yet
                    return res.json({ versionHash: 'none' }); 
                }
            }

            // 2. Download Data (Column A) - Stitching rows back together
            if (action === 'get-snapshot') {
                try {
                    const response = await sheets.spreadsheets.values.get({
                        spreadsheetId: SPREADSHEET_ID,
                        range: `'${SNAPSHOT_SHEET_TITLE}'!A:A`
                    });
                    if (!response.data.values) return res.status(404).json({ error: 'Empty' });
                    
                    // Join all rows in Column A to reform the JSON string
                    const fullJson = response.data.values.map((row: any) => row[0]).join('');
                    return res.json(JSON.parse(fullJson));
                } catch (e) { 
                    console.error("Error loading snapshot:", e);
                    return res.status(404).json({ error: 'Error loading snapshot' }); 
                }
            }
            
            // --- Legacy GET methods ---
            if (action === 'get-full-cache' || !action) return res.json(await getFullCoordsCache());
            if (action === 'get-cached-address') {
                const { rmName, address } = req.query;
                const cached = await getAddressFromCache(rmName as string, address as string);
                return cached ? res.json(cached) : res.status(404).json({ error: 'Not found' });
            }
        }

        if (req.method === 'POST') {
            const body = req.body;

            // 3. SINGLE UPLOAD ENDPOINT (Replaces chunked Drive uploads)
            if (action === 'upload-full-snapshot') {
                const { chunks, meta } = body;
                if (!chunks || !meta) return res.status(400).json({ error: 'Invalid payload' });

                // A. Ensure Sheet Exists
                try {
                    await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, ranges: [SNAPSHOT_SHEET_TITLE] });
                } catch (e) {
                    // Create sheet if missing
                    await sheets.spreadsheets.batchUpdate({
                        spreadsheetId: SPREADSHEET_ID,
                        requestBody: { requests: [{ addSheet: { properties: { title: SNAPSHOT_SHEET_TITLE } } }] }
                    });
                }

                // B. Clear the Sheet (Columns A and B)
                await sheets.spreadsheets.values.clear({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `'${SNAPSHOT_SHEET_TITLE}'!A:B`
                });

                // C. Write Chunks to Column A with a small delay to avoid rate limits
                // Vercel function timeout is 5 mins, so 1.5s delay per chunk is safe for ~20-30 chunks (15MB)
                for (let i = 0; i < chunks.length; i++) {
                    await sheets.spreadsheets.values.append({
                        spreadsheetId: SPREADSHEET_ID,
                        range: `'${SNAPSHOT_SHEET_TITLE}'!A:A`,
                        valueInputOption: 'RAW',
                        requestBody: { values: [[chunks[i]]] }
                    });
                    // Small throttle to be nice to Google API
                    await new Promise(r => setTimeout(r, 1500)); 
                }

                // D. Write Metadata to B1
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `'${SNAPSHOT_SHEET_TITLE}'!B1`,
                    valueInputOption: 'RAW',
                    requestBody: { values: [[JSON.stringify(meta)]] }
                });

                return res.json({ success: true });
            }

            // --- Legacy POST methods ---
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
