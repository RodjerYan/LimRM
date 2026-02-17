
import React, { useRef, useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { InteractiveRegionMapProps, OverlayMode } from './types';
import { useGeoJsonData } from './useGeoJsonData';
import { useSearchLocations } from './useSearchLocations';
import { useLeafletMap } from './useLeafletMap';
import { useRegionsLayer } from './useRegionsLayer';
import { usePotentialMarkers } from './usePotentialMarkers';
import { useActiveClientsCanvas } from './useActiveClientsCanvas';
import { useActiveInteractiveMarkers } from './useActiveInteractiveMarkers';
import { MapLegend } from './MapLegend';
import { SearchIcon, MaximizeIcon, MinimizeIcon, SunIcon, MoonIcon, LoaderIcon } from '../icons';
import { MapPoint } from '../../types';

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = (props) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const [localTheme, setLocalTheme] = useState(props.theme ?? 'light');
    const [overlayMode, setOverlayMode] = useState<OverlayMode>('sales');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [rebuildTick, setRebuildTick] = useState(0);

    // Refs for callbacks to avoid closure staleness in Leaflet events
    const activeClientsDataRef = useRef<MapPoint[]>(props.activeClients);
    const onEditClientRef = useRef(props.onEditClient);
    
    useEffect(() => { activeClientsDataRef.current = props.activeClients; }, [props.activeClients]);
    useEffect(() => { onEditClientRef.current = props.onEditClient; }, [props.onEditClient]);

    // 1. Data Hooks
    const { geoJsonData, isLoadingGeo } = useGeoJsonData();
    const { searchTerm, setSearchTerm, searchResults, setSearchResults } = useSearchLocations(geoJsonData);

    // 3. Layer Hooks (Initialize before Map to pass handlers if needed, though here we use refs inside)
    // NOTE: We rely on refs passed to hooks, so order of hooks execution vs map creation is handled by useEffect deps
    
    // 2. Leaflet Core
    const { refs, isReady } = useLeafletMap(mapContainer, {
        theme: localTheme,
        activeClientsDataRef,
        onEditClientRef,
        // Removed onMapClick to avoid conflict with useRegionsLayer's internal handling
        onRebuildTick: () => setRebuildTick(t => t + 1)
    });

    const regionLayerState = useRegionsLayer(refs, geoJsonData, {
        selectedRegions: props.selectedRegions,
        theme: localTheme,
        overlayMode,
        onRebuild: () => setRebuildTick(t => t + 1)
    });

    usePotentialMarkers(refs, props.potentialClients, overlayMode, regionLayerState.focusedRegionName);
    
    useActiveClientsCanvas(
        refs, 
        props.activeClients, 
        overlayMode, 
        regionLayerState.focusedRegionName, 
        props.flyToClientKey,
        activeClientsDataRef
    );

    useActiveInteractiveMarkers(
        refs, 
        rebuildTick, 
        overlayMode, 
        regionLayerState.focusedRegionName, 
        props.flyToClientKey
    );

    // Resize handling
    useEffect(() => {
        if (refs.mapInstance.current) {
            setTimeout(() => refs.mapInstance.current?.invalidateSize(), 200);
        }
    }, [props.data, isFullscreen]);

    // Legend Portal
    useEffect(() => {
        if (refs.legendContainer.current) {
            const root = ReactDOM.createRoot(refs.legendContainer.current);
            root.render(<MapLegend mode={overlayMode} />);
            return () => { setTimeout(() => root.unmount(), 0); };
        }
    }, [overlayMode, isReady]);

    const handleLocationSelect = (loc: any) => {
        setSearchTerm(''); setSearchResults([]);
        const map = refs.mapInstance.current;
        if (!map) return;
        let foundLayer: any = null;
        refs.geoJsonLayer.current?.eachLayer((layer: any) => {
            if (layer.feature?.properties?.name.toLowerCase() === loc.name.toLowerCase()) {
                foundLayer = layer;
            }
        });
        if (foundLayer) regionLayerState.focusRegionByLayer(foundLayer);
    };

    return (
        <div
            className={[
                "relative w-full overflow-hidden transition-all duration-500",
                "rounded-3xl border border-slate-200/70 bg-white/70 backdrop-blur-xl",
                "shadow-[0_18px_50px_rgba(15,23,42,0.08)]",
                isFullscreen ? "fixed inset-0 z-[100] h-screen" : "h-[600px] group",
            ].join(" ")}
        >
            {/* premium glow */}
            <div
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{
                    background:
                        "radial-gradient(900px 520px at 20% 10%, rgba(99,102,241,0.14), transparent 60%)," +
                        "radial-gradient(880px 520px at 72% 18%, rgba(34,211,238,0.12), transparent 60%)," +
                        "radial-gradient(950px 560px at 40% 92%, rgba(163,230,53,0.10), transparent 60%)",
                }}
            />

            {/* Map */}
            <div ref={mapContainer} className="relative z-0 h-full w-full bg-slate-50" />

            {/* Search */}
            <div className="absolute top-4 left-14 z-[400] w-80">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Поиск региона…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={[
                            "w-full rounded-2xl border border-slate-200 bg-white/90 backdrop-blur",
                            "px-4 py-3 pl-11 text-sm font-bold text-slate-900 shadow-[0_18px_50px_rgba(15,23,42,0.10)]",
                            "focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-300 transition",
                        ].join(" ")}
                    />
                    <div className="absolute left-4 top-3.5 text-slate-400">
                        <SearchIcon small />
                    </div>

                    {searchResults.length > 0 && (
                        <div className="absolute top-full left-0 w-full mt-2 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-2xl shadow-[0_18px_60px_rgba(15,23,42,0.14)] overflow-hidden max-h-64 overflow-y-auto custom-scrollbar">
                            {searchResults.map((res, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => handleLocationSelect(res)}
                                    className="px-4 py-3 hover:bg-indigo-50 cursor-pointer text-sm text-slate-700 border-b border-slate-200 last:border-0 transition-colors flex items-center justify-between"
                                >
                                    <span className="font-bold">{res.name}</span>
                                    <span className="text-[10px] uppercase text-slate-600 font-black bg-slate-900/5 px-2 py-1 rounded-xl border border-slate-200">
                                        Регион
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Controls */}
            <div className="absolute top-4 right-4 z-[400] flex flex-col gap-2">
                <button
                    onClick={() => setLocalTheme((t) => (t === "dark" ? "light" : "dark"))}
                    className="p-2.5 bg-white/90 backdrop-blur rounded-2xl border border-slate-200 text-slate-700 hover:bg-white transition-all shadow-[0_18px_50px_rgba(15,23,42,0.10)] active:scale-95"
                    title="Сменить тему"
                >
                    {localTheme === "dark" ? <SunIcon small /> : <MoonIcon small />}
                </button>

                <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="p-2.5 bg-white/90 backdrop-blur rounded-2xl border border-slate-200 text-slate-700 hover:bg-white transition-all shadow-[0_18px_50px_rgba(15,23,42,0.10)] active:scale-95"
                    title={isFullscreen ? "Свернуть" : "На весь экран"}
                >
                    {isFullscreen ? <MinimizeIcon small /> : <MaximizeIcon small />}
                </button>
            </div>

            {/* Overlay mode switch */}
            <div className="absolute bottom-8 left-24 z-[400]">
                <div className="bg-white/90 backdrop-blur p-1.5 rounded-2xl border border-slate-200 shadow-[0_18px_60px_rgba(15,23,42,0.14)] flex gap-1">
                    {(['sales', 'pets', 'competitors', 'age', 'abc'] as OverlayMode[]).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => setOverlayMode(mode)}
                            className={[
                                "px-3.5 py-2 rounded-xl text-xs font-black transition-all",
                                overlayMode === mode
                                    ? "bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow-[0_12px_30px_rgba(99,102,241,0.18)]"
                                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-900/5",
                            ].join(" ")}
                        >
                            {mode === 'sales'
                                ? 'Продажи'
                                : mode === 'pets'
                                ? 'Питомцы'
                                : mode === 'competitors'
                                ? 'Конкуренты'
                                : mode === 'age'
                                ? 'Возраст'
                                : 'ABC'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Loading overlay */}
            {isLoadingGeo && (
                <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/70 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-3">
                        <LoaderIcon className="w-8 h-8 text-indigo-600" />
                        <span className="text-slate-900 font-black text-sm">Загрузка геометрии…</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(InteractiveRegionMap);