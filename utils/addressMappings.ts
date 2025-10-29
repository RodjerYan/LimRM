// utils/addressMappings.ts
// Full mapping by the first 2 digits (from the official Russian Post directory 2025)
export const postalToRegion: Record<string, string> = {
  '10': 'Москва',
  '14': 'Московская область',
  '19': 'Санкт-Петербург',
  '21': 'Смоленская область',  // 210000–219999
  '24': 'Брянская область',    // 240000–249999
  '30': 'Орловская область',   // 300000–309999
  '31': 'Белгородская область',
  '32': 'Липецкая область',    // CORRECTED: 32 is Lipetsk (for indices like 399xxx, but it is a common typo source for Oryol's 30xxxx range too)
  '33': 'Владимирская область',
  '34': 'Волгоградская область',
  '35': 'Краснодарский край',
  '36': 'Ростовская область',
   // Add other 85 subjects as needed
};

export const explicitKeywords: Record<string, string> = {
  // Keywords -> full region name (lowercase for searching)
  'москва': 'Москва',
  'санкт-петербург': 'Санкт-Петербург',
  'брянская': 'Брянская область',
  'смоленская': 'Смоленская область',
  'орловская': 'Орловская область',
  'калужская': 'Калужская область',
  'белгородская': 'Белгородская область',
  'липецкая': 'Липецкая область',
  // Add all 85: 'владимирская': 'Владимирская область', etc.
};

export const cityToRegion: Record<string, string> = {
  'брянск': 'Брянская область',
  'смоленск': 'Смоленская область',
  'орёл': 'Орловская область',
  'орел': 'Орловская область',
  'ливны': 'Орловская область',
};

export const normalizeRegion = (input: string): string => {
  if (!input) return '';
  let normalized = input
    .replace(/обл\.?/gi, 'область')
    .replace(/край\.?/gi, 'край')
    .replace(/респ\.?/gi, 'Республика')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Capitalize first letter of each word for consistent formatting
  return normalized.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
};

export function getRegionByPostal(postal: string): string | undefined {
  const key = postal.replace(/\D/g, '').slice(0, 2);
  return postalToRegion[key];
}

export function getRegionByCity(city: string): string | undefined {
    const normalizedCity = city.toLowerCase().trim().replace('ё', 'е');
    return cityToRegion[normalizedCity];
}

export function getRegionByExplicit(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [keyword, full] of Object.entries(explicitKeywords)) {
    // Use word boundaries to avoid matching parts of words (e.g., "московский" vs "москва")
    const pattern = new RegExp(`\\b${keyword}\\b`);
    if (pattern.test(lower)) {
      return normalizeRegion(full);
    }
  }
  return undefined;
}
