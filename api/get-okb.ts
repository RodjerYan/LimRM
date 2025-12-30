
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';
import { Buffer } from 'buffer';
import type { FeatureCollection } from 'geojson';
import { 
    getOKBData, 
    listFilesForMonth, 
    listFilesForYear, 
    fetchFileContent, 
    getGoogleDriveClient,
    getOKBAddresses, 
    batchUpdateOKBStatus 
} from '../lib/sheets-helper.js';

export const config = {
    maxDuration: 60,
};

const MOCK_CONFLICT_ZONES_GEOJSON: FeatureCollection = {
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
    const action = req.query.action as string;

    if (req.method === 'GET') {
        if (action === 'get-okb' || !action) {
            try {
                const okbData = await getOKBData();
                res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=60');
                return res.status(200).json(okbData);
            } catch (error) {
                return res.status(500).json({ error: 'Failed to load OKB', details: (error as Error).message });
            }
        }

        if (action === 'get-akb') {
            try {
                const year = (req.query.year as string) || '2025';
                const mode = req.query.mode as string;

                if (mode === 'metadata') {
                    const drive = await getGoogleDriveClient();
                    const monthStr = req.query.month as string;
                    let files = monthStr ? await listFilesForMonth(year, parseInt(monthStr, 10)) : await listFilesForYear(year);
                    if (files.length === 0) return res.status(200).json({ version: 'none' });
                    const lastFile = files[0];
                    const meta = await drive.files.get({ fileId: lastFile.id, fields: 'modifiedTime, size, name' }) as any;
                    return res.status(200).json({
                        fileId: lastFile.id,
                        name: lastFile.name,
                        modifiedTime: meta.data.modifiedTime,
                        size: meta.data.size,
                        fileCount: files.length,
                        versionHash: `${meta.data.modifiedTime}-${meta.data.size}-${files.length}`
                    });
                }

                if (mode === 'list') {
                    const monthStr = req.query.month as string;
                    const files = monthStr ? await listFilesForMonth(year, parseInt(monthStr, 10)) : await listFilesForYear(year);
                    res.setHeader('Cache-Control', 'no-store');
                    return res.status(200).json(files);
                }

                if (req.query.fileId) {
                    const fileId = req.query.fileId as string;
                    const offset = parseInt(req.query.offset as string || '0', 10);
                    const limit = parseInt(req.query.limit as string || '2000', 10);
                    const chunk = await fetchFileContent(fileId, `A${offset + 1}:CZ${offset + limit}`);
                    const hasMore = chunk.length > 0 && chunk.length >= limit;
                    res.setHeader('Cache-Control', 'no-store');
                    return res.status(200).json({ fileId, rows: chunk, offset, limit, hasMore });
                }
                return res.status(400).json({ error: 'Invalid AKB params' });
            } catch (error) {
                return res.status(500).json({ error: 'AKB error', details: (error as Error).message });
            }
        }

        if (action === 'geocode') {
            const address = req.query.address as string;
            if (!address) return res.status(400).json({ error: 'Address required' });
            const countryCodes = 'ru,by,kz,ua,kg,uz,tj,tm,am,az,ge,md';
            const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=${countryCodes}`;
            try {
                const nominatimRes = await fetch(nominatimUrl, { headers: { 'User-Agent': 'LimkormGeoAnalyzer/1.0' } });
                if (!nominatimRes.ok) throw new Error(`Nominatim error: ${nominatimRes.status}`);
                const data = await nominatimRes.json() as any[];
                if (data && data.length > 0) {
                    const { lat, lon } = data[0];
                    res.setHeader('Cache-Control', 's-maxage=86400');
                    return res.status(200).json({ lat: parseFloat(lat), lon: parseFloat(lon) });
                }
                return res.status(404).json({ error: 'Not found' });
            } catch (error) {
                return res.status(500).json({ error: 'Geocoding failed', details: (error as Error).message });
            }
        }

        if (action === 'get-conflict-zones') {
            const data = MOCK_CONFLICT_ZONES_GEOJSON;
            if (data.features[0].properties) data.features[0].properties.last_updated = new Date().toISOString();
            res.setHeader('Cache-Control', 's-maxage=3600');
            return res.status(200).json(data);
        }
    }

    if (req.method === 'POST') {
        if (action === 'get-okb-status') {
            try {
                if (!req.body || !req.body.fileBase64) return res.status(400).json({ error: 'File required' });
                const buffer = Buffer.from(req.body.fileBase64, 'base64');
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const akbData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                const akbAddresses = new Set(akbData.flat().map(cell => String(cell).trim()));
                const updates: { rowIndex: number, status: string }[] = [];
                const results: { okbAddress: string, status: string }[] = [];
                const okbAddresses = await getOKBAddresses();
                okbAddresses.forEach((okbAddress: string, index: number) => {
                    const status = akbAddresses.has(okbAddress) ? 'Совпадение' : 'Не найдено';
                    updates.push({ rowIndex: index + 2, status });
                    results.push({ okbAddress, status });
                });
                if (updates.length > 0) await batchUpdateOKBStatus(updates);
                return res.status(200).json({ results });
            } catch (error) {
                return res.status(500).json({ error: 'Status check failed', details: (error as Error).message });
            }
        }
    }

    return res.status(400).json({ error: 'Unknown action' });
}
