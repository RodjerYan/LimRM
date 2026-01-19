
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

export const applyFilters = (data: AggregatedDataRow[], filters: FilterState): AggregatedDataRow[] => {
  return data.filter(row => {
    const rmMatch = !filters.rm || row.rm === filters.rm;
    const brandMatch = filters.brand.length === 0 || filters.brand.includes(row.brand);
    const packagingMatch = filters.packaging.length === 0 || filters.packaging.includes(row.packaging);
    const regionMatch = filters.region.length === 0 || filters.region.includes(row.region);
    return rmMatch && brandMatch && packagingMatch && regionMatch;
  });
};

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

export const calculateSummaryMetrics = (data: AggregatedDataRow[]): SummaryMetrics | null => {
  if (data.length === 0) return null;

  const globalUniqueKeys = new Set<string>();
  const channelUniqueKeys: Record<string, Set<string>> = {};

  const metrics = data.reduce(
    (acc, row) => {
      acc.totalFact += row.fact;
      acc.totalPotential += row.potential;
      acc.totalGrowth += row.growthPotential;
      
      if (row.clients) {
          row.clients.forEach(client => {
              globalUniqueKeys.add(client.key);
              const channel = client.type || 'Не определен';
              if (!channelUniqueKeys[channel]) channelUniqueKeys[channel] = new Set();
              channelUniqueKeys[channel].add(client.key);
          });
      }

      if (!acc.rmGrowth[row.rm]) acc.rmGrowth[row.rm] = 0;
      acc.rmGrowth[row.rm] += row.growthPotential;

      return acc;
    },
    { totalFact: 0, totalPotential: 0, totalGrowth: 0, rmGrowth: {} as { [key: string]: number } }
  );

  const averageGrowthPercentage = metrics.totalPotential > 0 ? (metrics.totalGrowth / metrics.totalPotential) * 100 : 0;

  let topPerformingRM = { name: 'N/A', value: 0 };
  const rmKeys = Object.keys(metrics.rmGrowth);
  if (rmKeys.length > 0) {
    const topRMName = rmKeys.reduce((a, b) => metrics.rmGrowth[a] > metrics.rmGrowth[b] ? a : b);
    topPerformingRM = { name: topRMName, value: metrics.rmGrowth[topRMName] };
  }

  const channelCounts: Record<string, number> = {};
  Object.entries(channelUniqueKeys).forEach(([ch, set]) => { channelCounts[ch] = set.size; });

  return {
    totalFact: metrics.totalFact,
    totalPotential: metrics.totalPotential,
    totalGrowth: metrics.totalGrowth,
    totalClients: data.length, 
    totalActiveClients: globalUniqueKeys.size, 
    averageGrowthPercentage,
    topPerformingRM,
    channelCounts
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
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim().includes(keyword.toLowerCase().trim()));
        if (foundKey && row[foundKey] != null) return String(row[foundKey]);
    }
    return '';
};

export const findAddressInRow = (row: { [key: string]: any }): string | null => {
    if (!row) return null;
    const rowKeys = Object.keys(row);
    const prioritizedKeys = ['адрес тт limkorm', 'фактический адрес', 'юридический адрес', 'адрес', 'пункт разгрузки', 'адрес доставки'];
    for (const pKey of prioritizedKeys) {
        const foundKey = rowKeys.find(rKey => rKey.toLowerCase().trim() === pKey);
        if (foundKey && row[foundKey]) return String(row[foundKey]);
    }
    const addressKey = rowKeys.find(key => key.toLowerCase().includes('адрес'));
    if (addressKey && row[addressKey]) return String(row[addressKey]);
    const fallbackKey = rowKeys.find(key => (key.toLowerCase().includes('город') || key.toLowerCase().includes('регион')) && !key.toLowerCase().includes('субъект'));
    if (fallbackKey && row[fallbackKey]) return String(row[fallbackKey]);
    return null;
};

// --- UNIVERSAL REGION MATCHER GENERATOR ---
const REGION_MATCHER_LIST = Object.values(REGION_KEYWORD_MAP).reduce((acc, regionName) => {
    const lowerName = regionName.toLowerCase();
    let root = lowerName
        .replace(/\bобласть\b/g, '')
        .replace(/\bкрай\b/g, '')
        .replace(/\bреспублика\b/g, '')
        .replace(/\bавтономный округ\b/g, '')
        .replace(/\bао\b/g, '')
        .replace(/\bг\.\s*/g, '') 
        .replace(/[()]/g, '')     
        .trim();
    if (root.length > 2) {
         if (!acc.some(item => item.root === root)) acc.push({ root, regionName });
    }
    return acc;
}, [] as { root: string, regionName: string }[]);
REGION_MATCHER_LIST.sort((a, b) => b.root.length - a.root.length);

export const recoverRegion = (dirtyString: string, cityHint: string): string => {
    const lowerDirty = dirtyString ? dirtyString.toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim() : '';
    if (!lowerDirty && !cityHint) return 'Регион не определен';
    if (lowerDirty) {
        for (const [key, value] of Object.entries(REGION_KEYWORD_MAP)) {
             if (lowerDirty.includes(key)) return value;
        }
        for (const { root, regionName } of REGION_MATCHER_LIST) {
            if (lowerDirty.includes(root)) return regionName;
        }
    }
    let lowerCity = cityHint ? cityHint.toLowerCase().trim() : '';
    if (lowerCity) {
        lowerCity = lowerCity.replace(/^(г\.|город|пгт|пос\.|с\.|село|дер\.|д\.)\s*/, '').trim().replace(/ё/g, 'е');
    }
    if (lowerCity && REGION_BY_CITY_MAP[lowerCity]) return REGION_BY_CITY_MAP[lowerCity];
    return 'Регион не определен';
};

const createStopwords = (): Set<string> => {
    const genericStopwords = [
        'улица', 'ул', 'проспект', 'пр', 'пр-т', 'пр-кт', 'проезд', 'пр-д', 'переулок', 'пер', 'шоссе', 'ш', 
        'бульвар', 'б-р', 'площадь', 'пл', 'набережная', 'наб', 'тупик', 'аллея', 'линия',
        'город', 'г', 'поселок', 'пос', 'пгт', 'деревня', 'дер', 'село', 'с', 'хутор', 'х', 
        'станица', 'ст-ца', 'аул', 'рп', 'рабочий', 'поселение', 'сельское', 'городское',
        'область', 'обл', 'край', 'республика', 'респ', 'автономный', 'округ', 'ао', 'район', 'р-н', 'р', 'н',
        'кыргызстан', 'киргизия', 'кыргызская', 'казахстан', 'россия', 'рф', 'беларусь', 'белоруссия',
        'таджикистан', 'узбекистан', 'туркменистан', 'армения', 'азербайджан', 'молдова', 'грузия',
        'дом', 'корпус', 'корп', 'строение', 'стр', 'литер', 'лит',
        'квартира', 'кв', 'офис', 'оф', 'помещение', 'пом', 'комната', 'комн', 'мкр', 'микрорайон', 'автодорога'
    ];
    return new Set([...genericStopwords]);
};

const STOPWORDS = createStopwords();
const ALL_CITIES = new Set(Object.keys(REGION_BY_CITY_WITH_INDEXES));

/**
 * НОВАЯ ВЕРСИЯ НОРМАЛИЗАЦИИ ДЛЯ БАЗЫ v5
 * Использует "Мешок слов" (Bag of Words) + Сортировку.
 * Это позволяет матчить "Москва Ленина" и "Ленина Москва" как идентичные.
 */
export function normalizeAddress(address: string | null | undefined, options: { simplify?: boolean } = {}): string {
    if (!address) return "";
    let cleaned = address.toLowerCase().replace(/ё/g, 'е');
    
    // 1. Стандартизация сокращений
    cleaned = cleaned
        .replace(/(\d+)\s*\/\s*(\d+[а-я]?)/g, '$1к$2') // 10/2 -> 10к2
        .replace(/\b(д|дом)\.?\s*(\d+)/g, '$2') // д.5 -> 5
        .replace(/\b(кв|оф)\.?\s*\d+/g, ''); // убираем квартиры и офисы, т.к. в ОКБ их часто нет

    // 2. Очистка от спецсимволов
    cleaned = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' '); 
    
    // 3. Разбиение на токены
    let parts = cleaned.split(/\s+/)
        .filter(part => part && part.length > 1 && !STOPWORDS.has(part)); // Убираем стопслова и однобуквенный мусор
    
    // 4. СОРТИРОВКА и УДАЛЕНИЕ ДУБЛИКАТОВ
    // Это критически важно для новой базы, где порядок слов может отличаться
    const uniqueParts = Array.from(new Set(parts));
    uniqueParts.sort((a, b) => a.localeCompare(b, 'ru'));
    
    return uniqueParts.join(' ').trim();
}
