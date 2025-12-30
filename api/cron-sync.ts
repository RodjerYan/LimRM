
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    getDistributedSnapshot, 
    saveSnapshotChunk, 
    getGoogleDriveClient,
    fetchFileContent,
    getOKBData,
    getFullCoordsCache
} from './_lib/sheets.js';
import { processObjectsOnServer } from './_lib/server-processor.js';
import { findAddressInRow, normalizeAddress } from '../utils/dataUtils.js';

// Vercel Hobby Plan Limit: 10 seconds execution time.
// We set it explicitly to avoid timeouts.
export const config = {
    maxDuration: 10, 
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const action = req.query.action as string || 'auto';

    try {
        // 1. Load State
        const snapshot = await getDistributedSnapshot();
        const manifest = snapshot ? snapshot.data : { 
            versionHash: 'init', 
            totalRowsProcessed: 0, 
            isProcessing: false,
            okbRegionCounts: {},
            unidentifiedRows: []
        };

        if (action === 'auto' && !manifest.isProcessing) {
            return res.status(200).json({ status: 'Idle', processed: manifest.totalRowsProcessed });
        }

        // 2. Safety Batch Size for 10s Limit
        // 500 rows is small enough to process + save to Google Drive within ~5-8 seconds.
        const BATCH_SIZE = 500; 
        const startOffset = manifest.totalRowsProcessed || 0;

        // 3. Find Files
        const drive = await getGoogleDriveClient();
        const ROOT_FOLDER_2025 = '1uJX1deU3Xo29cGeaUsepvMdmDosCN-7u'; 
        
        // We fetch the file list dynamically to ensure we are working on valid files
        // Note: In a production app, we would cache this list in the manifest to save time.
        const filesRes = await fetch(`https://${req.headers.host}/api/get-akb?year=2025&mode=list`);
        if (!filesRes.ok) throw new Error("Failed to list files via internal API");
        const files = await filesRes.json();
        
        if (!files || files.length === 0) return res.json({ error: 'No files found' });

        const fileIndex = manifest.currentFileIndex || 0;
        
        // If we processed all files, stop.
        if (fileIndex >= files.length) {
            if (manifest.isProcessing) {
                manifest.isProcessing = false;
                await saveSnapshotChunk('snapshot_manifest_v2.json', manifest);
            }
            return res.json({ status: 'Completed', total: startOffset });
        }
        
        const currentFileId = files[fileIndex].id;
        const fileOffset = manifest.fileRowsProcessed || 0;
        
        // 4. Fetch Chunk
        const rawData = await fetchFileContent(currentFileId, `A${fileOffset + 1}:CZ${fileOffset + BATCH_SIZE}`);
        
        // If no data returned, we finished this file. Move to next.
        if (!rawData || rawData.length === 0) {
            manifest.currentFileIndex = fileIndex + 1;
            manifest.fileRowsProcessed = 0;
            await saveSnapshotChunk('snapshot_manifest_v2.json', manifest);
            return res.json({ status: 'Next File', file: files[fileIndex].name });
        }

        // 5. Context Loading (OKB + Cache)
        // Optimization: This takes ~1-2s.
        const okbData = await getOKBData();
        const coordMap = new Map();
        okbData.forEach(r => {
            const a = findAddressInRow(r);
            if (a && r.lat && r.lon) coordMap.set(normalizeAddress(a), { lat: r.lat, lon: r.lon });
        });
        
        const cacheRaw = await getFullCoordsCache();
        const cacheMap = new Map();
        Object.values(cacheRaw).flat().forEach(c => {
            if (c.address) cacheMap.set(normalizeAddress(c.address), c);
        });

        // 6. Process on Server
        const { aggregatedData, unidentifiedRows, regionCounts } = processObjectsOnServer(
            rawData, 
            startOffset, 
            coordMap, 
            cacheMap
        );

        // 7. Save Results
        const chunkName = `snapshot_chunk_v2_${Date.now()}.json`;
        await saveSnapshotChunk(chunkName, aggregatedData);

        // 8. Update Manifest
        Object.entries(regionCounts).forEach(([reg, count]) => {
            manifest.okbRegionCounts[reg] = (manifest.okbRegionCounts[reg] || 0) + (count as number);
        });
        
        const newUnidentified = [...(manifest.unidentifiedRows || []), ...unidentifiedRows];
        // Limit unidentified rows history to prevent JSON bloat
        if (newUnidentified.length > 2000) newUnidentified.splice(0, newUnidentified.length - 2000);
        manifest.unidentifiedRows = newUnidentified;

        manifest.totalRowsProcessed = startOffset + rawData.length;
        manifest.fileRowsProcessed = fileOffset + rawData.length;
        manifest.lastUpdated = Date.now();
        manifest.isProcessing = true; 

        await saveSnapshotChunk('snapshot_manifest_v2.json', manifest);

        return res.json({ 
            success: true, 
            processed: rawData.length, 
            total: manifest.totalRowsProcessed,
            file: files[fileIndex].name
        });

    } catch (e) {
        console.error("Background sync error:", e);
        // Return 500 but strictly JSON so Vercel doesn't time out waiting for response
        return res.status(500).json({ error: (e as Error).message });
    }
}
