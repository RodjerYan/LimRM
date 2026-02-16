
import { useState, useMemo } from 'react';
import { AggregatedDataRow, FilterState, MapPoint, OkbDataRow } from '../types';
import {
  applyFilters,
  getFilterOptions,
  calculateSummaryMetrics,
  findAddressInRow,
  findValueInRow,
  normalizeAddress,
  toDayKey
} from '../utils/dataUtils';
import { enrichDataWithSmartPlan } from '../services/planning/integration';
import { enrichWithAbcCategories } from '../utils/analytics';

export const useAnalytics = (
  allData: AggregatedDataRow[],
  okbData: OkbDataRow[],
  okbRegionCounts: { [key: string]: number }
) => {
  const [filters, setFilters] = useState<FilterState>({ rm: '', brand: [], packaging: [], region: [] });
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  const filtered = useMemo(() => {
    let processedData = allData;

    // Standardize to YYYY-MM-DD
    const fStart = toDayKey(filterStartDate);
    const fEnd = toDayKey(filterEndDate);
    const hasDateFilter = Boolean(fStart || fEnd);

    if (hasDateFilter) {
      processedData = allData.map(row => {
        // We prefer dailyFact if available for precise filtering
        const rowHasDaily = row.dailyFact && Object.keys(row.dailyFact).length > 0;
        const rowHasMonthly = !rowHasDaily && row.monthlyFact && Object.keys(row.monthlyFact).length > 0;

        let newRowFact = 0; 

        if (rowHasDaily) {
            let hasValidDates = false;
            for (const [dayKey, val] of Object.entries(row.dailyFact!)) {
                if (dayKey === 'unknown') {
                    // Skip unknown if filter is active
                    continue;
                }
                const dk = toDayKey(dayKey);
                if (!dk) {
                    continue;
                }
                hasValidDates = true;
                if (fStart && dk < fStart) continue;
                if (fEnd && dk > fEnd) continue;
                newRowFact += (val as number) || 0;
            }
            
            // FALLBACK: If dailyFact exists but ONLY contains 'unknown' (parsing failed completely),
            // and the user has selected a filter, this effectively hides the data.
            // If you want to show it regardless (risky for analytics), uncomment below:
            // if (!hasValidDates && row.dailyFact!['unknown']) newRowFact = row.dailyFact!['unknown'];
            
        } else if (rowHasMonthly) {
            // Fallback for legacy data (monthly only)
            const startMonth = fStart ? fStart.slice(0, 7) : null;
            const endMonth = fEnd ? fEnd.slice(0, 7) : null;
            
            for (const [monthKey, val] of Object.entries(row.monthlyFact!)) {
                if (monthKey === 'unknown') continue;
                // Normalize legacy keys
                const mk = monthKey.length > 7 ? monthKey.slice(0, 7) : monthKey;
                
                if (startMonth && mk < startMonth) continue;
                if (endMonth && mk > endMonth) continue;
                newRowFact += (val as number) || 0;
            }
        } else {
            // If snapshot lacks ANY time data (flat snapshot), we cannot filter by time.
            // Current Decision: Show Total to prevent empty screen for users without temporal data
            newRowFact = row.fact;
        }

        // 2) Clients Filtering
        const activeClients = (row.clients || [])
          .map(client => {
            const cHasDaily = client.dailyFact && Object.keys(client.dailyFact).length > 0;
            const cHasMonthly = !cHasDaily && client.monthlyFact && Object.keys(client.monthlyFact).length > 0;
            
            let clientSum = 0;

            if (cHasDaily) {
                for (const [d, v] of Object.entries(client.dailyFact!)) {
                    if (d === 'unknown') continue;
                    const dk = toDayKey(d);
                    if (!dk) continue;
                    if (fStart && dk < fStart) continue;
                    if (fEnd && dk > fEnd) continue;
                    clientSum += (v as number) || 0;
                }
            } else if (cHasMonthly) {
                const startMonth = fStart ? fStart.slice(0, 7) : null;
                const endMonth = fEnd ? fEnd.slice(0, 7) : null;
                for (const [m, v] of Object.entries(client.monthlyFact!)) {
                    if (m === 'unknown') continue;
                    const mk = m.length > 7 ? m.slice(0, 7) : m;
                    if (startMonth && mk < startMonth) continue;
                    if (endMonth && mk > endMonth) continue;
                    clientSum += (v as number) || 0;
                }
            } else {
                // If no time data, preserve existing fact (same logic as row)
                clientSum = client.fact || 0;
            }

            return { ...client, fact: clientSum };
          })
          .filter(c => (c.fact || 0) > 0); 

        // RECALCULATE DERIVED METRICS FOR CONSISTENCY
        const newPotential = newRowFact * 1.15;
        const newGrowthPotential = Math.max(0, newPotential - newRowFact);

        return { 
            ...row, 
            fact: newRowFact, 
            potential: newPotential,
            growthPotential: newGrowthPotential,
            growthPercentage: 15,
            clients: activeClients 
        };
      })
      // Remove rows that became empty due to filtering
      .filter(r => (r.fact || 0) > 0);
    }

    // Smart Planning
    const smart = enrichDataWithSmartPlan(processedData, okbRegionCounts, 15, new Set());
    const filteredSmart = applyFilters(smart, filters);
    
    // Apply ABC classification on the FILTERED view
    return enrichWithAbcCategories(filteredSmart);
  }, [allData, filters, okbRegionCounts, filterStartDate, filterEndDate]);

  const allActiveClients = useMemo(() => {
    const clientsMap = new Map<string, MapPoint>();
    filtered.forEach(row => {
      if (row && Array.isArray(row.clients)) {
        row.clients.forEach(c => {
          if (c && c.key) clientsMap.set(c.key, c);
        });
      }
    });
    return Array.from(clientsMap.values());
  }, [filtered]);

  const activeClientAddressSet = useMemo(() => {
    const addressSet = new Set<string>();
    allActiveClients.forEach(client => {
      if (client.address) addressSet.add(normalizeAddress(client.address));
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