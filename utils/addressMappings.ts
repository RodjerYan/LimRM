/**
 * This file contains mappings for Russian addresses to standardize and parse region information.
 * It provides data for converting city names, postal codes, and keywords into canonical region names.
 */

// Canonical region names. Using an object for easy reference and to avoid typos.
const REGIONS = {
    // Federal Cities
    MOSCOW: 'г. Москва',
    SAINT_PETERSBURG: 'г. Санкт-Петербург',
    SEVASTOPOL: 'г. Севастополь',
    
    // Republics
    ADYGEA: 'Республика Адыгея',
    ALTAI: 'Республика Алтай',
    BASHKORTOSTAN: 'Республика Башкортостан',
    BURYATIA: 'Республика Бурятия',
    DAGESTAN: 'Республика Дагестан',
    INGUSHETIA: 'Республика Ингушетия',
    KABARDINO_BALKARIA: 'Кабардино-Балкарская Республика',
    KALMYKIA: 'Республика Калмыкия',
    KARACHAY_CHERKESSIA: 'Карачаево-Черкесская Республика',
    KARELIA: 'Республика Карелия',
    KOMI: 'Республика Коми',
    CRIMEA: 'Республика Крым',
    MARI_EL: 'Республика Марий Эл',
    MORDOVIA: 'Республика Мордовия',
    SAKHA: 'Республика Саха (Якутия)',
    NORTH_OSSETIA_ALANIA: 'Республика Северная Осетия — Алания',
    TATARSTAN: 'Республика Татарстан',
    TYVA: 'Республика Тыва',
    UDMURTIA: 'Удмуртская Республика',
    KHAKASSIA: 'Республика Хакасия',
    CHECHNYA: 'Чеченская Республика',
    CHUVASHIA: 'Чувашская Республика',

    // Krais
    ALTAI_KRAI: 'Алтайский край',
    KAMCHATKA: 'Камчатский край',
    KHABAROVSK: 'Хабаровский край',
    KRASNODAR: 'Краснодарский край',
    KRASNOYARSK: 'Красноярский край',
    PERM: 'Пермский край',
    PRIMORSKY: 'Приморский край',
    STAVROPOL: 'Ставропольский край',
    ZABAYKALSKY: 'Забайкальский край',

    // Oblasts
    AMUR: 'Амурская область',
    ARKHANGELSK: 'Архангельская область',
    ASTRAKHAN: 'Астраханская область',
    BELGOROD: 'Белгородская область',
    BRYANSK: 'Брянская область',
    CHELYABINSK: 'Челябинская область',
    IRKUTSK: 'Иркутская область',
    IVANOVO: 'Ивановская область',
    KALININGRAD: 'Калининградская область',
    KALUGA: 'Калужская область',
    KEMEROVO: 'Кемеровская область',
    KIROV: 'Кировская область',
    KOSTROMA: 'Костромская область',
    KURGAN: 'Курганская область',
    KURSK: 'Курская область',
    LENINGRAD: 'Ленинградская область',
    LIPETSK: 'Липецкая область',
    MAGADAN: 'Магаданская область',
    MOSCOW_OBLAST: 'Московская область',
    MURMANSK: 'Мурманская область',
    NIZHNY_NOVGOROD: 'Нижегородская область',
    NOVGOROD: 'Новгородская область',
    NOVOSIBIRSK: 'Новосибирская область',
    OMSK: 'Омская область',
    ORENBURG: 'Оренбургская область',
    ORYOL: 'Орловская область',
    PENZA: 'Пензенская область',
    PSKOV: 'Псковская область',
    ROSTOV: 'Ростовская область',
    RYAZAN: 'Рязанская область',
    SAKHALIN: 'Сахалинская область',
    SAMARA: 'Самарская область',
    SARATOV: 'Саратовская область',
    SMOLENSK: 'Смоленская область',
    SVERDLOVSK: 'Свердловская область',
    TAMBOV: 'Тамбовская область',
    TOMSK: 'Томская область',
    TULA: 'Тульская область',
    TVER: 'Тверская область',
    TYUMEN: 'Тюменская область',
    ULYANOVSK: 'Ульяновская область',
    VLADIMIR: 'Владимирская область',
    VOLGOGRAD: 'Волгоградская область',
    VOLOGDA: 'Вологодская область',
    VORONEZH: 'Воронежская область',
    YAROSLAVL: 'Ярославская область',

    // Autonomous Oblast
    JEWISH_AO: 'Еврейская автономная область',
    
    // Autonomous Okrugs
    KHANTY_MANSI: 'Ханты-Мансийский автономный округ - Югра',
    CHUKOTKA: 'Чукотский автономный округ',
    YAMALO_NENETS: 'Ямало-Ненецкий автономный округ',
    NENETS: 'Ненецкий автономный округ',
};

/**
 * Maps common aliases, abbreviations, and misspellings of regions to their canonical names.
 * Keys should be lowercase. This is the most reliable map for finding a region.
 */
export const REGION_KEYWORD_MAP: Record<string, string> = {
  'москва': REGIONS.MOSCOW,
  'московская обл': REGIONS.MOSCOW_OBLAST,
  'мособласть': REGIONS.MOSCOW_OBLAST,
  'подмосковье': REGIONS.MOSCOW_OBLAST,
  'санкт-петербург': REGIONS.SAINT_PETERSBURG,
  'спб': REGIONS.SAINT_PETERSBURG,
  'питер': REGIONS.SAINT_PETERSBURG,
  'ленинградская обл': REGIONS.LENINGRAD,
  'ленобласть': REGIONS.LENINGRAD,
  'адыгея': REGIONS.ADYGEA,
  'респ адыгея': REGIONS.ADYGEA,
  'алтай': REGIONS.ALTAI,
  'респ алтай': REGIONS.ALTAI,
  'башкортостан': REGIONS.BASHKORTOSTAN,
  'башкирия': REGIONS.BASHKORTOSTAN,
  'брянская обл': REGIONS.BRYANSK,
  'бурятия': REGIONS.BURYATIA,
  'дагестан': REGIONS.DAGESTAN,
  'ингушетия': REGIONS.INGUSHETIA,
  'кбр': REGIONS.KABARDINO_BALKARIA,
  'кабардино-балкария': REGIONS.KABARDINO_BALKARIA,
  'калмыкия': REGIONS.KALMYKIA,
  'кчр': REGIONS.KARACHAY_CHERKESSIA,
  'карачаево-черкесия': REGIONS.KARACHAY_CHERKESSIA,
  'карелия': REGIONS.KARELIA,
  'коми': REGIONS.KOMI,
  'крым': REGIONS.CRIMEA,
  'марий эл': REGIONS.MARI_EL,
  'мордовия': REGIONS.MORDOVIA,
  'саха': REGIONS.SAKHA,
  'якутия': REGIONS.SAKHA,
  'северная осетия': REGIONS.NORTH_OSSETIA_ALANIA,
  'алания': REGIONS.NORTH_OSSETIA_ALANIA,
  'татарстан': REGIONS.TATARSTAN,
  'тыва': REGIONS.TYVA,
  'тува': REGIONS.TYVA,
  'удмуртия': REGIONS.UDMURTIA,
  'хакасия': REGIONS.KHAKASSIA,
  'чечня': REGIONS.CHECHNYA,
  'чувашия': REGIONS.CHUVASHIA,
  'алтайский край': REGIONS.ALTAI_KRAI,
  'камчатский край': REGIONS.KAMCHATKA,
  'хабаровский край': REGIONS.KHABAROVSK,
  'краснодарский край': REGIONS.KRASNODAR,
  'кубань': REGIONS.KRASNODAR,
  'красноярский край': REGIONS.KRASNOYARSK,
  'пермский край': REGIONS.PERM,
  'приморский край': REGIONS.PRIMORSKY,
  'ставропольский край': REGIONS.STAVROPOL,
  'забайкальский край': REGIONS.ZABAYKALSKY,
  'амурская обл': REGIONS.AMUR,
  'архангельская обл': REGIONS.ARKHANGELSK,
  'астраханская обл': REGIONS.ASTRAKHAN,
  'белгородская обл': REGIONS.BELGOROD,
  'владимирская обл': REGIONS.VLADIMIR,
  'волгоградская обл': REGIONS.VOLGOGRAD,
  'вологодская обл': REGIONS.VOLOGDA,
  'воронежская обл': REGIONS.VORONEZH,
  'ивановская обл': REGIONS.IVANOVO,
  'иркутская обл': REGIONS.IRKUTSK,
  'калининградская обл': REGIONS.KALININGRAD,
  'калужская обл': REGIONS.KALUGA,
  'кемеровская обл': REGIONS.KEMEROVO,
  'кузбасс': REGIONS.KEMEROVO,
  'кировская обл': REGIONS.KIROV,
  'костромская обл': REGIONS.KOSTROMA,
  'курганская обл': REGIONS.KURGAN,
  'курская обл': REGIONS.KURSK,
  'липецкая обл': REGIONS.LIPETSK,
  'магаданская обл': REGIONS.MAGADAN,
  'мурманская обл': REGIONS.MURMANSK,
  'нижегородская обл': REGIONS.NIZHNY_NOVGOROD,
  'новгородская обл': REGIONS.NOVGOROD,
  'новосибирская обл': REGIONS.NOVOSIBIRSK,
  'омская обл': REGIONS.OMSK,
  'оренбургская обл': REGIONS.ORENBURG,
  'орловская обл': REGIONS.ORYOL,
  'пензенская обл': REGIONS.PENZA,
  'псковская обл': REGIONS.PSKOV,
  'ростовская обл': REGIONS.ROSTOV,
  'рязанская обл': REGIONS.RYAZAN,
  'сахалинская обл': REGIONS.SAKHALIN,
  'самарская обл': REGIONS.SAMARA,
  'саратовская обл': REGIONS.SARATOV,
  'смоленская обл': REGIONS.SMOLENSK,
  'свердловская обл': REGIONS.SVERDLOVSK,
  'тамбовская обл': REGIONS.TAMBOV,
  'томская обл': REGIONS.TOMSK,
  'тульская обл': REGIONS.TULA,
  'тверская обл': REGIONS.TVER,
  'тюменская обл': REGIONS.TYUMEN,
  'ульяновская обл': REGIONS.ULYANOVSK,
  'челябинская обл': REGIONS.CHELYABINSK,
  'ярославская обл': REGIONS.YAROSLAVL,
  'еврейская ао': REGIONS.JEWISH_AO,
  'хмао': REGIONS.KHANTY_MANSI,
  'югра': REGIONS.KHANTY_MANSI,
  'чукотский ао': REGIONS.CHUKOTKA,
  'янао': REGIONS.YAMALO_NENETS,
  'ненецкий ао': REGIONS.NENETS,
};

/**
 * Maps major city names to their corresponding region.
 * Keys should be lowercase.
 */
export const REGION_BY_CITY_MAP: Record<string, string> = {
    'москва': REGIONS.MOSCOW,
    'санкт-петербург': REGIONS.SAINT_PETERSBURG,
    'севастополь': REGIONS.SEVASTOPOL,
    'майкоп': REGIONS.ADYGEA,
    'горно-алтайск': REGIONS.ALTAI,
    'уфа': REGIONS.BASHKORTOSTAN,
    'улан-удэ': REGIONS.BURYATIA,
    'махачкала': REGIONS.DAGESTAN,
    'назрань': REGIONS.INGUSHETIA,
    'нальчик': REGIONS.KABARDINO_BALKARIA,
    'элиста': REGIONS.KALMYKIA,
    'черкесск': REGIONS.KARACHAY_CHERKESSIA,
    'петрозаводск': REGIONS.KARELIA,
    'сыктывкар': REGIONS.KOMI,
    'симферополь': REGIONS.CRIMEA,
    'йошкар-ола': REGIONS.MARI_EL,
    'саранск': REGIONS.MORDOVIA,
    'якутск': REGIONS.SAKHA,
    'владикавказ': REGIONS.NORTH_OSSETIA_ALANIA,
    'казань': REGIONS.TATARSTAN,
    'кызыл': REGIONS.TYVA,
    'ижевск': REGIONS.UDMURTIA,
    'абакан': REGIONS.KHAKASSIA,
    'грозный': REGIONS.CHECHNYA,
    'чебоксары': REGIONS.CHUVASHIA,
    'барнаул': REGIONS.ALTAI_KRAI,
    'петропавловск-камчатский': REGIONS.KAMCHATKA,
    'хабаровск': REGIONS.KHABAROVSK,
    'краснодар': REGIONS.KRASNODAR,
    'сочи': REGIONS.KRASNODAR,
    'красноярск': REGIONS.KRASNOYARSK,
    'пермь': REGIONS.PERM,
    'владивосток': REGIONS.PRIMORSKY,
    'ставрополь': REGIONS.STAVROPOL,
    'чита': REGIONS.ZABAYKALSKY,
    'благовещенск': REGIONS.AMUR,
    'архангельск': REGIONS.ARKHANGELSK,
    'астрахань': REGIONS.ASTRAKHAN,
    'белгород': REGIONS.BELGOROD,
    'брянск': REGIONS.BRYANSK,
    'челябинск': REGIONS.CHELYABINSK,
    'иркутск': REGIONS.IRKUTSK,
    'иваново': REGIONS.IVANOVO,
    'калининград': REGIONS.KALININGRAD,
    'калуга': REGIONS.KALUGA,
    'кемерово': REGIONS.KEMEROVO,
    'киров': REGIONS.KIROV,
    'кострома': REGIONS.KOSTROMA,
    'курган': REGIONS.KURGAN,
    'курск': REGIONS.KURSK,
    'липецк': REGIONS.LIPETSK,
    'магадан': REGIONS.MAGADAN,
    'мурманск': REGIONS.MURMANSK,
    'нижний новгород': REGIONS.NIZHNY_NOVGOROD,
    'великий новгород': REGIONS.NOVGOROD,
    'новосибирск': REGIONS.NOVOSIBIRSK,
    'омск': REGIONS.OMSK,
    'оренбург': REGIONS.ORENBURG,
    'орёл': REGIONS.ORYOL,
    'пенза': REGIONS.PENZA,
    'псков': REGIONS.PSKOV,
    'ростов-на-дону': REGIONS.ROSTOV,
    'рязань': REGIONS.RYAZAN,
    'южно-сахалинск': REGIONS.SAKHALIN,
    'самара': REGIONS.SAMARA,
    'саратов': REGIONS.SARATOV,
    'смоленск': REGIONS.SMOLENSK,
    'екатеринбург': REGIONS.SVERDLOVSK,
    'тамбов': REGIONS.TAMBOV,
    'томск': REGIONS.TOMSK,
    'тула': REGIONS.TULA,
    'тверь': REGIONS.TVER,
    'тюмень': REGIONS.TYUMEN,
    'ульяновск': REGIONS.ULYANOVSK,
    'владимир': REGIONS.VLADIMIR,
    'волгоград': REGIONS.VOLGOGRAD,
    'вологда': REGIONS.VOLOGDA,
    'воронеж': REGIONS.VORONEZH,
    'ярославль': REGIONS.YAROSLAVL,
    'биробиджан': REGIONS.JEWISH_AO,
    'ханты-мансийск': REGIONS.KHANTY_MANSI,
    'сургут': REGIONS.KHANTY_MANSI,
    'анадырь': REGIONS.CHUKOTKA,
    'салехард': REGIONS.YAMALO_NENETS,
    'нарьян-мар': REGIONS.NENETS,
};

/**
 * Maps postal code prefixes (first 3 digits) to their region.
 * This is used as a fallback.
 */
export const INDEX_MAP: Record<string, string> = {
    '301': REGIONS.TULA,
    '302': REGIONS.ORYOL,
    '303': REGIONS.ORYOL,
    '305': REGIONS.KURSK,
    '308': REGIONS.BELGOROD,
    '309': REGIONS.BELGOROD,
    '344': REGIONS.ROSTOV,
    '346': REGIONS.KHANTY_MANSI,
    '347': REGIONS.BASHKORTOSTAN,
    '350': REGIONS.KRASNODAR,
    '354': REGIONS.KRASNODAR, // Sochi
    '358': REGIONS.KALMYKIA,
    '360': REGIONS.KABARDINO_BALKARIA,
    '362': REGIONS.NORTH_OSSETIA_ALANIA,
    '364': REGIONS.CHECHNYA,
    '367': REGIONS.DAGESTAN,
    '385': REGIONS.ALTAI_KRAI,
    '390': REGIONS.KHAKASSIA,
    '392': REGIONS.TAMBOV,
    '394': REGIONS.VORONEZH,
    '400': REGIONS.VOLGOGRAD,
    '403': REGIONS.VOLGOGRAD,
    '410': REGIONS.SARATOV,
    '414': REGIONS.ASTRAKHAN,
    '420': REGIONS.TATARSTAN,
    '424': REGIONS.MARI_EL,
    '426': REGIONS.UDMURTIA,
    '428': REGIONS.CHUVASHIA,
    '430': REGIONS.MORDOVIA,
    '432': REGIONS.ULYANOVSK,
    '440': REGIONS.PENZA,
    '443': REGIONS.SAMARA,
    '450': REGIONS.BASHKORTOSTAN,
    '453': REGIONS.BASHKORTOSTAN,
    '454': REGIONS.CHELYABINSK,
    '455': REGIONS.CHELYABINSK,
    '460': REGIONS.ORENBURG,
    '600': REGIONS.VLADIMIR,
    '603': REGIONS.NIZHNY_NOVGOROD,
    '614': REGIONS.PERM,
    '620': REGIONS.SVERDLOVSK,
    '625': REGIONS.TYUMEN,
    '628': REGIONS.KHANTY_MANSI,
    '629': REGIONS.YAMALO_NENETS,
    '630': REGIONS.NOVOSIBIRSK,
    '634': REGIONS.TOMSK,
    '644': REGIONS.OMSK,
    '650': REGIONS.KEMEROVO,
    '656': REGIONS.ALTAI_KRAI,
    '660': REGIONS.KRASNOYARSK,
    '664': REGIONS.IRKUTSK,
    '667': REGIONS.TYVA,
    '670': REGIONS.BURYATIA,
    '672': REGIONS.ZABAYKALSKY,
    '675': REGIONS.AMUR,
    '677': REGIONS.SAKHA,
    '680': REGIONS.KHABAROVSK,
    '690': REGIONS.PRIMORSKY,
};

/**
 * Maps common typos or alternative names of cities to a standardized lowercase name.
 * This is used for pre-processing address strings.
 */
export const CITY_NORMALIZATION_MAP: Record<string, string> = {
    'с-петербург': 'санкт-петербург',
    'спб': 'санкт-петербург',
    'питер': 'санкт-петербург',
    'н новгород': 'нижний новгород',
    'н-новгород': 'нижний новгород',
    'е-бург': 'екатеринбург',
    'екб': 'екатеринбург',
    'екат': 'екатеринбург',
    'ростов на дону': 'ростов-на-дону',
    'к-на-амуре': 'комсомольск-на-амуре',
};

const allRegionVariants = Object.values(REGIONS).reduce((acc, region) => {
    const lower = region.toLowerCase();
    acc[lower] = region; // "г. москва" -> "г. Москва"
    const cleaned = lower
        .replace(/\b(г|область|республика|край|автономный округ|автономная область)\.?\b/g, '')
        .replace(/—/g, '')
        .replace(/\(.+\)/g, '')
        .replace(/ - /g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (cleaned && !acc[cleaned]) {
        acc[cleaned] = region; // "москва" -> "г. Москва"
    }
    return acc;
}, {} as Record<string, string>);

/**
 * Standardizes a region string to its canonical form (e.g., "Орловская обл." -> "Орловская область").
 * @param region A string containing a region name.
 * @returns The canonical region name or a default string if not found.
 */
export const standardizeRegion = (region: string | null | undefined): string => {
    if (!region) {
        return 'Регион не определен';
    }
    
    const lower = region.toLowerCase().trim();
    
    // Direct match from variants
    if (allRegionVariants[lower]) {
        return allRegionVariants[lower];
    }

    const cleaned = lower
        .replace(/\b(обл|респ|ао)\.?\b/g, '')
        .replace(/(\s-)?(югра)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (allRegionVariants[cleaned]) {
        return allRegionVariants[cleaned];
    }

    // Try finding a partial match in a sorted way to avoid "алтай" matching "алтайский край" first
    const sortedVariantKeys = Object.keys(allRegionVariants).sort((a, b) => b.length - a.length);
    for (const key of sortedVariantKeys) {
        if (lower.includes(key)) {
            return allRegionVariants[key];
        }
    }
    
    return 'Регион не определен';
};
