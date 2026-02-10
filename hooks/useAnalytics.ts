
import { useState, useMemo } from 'react';
import { AggregatedDataRow, FilterState, MapPoint, OkbDataRow } from '../types';
import { applyFilters, getFilterOptions, calculateSummaryMetrics, findAddressInRow, findValueInRow, normalizeAddress } from '../utils/dataUtils';
import { enrichDataWithSmartPlan } from '../services/planning/integration';

export const useAnalytics = (
    allData: AggregatedDataRow[], 
    okbData: OkbDataRow[],
    okbRegionCounts: {[key: string]: number}
) => {
    const [filters, setFilters] = useState<FilterState>({ rm: '', brand: [], packaging: [], region: [] });
    const [filterStartDate, setFilterStartDate] = useState<string>('');
    const [filterEndDate, setFilterEndDate] = useState<string>('');

    const filtered = useMemo(() => {
        let processedData = allData;
        
        // Date Filtering
        if (filterStartDate || filterEndDate) {
            // FIX: Normalize to YYYY-MM to match monthlyFact keys
            const fStart = filterStartDate ? filterStartDate.substring(0, 7) : null;
            const fEnd = filterEndDate ? filterEndDate.substring(0, 7) : null;

            processedData = allData.map(row => {
                if (!row.monthlyFact || Object.keys(row.monthlyFact).length === 0) return row; 
                let newRowFact = 0;
                Object.entries(row.monthlyFact).forEach(([dateKey, val]) => {
                    if (dateKey === 'unknown') return; 
                    if (fStart && dateKey < fStart) return;
                    if (fEnd && dateKey > fEnd) return;
                    newRowFact += val;
                });
                const activeClients = row.clients.map(client => {
                    if (!client.monthlyFact || Object.keys(client.monthlyFact).length === 0) return client; 
                    let clientSum = 0;
                    Object.entries(client.monthlyFact).forEach(([d, v]) => {
                        if (d === 'unknown') return;
                        if (fStart && d < fStart) return;
                        if (fEnd && d > fEnd) return;
                        clientSum += v;
                    });
                    // Only update fact if we actually calculated a new sum based on dates.
                    // If clientSum is 0 but we have filters, it means no sales in period -> fact becomes 0.
                    return { ...client, fact: clientSum };
                }).filter(c => (c.fact || 0) > 0);
                
                // If row fact became 0 or no active clients left, this row will be filtered out later
                return { ...row, fact: newRowFact, clients: activeClients };
            }).filter(r => r.fact > 0 && r.clients.length > 0); 
        }

        // Smart Planning
        const smart = enrichDataWithSmartPlan(processedData, okbRegionCounts, 15, new Set());
        return applyFilters(smart, filters);
    }, [allData, filters, okbRegionCounts, filterStartDate, filterEndDate]);

    const allActiveClients = useMemo(() => {
        const clientsMap = new Map<string, MapPoint>();
        filtered.forEach(row => {
            if (row && Array.isArray(row.clients)) {
                row.clients.forEach(c => { if (c && c.key) clientsMap.set(c.key, c); });
            }
        });
        return Array.from(clientsMap.values());
    }, [filtered]);

    const activeClientAddressSet = useMemo(() => {
        const addressSet = new Set<string>();
        allActiveClients.forEach(client => {
            if (client.address) {
                addressSet.add(normalizeAddress(client.address));
            }
        });
        return addressSet;
    }, [allActiveClients]);

    const mapPotentialClients = useMemo(() => {
        if (!okbData || okbData.length === 0) return [];
        
        const coordsOnly = okbData.filter(r => {
            const lat = r.lat;
            const lon = r.lon;
            return lat && lon && !isNaN(Number(lat)) && !isNaN(Number(lon)) && Number(lat) !== 0;
        });

        const potentialOnly = coordsOnly.filter(r => {
            const addr = findAddressInRow(r);
            if (!addr) return true; 
            return !activeClientAddressSet.has(normalizeAddress(addr));
        });

        if (filters.region.length === 0) return potentialOnly;
        
        return potentialOnly.filter(row => {
            const rawRegion = findValueInRow(row, ['регион', 'субъект', 'область']);
            if (!rawRegion) return false;
            return filters.region.some(selectedReg => 
                rawRegion.toLowerCase().includes(selectedReg.toLowerCase()) || 
                selectedReg.toLowerCase().includes(rawRegion.toLowerCase())
            );
        });
    }, [okbData, filters.region, activeClientAddressSet]);

    const filterOptions = useMemo(() => getFilterOptions(allData), [allData]);
    const summaryMetrics = useMemo(() => calculateSummaryMetrics(filtered), [filtered]);

    return {
        filters, setFilters,
        filterStartDate, setFilterStartDate,
        filterEndDate, setFilterEndDate,
        filtered,
        allActiveClients,
        mapPotentialClients,
        filterOptions,
        summaryMetrics
    };
};
