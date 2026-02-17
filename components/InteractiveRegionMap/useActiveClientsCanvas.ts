
import { useEffect, useCallback, useRef } from 'react';
import { MapRefs, OverlayMode, MapPoint } from './types';
import { normalizeAddress } from '../../utils/dataUtils';
import { parseCoord, getCoordinate } from './utils/coords';
import { pointInFeature } from './geo/pointInFeature';

export const useActiveClientsCanvas = (
    refs: MapRefs,
    activeClients: MapPoint[],
    overlayMode: OverlayMode,
    focusedRegionName: string | null,
    flyToClientKey: string | null,
    activeClientsDataRef: React.MutableRefObject<MapPoint[]>
) => {
    const pendingRedrawRef = useRef(false);
    const rafRedrawRef = useRef<number | null>(null);

    const redrawActiveCanvas = useCallback(() => {
        const map = refs.mapInstance.current;
        const layer: any = refs.activeCanvasLayer.current;
        if (!map || !layer) return;

        const canvas: HTMLCanvasElement = layer.getCanvas();
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;

        // Clear canvas based on actual buffer size
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Scale drawing operations by DPR
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const pts = refs.activeCanvasPoints.current;
        
        // Use CSS dimensions for bounds check
        const widthCss = canvas.width / dpr;
        const heightCss = canvas.height / dpr;

        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const pt = map.latLngToContainerPoint([p.lat, p.lon]);

            // Optimization: Bounds check
            if (pt.x < -20 || pt.y < -20 || pt.x > widthCss + 20 || pt.y > heightCss + 20) continue;

            const r = p.r;

            // 1. White Halo (Glow) for visibility and "premium" look
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, r + 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
            ctx.fill();

            // 2. Main Fill
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            
            // 3. Stroke (Border) for definition
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)'; // Slate-900 with opacity
            ctx.stroke();
        }
        
        // Reset transform
        ctx.setTransform(1, 0, 0, 1, 0, 0);

    }, []);

    const scheduleCanvasRedraw = useCallback(() => {
        if (pendingRedrawRef.current) return;
        pendingRedrawRef.current = true;
        rafRedrawRef.current = requestAnimationFrame(() => {
            pendingRedrawRef.current = false;
            redrawActiveCanvas();
        });
    }, [redrawActiveCanvas]);

    useEffect(() => {
        refs.scheduleCanvasRedrawRef.current = scheduleCanvasRedraw;
    }, [scheduleCanvasRedraw]);

    // Data Processing
    useEffect(() => {
        activeClientsDataRef.current = activeClients;

        const grouped = new Map<string, MapPoint[]>();
        for (const client of activeClients) {
            const normAddr = normalizeAddress(client.address);
            let groupKey = normAddr;
            if (!groupKey) {
                const lat = client.lat; const lon = client.lon;
                if (lat && lon) groupKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
                else continue;
            }
            if (!grouped.has(groupKey)) grouped.set(groupKey, []);
            grouped.get(groupKey)!.push(client);
        }

        refs.activeGroups.current = grouped;
        const reps: Array<{ key: string; groupKey: string; lat: number; lon: number; rep: MapPoint }> = [];

        grouped.forEach((clients, groupKey) => {
            let rep = clients[0];
            let bestTime = rep.lastUpdated || 0;
            for (let i = 1; i < clients.length; i++) {
                const t = clients[i].lastUpdated || 0;
                if (t > bestTime) { bestTime = t; rep = clients[i]; }
            }
            
            if (rep.coordStatus === 'pending' || rep.isGeocoding) return;
            let lat = rep.lat; let lon = rep.lon;
            if (lat === undefined || lon === undefined) {
                 lat = parseCoord(getCoordinate(rep, ['lat', 'latitude']));
                 lon = parseCoord(getCoordinate(rep, ['lon', 'lng']));
            }
            if (lat && lon && (Math.abs(lat) > 1 || Math.abs(lon) > 1)) {
                 if (lon < -170) lon += 360;
                 reps.push({ key: String(rep.key), groupKey, lat, lon, rep });
            }
        });

        refs.activeReps.current = reps;

        const pts: Array<{ lat: number; lon: number; color: string; r: number }> = [];
        let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
        let hasBounds = false;
        const feature = refs.focusedFeature.current;

        for (let i = 0; i < reps.length; i++) {
            const { lat, lon, groupKey, rep } = reps[i];
            const group = grouped.get(groupKey);
            const size = group ? group.length : 1;

            if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
            if (focusedRegionName) {
                const fastMatch = (rep.region || '').toString().toLowerCase().includes(focusedRegionName.toLowerCase());
                if (!fastMatch) continue;
                if (feature && !pointInFeature(lat, lon, feature)) continue;
            }

            let markerColor = '#10b981';
            let markerRadius = size > 1 ? 7 : 5;

            if (overlayMode === 'abc' && group) {
                let bestCategory = 'C';
                for (const curr of group) {
                    if (curr.abcCategory === 'A') { bestCategory = 'A'; break; }
                    if (curr.abcCategory === 'B') bestCategory = 'B';
                }
                switch (bestCategory) {
                    case 'A': markerColor = '#f59e0b'; markerRadius = size > 1 ? 9 : 7; break;
                    case 'B': markerColor = '#10b981'; markerRadius = size > 1 ? 7 : 5; break;
                    default: markerColor = '#9ca3af'; markerRadius = size > 1 ? 5 : 3; break;
                }
            } 
            pts.push({ lat, lon, color: markerColor, r: markerRadius });
            
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
            hasBounds = true;
        }

        refs.activeCanvasPoints.current = pts;
        scheduleCanvasRedraw();

        const map = refs.mapInstance.current;
        if (map && hasBounds && !flyToClientKey && !focusedRegionName) { 
            map.fitBounds([[minLat, minLon], [maxLat, maxLon]], { padding: [20, 20] });
        }

    }, [activeClients, overlayMode, focusedRegionName, scheduleCanvasRedraw, flyToClientKey]);

    useEffect(() => {
        return () => {
             if (rafRedrawRef.current) cancelAnimationFrame(rafRedrawRef.current);
        };
    }, []);
};