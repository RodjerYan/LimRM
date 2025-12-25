
import {
  AggregatedDataRow,
  FilterState,
  FilterOptions,
  SummaryMetrics,
  OkbDataRow,
} from '../types';
import { REGION_KEYWORD_MAP, REGION_BY_CITY_MAP } from './addressMappings';
import { REGION_BY_CITY_WITH_INDEXES } from './regionMap';

/**
 * Normalizes an RM name for consistent matching.
 */
export const normalizeRmNameForMatching = (str: string): string => {
    if (!str) return '';
    let clean = str.toLowerCase().trim();
    const surname = clean.split(/[\s.]+/)[0];
    return surname.replace(/[^a-zа-я0-9]/g, '');
};

/**
 * Applies the current filter state to the aggregated data.
 */
export const applyFilters = (data: AggregatedDataRow[], filters: FilterState): AggregatedDataRow[] => {
  return data.filter(row => {
    const rmMatch = !filters.rm || row.rm === filters.rm;
    const brandMatch = filters.brand.length === 0 || filters.brand.includes(row.brand);
    const packagingMatch = filters.packaging.length === 0 || filters.packaging.includes(row.packaging);
    const regionMatch = filters.region.length === 0 || filters.region.includes(row.region);
    return rmMatch && brandMatch && packagingMatch && regionMatch;
  });
};

/**
 * Extracts all unique values for filter dropdowns.
 */
export const getFilterOptions = (data: AggregatedDataRow[]): FilterOptions => {
  const rms = new Set<string>();
  const brands = new Set<string>();
  const packagings = new Set<string>();
  const regions = new Set<string>();

  data.forEach(row => {
    if (row.rm) rms.add(row.rm);
    if (row.brand) brands.add(row.brand);
    if (row.packaging) packagings.add(row.packaging);
    if (row.region && row.region !== 'Регион не определен') regions.add(row.region);
  });

  return {
    rms: Array.from(rms).sort((a, b) => a.localeCompare(b, 'ru')),
    brands: Array.from(brands).sort((a, b) => a.localeCompare(b, 'ru')),
    packagings: Array.from(packagings).sort((a, b) => a.localeCompare(b, 'ru')),
    regions: Array.from(regions).sort((a, b) => a.localeCompare(b, 'ru')),
  };
};

/**
 * Calculates summary metrics.
 */
export const calculateSummaryMetrics = (data: AggregatedDataRow[]): SummaryMetrics | null => {
  if (data.length === 0) return null;

  const metrics = data.reduce(
    (acc, row) => {
      acc.totalFact += row.fact;
      acc.totalPotential += row.potential;
      acc.totalGrowth += row.growthPotential;
      
      if (row.clients) {
          row.clients.forEach(client => {
              acc.totalActiveClients += 1;
              const channel = client.type || 'Не определен';
              acc.channelCounts[channel] = (acc.channelCounts[channel] || 0) + 1;
          });
      }

      if (!acc.rmGrowth[row.rm]) acc.rmGrowth[row.rm] = 0;
      acc.rmGrowth[row.rm] += row.growthPotential;

      return acc;
    },
    {
      totalFact: 0,
      totalPotential: 0,
      totalGrowth: 0,
      totalActiveClients: 0,
      rmGrowth: {} as { [key: string]: number },
      channelCounts: {} as Record<string, number>
    }
  );

  const averageGrowthPercentage =
    metrics.totalPotential > 0 ? (metrics.totalGrowth / metrics.totalPotential) * 100 : 0;

  let topPerformingRM = { name: 'N/A', value: 0 };
  const rmKeys = Object.keys(metrics.rmGrowth);
  if (rmKeys.length > 0) {
    const topRMName = rmKeys.reduce((a, b) =>
      metrics.rmGrowth[a] > metrics.rmGrowth[b] ? a : b
    );
    topPerformingRM = { name: topRMName, value: metrics.rmGrowth[topRMName] };
  }

  return {
    totalFact: metrics.totalFact,
    totalPotential: metrics.totalPotential,
    totalGrowth: metrics.totalGrowth,
    totalClients: data.length, 
    totalActiveClients: metrics.totalActiveClients, 
    averageGrowthPercentage,
    topPerformingRM,
    channelCounts: metrics.channelCounts
  };
};

export const findValueInRow = (row: { [key: string]: any }, keywords: string[]): string => {
    if (!row) return '';
    const rowKeys = Object.keys(row);
    for (const keyword of keywords) {
        const k = keyword.toLowerCase().trim();
        const exactKey = rowKeys.find(rKey => rKey.toLowerCase().trim() === k);
        if (exactKey && row[exactKey] != null) return String(row[exactKey]);
    }
    for (const keyword of keywords) {
        const k = keyword.toLowerCase().trim();
        const escapedK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(^|[^а-яёa-z0-9])${escapedK}([^а-яёa-z0-9]|$)`, 'i');
        const boundaryKey = rowKeys.find(rKey => regex.test(rKey.toLowerCase().trim()));
        if (boundaryKey && row[boundaryKey] != null) return String(row[boundaryKey]);
    }
    for (const keyword of keywords) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim().includes(keyword.toLowerCase().trim()));
        if (foundKey && row[foundKey] != null) return String(row[foundKey]);
    }
    return '';
};

export const findAddressInRow = (row: { [key: string]: any }): string | null => {
    if (!row) return null;
    const rowKeys = Object.keys(row);
    const prioritizedKeys = ['адрес тт limkorm', 'фактический адрес', 'юридический адрес', 'адрес'];
    for (const pKey of prioritizedKeys) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim() === pKey);
        if (foundKey && row[foundKey]) return String(row[foundKey]);
    }
    const addressKey = rowKeys.find(key => key.toLowerCase().includes('адрес'));
    if (addressKey && row[addressKey]) return String(row[addressKey]);
    return null;
};

export const recoverRegion = (dirtyString: string, cityHint: string): string => {
    const lowerDirty = dirtyString 
        ? dirtyString.toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim() 
        : '';
    if (!lowerDirty && !cityHint) return 'Регион не определен';
    if (lowerDirty) {
        for (const [key, value] of Object.entries(REGION_KEYWORD_MAP)) {
             if (lowerDirty.includes(key)) return value;
        }
    }
    let lowerCity = cityHint ? cityHint.toLowerCase().trim() : '';
    if (lowerCity) {
        lowerCity = lowerCity.replace(/^(г\.|город|пгт|пос\.|с\.|село|дер\.|д\.)\s*/, '').trim().replace(/ё/g, 'е');
    }
    if (lowerCity && REGION_BY_CITY_MAP[lowerCity]) return REGION_BY_CITY_MAP[lowerCity];
    return 'Регион не определен';
};

/**
 * КРИТИЧЕСКИЙ ФИКС: Создание списка стоп-слов БЕЗ частей названий регионов.
 * Это предотвратит удаление слова "Московская" из "Московская ул.".
 */
const createStopwords = (): Set<string> => {
    return new Set([
        'улица', 'ул', 'проспект', 'пр', 'пр-т', 'пр-кт', 'проезд', 'пр-д', 'переулок', 'пер', 'шоссе', 'ш', 
        'бульвар', 'б-р', 'площадь', 'пл', 'набережная', 'наб', 'тупик', 'аллея', 'линия',
        'город', 'г', 'поселок', 'пос', 'пгт', 'деревня', 'дер', 'село', 'с', 'хутор', 'х', 
        'станица', 'ст-ца', 'аул', 'рп', 'рабочий', 'поселение', 'сельское', 'городское',
        'область', 'обл', 'край', 'республика', 'респ', 'автономный', 'округ', 'ао', 'район', 'р-н',
        'дом', 'корпус', 'корп', 'строение', 'стр', 'литер', 'лит',
        'квартира', 'кв', 'офис', 'оф', 'помещение', 'пом', 'комната', 'комн', 'мкр', 'микрорайон'
    ]);
};

const STOPWORDS = createStopwords();

/**
 * Глубокая нормализация адреса.
 * ФИКС: Отключена сортировка и расширен список сохраняемых токенов.
 */
export function normalizeAddress(address: string | null | undefined): string {
    if (!address) return "";
    let cleaned = address.toLowerCase().replace(/ё/g, 'е');
    // Стандартизация номеров домов и корпусов
    cleaned = cleaned
        .replace(/(\d+)\s*\/\s*(\d+[а-я]?)/g, '$1к$2')
        .replace(/\b(корпус|корп|к)\.?\s*([а-я0-9]+)\b/g, 'к$2')
        .replace(/\b(строение|стр|с)\.?\s*([а-я0-9]+)\b/g, 'с$2')
        .replace(/\b(д|дом)\.?\s*(\d+[а-я]?\b)/g, '$2');
    
    // Удаление спецсимволов, кроме букв и цифр
    cleaned = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' '); 
    
    const parts = cleaned.split(/\s+/)
        .filter(part => part && !STOPWORDS.has(part) && part.length > 0);
        
    // ФИКС: Не сортируем части! Порядок слов в адресе важен для отличия похожих улиц.
    return parts.join(' ').trim();
}
