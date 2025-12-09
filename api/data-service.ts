
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';
import { Buffer } from 'buffer';
import { 
    getOKBData, 
    getAkbData, 
    getOKBAddresses, 
    batchUpdateOKBStatus, 
    getFullCoordsCache, 
    getAddressFromCache, 
    appendToCache, 
    deleteAddressFromCache, 
    updateAddressInCache, 
    updateCacheCoords, 
    deleteHistoryEntryFromCache 
} from './lib/sheets.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { action } = req.query;

    try {
        // --- READ OPERATIONS (GET) ---
        if (req.method === 'GET') {
            
            // 1. Get OKB Data
            if (action === 'get-okb') {
                const data = await getOKBData();
                res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
                return res.status(200).json(data);
            }

            // 2. Get AKB Data
            if (action === 'get-akb') {
                const data = await getAkbData();
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                return res.status(200).json(data);
            }

            // 3. Get Full Cache
            if (action === 'get-full-cache') {
                const data = await getFullCoordsCache();
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
                return res.status(200).json(data);
            }

            // 4. Get Single Cached Address
            if (action === 'get-cached-address') {
                const { rmName, address } = req.query;
                if (!rmName || typeof rmName !== 'string' || !address || typeof address !== 'string') {
                    return res.status(400).json({ error: 'Missing rmName or address' });
                }
                const data = await getAddressFromCache(rmName, address);
                if (data) return res.status(200).json(data);
                return res.status(404).json({ error: 'Address not found in cache' });
            }

            // 5. Geocode Proxy
            if (action === 'geocode') {
                const address = req.query.address as string;
                if (!address) return res.status(400).json({ error: 'Address required' });

                const countryCodes = 'ru,by,kz,ua,kg,uz,tj,tm,am,az,ge,md';
                const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=${countryCodes}`;
                
                const nominatimRes = await fetch(nominatimUrl, {
                    headers: { 'User-Agent': 'LimkormGeoAnalyzer/1.0 (https://limkorm.ru/)' },
                });

                if (!nominatimRes.ok) throw new Error(`Nominatim error: ${nominatimRes.status}`);
                const data = await nominatimRes.json() as any[];

                if (data && data.length > 0) {
                    const { lat, lon } = data[0];
                    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
                    return res.status(200).json({ lat: parseFloat(lat), lon: parseFloat(lon) });
                } else {
                    return res.status(404).json({ error: 'Coordinates not found' });
                }
            }
        }

        // --- WRITE OPERATIONS (POST) ---
        if (req.method === 'POST') {
            
            // 6. Check OKB Status (File Upload)
            if (action === 'get-okb-status') {
                if (!req.body || !req.body.fileBase64) {
                    return res.status(400).json({ error: 'File required' });
                }
                const okbAddresses = await getOKBAddresses();
                const buffer = Buffer.from(req.body.fileBase64, 'base64');
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const akbData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                const akbAddresses = new Set(akbData.flat().map(cell => String(cell).trim()));

                const updates: { rowIndex: number, status: string }[] = [];
                const results: { okbAddress: string, status: string }[] = [];

                okbAddresses.forEach((okbAddress: string, index: number) => {
                    const status = akbAddresses.has(okbAddress) ? 'Совпадение' : 'Не найдено';
                    updates.push({ rowIndex: index + 2, status });
                    results.push({ okbAddress, status });
                });

                if (updates.length > 0) await batchUpdateOKBStatus(updates);
                return res.status(200).json({ results });
            }

            // 7. Add to Cache
            if (action === 'add-to-cache') {
                const { rmName, rows } = req.body;
                if (!rmName || !Array.isArray(rows)) return res.status(400).json({ error: 'Invalid payload' });
                const formattedRows = rows.map((row: any) => [row.address, row.lat ?? '', row.lon ?? '']);
                await appendToCache(rmName, formattedRows);
                return res.status(200).json({ success: true });
            }

            // 8. Delete Address
            if (action === 'delete-address') {
                const { rmName, address } = req.body;
                if (!rmName || !address) return res.status(400).json({ error: 'Invalid payload' });
                await deleteAddressFromCache(rmName, address);
                return res.status(200).json({ success: true });
            }

            // 9. Update Address / Comment
            if (action === 'update-address') {
                const { rmName, oldAddress, newAddress, comment } = req.body;
                if (!rmName || !oldAddress || !newAddress) return res.status(400).json({ error: 'Invalid payload' });
                await updateAddressInCache(rmName, oldAddress, newAddress, comment);
                return res.status(200).json({ success: true });
            }

            // 10. Update Coordinates
            if (action === 'update-coords') {
                const { rmName, updates } = req.body;
                if (!rmName || !Array.isArray(updates)) return res.status(400).json({ error: 'Invalid payload' });
                await updateCacheCoords(rmName, updates);
                return res.status(200).json({ success: true });
            }

            // 11. Delete History Entry
            if (action === 'delete-history-entry') {
                const { rmName, address, entryText } = req.body;
                if (!rmName || !address || !entryText) return res.status(400).json({ error: 'Invalid payload' });
                await deleteHistoryEntryFromCache(rmName, address, entryText);
                return res.status(200).json({ success: true });
            }
        }

        return res.status(400).json({ error: `Unknown action: ${action}` });

    } catch (error) {
        console.error(`Error in data-service [${action}]:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: `Failed to process ${action}`, details: errorMessage });
    }
}
