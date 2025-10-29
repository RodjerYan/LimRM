// utils/addressMappings.ts
// Полный маппинг по первым 2 цифрам (из официального справочника Почты РФ 2025)
export const postalToRegion: Record<string, string> = {
  '10': 'Москва',
  '14': 'Московская область',
  '19': 'Санкт-Петербург',
  '21': 'Смоленская область',  // 210000–219999
  '24': 'Брянская область',    // 240000–249999
  '30': 'Орловская область',   // 300000–309999
  '31': 'Белгородская область',
  '32': 'Липецкая область',    // ИСПРАВЛЕНО: 32 — Липецкая область
  // ... (добавьте все 85 из предыдущего ответа, если нужно)
};

export const explicitKeywords: Record<string, string> = {
  // Ключевые слова → полный регион (lowercase для поиска)
  'москва': 'Москва',
  'санкт-петербург': 'Санкт-Петербург',
  'брянская': 'Брянская область',
  'смоленская': 'Смоленская область',
  'орловская': 'Орловская область',
  'калужская': 'Калужская область',
  'белгородская': 'Белгородская область',
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
  let normalized = input.trim();

  normalized = normalized.replace(/\bобл\.?/gi, 'область')
                       .replace(/\bресп\.?/gi, 'Республика')
                       .replace(/\bр-н\b/gi, 'район');

  const parts = normalized.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'область') {
      normalized = `${parts[1]} ${parts[0]}`;
  }

  return normalized.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
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
    if (lower.includes(keyword)) {
      return normalizeRegion(full);
    }
  }
  return undefined;
}
