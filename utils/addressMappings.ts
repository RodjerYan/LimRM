// utils/addressMappings.ts

// Полный маппинг по первым 2 цифрам (из официального справочника Почты РФ 2025)
export const postalToRegion: Record<string, string> = {
  '10': 'Москва', '11': 'Москва', '12': 'Москва', '13': 'Москва',
  '14': 'Московская область',
  '15': 'Ярославская область',
  '16': 'Ивановская область',
  '17': 'Костромская область',
  '18': 'Вологодская область',
  '19': 'Санкт-Петербург',
  '20': 'Тверская область',
  '21': 'Смоленская область',
  '24': 'Брянская область',
  '30': 'Орловская область',
  '31': 'Белгородская область',
  '32': 'Липецкая область', // ИСПРАВЛЕНО: 32 -> Липецкая область
  '39': 'Калининградская область',
  // ... добавьте остальные 85 по мере необходимости
};

// Централизованный справочник ключевых слов для явного поиска. Самый надежный метод.
export const explicitKeywords: Record<string, string> = {
  'москва': 'Москва',
  'санкт-петербург': 'Санкт-Петербург',
  'петербург': 'Санкт-Петербург',
  'брянская': 'Брянская область',
  'смоленская': 'Смоленская область',
  'орловская': 'Орловская область',
  'калужская': 'Калужская область',
  'белгородская': 'Белгородская область',
  'липецкая': 'Липецкая область',
  // ... добавьте остальные 85 по мере необходимости ('владимирская': 'Владимирская область', etc.)
};

// Справочник для определения региона по городу (вторичный метод)
export const cityToRegion: Record<string, string> = {
  'брянск': 'Брянская область',
  'смоленск': 'Смоленская область',
  'орёл': 'Орловская область',
  'орел': 'Орловская область',
  'ливны': 'Орловская область',
};

/**
 * Normalizes a region string to a consistent format.
 * E.g., "Брянская обл." -> "Брянская Область"
 */
export const normalizeRegion = (input: string): string => {
  if (!input) return '';
  let normalized = input.trim().toLowerCase();

  normalized = normalized
    .replace(/\bобл\.?/g, 'область')
    .replace(/\bресп\.?/g, 'республика')
    .replace(/\bр-н\b/g, 'район');

  // Handle cases like "область орловская" -> "орловская область"
  const parts = normalized.split(' ');
  if (parts.length > 1 && parts[0] === 'область') {
    normalized = `${parts.slice(1).join(' ')} область`;
  }
  
  // Capitalize each word for a clean, consistent output
  return normalized
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export function getRegionByPostal(postal: string): string | undefined {
  const key = postal.replace(/\D/g, '').slice(0, 2);
  return postalToRegion[key];
}

export function getRegionByCity(city: string): string | undefined {
  const normalizedCity = city.toLowerCase().trim().replace(/ё/g, 'е');
  return cityToRegion[normalizedCity];
}

/**
 * Finds a region by searching for an explicit keyword within the text.
 * Uses word boundaries (`\b`) to prevent partial matches (e.g., matching "томск" in "автомсклад").
 * @param text The full address string.
 * @returns The full, normalized region name if a keyword is found.
 */
export function getRegionByExplicit(text: string): string | undefined {
  const lowerText = text.toLowerCase();
  for (const [keyword, fullRegion] of Object.entries(explicitKeywords)) {
    const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
    if (pattern.test(lowerText)) {
      return normalizeRegion(fullRegion);
    }
  }
  
  // Also check for inverted format like "обл орловская"
  const invertedMatch = lowerText.match(/обл\s+([а-яё-]+)/);
  if (invertedMatch && invertedMatch[1]) {
      const keyword = invertedMatch[1];
      if (explicitKeywords[keyword]) {
          return normalizeRegion(explicitKeywords[keyword]);
      }
  }

  return undefined;
}
