// services/addressParser.ts
import { regionCenters, normalizeRegion } from '../utils/addressMappings';
import { ParsedAddress } from '../types';

/* -------------------------------------------------------------
   0. Справочники и константы
   ------------------------------------------------------------- */
   
// Карта префиксов почтовых индексов к регионам. Используется как fallback.
const indexPrefixToRegion: Record<string, string> = {
    "30": "Орловская область",
    "21": "Смоленская область",
    "24": "Брянская область",
    "10": "Московская область", "11": "Московская область", "12": "Московская область",
    "13": "Московская область", "14": "Московская область",
};

const extendedRegionCenters: Record<string, string> = {
    ...regionCenters,

    // -- Калининградская область --
    "калининград": "Калининградская область", "гурьевск": "Калининградская область", "советск": "Калининградская область",
    "пионерский": "Калининградская область", "светлогорск": "Калининградская область", "светлый": "Калининградская область",
    "багратионовск": "Калининградская область", "большоеисаково": "Калининградская область", "голубево": "Калининградская область",
    "зеленоградск": "Калининградская область", "черняховск": "Калининградская область", "гвардейск": "Калининградская область",
    "балтийск": "Калининградская область", "матросово": "Калининградская область", "неман": "Калининградская область", "мамоново": "Калининградская область",
    
    // -- Санкт-Петербург + Ленинградская область --
    "спб": "Санкт-Петербург", "санктпетербург": "Санкт-Петербург", "санкт‑петербург": "Санкт-Петербург", "петербург": "Санкт-Петербург",
    "колпино": "Санкт-Петербург", "красное село": "Санкт-Петербург", "парголово": "Санкт-Петербург", "пушкин": "Санкт-Петербург", "павловск": "Санкт-Петербург",
    "мурино": "Ленинградская область", "кудрово": "Ленинградская область", "сланцы": "Ленинградская область", "ломоносов": "Ленинградская область",
    "сиверский": "Ленинградская область", "гатчина": "Ленинградская область", "всеволожск": "Ленинградская область", "волхов": "Ленинградская область",
    "кипень": "Ленинградская область", "ло": "Ленинградская область", "кириши": "Ленинградская область", "ивангород": "Ленинградская область",
    "лодейное-поле": "Ленинградская область", "луга": "Ленинградская область", "приозерск": "Ленинградская область",
    "великийновгород": "Новгородская область",
    
    // -- Республики и края (дополнения) --
    "теучеж": "Республика Адыгея", "энем": "Республика Адыгея", "гиагинская": "Республика Адыгея", "кошехабль": "Республика Адыгея",
    "красногвардейское": "Республика Адыгея", "новороссийск": "Краснодарский край", "туапсе": "Краснодарский край", "славянск-на-кубани": "Краснодарский край",
    "гостагаевская": "Краснодарский край", "тихорецк": "Краснодарский край", "динская": "Краснодарский край", "северская": "Краснодарский край",
    "темрюк": "Краснодарский край", "лабинск": "Краснодарский край", "тимашевск": "Краснодарский край", "гулькевичи": "Краснодарский край",
    "выселки": "Краснодарский край", "старовеличковская": "Краснодарский край", "мостовской": "Краснодарский край", "новотитаровская": "Краснодарский край",
    "анапская": "Краснодарский край", "калининская": "Краснодарский край", "усть-лабинск": "Краснодарский край", "васюринская": "Краснодарский край",
    "горячий ключ": "Краснодарский край", "ильский": "Краснодарский край", "крымск": "Краснодарский край", "тамань": "Краснодарский край",
    "курганинск": "Краснодарский край", "ейск": "Краснодарский край", "апшеронск": "Краснодарский край", "ленинградская": "Краснодарский край",
    "тбилисская": "Краснодарский край", "старотитаровская": "Краснодарский край", "новомышастовская": "Краснодарский край", "сенной": "Краснодарский край",
    "старокорсунская": "Краснодарский край", "медведовская": "Краснодарский край", "новочеркасск": "Ростовская область", "таганрог": "Ростовская область",
    "шахты": "Ростовская область", "волгодонск": "Ростовская область", "батайск": "Ростовская область", "азов": "Ростовская область",
    "сальск": "Ростовская область", "аксай": "Ростовская область", "каменск-шахтинский": "Ростовская область", "красный сулин": "Ростовская область",
    "минеральные-воды": "Ставропольский край", "кисловодск": "Ставропольский край", "невинномысск": "Ставропольский край", "буденновск": "Ставропольский край",
    "георгиевск": "Ставропольский край", "михайловск": "Ставропольский край", "зеленокумск": "Ставропольский край",
    
    // -- Города для определения областей (по запросу) --
    "десногорск": "Смоленская область", "вязьма": "Смоленская область", "сафоново": "Смоленская область", "рославль": "Смоленская область",
    "починок": "Смоленская область", "рудня": "Смоленская область", "гагарин": "Смоленская область", "ярцево": "Смоленская область",
    
    // -- Новые территории --
    "донецк": "Донецкая Народная Республика", "макеевка": "Донецкая Народная Республика", "мариуполь": "Донецкая Народная Республика",
    "горловка": "Донецкая Народная Республика", "луганск": "Луганская Народная Республика", "алчевск": "Луганская Народная Республика",
    "мелитополь": "Запорожская область", "бердянск": "Запорожская область", "энергодар": "Запорожская область",
    "геническ": "Херсонская область", "скадовск": "Херсонская область",
};

const ABBREVIATIONS: Record<string, string> = {
  'обл': 'область', 'край': 'край', 'респ': 'республика', 'ао': 'автономный округ',
  'г': 'город', 'п': 'посёлок', 'пгт': 'посёлок городского типа', 'рп': 'рабочий посёлок',
  'с': 'село', 'д': 'деревня', 'ст': 'станица', 'х': 'хутор', 'мкр': 'микрорайон',
  'тер': 'территория', 'кп': 'коттеджный посёлок', 'снт': 'садовое некоммерческое товарищество', 'днт': 'дачное некоммерческое товарищество',
};

const replaceAbbr = (str: string): string => {
  let result = str.replace(/\b([а-яё]+)\.(\s|$)/gi, (match, word, spaceOrEnd) => {
    const clean = word.toLowerCase();
    return ABBREVIATIONS[clean] ? ABBREVIATIONS[clean] + spaceOrEnd : match;
  });
  result = result.replace(/\b(обл|край|респ|ао|г|п|пгт|рп|с|д|ст|х|мкр|тер|кп|снт|днт)\b/gi, (match) => {
     const clean = match.toLowerCase();
     return ABBREVIATIONS[clean] || match;
  });
  return result;
};

const ALL_REGIONS = [...new Set(Object.values(extendedRegionCenters))]
  .map(r => ({ normalized: r.toLowerCase(), original: normalizeRegion(r) }))
  .sort((a, b) => b.normalized.length - a.normalized.length);
  
const SORTED_CITY_KEYS = Object.keys(extendedRegionCenters)
  .map(k => k.toLowerCase())
  .sort((a, b) => b.length - a.length);

const REGION_TO_CENTER: Record<string, string> = {};
for (const [city, region] of Object.entries(regionCenters)) {
  REGION_TO_CENTER[normalizeRegion(region)] = city.charAt(0).toUpperCase() + city.slice(1);
}

const MOSCOW_OBLAST_REGEXPS = [/\bмосковская\s+(обл|область)\b/i, /\bмособл\b/i, /\bмос\s+обл/i, /\bмоск\s+обл/i];
const MOSCOW_CITY_VARIANTS = ['москва', 'москвы', 'мск', 'моск'].map(v => v.toLowerCase());
const DNR_VARIANTS = ['донецкая народная республика','донецкая народная респ','днр','донецкая нр','донецкая республика'].map(v=>v.toLowerCase());
const LNR_VARIANTS = ['луганская народная республика','луганская народная респ','лнр'].map(v=>v.toLowerCase());
const ZAPOR_VARIANTS = ['запорожская область','запорожская обл','запорожье'].map(v=>v.toLowerCase());
const KHERSON_VARIANTS = ['херсонская область','херсонская обл','херсон'].map(v=>v.toLowerCase());

/* -------------------------------------------------------------
   Вспомогательная функция для поиска города
   ------------------------------------------------------------- */
function findCityInAddress(cleanAddress: string, originalAddress: string, foundRegion: string | null): string {
    let city: string | null = null;
    for (const cityKey of SORTED_CITY_KEYS) {
        const cityRegex = new RegExp(`\\b${cityKey}\\b`, 'i');
        if (cityRegex.test(cleanAddress)) {
            const originalKey = Object.keys(extendedRegionCenters).find(k => k.toLowerCase() === cityKey)!;
            city = originalKey.charAt(0).toUpperCase() + originalKey.slice(1);
            break;
        }
    }
    if (city) return city;
    const cityMatch = cleanAddress.match(/\b(?:г|город|пгт|поселок|село|с|деревня|д)\s+([а-яё][а-яё-]*)/i);
    if (cityMatch?.[1]) {
        return cityMatch[1].charAt(0).toUpperCase() + cityMatch[1].slice(1);
    }
    if (foundRegion) {
        const fallbackCity = REGION_TO_CENTER[foundRegion];
        if (fallbackCity) return fallbackCity;
    }
    return 'Город не определён';
}

/* -------------------------------------------------------------
   Основная функция с иерархической логикой
   ------------------------------------------------------------- */
export function parseRussianAddress(address: string): ParsedAddress {
    if (!address?.trim() || /^строка\s*#\d+/i.test(address)) {
        return { region: 'Адрес не записан', city: 'Адрес не записан' };
    }
    const original = address;
    const lower = address.toLowerCase();

    // 1. Извлекаем индекс из оригинальной строки для использования в качестве fallback.
    const indexMatch = original.match(/(?:^|\s|,)(\d{6})(?:$|\s|,)/);
    const postalIndex = indexMatch ? indexMatch[1] : null;

    // 2. Очищаем строку для анализа текста.
    let clean = lower
        .replace(/ё/g, 'е')
        .replace(/(?:^|\s|,)\d{6}(?:$|\s|,)/g, ' ') // убираем индекс из текста
        .replace(/[,;]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    clean = replaceAbbr(clean);

    // --- Иерархическое определение региона ---
    let region: string | null = null;
    let city: string | null = null;

    // Приоритет 1: Явное указание региона в тексте.
    if (MOSCOW_OBLAST_REGEXPS.some(re => re.test(lower))) {
        region = 'Московская область';
    } else if (DNR_VARIANTS.some(v => lower.includes(v))) {
        region = 'Донецкая Народная Республика';
    } else if (LNR_VARIANTS.some(v => lower.includes(v))) {
        region = 'Луганская Народная Республика';
    } else if (ZAPOR_VARIANTS.some(v => lower.includes(v))) {
        region = 'Запорожская область';
    } else if (KHERSON_VARIANTS.some(v => lower.includes(v))) {
        region = 'Херсонская область';
    } else {
        for (const r of ALL_REGIONS) {
            const parts = r.normalized.split(' ');
            let regexPattern: string;

            if (parts.length === 2) {
                // FIX: A more flexible regex to handle "обл Орловская" by matching the two key parts in either order.
                regexPattern = `\\b(${parts[0]}\\s+${parts[1]}|${parts[1]}\\s+${parts[0]})\\b`;
            } else {
                // For single-word regions or complex ones, use original logic
                regexPattern = `\\b${r.normalized.replace(/ /g, '\\s*')}\\b`;
            }
            const regionRegex = new RegExp(regexPattern, 'i');

            if (regionRegex.test(clean)) {
                region = r.original;
                break;
            }
        }
    }
    
    // Особая проверка для городов федерального значения
    if (MOSCOW_CITY_VARIANTS.some(v => new RegExp(`\\b${v}\\b`).test(clean))) {
        if (region !== 'Московская область') return { region: 'Москва', city: 'Москва' };
    }
    
    // Если регион найден явно, определяем город и возвращаем результат.
    if (region) {
        city = findCityInAddress(clean, original, region);
        return { region, city };
    }

    // Приоритет 2: Определение региона по известному городу.
    for (const cityKey of SORTED_CITY_KEYS) {
        const cityRegex = new RegExp(`\\b${cityKey}\\b`, 'i');
        if (cityRegex.test(clean)) {
            const originalKey = Object.keys(extendedRegionCenters).find(k => k.toLowerCase() === cityKey)!;
            region = extendedRegionCenters[originalKey];
            city = originalKey.charAt(0).toUpperCase() + originalKey.slice(1);
            return { region, city }; // Регион найден по городу, завершаем.
        }
    }

    // Приоритет 3: Использование индекса как fallback.
    if (postalIndex) {
        const regionFromIndex = indexPrefixToRegion[postalIndex.substring(0, 2)];
        if (regionFromIndex) {
            region = regionFromIndex;
            city = findCityInAddress(clean, original, region);
            return { region, city }; // Регион найден по индексу, завершаем.
        }
    }

    // Если ничего не помогло, возвращаем неопределенный результат.
    city = findCityInAddress(clean, original, null);
    return {
        region: 'Регион не определён',
        city,
    };
}