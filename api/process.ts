
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
} from './_lib/sheets'; // Убрали .js
import { processBatch } from './_lib/processing'; // Убрали .js
import { normalizeAddress, findAddressInRow } from '../utils/dataUtils';

export const config = {
    maxDuration: 60,
};

const BATCH_SIZE = 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Включаем CORS на всякий случай
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const action = req.query.action as string;
        console.log(`API Process called with action: ${action}`);

        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host;
        const selfUrl = `${protocol}://${host}/api/process`;

        if (action === 'status') {
            const state = await getJobState();
            return res.json(state || { status: 'idle' });
        }

        if (action === 'start') {
            console.log('Starting job...');
            await clearTempChunks();
            const initialState = {
                status: 'processing',
                totalRows: 0,
                processedRows: 0,
                message: 'Инициализация...',
                startTime: Date.now(),
                lastUpdated: Date.now(),
                currentChunkIndex: 0
            };
            await updateJobState(initialState as any);

            // Запускаем цепочку. 
            // Используем фоновый fetch. В Vercel это не гарантировано, но обычно дает время на запуск первого батча.
            fetch(`${selfUrl}?action=next_batch&t=${Date.now()}`).catch(e => console.error('Fetch background error:', e));

            return res.json({ success: true, message: 'Processing triggered' });
        }

        if (action === 'next_batch') {
            const state = await getJobState();
            if (!state || state.status !== 'processing') {
                console.log('Job not in processing state, stopping batch chain.');
                return res.json({ status: 'stopped' });
            }

            console.log(`Processing batch ${state.currentChunkIndex}...`);
            
            const [okbData, cacheData, files] = await Promise.all([
                getOKBData(),
                getFullCoordsCache(),
                listFilesForYear('2025')
            ]);

            if (files.length === 0) {
                await updateJobState({ ...state, status: 'error', message: 'Файлы для загрузки не найдены в Google Drive' });
                return res.json({ error: 'No files' });
            }

            const okbCoordIndex = new Map<string, { lat: number; lon: number }>();
            okbData.forEach(row => {
                const addr = findAddressInRow(row);
                if (addr && row.lat && row.lon) {
                    okbCoordIndex.set(normalizeAddress(addr), { lat: Number(row.lat), lon: Number(row.lon) });
                }
            });

            const cacheAddressMap = new Map();
            Object.entries(cacheData).forEach(([rm, rows]) => {
                rows.forEach((item: any) => {
                    if (item.address && !item.isDeleted) {
                        cacheAddressMap.set(normalizeAddress(item.address), { 
                            lat: item.lat, lon: item.lon
                        });
                    }
                });
            });

            const targetFile = files[0];
            const offset = state.processedRows || 0;
            const rawData = await fetchFileContent(targetFile.id, `A${offset + 1}:CZ${offset + BATCH_SIZE}`);

            if (rawData.length === 0) {
                console.log('No more data in file, finalizing...');
                fetch(`${selfUrl}?action=finalize&t=${Date.now()}`).catch(e => console.error(e));
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
            await updateJobState(newState as any);

            // Рекурсивный вызов следующего батча
            fetch(`${selfUrl}?action=next_batch&t=${Date.now()}`).catch(e => console.error(e));
            return res.json({ status: 'continued', processed: rawData.length });
        }

        if (action === 'finalize') {
            const state = await getJobState();
            if (!state) return res.status(404).json({ error: 'Job state missing' });

            console.log('Finalizing all chunks...');
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
            const totalChunks = Math.ceil(finalDataArray.length / CHUNK_SIZE);
            for (let i = 0; i < totalChunks; i++) {
                const chunk = finalDataArray.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                await saveSnapshotChunk(`snapshot_chunk_v2_${i}.json`, chunk);
            }
            
            await saveSnapshotChunk('snapshot_manifest_v2.json', {
                timestamp: Date.now(),
                totalRowsProcessed: state.processedRows,
                unidentifiedRows: finalUnidentified,
                okbRegionCounts: {} 
            });

            await updateJobState({ ...state, status: 'completed', message: 'Готово' } as any);
            console.log('Job completed successfully.');
            return res.json({ success: true });
        }

        return res.status(400).json({ error: 'Unknown action' });

    } catch (error: any) {
        console.error("API RUNTIME ERROR:", error);
        // Возвращаем JSON с ошибкой вместо HTML страницы
        return res.status(500).json({ 
            error: 'Server Process Failed', 
            details: error.message,
            stack: error.stack
        });
    }
}
