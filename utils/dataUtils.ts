import { AggregatedDataRow, FilterOptions, FilterState, SummaryMetrics, OkbDataRow } from '../types';

/**
 * A comprehensive regex to remove region-specific nouns and adjectives from an address string.
 * This helps in matching addresses where one version has the region and the other doesn't.
 */
const REGION_WORDS_TO_REMOVE = new RegExp(
  `\\b(${[
    // Nouns
    'область', 'край', 'республика', 'автономный', 'округ', 'народная',
    // Adjectives & Place Names
    'адыгея', 'алтай', 'башкортостан', 'башкирия', 'бурятия', 'дагестан',
    'ингушетия', 'кбр', 'кабардино', 'балкарская', 'калмыкия', 'кчр', 'карачаево', 'черкесская',
    'карелия', 'коми', 'крым', 'марий', 'эл', 'мордовия', 'саха', 'якутия',
    'северная', 'осетия', 'алания', 'татарстан', 'тыва', 'тува', 'удмуртия',
    'хакасия', 'чечня', 'чеченская', 'чувашия', 'чувашская', 'алтайский',
    'забайкальский', 'камчатский', 'краснодарский', 'кубань', 'красноярский',
    'пермский', 'приморский', 'ставропольский', 'хабаровский', 'амурская',
    'архангельская', 'астраханская', 'белгородская', 'брянская', 'владимирская',
    'волгоградская', 'вологодская', 'воронежская', 'ивановская', 'иркутская',
    'калининградская', 'калужская', 'кемеровская', 'кузбасс', 'кировская',
    'костромская', 'курганская', 'курская', 'ленинградская', 'липецкая',
    'магаданская', 'московская', 'мурманская', 'нижегородская', 'новгородская',
    'новосибирская', 'омская', 'оренбургская', 'орловская', 'пензенская',
    'псковская', 'ростовская', 'рязанская', 'самарская', 'саратовская',
    'сахалинская', 'свердловская', 'смоленская', 'тамбовская', 'тверская',
    'томская', 'тульская', 'тюменская', 'ульяновская', 'челябинская',
    'ярославская', 'запорожская', 'херсонская', 'ненецкий', 'хмао', 'югра',
    'чукотский', 'чукотка', 'янао', 'ямал', 'еврейская', 'луганская', 'донецкая',
    // CIS & Others
    'беларусь', 'белоруссия', 'казахстан', 'армения', 'киргизия', 'кыргызстан', 'абхазия'
  ].join('|')})\\b`,
  'g'
);


/**
 * Normalizes an address string for search and comparison purposes.
 * It converts to lower case, handles 'ё', removes punctuation and legal forms,
 * and standardizes common abbreviations. This version is designed to be highly robust
 * against messy data formatting by removing region identifiers and address part keywords.
 * @param str The string to normalize.
 * @returns The normalized string, with parts sorted alphabetically.
 */
export const normalizeAddressForSearch = (str: string | undefined | null): string => {
    if (!str) return '';

    const cleanedString = str
        .toLowerCase()
        .replace(/ё/g, 'е')
        // Remove 6-digit postal code from the beginning of the string
        .replace(/^\s*\d{6}\s*,?\s*/, '')
        // Remove region-specific words to match addresses with and without region info
        .replace(REGION_WORDS_TO_REMOVE, ' ')
        // Replace all punctuation with a single space
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`"«»~()\[\]]/g, ' ')
        // Remove common address-part keywords.
        .replace(/\b(обл|респ|г|ул|р-н|д|дом|корп|к|ш|пос|пгт|поселок|деревня|станица|ст-ца|хутор|х)\b/g, ' ')
        // Remove common legal entity types
        .replace(/(^|\s)(ооо|зао|пао|ип|ао)($|\s)/g, ' ')
        // Collapse multiple spaces and trim
        .replace(/\s+/g, ' ')
        .trim();

    // Tokenize, sort, and join to make it order-independent
    const parts = cleanedString.split(' ').filter(Boolean);
    return [...new Set(parts)].sort().join(' ');
};

/**
 * Gets a reliable address from an OKB data row for comparison.
 * @param row The OKB data row.
 * @returns The address string.
 */
export const getOkbAddress = (row: OkbDataRow): string => {
    // Юридический адрес is the most reliable source.
    return row['Юридический адрес'] || row['Адрес'] || '';
};


// For compatibility with older parts of the codebase if needed.
export const normalizeString = normalizeAddressForSearch;

/**
 * Calculates the Levenshtein distance between two strings.
 * This is a measure of the difference between two sequences.
 * @param a The first string.
 * @param b The second string.
 * @returns The Levenshtein distance (number of edits).
 */
export const levenshteinDistance = (a: string, b: string): number => {
    const an = a ? a.length : 0;
    const bn = b ? b.length : 0;
    if (an === 0) return bn;
    if (bn === 0) return an;
    const matrix = Array.from({ length: bn + 1 }, (_, i) => [i]);
    for (let j = 1; j <= an; j++) matrix[0][j] = j;

    for (let i = 1; i <= bn; i++) {
        for (let j = 1; j <= an; j++) {
            const cost = a[j - 1] === b[i - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }
    return matrix[bn][an];
};

/**
 * Finds the best matching record from the OKB data for a given client name and city.
 */
export const findBestOkbMatch = (clientName: string, city: string, okbData: (OkbDataRow & { normalizedName: string })[]): OkbDataRow | null => {
    const normalizedClientName = normalizeAddressForSearch(clientName);
    const lowercasedCity = city.toLowerCase();
    
    let bestMatch: OkbDataRow | null = null;
    let maxScore = 0.8; // Set a threshold to avoid bad matches

    const potentialMatches = okbData.filter(okb =>
        okb['Город']?.toLowerCase() === lowercasedCity || okb['Юридический адрес']?.toLowerCase().includes(lowercasedCity)
    );

    for (const okb of potentialMatches) {
        const distance = levenshteinDistance(normalizedClientName, okb.normalizedName);
        const score = 1 - distance / Math.max(normalizedClientName.length, okb.normalizedName.length);
        if (score > maxScore) {
            maxScore = score;
            bestMatch = okb;
        }
    }
    
    return bestMatch;
};


/**
 * Filters the main dataset based on the current filter state.
 */
export const applyFilters = (allData: AggregatedDataRow[], filters: FilterState): AggregatedDataRow[] => {
    return allData.filter(row => {
        const rmMatch = filters.rm ? row.rm === filters.rm : true;
        const brandMatch = filters.brand.length > 0 ? filters.brand.includes(row.brand) : true;
        // FIX: Filter by region instead of city
        const regionMatch = filters.region.length > 0 ? filters.region.includes(row.region) : true;
        return rmMatch && brandMatch && regionMatch;
    });
};

/**
 * Extracts unique values for all filterable columns from the dataset.
 */
export const getFilterOptions = (data: AggregatedDataRow[]): FilterOptions => {
    const rms = new Set<string>();
    const brands = new Set<string>();
    const regions = new Set<string>(); // FIX: Extract regions instead of cities

    data.forEach(row => {
        rms.add(row.rm);
        brands.add(row.brand);
        regions.add(row.region);
    });

    return {
        rms: Array.from(rms).sort(),
        brands: Array.from(brands).sort(),
        regions: Array.from(regions).sort(), // FIX: Return sorted regions
    };
};

/**
 * Calculates summary metrics for a given dataset.
 */
export const calculateSummaryMetrics = (data: AggregatedDataRow[]): SummaryMetrics => {
    const totalFact = data.reduce((sum, row) => sum + row.fact, 0);
    const totalPotential = data.reduce((sum, row) => sum + row.potential, 0);
    const totalGrowth = data.reduce((sum, row) => sum + row.growthPotential, 0);

    const totalClients = data.length;
    const totalActiveClients = data.reduce((sum, row) => sum + (row.clients?.length || 1), 0);
    
    const averageGrowthPercentage = totalPotential > 0 ? (totalGrowth / totalPotential) * 100 : 0;
    
    const rmGrowth: { [key: string]: number } = {};
    data.forEach(row => {
        if (!rmGrowth[row.rm]) rmGrowth[row.rm] = 0;
        rmGrowth[row.rm] += row.growthPotential;
    });

    const topPerformingRM = Object.entries(rmGrowth).reduce(
        (top, [name, value]) => (value > top.value ? { name, value } : top),
        { name: 'N/A', value: -1 }
    );

    return {
        totalFact, totalPotential, totalGrowth, totalClients, totalActiveClients,
        averageGrowthPercentage, topPerformingRM,
    };
};