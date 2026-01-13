
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Navigation from './components/Navigation';
import Adapta from './components/modules/Adapta';
import Prophet from './components/modules/Prophet';
import AgileLearning from './components/modules/AgileLearning';
import RoiGenome from './components/modules/RoiGenome'; 
import InteractiveRegionMap from './components/InteractiveRegionMap';
import Filters from './components/Filters';
import PotentialChart from './components/PotentialChart';
import ResultsTable from './components/ResultsTable';
import { RMDashboard } from './components/RMDashboard';
import Notification from './components/Notification';
import DetailsModal from './components/DetailsModal';
import UnidentifiedRowsModal from './components/UnidentifiedRowsModal';
import AddressEditModal from './components/AddressEditModal'; 
import ApiKeyErrorDisplay from './components/ApiKeyErrorDisplay';
import MergeOverlay from './components/MergeOverlay';
import Presentation from './components/modules/Presentation';

import { 
    AggregatedDataRow, 
    FilterOptions, 
    FilterState, 
    NotificationMessage, 
    OkbStatus, 
    OkbDataRow,
    MapPoint,
    UnidentifiedRow,
    CloudLoadParams
} from './types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, findAddressInRow, normalizeAddress } from './utils/dataUtils';
import { LoaderIcon, CheckIcon } from './components/icons';
import { enrichDataWithSmartPlan } from './services/planning/integration';
import { loadAnalyticsState } from './utils/db';
import { useCloudSync } from './hooks/useCloudSync';

const isApiKeySet = import.meta.env.VITE_GEMINI_API_KEY === 'key_is_set';

const App: React.FC = () => {
    if (!isApiKeySet) return <ApiKeyErrorDisplay />;

    const [activeModule, setActiveModule] = useState('adapta');
    const [allData, setAllData] = useState<AggregatedDataRow[]>([]);
    const [filteredData, setFilteredData] = useState<AggregatedDataRow[]>([]);
    const [dateRange, setDateRange] = useState<string | undefined>(undefined);
    
    // --- DATE FILTER STATE ---
    const [filterStartDate, setFilterStartDate] = useState<string>('');
    const [filterEndDate, setFilterEndDate] = useState<string>('');

    const [notifications, setNotifications] = useState<NotificationMessage[]>([]);
    
    const [lastSnapshotVersion, setLastSnapshotVersion] = useState<string | null>(localStorage.getItem('last_snapshot_version'));
    const [isRestoring, setIsRestoring] = useState(true);
    const [dbStatus, setDbStatus] = useState<'empty' | 'ready' | 'loading'>('empty');
    
    const totalRowsProcessedRef = useRef<number>(0);
    const processedFileIdsRef = useRef<Set<string>>(new Set());
    const allDataRef = useRef<AggregatedDataRow[]>([]);
    const unidentifiedRowsRef = useRef<UnidentifiedRow[]>([]);
    const pollingIntervals = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
    
    const [okbData, setOkbData] = useState<OkbDataRow[]>([]);
    const [okbStatus, setOkbStatus] = useState<OkbStatus | null>(null);
    const [okbRegionCounts, setOkbRegionCounts] = useState<{ [key: string]: number } | null>(null);
    const [allActiveClients, setAllActiveClients] = useState<MapPoint[]>([]);
    const [unidentifiedRows, setUnidentifiedRows] = useState<UnidentifiedRow[]>([]);
    const [filters, setFilters] = useState<FilterState>({ rm: '', brand: [], packaging: [], region: [] });
    
    const [isUnidentifiedModalOpen, setIsUnidentifiedModalOpen] = useState(false);
    const [selectedDetailsRow, setSelectedDetailsRow] = useState<AggregatedDataRow | null>(null);
    const [editingClient, setEditingClient] = useState<MapPoint | UnidentifiedRow | null>(null); 
    const [flyToClientKey, setFlyToClientKey] = useState<string | null>(null);

    const [mergeModalData, setMergeModalData] = useState<{
        initialCount: number;
        finalCount: number;
        newClients: MapPoint[];
        newAllData: AggregatedDataRow[];
    } | null>(null);

    useEffect(() => { allDataRef.current = allData; }, [allData]);
    useEffect(() => { unidentifiedRowsRef.current = unidentifiedRows; }, [unidentifiedRows]);

    const addNotification = useCallback((message: string, type: NotificationMessage['type']) => {
        const newNotification: NotificationMessage = { id: Date.now(), message, type };
        setNotifications(prev => [...prev, newNotification]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== newNotification.id)), 5000);
    }, []);

    // --- HOOK: CLOUD SYNC ---
    const {
        isLiveConnected,
        setIsLiveConnected,
        isSavingToCloud,
        uploadProgress,
        processingState,
        setProcessingState,
        handleStartCloudProcessing,
        checkCloudChanges,
        persistToDB,
        uploadStartTimeRef
    } = useCloudSync({
        allDataRef,
        unidentifiedRowsRef,
        processedFileIdsRef,
        totalRowsProcessedRef,
        setAllData,
        setUnidentifiedRows,
        setOkbRegionCounts,
        setAllActiveClients,
        setDbStatus,
        okbData,
        lastSnapshotVersion,
        setLastSnapshotVersion
    });

    // --- CALCULATE DUPLICATES COUNT ---
    const duplicatesCount = useMemo(() => {
        if (allActiveClients.length === 0) return 0;
        const uniqueKeys = new Set<string>();
        let duplicates = 0;
        allActiveClients.forEach(client => {
            const normAddr = normalizeAddress(client.address);
            const key = `${normAddr}_${client.type || 'common'}`;
            if (uniqueKeys.has(key)) duplicates++;
            else uniqueKeys.add(key);
        });
        return duplicates;
    }, [allActiveClients]);

    const handleDataUpdate = useCallback(async (oldKey: string, newPoint: MapPoint) => {
        if (pollingIntervals.current.has(oldKey) && !newPoint.isGeocoding) {
            clearInterval(pollingIntervals.current.get(oldKey));
            pollingIntervals.current.delete(oldKey);
        }
        setEditingClient(prev => (prev && 'key' in prev && (prev as MapPoint).key === oldKey ? newPoint : prev));
        
        let finalData: AggregatedDataRow[] = [];
        let finalUnidentified: UnidentifiedRow[] = [];
        let finalPoints: MapPoint[] = [];
        
        setAllActiveClients(prev => {
            const index = prev.findIndex(c => c.key === oldKey);
            const updated = index !== -1 ? [...prev] : [...prev, newPoint];
            if (index !== -1) updated[index] = newPoint;
            finalPoints = updated;
            return updated;
        });
        
        setAllData(prev => {
            finalData = prev.map(group => {
                const clientIndex = group.clients.findIndex(c => c.key === oldKey);
                if (clientIndex !== -1) {
                    const updatedClients = [...group.clients];
                    updatedClients[clientIndex] = newPoint;
                    return { ...group, clients: updatedClients };
                }
                return group;
            });
            return finalData;
        });

        setUnidentifiedRows(prev => {
            finalUnidentified = prev.filter(row => {
                const rowAddr = normalizeAddress(findAddressInRow(row.rowData));
                return rowAddr !== oldKey && rowAddr !== newPoint.key;
            });
            return finalUnidentified;
        });

        try {
            fetch('/api/get-full-cache?action=update-address', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-api-key': import.meta.env.VITE_API_SECRET_KEY || ''
                },
                body: JSON.stringify({
                    rmName: newPoint.rm || 'Unknown',
                    oldAddress: oldKey,
                    newAddress: newPoint.address,
                    comment: newPoint.comment,
                    lat: newPoint.lat,
                    lon: newPoint.lon
                })
            }).then(res => {
                if (res.ok) console.log(`Edit saved to cloud: ${newPoint.address}`);
                else console.warn("Failed to save edit to cloud");
            });
        } catch (e) { console.error("Network error saving edit:", e); }

        setTimeout(() => persistToDB(finalData, finalUnidentified, totalRowsProcessedRef.current || 0), 50);
    }, [persistToDB]);

    const handleStartPolling = useCallback((rmName: string, address: string, tempKey: string, basePoint: MapPoint) => {
        if (pollingIntervals.current.has(tempKey)) clearInterval(pollingIntervals.current.get(tempKey));
        const intervalId = setInterval(async () => {
            try {
                const res = await fetch(`/api/get-cached-address?rmName=${encodeURIComponent(rmName)}&address=${encodeURIComponent(address)}&t=${Date.now()}`);
                if (res.ok) {
                    const cached = await res.json();
                    if (cached.isInvalid) {
                        handleDataUpdate(tempKey, { ...basePoint, isGeocoding: false, geocodingError: 'Геокодер не смог найти этот адрес.', lastUpdated: Date.now() });
                        addNotification(`Адрес не распознан: ${address}`, 'error');
                        return;
                    }
                    if (cached.lat && cached.lon && !isNaN(cached.lat)) {
                        handleDataUpdate(tempKey, { ...basePoint, lat: parseFloat(cached.lat), lon: parseFloat(cached.lon), isGeocoding: false, geocodingError: undefined, lastUpdated: Date.now() });
                        addNotification(`Координаты определены: ${address}`, 'success');
                    }
                }
            } catch (e) {}
        }, 10000);
        pollingIntervals.current.set(tempKey, intervalId);
    }, [handleDataUpdate, addNotification]);

    const handleDeleteClient = useCallback(async (key: string) => {
        let finalData: AggregatedDataRow[] = [];
        let finalUnidentified: UnidentifiedRow[] = [];
        let finalPoints: MapPoint[] = [];
        setAllActiveClients(prev => { finalPoints = prev.filter(c => c.key !== key); return finalPoints; });
        setAllData(prev => { finalData = prev.map(group => ({ ...group, clients: group.clients.filter(c => c.key !== key) })); return finalData; });
        setUnidentifiedRows(prev => { finalUnidentified = prev.filter(row => normalizeAddress(findAddressInRow(row.rowData)) !== key); return finalUnidentified; });
        if (pollingIntervals.current.has(key)) { clearInterval(pollingIntervals.current.get(key)); pollingIntervals.current.delete(key); }
        setEditingClient(null);
        setTimeout(() => persistToDB(finalData, finalUnidentified, totalRowsProcessedRef.current || 0), 50);
    }, [persistToDB]);

    const handleDeduplicate = useCallback(() => {
        if (duplicatesCount === 0) { addNotification('Дубликатов не найдено. База оптимизирована.', 'info'); return; }
        const uniqueMap = new Map<string, MapPoint>();
        allActiveClients.forEach(client => {
            const normAddr = normalizeAddress(client.address);
            const key = `${normAddr}_${client.type || 'common'}`;
            if (uniqueMap.has(key)) {
                const existing = uniqueMap.get(key)!;
                existing.fact = (existing.fact || 0) + (client.fact || 0);
                if (client.brand && existing.brand && !existing.brand.includes(client.brand)) { existing.brand += `, ${client.brand}`; }
                existing.potential = Math.max(existing.potential || 0, client.potential || 0);
                if (!existing.lat && client.lat) { existing.lat = client.lat; existing.lon = client.lon; }
            } else { uniqueMap.set(key, { ...client }); }
        });
        const newClients = Array.from(uniqueMap.values());
        const clientLookup = new Map<string, MapPoint>();
        newClients.forEach(c => { const normAddr = normalizeAddress(c.address); const key = `${normAddr}_${c.type || 'common'}`; clientLookup.set(key, c); });
        const newAllData = allData.map(row => {
            const uniqueGroupClients = new Map<string, MapPoint>();
            row.clients.forEach(c => {
                const normAddr = normalizeAddress(c.address); const key = `${normAddr}_${c.type || 'common'}`;
                const mergedClient = clientLookup.get(key);
                if (mergedClient) uniqueGroupClients.set(key, mergedClient);
            });
            return { ...row, clients: Array.from(uniqueGroupClients.values()) };
        });
        setMergeModalData({ initialCount: allActiveClients.length, finalCount: newClients.length, newClients: newClients, newAllData: newAllData });
    }, [allActiveClients, allData, addNotification, duplicatesCount]);

    const handleMergeComplete = useCallback(async () => {
        if (!mergeModalData) return;
        setAllActiveClients(mergeModalData.newClients);
        setAllData(mergeModalData.newAllData);
        await persistToDB(mergeModalData.newAllData, unidentifiedRows, totalRowsProcessedRef.current || 0);
        setMergeModalData(null);
        addNotification(`База оптимизирована. Удалено ${mergeModalData.initialCount - mergeModalData.finalCount} дублей.`, 'success');
    }, [mergeModalData, unidentifiedRows, persistToDB, addNotification]);

    useEffect(() => {
        const timer = setInterval(() => { setIsLiveConnected(false); setTimeout(() => setIsLiveConnected(true), 300); checkCloudChanges(); }, 15000); 
        if (!isRestoring && dbStatus === 'ready') checkCloudChanges();
        return () => clearInterval(timer);
    }, [checkCloudChanges, isRestoring, dbStatus, setIsLiveConnected]);

    useEffect(() => {
        const initializeApp = async () => {
            setDbStatus('loading');
            setProcessingState(prev => ({ ...prev, message: 'Синхронизация с командой...' }));
            try {
                const localState = await loadAnalyticsState();
                let localVersion = null;
                if (localState && localState.allData?.length > 0) {
                    setAllData(localState.allData);
                    setUnidentifiedRows(localState.unidentifiedRows || []);
                    setOkbRegionCounts(localState.okbRegionCounts || null);
                    setOkbData(localState.okbData || []);
                    setOkbStatus(localState.okbStatus || null);
                    setDateRange(localState.dateRange);
                    if (localState.processedFileIds) processedFileIdsRef.current = new Set(localState.processedFileIds);
                    if (localState.versionHash) { localVersion = localState.versionHash; setLastSnapshotVersion(localVersion); localStorage.setItem('last_snapshot_version', localVersion); }
                    const clientsMap = new Map<string, MapPoint>();
                    localState.allData.forEach((row: AggregatedDataRow) => { row.clients.forEach(c => clientsMap.set(c.key, c)); });
                    setAllActiveClients(Array.from(clientsMap.values()));
                    totalRowsProcessedRef.current = localState.totalRowsProcessed || 0;
                }
                const metaRes = await fetch(`/api/get-full-cache?action=get-snapshot-meta&t=${Date.now()}`);
                if (metaRes.ok) {
                    const serverMeta = await metaRes.json();
                    if (serverMeta.processedFileIds && Array.isArray(serverMeta.processedFileIds)) processedFileIdsRef.current = new Set(serverMeta.processedFileIds);
                    if (serverMeta.versionHash && serverMeta.versionHash !== 'none' && serverMeta.versionHash !== localVersion) {
                        console.log(`Найден новый прогресс на сервере (${serverMeta.versionHash}). Обновляем...`);
                        await handleStartCloudProcessing({ year: '2025' }, serverMeta.versionHash);
                        setIsRestoring(false); 
                        return;
                    }
                }
                if (localState && localState.allData?.length > 0) {
                    setDbStatus('ready');
                    await handleStartCloudProcessing({ year: '2025' }, localVersion || undefined);
                } else {
                    setDbStatus('empty');
                    handleStartCloudProcessing({ year: '2025' });
                }
            } catch (e) {
                console.error("Ошибка инициализации:", e);
                if (allDataRef.current.length > 0) setDbStatus('ready'); else setDbStatus('empty');
            } finally { setIsRestoring(false); }
        };
        initializeApp();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { return () => pollingIntervals.current.forEach(clearInterval); }, []);

    const dateFilteredData = useMemo(() => {
        if (!filterStartDate || !filterEndDate) return allData;
        return allData.map(row => {
            if (!row.monthlyFact) return row;
            let newFact = 0;
            Object.entries(row.monthlyFact).forEach(([monthKey, val]) => {
                if (monthKey >= filterStartDate && monthKey <= filterEndDate) { newFact += (val as number); }
            });
            return { ...row, fact: newFact };
        }).filter(row => row.fact > 0);
    }, [allData, filterStartDate, filterEndDate]);

    const smartData = useMemo(() => {
        const okbCoordSet = new Set<string>();
        okbData.forEach(row => { if (row.lat && row.lon) okbCoordSet.add(`${row.lat.toFixed(4)},${row.lon.toFixed(4)}`); });
        return enrichDataWithSmartPlan(dateFilteredData, okbRegionCounts, 15, okbCoordSet);
    }, [dateFilteredData, okbRegionCounts, okbData]);

    useEffect(() => { setFilteredData(applyFilters(smartData, filters)); }, [smartData, filters]);

    const filterOptions = useMemo<FilterOptions>(() => getFilterOptions(allData), [allData]);
    const summaryMetrics = useMemo(() => calculateSummaryMetrics(filteredData), [filteredData]);

    const potentialClients = useMemo(() => {
        if (!okbData.length) return [];
        const activeAddressesSet = new Set(allActiveClients.map(c => normalizeAddress(c.address)));
        return okbData.filter(okb => !activeAddressesSet.has(normalizeAddress(findAddressInRow(okb))));
    }, [okbData, allActiveClients]);

    const uploadETR = useMemo(() => {
        if (!isSavingToCloud || uploadProgress <= 0 || !uploadStartTimeRef.current) return '';
        const elapsed = (Date.now() - uploadStartTimeRef.current) / 1000;
        if (elapsed < 2) return '';
        const rate = uploadProgress / elapsed;
        if (rate <= 0) return '';
        const remainingPercent = 100 - uploadProgress;
        const secondsLeft = remainingPercent / rate;
        if (!isFinite(secondsLeft) || secondsLeft < 0) return '';
        const m = Math.floor(secondsLeft / 60);
        const s = Math.floor(secondsLeft % 60);
        return ` (~${m}м ${s.toString().padStart(2, '0')}с)`;
    }, [isSavingToCloud, uploadProgress, uploadStartTimeRef]); // Ensure uploadStartTimeRef is in deps if used, or assume stable

    useEffect(() => {
        const syncEdits = async () => {
            if (!dbStatus || dbStatus === 'loading') return;
            try {
                const res = await fetch(`/api/get-full-cache?t=${Date.now()}`);
                if (!res.ok) return;
                const rawCache = await res.json();
                const flatCache = new Map<string, any>();
                Object.values(rawCache).flat().forEach((entry: any) => { if (entry.address) flatCache.set(normalizeAddress(entry.address), entry); });
                setAllActiveClients(prev => {
                    let hasChanges = false;
                    const updated = prev.map(client => {
                        const normAddr = normalizeAddress(client.address);
                        const serverEntry = flatCache.get(normAddr);
                        if (serverEntry && !serverEntry.isDeleted) {
                            if (serverEntry.lat !== client.lat || serverEntry.lon !== client.lon || serverEntry.comment !== client.comment) {
                                hasChanges = true;
                                return { ...client, lat: serverEntry.lat ?? client.lat, lon: serverEntry.lon ?? client.lon, comment: serverEntry.comment ?? client.comment, isGeocoding: false };
                            }
                        }
                        return client;
                    });
                    return hasChanges ? updated : prev;
                });
            } catch (e) { console.error("Auto-sync edits error", e); }
        };
        const timer = setInterval(syncEdits, 30000);
        return () => clearInterval(timer);
    }, [dbStatus]);

    return (
        <div className="flex min-h-screen bg-primary-dark font-sans text-text-main overflow-hidden">
            <Navigation activeTab={activeModule} onTabChange={setActiveModule} />
            <main className="flex-1 ml-0 lg:ml-64 h-screen overflow-y-auto custom-scrollbar relative">
                <div className="sticky top-0 z-30 bg-primary-dark/95 backdrop-blur-md border-b border-gray-800 px-8 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${dbStatus === 'ready' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></div>
                                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">Local DB</span>
                            </div>
                            <span className="text-xs font-bold text-white">{dbStatus === 'ready' ? 'Offline: Ready' : 'Initializing...'}</span>
                        </div>
                        <div className="h-8 w-px bg-gray-800"></div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${isSavingToCloud ? 'bg-cyan-400 animate-ping' : (isLiveConnected ? 'bg-emerald-500' : 'bg-red-500')}`}></div>
                                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-400">Cloud Sync</span>
                            </div>
                            <span className="text-xs font-bold text-white">
                                {isSavingToCloud ? `Saving ${uploadProgress}%${uploadETR}` : (isLiveConnected ? 'Live: 15s Polling' : 'Disconnected')}
                            </span>
                        </div>
                        {processingState.isProcessing && (
                            <div className="flex items-center gap-3 px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full animate-fade-in">
                                <LoaderIcon className="w-3 h-3 text-indigo-400" />
                                <span className="text-[10px] uppercase font-bold text-indigo-300 tracking-tighter">
                                    {processingState.message || (allData.length > 0 ? 'Синхронизация' : 'Загрузка')}: {Math.round(processingState.progress)}%
                                </span>
                            </div>
                        )}
                        <button onClick={handleDeduplicate} disabled={duplicatesCount === 0} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs font-bold ml-2 ${duplicatesCount > 0 ? 'bg-blue-900/20 hover:bg-blue-900/40 text-blue-400 border-blue-500/20 cursor-pointer' : 'bg-gray-800/20 text-gray-500 border-gray-700/20 cursor-not-allowed opacity-50'}`} title={duplicatesCount > 0 ? "Найти одинаковые адреса и сложить их показатели" : "Дубликатов не найдено"}>
                            {duplicatesCount > 0 ? (<><CheckIcon className="w-3 h-3" /> Объединить ({duplicatesCount})</>) : (<><CheckIcon className="w-3 h-3" /> Дублей нет</>)}
                        </button>
                    </div>
                    <div className="flex items-center gap-6">
                         {allActiveClients.length > 0 && (
                            <div className="flex items-center gap-6 text-xs text-right">
                                <div className="flex flex-col">
                                    <span className="text-gray-500 text-[10px] uppercase font-bold">Уникальных ТТ</span>
                                    <span className="text-emerald-400 font-mono font-bold text-base">{allActiveClients.length.toLocaleString('ru-RU')}</span>
                                </div>
                            </div>
                        )}
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 border border-white/10 flex items-center justify-center text-white shadow-lg">
                            <span className="font-bold">L</span>
                        </div>
                    </div>
                </div>

                <div className="py-8 px-4 lg:px-8">
                    {activeModule === 'adapta' && (
                        <Adapta 
                            processingState={processingState}
                            onStartProcessing={() => {}}
                            onStartCloudProcessing={handleStartCloudProcessing}
                            onFileProcessed={() => {}}
                            onProcessingStateChange={() => {}}
                            okbData={okbData}
                            okbStatus={okbStatus}
                            onOkbStatusChange={setOkbStatus}
                            onOkbDataChange={setOkbData}
                            disabled={processingState.isProcessing}
                            unidentifiedCount={unidentifiedRows.length}
                            activeClientsCount={allActiveClients.length}
                            uploadedData={allData}
                            dbStatus={dbStatus}
                            onStartEdit={setEditingClient}
                            startDate={filterStartDate}
                            endDate={filterEndDate}
                            onStartDateChange={setFilterStartDate}
                            onEndDateChange={setFilterEndDate}
                        />
                    )}
                    {activeModule === 'amp' && (
                        <div className="space-y-6">
                             <InteractiveRegionMap data={filteredData} selectedRegions={filters.region} potentialClients={potentialClients} activeClients={allActiveClients} flyToClientKey={flyToClientKey} onEditClient={setEditingClient} />
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                <div className="lg:col-span-1"><Filters options={filterOptions} currentFilters={filters} onFilterChange={setFilters} onReset={() => setFilters({ rm: '', brand: [], packaging: [], region: [] })} disabled={allData.length === 0} /></div>
                                <div className="lg:col-span-3"><PotentialChart data={filteredData} /></div>
                            </div>
                            <ResultsTable data={filteredData} onRowClick={setSelectedDetailsRow} disabled={allData.length === 0} unidentifiedRowsCount={unidentifiedRows.length} onUnidentifiedClick={() => setIsUnidentifiedModalOpen(true)} />
                        </div>
                    )}
                    {activeModule === 'dashboard' && (
                        <RMDashboard isOpen={true} onClose={() => setActiveModule('amp')} data={filteredData} okbRegionCounts={okbRegionCounts} okbData={okbData} mode="page" metrics={summaryMetrics} okbStatus={okbStatus} dateRange={dateRange} onEditClient={setEditingClient} />
                    )}
                    {activeModule === 'prophet' && <Prophet data={filteredData} />}
                    {activeModule === 'agile' && <AgileLearning data={filteredData} />}
                    {activeModule === 'roi-genome' && <RoiGenome data={filteredData} />}
                    {activeModule === 'presentation' && <Presentation />}
                </div>
            </main>
            <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[100]">{notifications.map(n => <Notification key={n.id} message={n.message} type={n.type} />)}</div>
            {selectedDetailsRow && <DetailsModal isOpen={!!selectedDetailsRow} onClose={() => setSelectedDetailsRow(null)} data={selectedDetailsRow} okbStatus={okbStatus} onStartEdit={setEditingClient} />}
            {isUnidentifiedModalOpen && <UnidentifiedRowsModal isOpen={isUnidentifiedModalOpen} onClose={() => setIsUnidentifiedModalOpen(false)} rows={unidentifiedRows} onStartEdit={setEditingClient} />}
            {editingClient && <AddressEditModal isOpen={!!editingClient} onClose={() => setEditingClient(null)} onBack={() => setEditingClient(null)} data={editingClient} onDataUpdate={handleDataUpdate} onStartPolling={handleStartPolling} onDelete={handleDeleteClient} globalTheme="dark" />}
            {mergeModalData && <MergeOverlay isOpen={!!mergeModalData} initialCount={mergeModalData.initialCount} finalCount={mergeModalData.finalCount} onComplete={handleMergeComplete} onCancel={() => setMergeModalData(null)} />}
        </div>
    );
};

export default App;
