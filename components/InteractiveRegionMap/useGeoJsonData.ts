
import { useState, useEffect } from 'react';
import { FeatureCollection } from 'geojson';
import { MANUAL_BOUNDARIES } from '../../data/manual_boundaries';
import { fixChukotkaGeoJSON } from './geo/fixChukotkaGeoJSON';

export const useGeoJsonData = () => {
    const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
    const [isLoadingGeo, setIsLoadingGeo] = useState(true);
    const [isFromCache, setIsFromCache] = useState(false);

    useEffect(() => {
        const fetchGeoData = async () => {
            const CACHE_NAME = 'limkorm-geo-v2';
            const RUSSIA_URL = 'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/russia.geojson';
            const WORLD_URL = 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_0_countries.geojson';

            try {
                setIsLoadingGeo(true);
                let russiaData: any = null, worldData: any = null;
                if ('caches' in window) {
                    try {
                        const cache = await caches.open(CACHE_NAME);
                        const [russiaRes, worldRes] = await Promise.all([cache.match(RUSSIA_URL), cache.match(WORLD_URL)]);
                        if (russiaRes && worldRes) {
                            russiaData = await russiaRes.json(); worldData = await worldRes.json();
                            setIsFromCache(true);
                        } else {
                            const [rNetwork, wNetwork] = await Promise.all([fetch(RUSSIA_URL), fetch(WORLD_URL)]);
                            if (rNetwork.ok && wNetwork.ok) {
                                cache.put(RUSSIA_URL, rNetwork.clone()); cache.put(WORLD_URL, wNetwork.clone());
                                russiaData = await rNetwork.json(); worldData = await wNetwork.json();
                            }
                        }
                    } catch (e) { console.warn('Cache API error:', e); }
                }
                if (!russiaData || !worldData) {
                    const [rRes, wRes] = await Promise.all([fetch(RUSSIA_URL), fetch(WORLD_URL)]);
                    russiaData = await rRes.json(); worldData = await wRes.json();
                }
                const finalFeatures = [];
                // Push manual boundaries first (if any)
                if (MANUAL_BOUNDARIES && MANUAL_BOUNDARIES.length > 0) {
                     finalFeatures.push(...MANUAL_BOUNDARIES);
                }
                
                const manualNames = new Set(MANUAL_BOUNDARIES.map(f => f.properties.name));
                if (russiaData && russiaData.features) {
                    const fixedRussia = russiaData.features.filter((f: any) => !manualNames.has(f.properties.name)).map((f: any) => f.properties?.name === 'Чукотский автономный округ' ? fixChukotkaGeoJSON(f) : f);
                    finalFeatures.push(...fixedRussia);
                }
                if (worldData && worldData.features) {
                    const cisCountriesMap: Record<string, string> = { 'Belarus': 'Республика Беларусь', 'Kazakhstan': 'Республика Казахстан', 'Kyrgyzstan': 'Кыргызская Республика', 'Uzbekistan': 'Республика Узбекистан', 'Tajikistan': 'Республика Таджикистан', 'Turkmenistan': 'Туркменистан', 'Armenia': 'Армения', 'Azerbaijan': 'Азербайджан', 'Georgia': 'Грузия', 'Moldova': 'Республика Молдова' };
                    const cisFeatures = worldData.features.filter((f: any) => cisCountriesMap[f.properties.name]).map((f: any) => { f.properties.name = cisCountriesMap[f.properties.name]; return f; });
                    finalFeatures.push(...cisFeatures);
                }
                setGeoJsonData({ type: 'FeatureCollection', features: finalFeatures });
            } catch (error) { console.error("Error fetching map geometry:", error); } finally { setIsLoadingGeo(false); }
        };
        fetchGeoData();
    }, []);

    return { geoJsonData, isLoadingGeo, isFromCache };
};