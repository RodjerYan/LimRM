import { getGoogleSheetsClient, listFilesForYear, getOKBData } from './_lib/sheets.js';

export default async function handler(req: Request) {
    // Check method
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            }
        });
    }

    const url = new URL(req.url);
    const mode = url.searchParams.get('mode');
    const year = url.searchParams.get('year');
    const fileId = url.searchParams.get('fileId');
    const offset = url.searchParams.get('offset') || '0';
    const limit = url.searchParams.get('limit') || '1000';

    try {
        // --- MODE: GET CLIENT BASE (OKB) ---
        if (mode === 'okb_data') {
            const data = await getOKBData();
            return new Response(JSON.stringify(data), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=60',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        // --- MODE: LIST FILES ---
        if (mode === 'list') {
            if (!year) {
                return new Response(JSON.stringify({ error: 'Year is required for list mode' }), { status: 400 });
            }
            const files = await listFilesForYear(year);
            return new Response(JSON.stringify(files), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=59',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        // --- MODE: GET FILE CONTENT (CHUNK VIA SHEETS API) ---
        if (fileId) {
            const sheets = await getGoogleSheetsClient();
            
            const startRow = parseInt(offset, 10) + 1; 
            const endRow = startRow + parseInt(limit, 10) - 1;
            const range = `A${startRow}:CZ${endRow}`;

            try {
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId: fileId,
                    range: range,
                    valueRenderOption: 'UNFORMATTED_VALUE',
                });
                
                const rows = response.data.values || [];
                const hasMore = rows.length === parseInt(limit, 10);

                return new Response(JSON.stringify({
                    fileId,
                    rows,
                    offset,
                    limit,
                    hasMore
                }), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-store',
                        'Access-Control-Allow-Origin': '*'
                    }
                });

            } catch (error: any) {
                if (error.code === 400 && (error.message.includes('exceeds grid limits') || error.message.includes('Unable to parse range'))) {
                    return new Response(JSON.stringify({
                        fileId,
                        rows: [],
                        offset,
                        limit,
                        hasMore: false
                    }), { status: 200, headers: {'Content-Type': 'application/json'} });
                }
                throw error;
            }
        }

        return new Response(JSON.stringify({ error: 'Invalid parameters.' }), { status: 400 });

    } catch (error: any) {
        console.error(`API Error in /api/get-akb:`, error);
        return new Response(JSON.stringify({ 
            error: 'Failed to process request.', 
            details: error.message 
        }), { status: 500, headers: {'Content-Type': 'application/json'} });
    }
}