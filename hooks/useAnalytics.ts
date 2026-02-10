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

        // 1) Считаем row.fact по месяцам, если monthlyFact есть.
        // Если monthlyFact нет — оставляем row.fact как был, чтобы не пропадали строки/точки.
        let newRowFact = row.fact ?? 0;

        if (rowHasMonthly) {
          newRowFact = 0;
          for (const [dateKey, val] of Object.entries(row.monthlyFact!)) {
            if (dateKey === 'unknown') {
              // unknown включаем всегда, иначе будут "пропадающие" клиенты/точки
              newRowFact += (val as number) || 0;
              continue;
            }

            const mk = toMonthKey(dateKey);
            // если ключ не распознан — считаем как unknown (лучше так, чем потерять)
            if (!mk) {
              newRowFact += (val as number) || 0;
              continue;
            }

            if (fStart && mk < fStart) continue;
            if (fEnd && mk > fEnd) continue;

            newRowFact += (val as number) || 0;
          }
        }

        // 2) Клиенты
        const activeClients = (row.clients || [])
          .map(client => {
            const cHasMonthly = client.monthlyFact && Object.keys(client.monthlyFact).length > 0;

            // Если детализации нет — не зануляем, иначе потеряем точку.
            if (!cHasMonthly) return client;

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
          // ВАЖНО: фильтруем только тех, у кого monthlyFact есть и факт реально 0.
          // Клиенты без monthlyFact не удаляются.
          .filter(c => {
            const hasMonthly = c.monthlyFact && Object.keys(c.monthlyFact).length > 0;
            if (!hasMonthly) return true;
            return (c.fact || 0) > 0;
          });

        return { ...row, fact: newRowFact, clients: activeClients };
      })
      // И тут тоже: не выкидываем строки только из-за того, что факт = 0,
      // если у них нет monthlyFact (иначе точки пропадут).
      .filter(r => {
        const rowHasMonthly = r.monthlyFact && Object.keys(r.monthlyFact).length > 0;
        if (!rowHasMonthly) return true;
        return (r.fact || 0) > 0;
      });
    }

    // Smart Planning
    const smart = enrichDataWithSmartPlan(processedData, okbRegionCounts, 15, new Set());
    return applyFilters(smart, filters);
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
