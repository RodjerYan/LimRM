
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
            processedData = allData.map(row => {
                if (!row.monthlyFact || Object.keys(row.monthlyFact).length === 0) return row; 
                let newRowFact = 0;
                Object.entries(row.monthlyFact).forEach(([dateKey, val]) => {
                    if (dateKey === 'unknown') return; 
                    if (filterStartDate && dateKey < filterStartDate) return;
                    if (filterEndDate && dateKey > filterEndDate) return;
                    newRowFact += val;
                });
                const activeClients = row.clients.map(client => {
                    if (!client.monthlyFact || Object.keys(client.monthlyFact).length === 0) return client; 
                    let clientSum = 0;
                    Object.entries(client.monthlyFact).forEach(([d, v]) => {
                        if (d === 'unknown') return;
                        if (filterStartDate && d < filterStartDate) return;
                        if (filterEndDate && d > filterEndDate) return;
                        clientSum += v;
                    });
                    return { ...client, fact: clientSum };
                }).filter(c => (c.fact || 0) > 0);
                return { ...row, fact: newRowFact, clients: activeClients };
            }).filter(r => r.fact > 0); 
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
