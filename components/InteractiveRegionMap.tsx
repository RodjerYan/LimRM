
import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AggregatedDataRow, OkbDataRow, MapPoint } from '../types';
import { getMarketData } from '../utils/marketData';
import { REGION_KEYWORD_MAP } from '../utils/addressMappings';
import { SearchIcon, MaximizeIcon, MinimizeIcon, SunIcon, MoonIcon, LoaderIcon, CheckIcon } from './icons';
import type { FeatureCollection } from 'geojson';

type Theme = 'dark' | 'light';
type OverlayMode = 'sales' | 'pets' | 'competitors';

interface InteractiveRegionMapProps {
  data: AggregatedDataRow[];
  selectedRegions: string[];
  potentialClients: OkbDataRow[];
  activeClients: MapPoint[];
  flyToClientKey: string | null;
  theme?: Theme;
  onToggleTheme?: () => void;
  onEditClient: (client: MapPoint) => void;
}

interface SearchableLocation { name: string; type: 'region' }

const findValueInRow = (row: OkbDataRow, keywords: string[]): string => {
  const rowKeys = Object.keys(row);
  for (const keyword of keywords) {
    const foundKey = rowKeys.find(rKey => rKey.toLowerCase().includes(keyword));
    if (foundKey && row[foundKey]) return String(row[foundKey]);
  }
  return '';
};

const MapLegend: React.FC<{ mode: OverlayMode }> = ({ mode }) => {
  if (mode === 'pets') {
    return (
      <div className="p-3 bg-card-bg/90 backdrop-blur-md rounded-lg border border-gray-700 text-text-main max-w-[200px] shadow-xl">
        <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-text-muted flex items-center gap-2">Питомец-Индекс</h4>
        <div className="space-y-1">
          <div className="flex items-center"><span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#10b981', opacity: 0.7}}></span><span className="text-xs">Высокая (&gt;80)</span></div>
          <div className="flex items-center"><span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#f59e0b', opacity: 0.5}}></span><span className="text-xs">Средняя (50-80)</span></div>
          <div className="flex items-center"><span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#6b7280', opacity: 0.3}}></span><span className="text-xs">Низкая (&lt;50)</span></div>
        </div>
      </div>
    );
  }
  if (mode === 'competitors') {
    return (
      <div className="p-3 bg-card-bg/90 backdrop-blur-md rounded-lg border border-gray-700 text-text-main max-w-[200px] shadow-xl">
        <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-text-muted flex items-center gap-2">Конкуренция</h4>
        <div className="space-y-1">
          <div className="flex items-center"><span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#ef4444', opacity: 0.7}}></span><span className="text-xs">Агрессивная (&gt;80)</span></div>
          <div className="flex items-center"><span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#f97316', opacity: 0.5}}></span><span className="text-xs">Умеренная (50-80)</span></div>
          <div className="flex items-center"><span className="w-4 h-4 mr-2 rounded-sm" style={{backgroundColor: '#3b82f6', opacity: 0.3}}></span><span className="text-xs">Слабая (&lt;50)</span></div>
        </div>
      </div>
    );
  }
  return (
    <div className="p-3 bg-card-bg/90 backdrop-blur-md rounded-lg border border-gray-700 text-text-main max-w-[200px] shadow-xl">
      <h4 className="font-bold text-xs mb-2 uppercase tracking-wider text-text-muted">Легенда</h4>
      <div className="flex items-center mb-1.5"><span className="inline-block w-4 h-2 mr-2 border border-gray-500 bg-gray-500/20"></span><span className="text-xs font-medium">Регионы РФ</span></div>
      <div className="flex items-center mb-1.5"><span className="inline-block w-4 h-2 mr-2 border border-amber-500 bg-amber-500/40"></span><span className="text-xs font-medium">Новые территории</span></div>
      <div className="flex items-center mb-1.5"><span className="inline-block w-3 h-3 rounded-full mr-2 bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.6)]"></span><span className="text-xs font-medium">Активные ТТ</span></div>
      <div className="flex items-center mb-1.5"><span className="inline-block w-3 h-3 rounded-full mr-2 bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.6)]"></span><span className="text-xs font-medium">Потенциал (ОКБ)</span></div>
    </div>
  );
};

const InteractiveRegionMap: React.FC<InteractiveRegionMapProps> = ({ data, selectedRegions, potentialClients, activeClients, flyToClientKey, theme = 'dark', onEditClient }) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<L.Map | null>(null);
  
  // Layers
  const geoJsonLayer = useRef<L.GeoJSON | null>(null);
  const potentialClientMarkersLayer = useRef<L.LayerGroup | null>(null);
  const activeClientMarkersLayer = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  
  // Controls & Refs
  const layerControl = useRef<L.Control.Layers | null>(null);
  const activeClientMarkersRef = useRef<Map<string, L.Layer>>(new Map());
  const legendContainerRef = useRef<HTMLDivElement | null>(null);
  const legendRootRef = useRef<ReactDOM.Root | null>(null);
  const highlightedLayer = useRef<L.Layer | null>(null);

  // Sync refs for event handlers
  const activeClientsDataRef = useRef<MapPoint[]>(activeClients);
  const onEditClientRef = useRef(onEditClient);

  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchableLocation[]>([]);
  const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
  const [isLoadingGeo, setIsLoadingGeo] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);
  const [localTheme, setLocalTheme] = useState<Theme>(theme);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('sales');

  // 1. Fetch GeoJSON Data
  useEffect(() => {
    const fetchGeoData = async () => {
      const CACHE_NAME = 'limkorm-geo-v17-composite';
      // Basic Russia map (often excludes Crimea/New Territories in international versions)
      const RUSSIA_URL = 'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/russia.geojson';
      // Ukraine map (contains the regions we need to extract)
      const UKRAINE_URL = 'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/ukraine.geojson';
      const WORLD_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson';

      const safeFetchJson = async (url: string) => {
        try {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return await r.json();
        } catch (e) {
          console.warn('fetch failed', url, e);
          return null;
        }
      };

      try {
        setIsLoadingGeo(true);
        let russiaData: any = null, ukraineData: any = null, worldData: any = null;

        if ('caches' in window) {
          try {
            const cache = await caches.open(CACHE_NAME);
            const [rRes, uRes, wRes] = await Promise.all([
              cache.match(RUSSIA_URL), 
              cache.match(UKRAINE_URL),
              cache.match(WORLD_URL)
            ]);
            if (rRes) russiaData = await rRes.json();
            if (uRes) ukraineData = await uRes.json();
            if (wRes) worldData = await wRes.json();
            if (russiaData && ukraineData && worldData) setIsFromCache(true);
          } catch (e) { console.warn('Cache read error', e); }
        }

        if (!russiaData) russiaData = await safeFetchJson(RUSSIA_URL);
        if (!ukraineData) ukraineData = await safeFetchJson(UKRAINE_URL);
        if (!worldData) worldData = await safeFetchJson(WORLD_URL);

        if ('caches' in window) {
          try {
            const cache = await caches.open(CACHE_NAME);
            if (russiaData) cache.put(RUSSIA_URL, new Response(JSON.stringify(russiaData)));
            if (ukraineData) cache.put(UKRAINE_URL, new Response(JSON.stringify(ukraineData)));
            if (worldData) cache.put(WORLD_URL, new Response(JSON.stringify(worldData)));
          } catch (e) { console.warn('Cache write error', e); }
        }

        const features: any[] = [];

        // 1. Add Russia (Mainland) features
        if (russiaData && russiaData.features) {
          russiaData.features.forEach((feature: any) => {
            const p = feature.properties || {};
            const rawName = p.name || p.NAME || '';
            feature.properties = feature.properties || {};
            feature.properties.name = String(rawName || '').trim();
            features.push(feature);
          });
        }

        // 2. Extract and Rename specific regions from Ukraine GeoJSON
        if (ukraineData && ukraineData.features) {
          // Map of Ukraine GeoJSON names (latin) to Russian Official Names
          // Keys should allow partial matching (lowercase)
          const targetRegions: Record<string, string> = {
            'crimea': 'Республика Крым',
            'krym': 'Республика Крым',
            'sevastopol': 'Севастополь',
            'donets': 'Донецкая Народная Республика', // Matches Donetsk
            'luhan': 'Луганская Народная Республика', // Matches Luhansk
            'zaporiz': 'Запорожская область', // Matches Zaporizhia
            'kherson': 'Херсонская область'
          };

          ukraineData.features.forEach((feature: any) => {
            const originalName = (feature.properties?.name || '').toLowerCase();
            let matchedRussianName: string | null = null;

            for (const [key, ruName] of Object.entries(targetRegions)) {
              if (originalName.includes(key)) {
                matchedRussianName = ruName;
                break;
              }
            }

            if (matchedRussianName) {
              // Modify the feature to belong to Russia (visually)
              feature.properties = feature.properties || {};
              feature.properties.name = matchedRussianName;
              feature.properties.isNewTerritory = true; // Flag for specific styling if needed
              features.push(feature);
            }
          });
        }

        // 3. Add CIS Neighbors
        if (worldData && worldData.features) {
          const cisMap: Record<string, string> = {
            'Belarus': 'Республика Беларусь', 'Kazakhstan': 'Республика Казахстан', 
            'Uzbekistan': 'Республика Узбекистан', 'Tajikistan': 'Республика Таджикистан',
            'Kyrgyzstan': 'Кыргызская Республика', 'Turkmenistan': 'Туркменистан',
            'Armenia': 'Армения', 'Azerbaijan': 'Азербайджан', 
            'Georgia': 'Грузия', 'Moldova': 'Республика Молдова'
          };
          const cisFeatures = worldData.features.filter((f: any) => cisMap[f.properties.NAME || f.properties.name]);
          cisFeatures.forEach((f: any) => {
            const englishName = f.properties.NAME || f.properties.name;
            f.properties = f.properties || {};
            f.properties.name = cisMap[englishName];
            features.push(f);
          });
        }

        if (features.length > 0) {
            console.log(`Loaded ${features.length} GeoJSON features.`);
            setGeoJsonData({ type: 'FeatureCollection', features } as FeatureCollection);
        } else {
            console.error('No features parsed from GeoJSON sources.');
        }
      } catch (err) {
        console.error('Error fetching geo data', err);
      } finally {
        setIsLoadingGeo(false);
      }
    };

    fetchGeoData();
  }, []);

  // 2. Sync Refs
  useEffect(() => { activeClientsDataRef.current = activeClients; }, [activeClients]);
  useEffect(() => { onEditClientRef.current = onEditClient; }, [onEditClient]);

  // 3. Search Logic
  const searchableLocations = useMemo(() => {
    if (!geoJsonData) return [] as SearchableLocation[];
    const names = new Set<string>();
    geoJsonData.features.forEach((f: any) => {
      const n = f.properties?.name;
      if (n && !names.has(n)) names.add(n);
    });
    return Array.from(names).map(n => ({ name: n, type: 'region' as const })).sort((a,b) => a.name.localeCompare(b.name, 'ru'));
  }, [geoJsonData]);

  useEffect(() => {
    if (searchTerm.trim().length > 1) {
      const lower = searchTerm.toLowerCase().trim();
      const targets = [lower];
      for (const [k,v] of Object.entries(REGION_KEYWORD_MAP)) {
        if (k.includes(lower) || lower.includes(k)) targets.push(String(v).toLowerCase());
      }
      const results = searchableLocations.filter(loc => targets.some(t => loc.name.toLowerCase().includes(t))).slice(0,7);
      setSearchResults(results);
    } else setSearchResults([]);
  }, [searchTerm, searchableLocations]);

  // 4. Style Logic
  const getStyleForRegion = useCallback((feature: any) => {
    const regionName = feature.properties?.name || '';
    const isBreakaway = !!feature.properties?.isBreakaway;
    const isNewTerritory = !!feature.properties?.isNewTerritory;
    const marketData = getMarketData(regionName);
    const isSelected = selectedRegions.includes(regionName);

    // COLORS
    const defaultBorder = localTheme === 'dark' ? '#6b7280' : '#9ca3af';
    
    // Explicitly handle new territories with a distinct amber color
    const borderColor = isSelected ? '#818cf8' : (isNewTerritory ? '#fbbf24' : (isBreakaway ? '#f59e0b' : defaultBorder));
    
    // WEIGHTS
    const weight = isSelected || isBreakaway || isNewTerritory ? 2 : 1;

    // BASE STYLE
    // Ensure standard regions have some fill opacity (0.1) so they are visible against the dark map
    const base = { 
        weight, 
        opacity: 1, 
        color: borderColor, 
        fillColor: defaultBorder, 
        fillOpacity: 0.1, 
        className: isSelected ? 'selected-region-layer' : '' 
    } as any;

    if (overlayMode === 'sales') {
      const newTerritoryFill = isNewTerritory ? 0.35 : 0;
      const newTerritoryColor = isNewTerritory ? '#d97706' : 'transparent'; // Amber-600
      
      return { 
          ...base, 
          fillColor: isSelected ? '#818cf8' : (isBreakaway ? '#d97706' : (isNewTerritory ? newTerritoryColor : base.fillColor)), 
          fillOpacity: isSelected ? 0.25 : (isBreakaway ? 0.35 : (isNewTerritory ? newTerritoryFill : 0.1)), 
          interactive: true 
      };
    }

    if (overlayMode === 'pets') {
      const density = marketData.petDensityIndex || 0;
      let fillColor = '#6b7280', fillOpacity = 0.3;
      if (density > 80) { fillColor = '#10b981'; fillOpacity = 0.6; }
      else if (density > 50) { fillColor = '#f59e0b'; fillOpacity = 0.5; }
      return { ...base, color: isSelected ? '#fff' : '#4b5563', fillColor, fillOpacity: isSelected ? Math.min(fillOpacity + 0.2,0.9) : fillOpacity, interactive: true };
    }

    if (overlayMode === 'competitors') {
      const comp = marketData.competitorDensityIndex || 0;
      let fillColor = '#3b82f6', fillOpacity = 0.3;
      if (comp > 80) { fillColor = '#ef4444'; fillOpacity = 0.6; }
      else if (comp > 50) { fillColor = '#f97316'; fillOpacity = 0.5; }
      return { ...base, color: isSelected ? '#fff' : '#4b5563', fillColor, fillOpacity: isSelected ? Math.min(fillOpacity + 0.2,0.9) : fillOpacity, interactive: true };
    }

    return base;
  }, [localTheme, overlayMode, selectedRegions]);

  const resetHighlight = useCallback(() => {
    if (highlightedLayer.current && geoJsonLayer.current) {
      try { geoJsonLayer.current.resetStyle(highlightedLayer.current as any); } catch (e) { /* ignore */ }
    }
    highlightedLayer.current = null;
  }, [overlayMode, localTheme]);

  const highlightRegion = useCallback((layer: L.Layer) => {
    resetHighlight();
    if (layer instanceof L.Path) {
      layer.setStyle({ weight: 3, color: '#ffffff', opacity: 1, fillOpacity: 0.4 });
      try { (layer as any).bringToFront(); } catch (e) {}
      highlightedLayer.current = layer;
    }
  }, [resetHighlight]);

  const handleLocationSelect = useCallback((location: SearchableLocation) => {
    const map = mapInstance.current; if (!map) return;
    setSearchTerm(''); setSearchResults([]);
    let found: L.Layer | null = null;
    geoJsonLayer.current?.eachLayer((layer: any) => {
      if (layer.feature?.properties?.name && layer.feature.properties.name.toLowerCase() === location.name.toLowerCase()) found = layer;
    });
    if (found) { map.fitBounds((found as any).getBounds()); highlightRegion(found); }
  }, [highlightRegion]);

  // 5. Map Initialization
  useEffect(() => {
    if (!mapContainer.current) return;
    if (mapInstance.current) return;

    const map = L.map(mapContainer.current, { center: [55,60], zoom: 3, minZoom: 2, scrollWheelZoom: true, preferCanvas: true, worldCopyJump: true, zoomControl: false, attributionControl: false });
    mapInstance.current = map;
    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Create custom pane for markers to sit above regions
    map.createPane('markerPane');
    const pane = map.getPane('markerPane'); 
    if (pane) pane.style.zIndex = '650';

    layerControl.current = L.control.layers({}, {}, { position: 'bottomleft' }).addTo(map);

    // Create container for Legend
    const LegendControl = L.Control.extend({
      onAdd: () => {
        const d = L.DomUtil.create('div', 'info legend');
        legendContainerRef.current = d;
        return d;
      },
      onRemove: () => {
        legendContainerRef.current = null;
      }
    });
    new LegendControl({ position: 'bottomright' }).addTo(map);

    map.on('click', resetHighlight);

    // Popup Event Delegation
    map.on('popupopen', (e: any) => {
      const popupNode = e.popup?.getElement();
      if (!popupNode) return;
      
      const editBtn = popupNode.querySelector('.edit-location-btn');
      if (editBtn) {
        // Clone to strip old listeners
        const newBtn = editBtn.cloneNode(true);
        editBtn.parentNode.replaceChild(newBtn, editBtn);
        
        newBtn.addEventListener('click', (ev: any) => {
          ev.stopPropagation();
          const key = newBtn.getAttribute('data-key');
          if (key) {
            const client = activeClientsDataRef.current.find(c => c.key === key);
            if (client) onEditClientRef.current(client);
          }
        });
      }
    });

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
        tileLayerRef.current = null;
      }
    };
  }, []);

  // 6. Render GeoJSON Layer
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !geoJsonData) return;

    if (geoJsonLayer.current) {
      map.removeLayer(geoJsonLayer.current);
    }

    geoJsonLayer.current = L.geoJSON(geoJsonData as any, {
      style: getStyleForRegion,
      onEachFeature: (feature, layer) => {
        const regionName = feature.properties?.name; 
        if (!regionName) return;
        
        const marketData = getMarketData(regionName);
        let tooltip = regionName;
        if (overlayMode === 'pets') tooltip += `\nПитомец-Индекс: ${Math.round(marketData.petDensityIndex || 0)}`;
        if (overlayMode === 'competitors') tooltip += `\nКонкуренция: ${Math.round(marketData.competitorDensityIndex || 0)}`;
        
        layer.bindTooltip(tooltip, { sticky: true, className: 'leaflet-tooltip-custom' });

        layer.on({
          click: (e: any) => { L.DomEvent.stop(e); map.fitBounds(e.target.getBounds()); highlightRegion(e.target); },
          mouseover: (e: any) => { 
            const l = e.target; 
            if (l !== highlightedLayer.current && overlayMode === 'sales') { 
              try { 
                l.setStyle({ weight: 2, color: '#a5b4fc', opacity: 1, fillOpacity: 0.15 }); 
                l.bringToFront(); 
              } catch (e) {} 
            } 
          },
          mouseout: (e: any) => { 
            const l = e.target; 
            if (l !== highlightedLayer.current) {
               geoJsonLayer.current?.resetStyle(l); 
            }
          }
        });
      }
    }).addTo(map);

    // Initial fit bounds if valid
    try {
      const bounds = geoJsonLayer.current.getBounds();
      if (bounds.isValid() && Object.keys(bounds).length > 0) {
        map.fitBounds(bounds, { maxZoom: 6, padding: [50, 50] });
      }
    } catch(e) { /* ignore */ }

  }, [geoJsonData, getStyleForRegion, overlayMode]);

  // 7. Render Markers (Active & Potential)
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !layerControl.current) return;

    // Active Clients Layer
    if (activeClientMarkersLayer.current) {
      try { 
        activeClientMarkersLayer.current.clearLayers();
        layerControl.current.removeLayer(activeClientMarkersLayer.current);
      } catch(e) {}
    }
    activeClientMarkersLayer.current = L.layerGroup();
    activeClientMarkersRef.current.clear();

    const createPopup = (name: string, address: string, type: string, contacts: string | undefined, key: string) => `
      <div class="popup-inner-content text-gray-800">
        <b>${name}</b><br>
        ${address}<br>
        <small>${type || 'н/д'}</small>
        ${contacts ? `<hr style="margin:5px 0;"/><small>Контакты: ${contacts}</small>` : ''}
        <button class="edit-location-btn mt-3 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-1.5 px-3 rounded text-xs transition-colors flex items-center justify-center gap-2" data-key="${key}">Изменить</button>
      </div>
    `;

    activeClients.forEach(tt => {
      if (tt.lat && tt.lon) {
        const marker = L.circleMarker([tt.lat, tt.lon], { 
          pane: 'markerPane', 
          fillColor: '#10b981', 
          color: '#059669', 
          radius: 4, 
          weight: 1, 
          opacity: 1, 
          fillOpacity: 0.9 
        });
        marker.bindPopup(createPopup(tt.name, tt.address, tt.type, tt.contacts, tt.key));
        activeClientMarkersLayer.current?.addLayer(marker);
        activeClientMarkersRef.current.set(tt.key, marker);
      }
    });

    // Potential Clients Layer
    if (potentialClientMarkersLayer.current) {
      try { 
        potentialClientMarkersLayer.current.clearLayers();
        layerControl.current.removeLayer(potentialClientMarkersLayer.current);
      } catch(e) {}
    }
    potentialClientMarkersLayer.current = L.layerGroup();

    potentialClients.forEach(tt => {
      if (tt.lat && tt.lon) {
        const popup = `<b>${findValueInRow(tt,['наименование','клиент'])}</b><br>${findValueInRow(tt,['юридический адрес','адрес'])}<br><small>${findValueInRow(tt,['вид деятельности','тип']) || 'н/д'}</small>`;
        const marker = L.circleMarker([tt.lat, tt.lon], { 
          pane: 'markerPane', 
          fillColor: '#3b82f6', 
          color: '#2563eb', 
          radius: 3, 
          weight: 1, 
          opacity: 1, 
          fillOpacity: 0.8 
        });
        marker.bindPopup(popup);
        potentialClientMarkersLayer.current?.addLayer(marker);
      }
    });

    if (overlayMode === 'sales') {
      map.addLayer(activeClientMarkersLayer.current!);
      map.addLayer(potentialClientMarkersLayer.current!);
    } else {
      map.removeLayer(activeClientMarkersLayer.current!);
      map.removeLayer(potentialClientMarkersLayer.current!);
    }

    layerControl.current.addOverlay(activeClientMarkersLayer.current!, 'Активные ТТ');
    layerControl.current.addOverlay(potentialClientMarkersLayer.current!, 'Потенциал (ОКБ)');

  }, [activeClients, potentialClients, overlayMode]);

  // 8. FlyTo Handler
  useEffect(() => {
    if (flyToClientKey && mapInstance.current) {
      const marker = activeClientMarkersRef.current.get(flyToClientKey);
      if (marker && marker instanceof L.CircleMarker) {
        mapInstance.current.flyTo(marker.getLatLng(), 14, { duration: 1.5 });
        marker.openPopup();
      }
    }
  }, [flyToClientKey]);

  // 9. Theme Switching
  useEffect(() => {
    const map = mapInstance.current; if (!map) return;
    const darkUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const lightUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    const target = localTheme === 'dark' ? darkUrl : lightUrl;
    
    if (tileLayerRef.current) {
      tileLayerRef.current.setUrl(target);
    } else {
      tileLayerRef.current = L.tileLayer(target, { attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(map);
      tileLayerRef.current.bringToBack();
    }
    
    if (mapContainer.current) {
      mapContainer.current.classList.remove('theme-dark','theme-light');
      mapContainer.current.classList.add(`theme-${localTheme}`);
    }
  }, [localTheme]);

  // 10. Legend Rendering (React Portal)
  useEffect(() => {
    if (legendContainerRef.current) {
      if (!legendRootRef.current) {
        legendRootRef.current = ReactDOM.createRoot(legendContainerRef.current);
      }
      legendRootRef.current.render(<MapLegend mode={overlayMode} />);
    }
  }, [overlayMode]);

  return (
    <div id="interactive-map-container" className={`bg-card-bg/70 backdrop-blur-sm rounded-2xl shadow-lg border border-indigo-500/10 transition-all duration-500 ease-in-out ${isFullscreen ? 'fixed inset-0 z-[100] rounded-none p-0 bg-gray-900' : 'p-6 relative'}`}>
      <style>{`.leaflet-control-attribution { display: none !important; }`}</style>
      
      {/* Header / Controls */}
      <div className={`flex flex-col md:flex-row justify-between items-center mb-4 gap-4 ${isFullscreen ? 'absolute top-4 left-4 z-[1001] w-[calc(100%-5rem)] pointer-events-none' : ''}`}>
        
        <div className="flex items-center gap-3 pointer-events-auto">
          <h2 className={`text-xl font-bold text-text-main whitespace-nowrap drop-shadow-md ${isFullscreen ? 'bg-card-bg/80 px-4 py-2 rounded-lg backdrop-blur-md border border-gray-700' : ''}`}>Карта рыночного потенциала</h2>
          {isLoadingGeo ? (<div className="flex items-center gap-2 px-3 py-1 bg-indigo-600/80 rounded-lg text-white text-xs animate-pulse shadow-lg backdrop-blur-md"><LoaderIcon /> Загрузка геометрии...</div>) : isFromCache ? (<div className="flex items-center gap-2 px-3 py-1 bg-emerald-600/20 border border-emerald-500/50 rounded-lg text-emerald-400 text-xs shadow-lg backdrop-blur-md"><CheckIcon /> Из кэша</div>) : null}
        </div>

        <div className={`flex bg-gray-800/80 p-1 rounded-lg border border-gray-600 pointer-events-auto backdrop-blur-md ${isFullscreen ? 'shadow-xl' : ''}`}>
          <button onClick={() => setOverlayMode('sales')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${overlayMode === 'sales' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}>Продажи</button>
          <button onClick={() => setOverlayMode('pets')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${overlayMode === 'pets' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}>Питомец-Индекс</button>
          <button onClick={() => setOverlayMode('competitors')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${overlayMode === 'competitors' ? 'bg-red-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}>Конкуренты</button>
        </div>

        {/* Search Bar */}
        <div className={`relative w-full md:w-auto md:min-w-[300px] ${isFullscreen ? 'pointer-events-auto' : ''}`}>
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><SearchIcon /></div>
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Поиск региона..." className="w-full p-2 pl-10 bg-card-bg/80 border border-gray-600 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent text-text-main placeholder-gray-500 transition backdrop-blur-sm" />
          {searchResults.length > 0 && (<ul className="absolute z-50 w-full mt-1 bg-card-bg/90 backdrop-blur-md border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar">{searchResults.map(loc => (<li key={loc.name} onClick={() => handleLocationSelect(loc)} className="px-4 py-2 text-text-main cursor-pointer hover:bg-indigo-500/20 flex justify-between items-center border-b border-gray-700/50 last:border-0"><span>{loc.name}</span></li>))}</ul>)}
        </div>
      </div>

      {/* Map Canvas */}
      <div className={`relative w-full ${isFullscreen ? 'h-full' : 'h-[65vh]'} rounded-lg overflow-hidden border border-gray-700`}>
        <div ref={mapContainer as any} className="h-full w-full bg-gray-800 z-0" />
        
        {/* Right Controls */}
        <div className="absolute top-4 right-4 z-[2000] flex flex-col gap-3 pointer-events-auto">
          <button onClick={() => setLocalTheme(prev => prev === 'dark' ? 'light' : 'dark')} className="bg-card-bg/90 hover:bg-gray-700 text-text-main p-2.5 rounded-lg shadow-lg border border-gray-600 transition-all backdrop-blur-md flex items-center justify-center">{localTheme === 'dark' ? <SunIcon /> : <MoonIcon />}</button>
          <button onClick={() => setIsFullscreen(prev => !prev)} className="bg-card-bg/90 hover:bg-gray-700 text-text-main p-2.5 rounded-lg shadow-lg border border-gray-600 transition-all backdrop-blur-md flex items-center justify-center">{isFullscreen ? <MinimizeIcon /> : <MaximizeIcon />}</button>
        </div>
        
        {/* Legend container managed by Leaflet, content by React Portal */}
      </div>
    </div>
  );
};

export default InteractiveRegionMap;
