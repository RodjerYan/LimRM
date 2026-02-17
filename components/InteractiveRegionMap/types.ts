
import React from 'react';
import L from 'leaflet';
import { AggregatedDataRow, OkbDataRow, MapPoint } from '../../types';

// Re-export types so consuming files can import them from here
export type { AggregatedDataRow, OkbDataRow, MapPoint };

export type Theme = 'dark' | 'light';
export type OverlayMode = 'sales' | 'pets' | 'competitors' | 'age' | 'abc';

export interface InteractiveRegionMapProps {
    data: AggregatedDataRow[];
    selectedRegions: string[];
    potentialClients: OkbDataRow[];
    activeClients: MapPoint[];
    flyToClientKey: string | null;
    theme?: Theme;
    onToggleTheme?: () => void;
    onEditClient: (client: MapPoint) => void;
}

export interface SearchableLocation {
    name: string;
    type: 'region';
}

export interface MapRefs {
    mapInstance: React.MutableRefObject<L.Map | null>;
    geoJsonLayer: React.MutableRefObject<L.GeoJSON | null>;
    layerControl: React.MutableRefObject<L.Control.Layers | null>;
    tileLayer: React.MutableRefObject<L.TileLayer | null>;
    
    // Layers
    potentialLayer: React.MutableRefObject<L.LayerGroup | null>;
    activeInteractiveLayer: React.MutableRefObject<L.LayerGroup | null>;
    activeCanvasLayer: React.MutableRefObject<any | null>; // Custom Leaflet Layer

    // State Refs
    focusedFeature: React.MutableRefObject<any | null>;
    scheduleCanvasRedrawRef: React.MutableRefObject<() => void>;
    
    // Data Refs (for performance access inside event loops)
    activeGroups: React.MutableRefObject<Map<string, MapPoint[]>>;
    activeReps: React.MutableRefObject<Array<{ key: string; groupKey: string; lat: number; lon: number; rep: MapPoint }>>;
    activeMarkersByKey: React.MutableRefObject<Map<string, L.Layer>>;
    activeCanvasPoints: React.MutableRefObject<Array<{ lat: number; lon: number; color: string; r: number }>>;
    
    // Containers
    legendContainer: React.MutableRefObject<HTMLDivElement | null>;
}