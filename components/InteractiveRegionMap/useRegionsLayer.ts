
import { useState, useCallback, useEffect, useRef } from 'react';
import L from 'leaflet';
import { FeatureCollection } from 'geojson';
import { MapRefs, Theme, OverlayMode } from './types';
import { getMarketData } from '../../utils/marketData';
import { pointInFeature } from './geo/pointInFeature';

export const useRegionsLayer = (
    refs: MapRefs, 
    geoJsonData: FeatureCollection | null, 
    props: { 
        selectedRegions: string[], 
        theme: Theme, 
        overlayMode: OverlayMode, 
        onRebuild: () => void 
    }
) => {
    const [focusedRegionName, setFocusedRegionName] = useState<string | null>(null);
    const highlightedLayer = useRef<L.Layer | null>(null);
    
    // New refs for manual hover handling
    const hoveredRegionNameRef = useRef<string | null>(null);
    const rafHoverRef = useRef<number | null>(null);

    // Derived style function
    const getStyleForRegion = useCallback((feature: any) => {
        const regionName = feature.properties?.name;
        const marketData = getMarketData(regionName);
        const isSelected = props.selectedRegions.includes(regionName);
        
        const isFocused = !!focusedRegionName && regionName === focusedRegionName;
        const isDimmedByFocus = !!focusedRegionName && regionName !== focusedRegionName;

        // Check manual hover state
        const isHovered = !focusedRegionName && hoveredRegionNameRef.current && regionName === hoveredRegionNameRef.current;

        const applyFocus = (style: any) => {
            if (!focusedRegionName) return style;
            if (isFocused) {
                return {
                    ...style,
                    weight: 2,
                    color: '#fbbf24',
                    fillColor: '#fde68a',
                    fillOpacity: Math.max(style.fillOpacity ?? 0, 0.22),
                    opacity: 1,
                };
            }
            if (isDimmedByFocus) {
                return { ...style, opacity: 0.25, fillOpacity: 0.03 };
            }
            return style;
        };

        const baseBorder = { 
            weight: isSelected ? 2 : 1, 
            opacity: 1, 
            color: isSelected ? (props.theme === 'dark' ? '#818cf8' : '#4f46e5') : (props.theme === 'dark' ? '#6b7280' : '#9ca3af'),
            fillColor: 'transparent', 
            fillOpacity: 0, 
            className: isSelected ? 'selected-region-layer region-polygon' : 'region-polygon', 
            pane: 'regionsPane' 
        };

        let resultStyle: any = baseBorder;

        if (props.overlayMode === 'sales' || props.overlayMode === 'abc') { 
            resultStyle = { ...baseBorder, fillColor: isSelected ? '#4f46e5' : '#f3f4f6', fillOpacity: isSelected ? 0.3 : 0.1, interactive: true }; 
        } else if (props.overlayMode === 'pets') {
            const catShare = marketData.catShare; 
            let fillColor = '#64748b'; let fillOpacity = 0.3;
            if (catShare > 55) { fillColor = '#8b5cf6'; fillOpacity = 0.5 + ((catShare - 55) / 100); } 
            else if (catShare < 45) { fillColor = '#f97316'; fillOpacity = 0.5 + ((45 - catShare) / 100); }
            resultStyle = { ...baseBorder, color: isSelected ? '#000' : '#6b7280', fillColor, fillOpacity: isSelected ? Math.min(fillOpacity + 0.2, 0.9) : fillOpacity, interactive: true };
        } else if (props.overlayMode === 'competitors') {
            const comp = marketData.competitorDensityIndex; let fillColor = '#3b82f6'; let fillOpacity = 0.3;
            if (comp > 80) { fillColor = '#ef4444'; fillOpacity = 0.6; } else if (comp > 50) { fillColor = '#f97316'; fillOpacity = 0.5; }
            resultStyle = { ...baseBorder, color: isSelected ? '#000' : '#6b7280', fillColor, fillOpacity: isSelected ? Math.min(fillOpacity + 0.2, 0.9) : fillOpacity, interactive: true };
        } else if (props.overlayMode === 'age') {
            const age = marketData.avgOwnerAge; let fillColor = '#9ca3af'; let fillOpacity = 0.3;
            if (age < 35) { fillColor = '#10b981'; fillOpacity = 0.6; } else if (age < 45) { fillColor = '#f59e0b'; fillOpacity = 0.5; } else { fillColor = '#8b5cf6'; fillOpacity = 0.5; }
            resultStyle = { ...baseBorder, color: isSelected ? '#000' : '#6b7280', fillColor, fillOpacity: isSelected ? Math.min(fillOpacity + 0.2, 0.9) : fillOpacity, interactive: true };
        }

        const styled = applyFocus(resultStyle);

        // Apply Hover Override
        if (isHovered) {
            return {
                ...styled,
                weight: Math.max(styled.weight ?? 1, 2),
                color: '#fbbf24',
                fillOpacity: Math.max(styled.fillOpacity ?? 0, 0.18),
                opacity: 1,
            };
        }

        return styled;
    }, [props.selectedRegions, props.theme, props.overlayMode, focusedRegionName]);

    const resetHighlight = useCallback(() => {
        if (highlightedLayer.current && refs.geoJsonLayer.current) {
            refs.geoJsonLayer.current.resetStyle(highlightedLayer.current as L.Path);
        }
        highlightedLayer.current = null;
    }, []); 

    const clearFocusedRegion = useCallback(() => {
        setFocusedRegionName(null);
        refs.focusedFeature.current = null;
        if (refs.tileLayer.current) refs.tileLayer.current.setOpacity(1);
        props.onRebuild();
    }, [props.onRebuild]);

    const focusRegionByLayer = useCallback((layer: L.Layer) => {
        const feature = (layer as any).feature;
        const name = feature?.properties?.name;
        if (!name) return;
        if (focusedRegionName && name === focusedRegionName) { clearFocusedRegion(); return; }

        setFocusedRegionName(name);
        refs.focusedFeature.current = feature;
        if (refs.tileLayer.current) refs.tileLayer.current.setOpacity(0.7);
        
        const map = refs.mapInstance.current;
        if (map && (layer as any).getBounds) {
            map.fitBounds((layer as any).getBounds(), { padding: [20, 20], maxZoom: 7 });
        }
        props.onRebuild();
    }, [focusedRegionName, clearFocusedRegion, props.onRebuild]);

    const focusRegionByName = useCallback((name: string) => {
        if (!refs.geoJsonLayer.current) return;
      
        let targetLayer: L.Layer | null = null;
        refs.geoJsonLayer.current.eachLayer((layer: any) => {
          if (layer?.feature?.properties?.name === name) targetLayer = layer;
        });
      
        if (targetLayer) focusRegionByLayer(targetLayer);
    }, [focusRegionByLayer]);

    const findRegionAtLatLng = useCallback((lat: number, lon: number) => {
        if (!geoJsonData) return null;
        for (const f of geoJsonData.features as any[]) {
            const name = f?.properties?.name;
            if (!name) continue;
            if (pointInFeature(lat, lon, f)) return name;
        }
        return null;
    }, [geoJsonData]);

    // Handle Manual Map Events for Hover/Click
    useEffect(() => {
        const map = refs.mapInstance.current;
        if (!map) return;

        const onMove = (e: L.LeafletMouseEvent) => {
            if (rafHoverRef.current) cancelAnimationFrame(rafHoverRef.current);
            rafHoverRef.current = requestAnimationFrame(() => {
                const name = findRegionAtLatLng(e.latlng.lat, e.latlng.lng);

                if (focusedRegionName) return; // Don't hover if focused

                if (hoveredRegionNameRef.current !== name) {
                    hoveredRegionNameRef.current = name;
                    // Trigger redraw
                    if (refs.geoJsonLayer.current) refs.geoJsonLayer.current.setStyle(getStyleForRegion as any);
                }
            });
        };

        const onClick = (e: L.LeafletMouseEvent) => {
            const name = findRegionAtLatLng(e.latlng.lat, e.latlng.lng);
            if (name) {
                focusRegionByName(name);
            } else {
                clearFocusedRegion();
            }
        };

        map.on('mousemove', onMove);
        map.on('click', onClick);

        return () => {
            map.off('mousemove', onMove);
            map.off('click', onClick);
            if (rafHoverRef.current) cancelAnimationFrame(rafHoverRef.current);
        };
    }, [findRegionAtLatLng, focusedRegionName, getStyleForRegion, focusRegionByName, clearFocusedRegion]);

    // Initialization
    useEffect(() => {
        if (geoJsonData && refs.mapInstance.current && refs.geoJsonLayer.current === null) {
            refs.geoJsonLayer.current = L.geoJSON(geoJsonData as any, {
                style: getStyleForRegion,
                onEachFeature: (feature, layer) => {
                    // Removed mouseover/mouseout/click listeners from here
                    // Handling them globally on the map now to support layers obstruction
                    if (feature.properties?.name) {
                        layer.bindTooltip(feature.properties.name, { permanent: false, direction: 'center', className: 'region-tooltip' });
                    }
                },
                pane: 'regionsPane'
            }).addTo(refs.mapInstance.current);
        } else if (refs.geoJsonLayer.current) {
            refs.geoJsonLayer.current.setStyle(getStyleForRegion);
        }
    }, [geoJsonData, props.selectedRegions, props.theme, props.overlayMode, getStyleForRegion]);

    return { 
        focusedRegionName, 
        clearFocusedRegion, 
        focusRegionByLayer,
        resetHighlight
    };
};