
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';
import { Buffer } from 'buffer';
import { 
    getOKBData, 
    getOKBAddresses, 
    batchUpdateOKBStatus, 
    listFilesForYear, 
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
} from './lib/sheets.js';

const MOCK_ZONES = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": { "name": "Линия боевого соприкосновения", "status": "line_of_contact" },
            "geometry": { "type": "LineString", "coordinates": [[31.55, 46.52], [37.80, 50.15]] }
        }
    ]
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const action = (req.query.action as string) || '';

    try {
        switch (action) {
            case 'get-okb': {
                const okbData = await getOKBData();
                res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
                return res.status(200).json(okbData);
            }
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
                    const files = await listFilesForYear(year);
                    if (files.length === 0) return res.status(200).json({ version: 'none' });
                    const meta = await drive.files.get({ fileId: files[0].id, fields: 'modifiedTime, size' });
                    return res.status(200).json({ versionHash: `${meta.data.modifiedTime}-${meta.data.size}-${files.length}` });
                }
                if (mode === 'list') {
                    return res.status(200).json(await listFilesForYear(year));
                }
                if (req.query.fileId) {
                    const offset = parseInt(req.query.offset as string || '0', 10);
                    const limit = parseInt(req.query.limit as string || '5000', 10);
                    const chunk = await fetchFileContent(req.query.fileId as string, `A${offset + 1}:CZ${offset + limit}`);
                    return res.status(200).json({ rows: chunk, hasMore: chunk.length >= limit });
                }
                return res.status(400).json({ error: 'Invalid mode' });
            }
            case 'snapshot': {
                if (req.method === 'GET') {
                    const snap = await loadMasterSnapshot();
                    return snap ? res.status(200).json(snap) : res.status(404).json({ error: 'Not found' });
                }
                if (req.method === 'POST') {
                    const fid = await saveMasterSnapshot(req.body);
                    return res.status(200).json({ success: true, fileId: fid });
                }
                return res.status(405).end();
            }
            case 'full-cache': return res.status(200).json(await getFullCoordsCache());
            case 'get-address': {
                const resAddr = await getAddressFromCache(req.query.rmName as string, req.query.address as string);
                return resAddr ? res.status(200).json(resAddr) : res.status(404).end();
            }
            case 'add-to-cache': {
                const fmt = (req.body.rows as any[]).map((r: any) => [r.address, r.lat ?? '', r.lon ?? '']);
                await appendToCache(req.body.rmName, fmt);
                return res.status(200).json({ success: true });
            }
            case 'update-coords': {
                await updateCacheCoords(req.body.rmName, req.body.updates);
                return res.status(200).json({ success: true });
            }
            case 'update-address': {
                await updateAddressInCache(req.body.rmName, req.body.oldAddress, req.body.newAddress, req.body.comment);
                return res.status(200).json({ success: true });
            }
            case 'delete-address': {
                await deleteAddressFromCache(req.body.rmName, req.body.address);
                return res.status(200).json({ success: true });
            }
            case 'geocode': {
                const q = req.query.address as string;
                const gRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=ru,by,kz,kg,uz`, { headers: { 'User-Agent': 'LimRM/1.1' } });
                const gData = await gRes.json() as any[];
                if (gData && gData.length > 0) return res.status(200).json({ lat: parseFloat(gData[0].lat), lon: parseFloat(gData[0].lon) });
                return res.status(404).json({ error: 'Not found' });
            }
            case 'get-conflict-zones': {
                res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
                return res.status(200).json(MOCK_ZONES);
            }
            default: return res.status(400).json({ error: 'Invalid action' });
        }
    } catch (e: any) {
        console.error('API Error:', e);
        return res.status(500).json({ error: e.message });
    }
}
