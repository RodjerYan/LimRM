
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    getJobState, 
    updateJobState, 
    saveTempChunk, 
    clearTempChunks, 
    loadAllTempChunks,
    getOKBData,
    fetchFileContent,
    saveSnapshotChunk,
    clearOldSnapshots,
    getFullCoordsCache,
    listFilesForYear
} from './_lib/sheets.js';
import { processBatch } from './_lib/processing.js';
import { normalizeAddress, findAddressInRow } from '../utils/dataUtils';

export const config = {
    maxDuration: 60,
};

const BATCH_SIZE = 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
            await clearTempChunks();
            const initialState: any = {
                status: 'processing',
                totalRows: 0,
                processedRows: 0,
                message: 'Инициализация...',
                startTime: Date.now(),
                lastUpdated: Date.now(),
                currentChunkIndex: 0,
                totalChunksEstimate: 0
            };
            await updateJobState(initialState);

            // Запускаем фоновый процесс через fetch
            fetch(`${selfUrl}?action=next_batch&t=${Date.now()}`).catch(console.error);

            return res.json({ success: true, message: 'Process started' });
        }

        if (action === 'next_batch') {
            const state = await getJobState();
            if (!state || state.status !== 'processing') {
                return res.json({ status: 'stopped' });
            }

            const [okbData, cacheData, files] = await Promise.all([
                getOKBData(),
                getFullCoordsCache(),
                listFilesForYear('2025')
            ]);

            if (files.length === 0) {
                await updateJobState({ ...state, status: 'error', message: 'Файлы не найдены' });
                return res.json({ error: 'No files' });
            }

            const okbCoordIndex = new Map<string, { lat: number; lon: number }>();
            okbData.forEach(row => {
                const addr = findAddressInRow(row);
                if (addr && row.lat && row.lon) {
                    okbCoordIndex.set(normalizeAddress(addr), { lat: row.lat, lon: row.lon });
                }
            });

            const cacheAddressMap = new Map();
            Object.values(cacheData).flat().forEach(item => {
                if (item.address && !item.isDeleted) {
                    cacheAddressMap.set(normalizeAddress(item.address), { 
                        lat: item.lat, lon: item.lon, isInvalid: item.isInvalid
                    });
                }
            });

            const targetFile = files[0];
            const offset = state.processedRows || 0;
            const rawData = await fetchFileContent(targetFile.id, `A${offset + 1}:CZ${offset + BATCH_SIZE}`);

            if (rawData.length === 0) {
                fetch(`${selfUrl}?action=finalize&t=${Date.now()}`).catch(console.error);
                return res.json({ status: 'finalizing' });
            }

            let headers = null;
            if (offset > 0) {
                const headerRow = await fetchFileContent(targetFile.id, `A1:CZ1`);
                if (headerRow.length > 0) headers = headerRow[0].map(h => String(h));
            }

            const result = processBatch(rawData, headers, okbCoordIndex, cacheAddressMap);

            const serializedData = {
                aggregated: Object.values(result.aggregatedData).map(item => ({
                    ...item,
                    clients: Array.from(item.clients.values())
                })),
                unidentified: result.unidentifiedRows
            };

            await saveTempChunk(state.currentChunkIndex, serializedData);

            const newState = {
                ...state,
                processedRows: offset + rawData.length,
                currentChunkIndex: state.currentChunkIndex + 1,
                lastUpdated: Date.now(),
                message: `Обработано ${offset + rawData.length} строк...`
            };
            await updateJobState(newState);

            fetch(`${selfUrl}?action=next_batch&t=${Date.now()}`).catch(console.error);
            return res.json({ status: 'continued', processed: rawData.length });
        }

        if (action === 'finalize') {
            const state = await getJobState();
            if (!state) return res.status(404).json({ error: 'No job' });

            await updateJobState({ ...state, message: 'Финализация...' });
            const chunks = await loadAllTempChunks();
            
            const finalAggregation: Record<string, any> = {};
            const finalUnidentified: any[] = [];

            chunks.forEach((chunk: any) => {
                if (chunk.unidentified) finalUnidentified.push(...chunk.unidentified);
                if (chunk.aggregated) {
                    chunk.aggregated.forEach((row: any) => {
                        if (!finalAggregation[row.key]) {
                            finalAggregation[row.key] = { ...row, clients: [], fact: 0 };
                        }
                        finalAggregation[row.key].fact += row.fact;
                        row.clients.forEach((c: any) => {
                            if (!finalAggregation[row.key].clients.some((ex: any) => ex.key === c.key)) {
                                finalAggregation[row.key].clients.push(c);
                            }
                        });
                    });
                }
            });

            const finalDataArray = Object.values(finalAggregation).map(row => ({
                ...row,
                potential: row.fact * 1.15,
                growthPotential: row.fact * 0.15,
                growthPercentage: 15,
            }));

            await clearOldSnapshots();
            const CHUNK_SIZE = 2000;
            for (let i = 0; i < Math.ceil(finalDataArray.length / CHUNK_SIZE); i++) {
                const chunk = finalDataArray.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                await saveSnapshotChunk(`snapshot_chunk_v2_${i}.json`, chunk);
            }
            
            await saveSnapshotChunk('snapshot_manifest_v2.json', {
                timestamp: Date.now(),
                totalRows: state.processedRows,
                unidentifiedRows: finalUnidentified
            });

            await clearTempChunks();
            await updateJobState({ ...state, status: 'completed', message: 'Завершено' });
            return res.json({ success: true });
        }

        return res.status(400).json({ error: 'Unknown action' });

    } catch (error: any) {
        console.error("API Error:", error);
        return res.status(500).json({ 
            error: 'Internal Server Error', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
