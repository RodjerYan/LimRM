
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    getDistributedSnapshot, 
    saveSnapshotChunk, 
    getGoogleDriveClient,
    getGoogleSheetsClient,
    fetchFileContent,
    getOKBData,
    getFullCoordsCache
} from './_lib/sheets.js';
import { processObjectsOnServer } from './_lib/server-processor.js';
import { normalizeAddress, findAddressInRow } from '../utils/dataUtils.js';

export const config = {
    maxDuration: 60, // Max allowed for Hobby/Pro on Vercel
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. Secure this endpoint (optional, simple check)
    // const authHeader = req.headers['authorization'];
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) { return res.status(401).end('Unauthorized'); }

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
        const BATCH_SIZE = 2000; // Safe size for 60s timeout
        const startOffset = manifest.totalRowsProcessed || 0;

        // 3. Load Raw Data (AKB)
        // Note: For simplicity, we assume we are processing the FIRST file found in 2025 folder
        // In a real app, we'd store the fileId in the manifest.
        const drive = await getGoogleDriveClient();
        const ROOT_FOLDER_2025 = '1uJX1deU3Xo29cGeaUsepvMdmDosCN-7u'; // From sheets.ts
        
        // Find the target file
        // Helper to find file (duplicated logic for speed)
        const folderListRes = await drive.files.list({ q: `'${ROOT_FOLDER_2025}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: 'files(id)' });
        if (!folderListRes.data.files?.length) return res.json({ error: 'No 2025 folder found' });
        
        // Iterate folders to find files (Assuming structure Year -> Month -> File)
        let targetFileId = null;
        // Naive search: just find any spreadsheet in the tree
        // Improved: Look for the fileId saved in manifest if exists, else search
        
        // For this implementation, let's assume we grabbed the list of files and pick the first one 
        // OR we simply loop through months until we find data at the offset.
        
        // SIMPLIFIED LOGIC: List ALL spreadsheets in 2025 recursively
        // This is heavy, but we cache the "active file" in manifest ideally.
        // For now, we search dynamically.
        
        const q = `mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false and '${ROOT_FOLDER_2025}' in parents`; 
        // Note: Recursive search in GDrive API requires listing folders. 
        // Let's rely on `fetchFileContent` from sheets.ts but we need the ID.
        // HARDCODED FIX: We need a way to know WHICH file. 
        // Let's fetch the file list from `get-akb` logic logic.
        
        // Fallback: We assume the client started the process and validated files.
        // We will fetch file list again.
        
        // ... (Skipping complex file tree traversal for brevity, assuming we get a file list)
        // Let's assume we process "The Main File". 
        // In reality, we need to iterate all files. 
        // If startOffset > file1.length, go to file2.
        
        // Let's implement a robust "Find chunk at offset" logic
        const filesRes = await fetch(`https://${req.headers.host}/api/get-akb?year=2025&mode=list`);
        const files = await filesRes.json();
        
        let currentFileId = null;
        let localOffset = 0;
        let accum = 0;
        
        // We need to know file sizes to skip. This is slow without metadata.
        // Hack: Just try to read.
        // Better: We process ONE file at a time. The Manifest should store `currentFileIndex`.
        
        const fileIndex = manifest.currentFileIndex || 0;
        if (fileIndex >= files.length) {
            // All Done
            if (manifest.isProcessing) {
                manifest.isProcessing = false;
                await saveSnapshotChunk('snapshot_manifest_v2.json', manifest);
            }
            return res.json({ status: 'Completed', total: startOffset });
        }
        
        currentFileId = files[fileIndex].id;
        
        // 4. Fetch Data Chunk
        // We assume `totalRowsProcessed` tracks GLOBAL rows. 
        // We need `fileProcessedRows` in manifest to track local offset.
        const fileOffset = manifest.fileRowsProcessed || 0;
        
        const rawData = await fetchFileContent(currentFileId, `A${fileOffset + 1}:CZ${fileOffset + BATCH_SIZE}`);
        
        if (!rawData || rawData.length === 0) {
            // End of this file
            manifest.currentFileIndex = fileIndex + 1;
            manifest.fileRowsProcessed = 0;
            await saveSnapshotChunk('snapshot_manifest_v2.json', manifest);
            
            // Recurse / Re-trigger immediately if time allows? 
            // Better to just return and let next Cron tick handle it, or client.
            return res.json({ status: 'Next File', file: files[fileIndex].name });
        }

        // 5. Prepare Context (OKB + Cache)
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
        const chunkIndex = Math.floor(startOffset / 5000) + (fileOffset / BATCH_SIZE); // Unique-ish ID
        // Actually, let's just append timestamp to chunk name to avoid collisions
        const chunkName = `snapshot_chunk_v2_${Date.now()}.json`;
        
        await saveSnapshotChunk(chunkName, aggregatedData);

        // 8. Update Manifest
        // Merge region counts
        Object.entries(regionCounts).forEach(([reg, count]) => {
            manifest.okbRegionCounts[reg] = (manifest.okbRegionCounts[reg] || 0) + (count as number);
        });
        
        // Append Unidentified (Limit size to avoid massive JSON)
        const newUnidentified = [...(manifest.unidentifiedRows || []), ...unidentifiedRows];
        // Keep last 2000 errors max to preserve manifest size
        if (newUnidentified.length > 2000) newUnidentified.splice(0, newUnidentified.length - 2000);
        manifest.unidentifiedRows = newUnidentified;

        manifest.totalRowsProcessed = startOffset + rawData.length;
        manifest.fileRowsProcessed = fileOffset + rawData.length;
        manifest.lastUpdated = Date.now();
        manifest.isProcessing = true; // Keep running

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
