// utils/addressMappings.ts

/**
 * A map for normalizing common address misspellings, abbreviations, and non-standard formats
 * before the main parsing logic begins. This is a key part of handling user input variations.
 */
export const CITY_NORMALIZATION: Record<string, string> = {
  // Typos
  'калининрад': 'калининград',
  'калининграл': 'калининград',
  'калиннградская': 'калининград',
  'снкт-петербург': 'санкт-петербург',
  
  // Formatting issues
  'г,гурьевск': 'гурьевск',
  'ул.калининград': 'калининград',
  'б. исаково': 'большое исаково',
  'пгт чкаловск': 'чкаловск',

  // Region abbreviations
  'кал-я обл': 'калининградская область',
  'лен.обл': 'ленинградская область',
  'ло': 'ленинградская область',
};

/**
 * A comprehensive mapping of cities to their regions.
 * This is the primary data source for determining a region based on a found city.
 */
export const REGION_BY_CITY: Record<string, string> = {
  // === КАЛИНИНГРАДСКАЯ ОБЛАСТЬ ===
  'гвардейск': 'Калининградская область',
  'калининград': 'Калининградская область',
  'светлый': 'Калининградская область',
  'зеленоградск': 'Калининградская область',
  'гурьевск': 'Калининградская область',
  'пионерский': 'Калининградская область',
  'советск': 'Калининградская область',
  'светлогорск': 'Калининградская область',
  'багратионовск': 'Калининградская область',
  'черняховск': 'Калининградская область',
  'балтийск': 'Калининградская область',
  'правдинск': 'Калининградская область',
  'большое исаково': 'Калининградская область',
  'васильково': 'Калининградская область',
  'голубево': 'Калининградская область',

  // === САНКТ-ПЕТЕРБУРГ (Федеральный город) ===
  'санкт-петербург': 'Санкт-Петербург',
  'колпино': 'Санкт-Петербург',
  'пушкин': 'Санкт-Петербург',
  'петергоф': 'Санкт-Петербург',
  'сестрорецк': 'Санкт-Петербург',
  'кронштадт': 'Санкт-Петербург',
  'ломоносов': 'Санкт-Петербург',

  // === ЛЕНИНГРАДСКАЯ ОБЛАСТЬ ===
  'всеволожск': 'Ленинградская область',
  'выборг': 'Ленинградская область',
  'гатчина': 'Ленинградская область',
  'сосновый бор': 'Ленинградская область',
  'кировск': 'Ленинградская область',
  'тосно': 'Ленинградская область',
  'кудрово': 'Ленинградская область',
  'мурино': 'Ленинградская область',
  'коммунар': 'Ленинградская область',
  'тихвин': 'Ленинградская область',
  'сланцы': 'Ленинградская область',
  'приозерск': 'Ленинградская область',
  'волхов': 'Ленинградская область',
  'кириши': 'Ленинградская область',
  'луга': 'Ленинградская область',

  // === НОВГОРОДСКАЯ ОБЛАСТЬ ===
  'великий новгород': 'Новгородская область',
};

/**
 * Standardizes a given region string. 
 * This function remains for compatibility but the core logic is now more distributed.
 * @param input The raw region string.
 * @returns The standardized, official region name or the original input if no match is found.
 */
export const standardizeRegion = (input: string | null | undefined): string => {
    if (!input) return '';
    // A simple standardization can be added here if needed in the future.
    // For now, the main logic is handled in the parser with the maps above.
    return input.trim();
};
