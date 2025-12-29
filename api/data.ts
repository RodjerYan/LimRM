
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Buffer } from 'node:buffer';
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
} from './_lib/sheets';

// Explicitly set Node.js 20.x runtime for Vercel
export const runtime = "nodejs20.x";

export const config = {
  maxDuration: 60,
  memory: 1024,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string) || '';

  // Unified CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    switch (action) {
      case 'get-okb':
        return res.status(200).json(await getOKBData());

      case 'get-okb-status': {
        if (req.method !== 'POST') return res.status(405).end();
        if (!req.body.fileBase64) return res.status(400).json({ error: 'File is required' });

        // Limit file size to 10 MB
        const fileBuffer = Buffer.from(req.body.fileBase64, 'base64');
        if (fileBuffer.length > 10 * 1024 * 1024) {
          return res.status(413).json({ error: 'File too large. Max 10MB' });
        }

        // Dynamic import of XLSX to reduce cold start time
        const XLSX = await import('xlsx');

        const okbAddresses = await getOKBAddresses();
        let workbook;
        try {
          workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        } catch (e: any) {
          return res.status(400).json({ error: 'Invalid Excel file', details: e.message });
        }

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
        const monthStr = req.query.month as string;

        const drive = await getGoogleDriveClient();

        if (mode === 'metadata') {
          const files = monthStr ? await listFilesForMonth(year, parseInt(monthStr, 10)) : await listFilesForYear(year);
          if (files.length === 0) return res.status(200).json({ version: 'none' });
          const meta = await drive.files.get({ fileId: files[0].id, fields: 'modifiedTime, size' });
          return res.status(200).json({ versionHash: `${meta.data.modifiedTime}-${meta.data.size}-${files.length}` });
        }

        if (mode === 'list') {
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

      case 'geocode':
        return res.status(404).json({ error: 'Not found' });

      case 'get-conflict-zones':
        return res.status(200).json({ type: "FeatureCollection", features: [] });

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (e: any) {
    console.error('API Error:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Internal Server Error' });
    else res.end();
  }
}
