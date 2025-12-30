
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
import { normalizeAddress, findAddressInRow } from '../utils/dataUtils.js';

export const config = {
    maxDuration: 10, // Hobby Plan limit is 10s (Pro is 60s)
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const action = req.query.action as string || 'auto';

    try {
        // 1. Load Current Manifest / State
        const snapshot = await getDistributedSnapshot();
        const manifest = snapshot ? snapshot.data : { 
            versionHash: 'init', 
            totalRowsProcessed: 0, 
            isProcessing: false,
            okbRegionCounts: {},
            unidentifiedRows: []
        };

        // If explicitly stopped or not started, do nothing (unless forced)
        if (action === 'auto' && !manifest.isProcessing) {
            return res.status(200).json({ status: 'Idle', processed: manifest.totalRowsProcessed });
        }

        // 2. Determine Next Batch
        // CRITICAL FOR HOBBY PLAN: Reduced to 500 to fit in 10s timeout
        const BATCH_SIZE = 500; 
        const startOffset = manifest.totalRowsProcessed || 0;

        // 3. Load Raw Data (AKB)
        const drive = await getGoogleDriveClient();
        const ROOT_FOLDER_2025 = '1uJX1deU3Xo29cGeaUsepvMdmDosCN-7u'; 
        
        // Find the target file
        const filesRes = await fetch(`https://${req.headers.host}/api/get-akb?year=2025&mode=list`);
        if (!filesRes.ok) throw new Error("Failed to list files");
        const files = await filesRes.json();
        
        if (!files || files.length === 0) return res.json({ error: 'No files found' });

        const fileIndex = manifest.currentFileIndex || 0;
        if (fileIndex >= files.length) {
            // All Done
            if (manifest.isProcessing) {
                manifest.isProcessing = false;
                await saveSnapshotChunk('snapshot_manifest_v2.json', manifest);
            }
            return res.json({ status: 'Completed', total: startOffset });
        }
        
        const currentFileId = files[fileIndex].id;
        const fileOffset = manifest.fileRowsProcessed || 0;
        
        // 4. Fetch Data Chunk
        const rawData = await fetchFileContent(currentFileId, `A${fileOffset + 1}:CZ${fileOffset + BATCH_SIZE}`);
        
        if (!rawData || rawData.length === 0) {
            // End of this file, move to next
            manifest.currentFileIndex = fileIndex + 1;
            manifest.fileRowsProcessed = 0;
            await saveSnapshotChunk('snapshot_manifest_v2.json', manifest);
            return res.json({ status: 'Next File', file: files[fileIndex].name });
        }

        // 5. Prepare Context (OKB + Cache)
        // Optimization: We load this every time. In a real heavy app, we'd cache this in a separate JSON in /tmp
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

        // 6. PROCESS
        const { aggregatedData, unidentifiedRows, regionCounts } = processObjectsOnServer(
            rawData, 
            startOffset, 
            coordMap, 
            cacheMap
        );

        // 7. Save Chunk
        const chunkName = `snapshot_chunk_v2_${Date.now()}.json`;
        await saveSnapshotChunk(chunkName, aggregatedData);

        // 8. Update Manifest
        Object.entries(regionCounts).forEach(([reg, count]) => {
            manifest.okbRegionCounts[reg] = (manifest.okbRegionCounts[reg] || 0) + (count as number);
        });
        
        const newUnidentified = [...(manifest.unidentifiedRows || []), ...unidentifiedRows];
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
        return res.status(500).json({ error: (e as Error).message });
    }
}
