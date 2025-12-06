import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as SheetsLib from './lib/sheets.js';
import * as XLSX from 'xlsx';
import { Buffer } from 'buffer';

// Mock GeoJSON data for Conflict Zones (Moved from separate file)
const MOCK_CONFLICT_ZONES_GEOJSON = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": { "name": "Линия боевого соприкосновения (ЛБС)", "status": "line_of_contact" },
            "geometry": { "type": "LineString", "coordinates": [[31.55, 46.52], [32.22, 46.48], [32.65, 46.60], [33.36, 46.75], [34.10, 47.10], [34.55, 47.45], [35.30, 47.48], [35.80, 47.35], [36.20, 47.45], [36.70, 47.65], [37.20, 47.75], [37.50, 47.85], [37.70, 48.05], [37.85, 48.25], [38.00, 48.55], [38.15, 48.75], [38.20, 48.95], [38.10, 49.05], [38.00, 49.35], [37.85, 49.65], [37.70, 49.90], [37.80, 50.15]] }
        },
        {
            "type": "Feature",
            "properties": { "name": "Территория проведения СВО", "status": "occupied" },
            "geometry": { "type": "Polygon", "coordinates": [[[37.80, 50.15], [39.50, 49.80], [40.20, 48.50], [38.50, 47.00], [36.50, 46.50], [35.00, 46.00], [33.00, 46.00], [31.50, 46.50], [31.55, 46.52], [32.22, 46.48], [32.65, 46.60], [33.36, 46.75], [34.10, 47.10], [34.55, 47.45], [35.30, 47.48], [35.80, 47.35], [36.20, 47.45], [36.70, 47.65], [37.20, 47.75], [37.50, 47.85], [37.70, 48.05], [37.85, 48.25], [38.00, 48.55], [38.15, 48.75], [38.20, 48.95], [38.10, 49.05], [38.00, 49.35], [37.85, 49.65], [37.70, 49.90], [37.80, 50.15]]] }
        },
        {
            "type": "Feature",
            "properties": { "name": "Зона повышенной опасности (Белгород)", "status": "border_danger_zone" },
            "geometry": { "type": "Polygon", "coordinates": [[[35.4, 50.6], [36.0, 50.7], [37.0, 50.5], [38.0, 50.3], [39.1, 50.3], [39.1, 50.0], [38.0, 50.1], [37.0, 50.3], [36.0, 50.4], [35.4, 50.4], [35.4, 50.6]]] }
        },
        {
            "type": "Feature",
            "properties": { "name": "Зона повышенной опасности (Курск)", "status": "border_danger_zone" },
            "geometry": { "type": "Polygon", "coordinates": [[[34.3, 51.5], [35.0, 51.6], [35.8, 51.5], [35.8, 51.2], [35.0, 51.2], [34.3, 51.3], [34.3, 51.5]]] }
        },
         {
            "type": "Feature",
            "properties": { "name": "Зона повышенной опасности (Брянск)", "status": "border_danger_zone" },
            "geometry": { "type": "Polygon", "coordinates": [[[31.8, 52.4], [32.5, 52.5], [33.5, 52.3], [34.1, 52.4], [34.1, 52.1], [33.5, 52.0], [32.5, 52.1], [31.8, 52.1], [31.8, 52.4]]] }
        }
    ]
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Determine Operation Type via Query Param
    const type = req.query.type as string;

    try {
        switch (type) {
            
            // --- 1. DATA FETCHING (OKB/AKB) ---
            case 'get-okb': {
                if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
                const { source } = req.query;
                if (source === 'akb') {
                    const data = await SheetsLib.getAkbData();
                    res.setHeader('Cache-Control', 'no-store');
                    return res.status(200).json(data);
                }
                const data = await SheetsLib.getOKBData();
                res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
                return res.status(200).json(data);
            }

            case 'get-okb-status': {
                if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
                const okbAddresses = await SheetsLib.getOKBAddresses();
                if (!req.body?.fileBase64) return res.status(400).json({ error: 'File required' });
                
                const buffer = Buffer.from(req.body.fileBase64, 'base64');
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const akbData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                const akbAddresses = new Set(akbData.flat().map(cell => String(cell).trim()));

                const updates: { rowIndex: number, status: string }[] = [];
                const results: { okbAddress: string, status: string }[] = [];

                okbAddresses.forEach((addr: string, index: number) => {
                    const status = akbAddresses.has(addr) ? 'Совпадение' : 'Не найдено';
                    updates.push({ rowIndex: index + 2, status });
                    results.push({ okbAddress: addr, status });
                });

                if (updates.length > 0) await SheetsLib.batchUpdateOKBStatus(updates);
                return res.status(200).json({ results });
            }

            // --- 2. GEO & CONFLICTS ---
            case 'get-conflict-zones': {
                if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
                res.setHeader('Cache-Control', 's-maxage=3600');
                return res.status(200).json(MOCK_CONFLICT_ZONES_GEOJSON);
            }

            case 'geocode': {
                const address = req.query.address as string;
                if (!address) return res.status(400).json({ error: 'Address required' });
                const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=ru,by,kz,ua,kg,uz,tj,tm,am,az,ge,md`;
                const nominatimRes = await fetch(url, { headers: { 'User-Agent': 'LimkormGeoAnalyzer/1.0' } });
                if (!nominatimRes.ok) throw new Error('Nominatim Error');
                const data = await nominatimRes.json() as any[];
                if (data && data.length > 0) {
                    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
                    return res.status(200).json({ lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) });
                }
                return res.status(404).json({ error: 'Not found' });
            }

            // --- 3. CACHE OPERATIONS ---
            case 'cache': {
                const action = req.query.action || req.body?.action;
                
                if (req.method === 'GET') {
                    if (action === 'get-all') {
                        const data = await SheetsLib.getFullCoordsCache();
                        // Important: No-store to ensure fresh data on reload
                        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
                        return res.status(200).json(data);
                    }
                    if (action === 'get-one') {
                        const { rmName, address } = req.query;
                        if (!rmName || !address) return res.status(400).json({ error: 'Params missing' });
                        const data = await SheetsLib.getAddressFromCache(String(rmName), String(address));
                        if (data) return res.status(200).json(data);
                        return res.status(404).json({ error: 'Not found' });
                    }
                }
                
                if (req.method === 'POST') {
                    if (action === 'add') {
                        const { rmName, rows } = req.body;
                        const formattedRows = rows.map((r: any) => [r.address, r.lat ?? '', r.lon ?? '']);
                        await SheetsLib.appendToCache(rmName, formattedRows);
                        return res.status(200).json({ success: true });
                    }
                }
                return res.status(400).json({ error: 'Invalid cache action' });
            }

            // --- 4. UPDATES ---
            case 'update-address': {
                if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
                const { rmName, action, updates, oldAddress, newAddress, comment } = req.body;

                if (action === 'update-coords') {
                    await SheetsLib.updateCacheCoords(rmName, updates);
                    return res.status(200).json({ success: true });
                }
                
                await SheetsLib.updateAddressInCache(rmName, oldAddress, newAddress, comment);
                return res.status(200).json({ success: true });
            }

            // --- 5. DELETION ---
            case 'delete-address': {
                if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
                const { rmName, action, address, entryIndex, currentAddress, entryContent } = req.body;

                if (action === 'delete-history') {
                    const result = await SheetsLib.deleteHistoryEntry(rmName, currentAddress, entryIndex, entryContent);
                    if (!result) return res.status(404).json({ error: 'Failed' });
                    return res.status(200).json({ success: true, ...result });
                }

                await SheetsLib.deleteAddressFromCache(rmName, address);
                return res.status(200).json({ success: true });
            }

            default:
                return res.status(404).json({ error: `Unknown request type: ${type}` });
        }

    } catch (error: any) {
        console.error(`Gateway Error [${type}]:`, error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}