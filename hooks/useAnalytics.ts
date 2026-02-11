
import { useState, useMemo } from 'react';
import { AggregatedDataRow, FilterState, MapPoint, OkbDataRow } from '../types';
import {
  applyFilters,
  getFilterOptions,
  calculateSummaryMetrics,
  findAddressInRow,
  findValueInRow,
  normalizeAddress
} from '../utils/dataUtils';
import { enrichDataWithSmartPlan } from '../services/planning/integration';
import { enrichWithAbcCategories } from '../utils/analytics';

// Приводим "YYYY-MM-DD" / "YYYY-MM" / "YYYY.MM.DD" -> "YYYY-MM".
// Если не похоже на дату — возвращаем null.
const toMonthKey = (raw?: string | null): string | null => {
  if (!raw) return null;
  const s = String(raw).trim();
  // Быстрая нормализация разделителей
  const norm = s.replace(/\./g, '-').replace(/\//g, '-');
  // Берём первые 7 символов, если похоже на YYYY-MM
  const m = norm.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(m)) return m;
  return null;
};

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

    // Date Filtering
    const fStart = toMonthKey(filterStartDate);
    const fEnd = toMonthKey(filterEndDate);
    const hasDateFilter = Boolean(fStart || fEnd);

    if (hasDateFilter) {
      processedData = allData.map(row => {
        const rowHasMonthly = row.monthlyFact && Object.keys(row.monthlyFact).length > 0;

        // STRICT FILTERING LOGIC
        // If we have a date filter active, we CANNOT rely on the total 'fact' if 'monthlyFact' is missing.
        // Doing so results in showing 2 years of sales for an 11-day period.
        // Therefore, if monthlyFact is missing, we assume 0 for the selected period (Strict Mode).
        
        let newRowFact = 0; // Default to 0 in strict mode

        if (rowHasMonthly) {
          for (const [dateKey, val] of Object.entries(row.monthlyFact!)) {
            if (dateKey === 'unknown') {
              // unknown still included to catch data errors, but it's debatable.
              newRowFact += (val as number) || 0;
              continue;
            }

            const mk = toMonthKey(dateKey);
            if (!mk) {
              newRowFact += (val as number) || 0;
              continue;
            }

            if (fStart && mk < fStart) continue;
            if (fEnd && mk > fEnd) continue;

            newRowFact += (val as number) || 0;
          }
        } else {
            // Row has NO monthly data. 
            // In strict mode with active date filter, this means we can't attribute ANY sales to this period.
            // So newRowFact remains 0.
        }

        // 2) Clients Filtering
        const activeClients = (row.clients || [])
          .map(client => {
            const cHasMonthly = client.monthlyFact && Object.keys(client.monthlyFact).length > 0;
            
            // If client has no monthly data, strict mode applies: fact = 0
            if (!cHasMonthly) {
                return { ...client, fact: 0 };
            }

            let clientSum = 0;
            for (const [d, v] of Object.entries(client.monthlyFact!)) {
              if (d === 'unknown') {
                clientSum += (v as number) || 0;
                continue;
              }

              const mk = toMonthKey(d);
              if (!mk) {
                clientSum += (v as number) || 0;
                continue;
              }

              if (fStart && mk < fStart) continue;
              if (fEnd && mk > fEnd) continue;

              clientSum += (v as number) || 0;
            }

            return { ...client, fact: clientSum };
          })
          .filter(c => (c.fact || 0) > 0); // Remove zero-fact clients in this view

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
