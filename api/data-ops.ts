import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';
import { Buffer } from 'buffer';
import { getOKBData, getOKBAddresses, batchUpdateOKBStatus } from '../lib/sheets.js';
import type { FeatureCollection } from 'geojson';

// --- MOCK DATA FOR CONFLICT ZONES ---
const MOCK_CONFLICT_ZONES_GEOJSON: FeatureCollection = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {
                "name": "Линия боевого соприкосновения (ЛБС)",
                "description": "Текущая линия фронта согласно официальным данным.",
                "status": "line_of_contact",
                "last_updated": new Date().toISOString()
            },
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [31.55, 46.52], [32.22, 46.48], [32.65, 46.60], [33.36, 46.75],
                    [34.10, 47.10], [34.55, 47.45], [35.30, 47.48], [35.80, 47.35],
                    [36.20, 47.45], [36.70, 47.65], [37.20, 47.75], [37.50, 47.85],
                    [37.70, 48.05], [37.85, 48.25], [38.00, 48.55], [38.15, 48.75],
                    [38.20, 48.95], [38.10, 49.05], [38.00, 49.35], [37.85, 49.65],
                    [37.70, 49.90], [37.80, 50.15]
                ]
            }
        },
        {
            "type": "Feature",
            "properties": { "name": "Зона повышенной опасности (Белгород)", "status": "border_danger_zone" },
            "geometry": { "type": "Polygon", "coordinates": [[[35.4, 50.6], [36.0, 50.7], [37.0, 50.5], [38.0, 50.3], [39.1, 50.3], [39.1, 50.0], [38.0, 50.1], [37.0, 50.3], [36.0, 50.4], [35.4, 50.4], [35.4, 50.6]]] }
        }
    ]
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { op } = req.query;

    try {
        // --- GET: OKB Data ---
        if (op === 'get-okb' && req.method === 'GET') {
            const okbData = await getOKBData();
            res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
            return res.status(200).json(okbData);
        }

        // --- GET: Conflict Zones ---
        if (op === 'get-conflict-zones' && req.method === 'GET') {
            const data = MOCK_CONFLICT_ZONES_GEOJSON;
            if (data.features[0].properties) data.features[0].properties.last_updated = new Date().toISOString();
            res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
            return res.status(200).json(data);
        }

        // --- GET: Geocode ---
        if (op === 'geocode' && req.method === 'GET') {
            const address = req.query.address as string;
            if (!address) return res.status(400).json({ error: 'Address required' });

            const countryCodes = 'ru,by,kz,ua,kg,uz,tj,tm,am,az,ge,md';
            const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=${countryCodes}`;
            
            const nominatimRes = await fetch(nominatimUrl, {
                headers: { 'User-Agent': 'LimkormGeoAnalyzer/1.0 (https://limkorm.ru/)' }
            });

            if (!nominatimRes.ok) throw new Error(`Nominatim status: ${nominatimRes.status}`);
            const data = await nominatimRes.json() as any[];

            if (data && data.length > 0) {
                const { lat, lon } = data[0];
                res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
                return res.status(200).json({ lat: parseFloat(lat), lon: parseFloat(lon) });
            } else {
                return res.status(404).json({ error: 'Not found' });
            }
        }

        // --- POST: OKB Status ---
        if (op === 'get-okb-status' && req.method === 'POST') {
            const okbAddresses = await getOKBAddresses();
            if (!req.body || !req.body.fileBase64) return res.status(400).json({ error: 'fileBase64 required' });
            
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

        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ error: 'Method not allowed or unknown op' });

    } catch (error) {
        console.error(`Error in data-ops/${op}:`, error);
        const msg = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: 'Operation failed', details: msg });
    }
}