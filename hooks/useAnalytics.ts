
import { useState, useMemo } from 'react';
import { AggregatedDataRow, FilterState, MapPoint, OkbDataRow } from '../types';
import {
  applyFilters,
  getFilterOptions,
  calculateSummaryMetrics,
  findAddressInRow,
  findValueInRow,
  toDayKey,
  getCoreAddressTokens
} from '../utils/dataUtils';
import { enrichDataWithSmartPlan } from '../services/planning/integration';
import { enrichWithAbcCategories } from '../utils/analytics';

const getHouseTokens = (tokens: string[]) => tokens.filter(t => 
  /^\d+[а-я]?$/.test(t) ||                  // 98, 98а
  /^\d+(к|с|л)\d+[а-я]?$/.test(t) ||        // 98к1, 98с1
  /^[ксл]\d+[а-я]?$/.test(t)                // к1, с2
);

const TT_NAME_STOP = new Set([
  'ооо','ип','ао','пао','зао','оао','тд','гк',
  'магазин','супермаркет','гипермаркет','сеть','пвз','пункт','выдачи'
]);

const normalizeTtName = (s?: string | null) => {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .replace(/ё/g,'е')
    .replace(/[«»"']/g,' ')
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .split(' ')
    .filter(w => w.length >= 2 && !TT_NAME_STOP.has(w))
    .join(' ');
};

const ttNameSimilarity = (a: string, b: string) => {
  const A = new Set(a.split(/\s+/).filter(Boolean));
  const B = new Set(b.split(/\s+/).filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
};

const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
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

  // 1) GLOBAL list of active clients (independent of filters / date range)
  const globalActiveClients = useMemo(() => {
    const clientsMap = new Map<string, MapPoint>();

    (allData || []).forEach(row => {
      if (row && Array.isArray(row.clients)) {
        row.clients.forEach(c => {
          if (c && c.key) clientsMap.set(c.key, c);
        });
      }
    });

    return Array.from(clientsMap.values());
  }, [allData]);

  // 2) GLOBAL index of occupied addresses
  const globalActiveClientIndex = useMemo(() => {
    // Store rich signature for debugging and better matching
    const index = new Map<string, { key: string; tokens: string[]; raw?: string; ttNameNorm: string }[]>();

    globalActiveClients.forEach(client => {
      if (!client.address) return;
      const { cities, tokens } = getCoreAddressTokens(client.address);

      if (tokens.length === 0) return; // address is empty after normalization - do not index

      if (!client.key) return;
      const signature = { 
          key: client.key, 
          tokens, 
          raw: client.address,
          ttNameNorm: normalizeTtName(
            (client as any).ttName || (client as any).name || (client as any).title || (client as any).clientName
          )
      };

      if (cities.length > 0) {
        cities.forEach(city => {
          if (!index.has(city)) index.set(city, []);
          index.get(city)!.push(signature);
        });
      } else {
        if (!index.has('unknown')) index.set('unknown', []);
        index.get('unknown')!.push(signature);
      }
    });

    return index;
  }, [globalActiveClients]);

  // 3) GLOBAL index of coordinates (lat:lon -> client[])
  const globalActiveClientCoords = useMemo(() => {
    const index = new Map<string, { key: string; lat: number; lon: number; ttNameNorm: string }[]>();
    globalActiveClients.forEach(c => {
        const latN = Number((c as any).lat);
        const lonN = Number((c as any).lon);
        
        if (!Number.isFinite(latN) || !Number.isFinite(lonN) || latN === 0 || lonN === 0) return;
        if (!c.key) return;

        const cell = (x: number) => Math.round(x * 1000);
        const key = `${cell(latN)}:${cell(lonN)}`;
        
        if (!index.has(key)) index.set(key, []);
        index.get(key)!.push({ 
            key: c.key, 
            lat: latN, 
            lon: lonN,
            ttNameNorm: normalizeTtName(
                (c as any).ttName || (c as any).name || (c as any).title || (c as any).clientName
            )
        });
    });
    return index;
  }, [globalActiveClients]);

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

  const mapPotentialClients = useMemo(() => {
    if (!okbData || okbData.length === 0) return [];

    const coordsOnly = okbData.filter(r => {
      const latN = Number(r.lat);
      const lonN = Number(r.lon);
      return Number.isFinite(latN) && Number.isFinite(lonN) && latN !== 0 && lonN !== 0;
    });

    const potentialOnly = coordsOnly.filter(r => {
      // Extract OKB Name for validation
      const okbNameRaw = findValueInRow(r, ['наименование тт', 'название тт', 'торговая точка', 'тт', 'клиент', 'контрагент', 'наименование', 'название', 'name']);
      const okbNameNorm = normalizeTtName(okbNameRaw);
      const NAME_THRESHOLD = 0.75;

      // 1. Coordinate Match (Fastest)
      const rLat = Number(r.lat);
      const rLon = Number(r.lon);
      
      let coordNear = false;
      const nearNamesSet = new Set<string>();

      // Check 9 neighbors grid
      const cell = (x: number) => Math.round(x * 1000);
      const centerLat = cell(rLat);
      const centerLon = cell(rLon);

      for (let latOff = -1; latOff <= 1; latOff++) {
          for (let lonOff = -1; lonOff <= 1; lonOff++) {
               // Calculate neighbor key
               const key = `${centerLat + latOff}:${centerLon + lonOff}`;
               
               const candidates = globalActiveClientCoords.get(key);
               if (candidates) {
                   for (const cand of candidates) {
                       if (getDistanceMeters(rLat, rLon, cand.lat, cand.lon) < 80) {
                           coordNear = true;
                           if (cand.ttNameNorm) nearNamesSet.add(cand.ttNameNorm);
                       }
                   }
               }
          }
      }

      // 2. Address Analysis (for Collective check)
      let addrRaw = findAddressInRow(r);
      let isCollective = false;

      if (addrRaw) {
          const addrCollective = addrRaw.toLowerCase().replace(/ё/g,'е');
          isCollective = /\b(тц|т\/ц|т\.ц\.|трц|трк|тк|бц|торгов(ый|ого)|бизнес|центр|комплекс|рынок|пав(ильон)?|секц(ия)?|линия|ряд|офис|помещ(ение)?)\b/.test(addrCollective);
      }

      if (coordNear) {
          if (isCollective) {
              // Collective: Strict Name Match Required
              if (okbNameNorm && nearNamesSet.size > 0) {
                 const nearNames = Array.from(nearNamesSet);
                 if (nearNames.some(n => ttNameSimilarity(okbNameNorm, n) >= NAME_THRESHOLD)) {
                     return false; // Confirmed duplicate by coords + name
                 }
              }
          } else {
              // Ordinary Address (or no address): Coordinate match is sufficient (Strict Mode)
              return false; // Duplicate
          }
      }

      // 3. Address Match (Fallback)
      if (!addrRaw) return true;

      // Append City if available in row and not in address (Robust check)
      const rowCity = findValueInRow(r, ['город', 'city']);
      if (rowCity) {
          const addrLower = addrRaw.toLowerCase().replace(/ё/g,'е');
          const cityLower = String(rowCity).toLowerCase().replace(/ё/g,'е').trim();
          const hasCityWord = new RegExp(`(^|\\s)${cityLower}(\\s|$)`).test(addrLower);
          if (!hasCityWord) addrRaw = `${rowCity} ${addrRaw}`;
      }

      const { cities, tokens } = getCoreAddressTokens(addrRaw);
      if (tokens.length === 0) return true;

      const candidates: { key: string; tokens: string[]; raw?: string; ttNameNorm: string }[] = [];
      
      if (cities.length > 0) {
          cities.forEach(c => {
              const cityCandidates = globalActiveClientIndex.get(c);
              if (cityCandidates) candidates.push(...cityCandidates);
          });

          // fallback: if empty by city - try unknown
          if (candidates.length === 0) {
            const unknownCandidates = globalActiveClientIndex.get('unknown');
            if (unknownCandidates) candidates.push(...unknownCandidates);
          }
      } else {
          const unknownCandidates = globalActiveClientIndex.get('unknown');
          if (unknownCandidates) candidates.push(...unknownCandidates);
      }

      if (candidates.length === 0) return true;

      // Check for match: Symmetric subset check (OKB ⊆ ACTIVE) OR (ACTIVE ⊆ OKB)
      const isMatch = candidates.some(candidate => {
          const activeTokens = candidate.tokens;
          if (activeTokens.length === 0) return false;

          // House Token Check (Anchor)
          const okbHouses = getHouseTokens(tokens);
          const actHouses = getHouseTokens(activeTokens);
          
          // If both have house tokens, they MUST match at least one
          if (okbHouses.length > 0 && actHouses.length > 0) {
              const houseMatch = okbHouses.some(h => actHouses.includes(h));
              if (!houseMatch) return false;
          }

          // Short Token Safety
          if (tokens.length < 3) {
             // If very short, require strict Jaccard or house match
             if (okbHouses.length > 0 && actHouses.length > 0) {
                 // House matched above, so we are good
             } else {
                 // No houses, short address -> risky. Require high overlap.
                 const overlap = tokens.filter(t => activeTokens.includes(t)).length;
                 const jaccard = overlap / (new Set([...tokens, ...activeTokens]).size);
                 if (jaccard < 0.85) return false;
             }
          }

          const okbInActive = tokens.every(t => activeTokens.includes(t));
          const activeInOkb = activeTokens.every(t => tokens.includes(t));
          const addrMatch = okbInActive || activeInOkb;

          if (!addrMatch) return false;

          // Address Matched -> Validate by Name
          const actName = candidate.ttNameNorm || '';
          
          // Hybrid Logic:
          // 1. Collective Address (Mall, BC) -> Name match REQUIRED
          if (isCollective) {
              if (!okbNameNorm || !actName) return false; // Cannot verify -> assume different
              return ttNameSimilarity(okbNameNorm, actName) >= NAME_THRESHOLD;
          }

          // 2. Ordinary Address -> Name match reinforces, but missing name = duplicate IF house matches
          if (!okbNameNorm || !actName) {
              // Check for house anchor match as final safety check
              const hasHouse = okbHouses.length > 0 && actHouses.length > 0 && okbHouses.some(h => actHouses.includes(h));
              return hasHouse; // Only cut if house number definitely matches
          }

          // If names present, check similarity with softer threshold
          return ttNameSimilarity(okbNameNorm, actName) >= 0.6;
      });

      return !isMatch;
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
  }, [okbData, filters.region, globalActiveClientIndex, globalActiveClientCoords]);

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