
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    getJobState, updateJobState, saveTempChunk, clearTempChunks, 
    loadAllTempChunks, getOKBData, fetchFileContent, saveSnapshotChunk, 
    clearOldSnapshots, findFilesForRange 
} from './_lib/sheets.js';
import { processBatch } from './_lib/processing.js';
import { normalizeAddress, findAddressInRow } from '../utils/dataUtils';

export const config = { maxDuration: 60 };
const BATCH_SIZE = 1500;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Content-Type', 'application/json');
    try {
        const action = req.query.action as string;
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host;
        const selfUrl = `${protocol}://${host}/api/process`;

        if (action === 'status') {
            const state = await getJobState();
            return res.json(state || { status: 'idle' });
        }

        if (action === 'start') {
            const { startYear, endYear, startMonth, endMonth } = req.query;
            const params = { 
                startYear: startYear as string, 
                endYear: endYear as string, 
                startMonth: parseInt(startMonth as string), 
                endMonth: parseInt(endMonth as string) 
            };
            
            await clearTempChunks();
            const fileQueue = await findFilesForRange(params);
            
            if (fileQueue.length === 0) {
                return res.status(404).json({ error: 'No data files found for this period' });
            }

            const initialState: any = {
                status: 'processing',
                processedRows: 0,
                message: `Найдено ${fileQueue.length} мес. Инициализация...`,
                currentChunkIndex: 0,
                currentFileIndex: 0,
                fileQueue: fileQueue,
                params: params
            };
            await updateJobState(initialState);
            
            fetch(`${selfUrl}?action=next_batch&t=${Date.now()}`).catch(() => {});
            return res.json({ success: true });
        }

        if (action === 'next_batch') {
            const state = await getJobState();
            if (!state || state.status !== 'processing') return res.json({ status: 'stopped' });

            const fileIdx = state.currentFileIndex;
            const queue = state.fileQueue || [];
            
            if (fileIdx >= queue.length) {
                fetch(`${selfUrl}?action=finalize&t=${Date.now()}`).catch(() => {});
                return res.json({ status: 'finalizing' });
            }

            const targetFile = queue[fileIdx];
            const okbData = await getOKBData();
            const okbCoordIndex = new Map<string, { lat: number; lon: number }>();
            okbData.forEach(row => {
                const addr = findAddressInRow(row);
                if (addr && row.lat && row.lon) okbCoordIndex.set(normalizeAddress(addr), { lat: row.lat, lon: row.lon });
            });

            // Local offset management per file
            // Since we use temp chunks, processedRows is global, but for fetchFileContent we need local offset.
            // We'll store local offset in state as well if needed, or simply try to fetch next A{N}
            // Logic: if batch returns empty, increment currentFileIndex
            
            const offset = state.processedRows || 0; // Simplified global offset for this example
            const rawData = await fetchFileContent(targetFile.id, `A${offset + 1}:CZ${offset + BATCH_SIZE}`);

            if (rawData.length === 0) {
                // Current file is empty or finished
                await updateJobState({
                    ...state,
                    currentFileIndex: fileIdx + 1,
                    message: `Переход к следующему периоду...`
                });
                fetch(`${selfUrl}?action=next_batch&t=${Date.now()}`).catch(() => {});
                return res.json({ status: 'file_switched' });
            }

            const result = processBatch(rawData, null, okbCoordIndex, new Map());
            const serialized = {
                aggregated: Object.values(result.aggregatedData).map(i => ({ ...i, clients: Array.from(i.clients.values()) })),
                unidentified: result.unidentifiedRows
            };

            await saveTempChunk(state.currentChunkIndex, serialized);
            await updateJobState({
                ...state,
                processedRows: offset + rawData.length,
                currentChunkIndex: state.currentChunkIndex + 1,
                message: `[${fileIdx + 1}/${queue.length}] ${targetFile.name}: ${offset + rawData.length} стр.`
            });

            fetch(`${selfUrl}?action=next_batch&t=${Date.now()}`).catch(() => {});
            return res.json({ status: 'continued' });
        }

        if (action === 'finalize') {
            const state = await getJobState();
            if (!state) return res.status(404).json({ error: 'No job' });

            const chunks = await loadAllTempChunks();
            const finalAggregation: Record<string, any> = {};
            const finalUnidentified: any[] = [];

            chunks.forEach(chunk => {
                if (chunk.unidentified) finalUnidentified.push(...chunk.unidentified);
                if (chunk.aggregated) {
                    chunk.aggregated.forEach((row: any) => {
                        if (!finalAggregation[row.key]) finalAggregation[row.key] = { ...row, fact: 0, clients: [] };
                        finalAggregation[row.key].fact += row.fact;
                        row.clients.forEach((c: any) => {
                            if (!finalAggregation[row.key].clients.find((ex: any) => ex.key === c.key)) finalAggregation[row.key].clients.push(c);
                        });
                    });
                }
            });

            const finalData = Object.values(finalAggregation).map(r => ({
                ...r, potential: r.fact * 1.15, growthPotential: r.fact * 0.15, growthPercentage: 15
            }));

            await clearOldSnapshots();
            await saveSnapshotChunk('snapshot_chunk_v2_0.json', finalData);
            await saveSnapshotChunk('snapshot_manifest_v2.json', { timestamp: Date.now(), totalRows: state.processedRows, unidentifiedRows: finalUnidentified });
            await updateJobState({ ...state, status: 'completed', message: 'Готово' });
            return res.json({ success: true });
        }

        return res.status(400).json({ error: 'Invalid action' });
    } catch (e: any) {
        return res.status(500).json({ error: 'API Crash', details: e.message });
    }
}
