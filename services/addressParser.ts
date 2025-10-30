// services/addressParser.ts
import { regionCenters, normalizeRegion } from '../utils/addressMappings';
import { ParsedAddress } from '../types';

// Полный расширенный map: Ваш + добавки для топ-городов/посёлков (lowercase keys)
// Источник: Официальный список субъектов РФ 2025 + типичные из FIAS
const extendedRegionCenters: Record<string, string> = {
  ...regionCenters,  // Ваш базовый (центры)
  // Области: Добавки для городов/районов (примеры для топ-10; расширьте по data)
  "подольск": "Московская область",  // Московская
  "химки": "Московская область",
  "одинцово": "Московская область",
  "лыткарино": "Московская область",
  "фрязино": "Московская область",
  "екатеринбург": "Свердловская область",  // Свердловская
  "нижний тагил": "Свердловская область",
  "каменск-уральский": "Свердловская область",
  "первоуральск": "Свердловская область",
  "североуральск": "Свердловская область",
  "новосибирск": "Новосибирская область",  // Новосибирская
  "бердск": "Новосибирская область",
  "искитим": "Новосибирская область",
  "обь": "Новосибирская область",
  "колцово": "Новосибирская область",
  "воронеж": "Воронежская область",  // Воронежская
  "липецк": "Липецкая область",  // Липецкая
  "тамбов": "Тамбовская область",  // Тамбовская
  "ярославль": "Ярославская область",  // Ярославская
  "рыбинск": "Ярославская область",
  "переславль- залесский": "Ярославская область",
  // Края
  "краснодар": "Краснодарский край",
  "новороссийск": "Краснодарский край",
  "армавир": "Краснодарский край",
  "ставрополь": "Ставропольский край",
  "пятигорск": "Ставропольский край",
  // Республики (примеры)
  "казань": "Республика Татарстан",
  "набережные челны": "Республика Татарстан",
  "альметьевск": "Республика Татарстан",
  "уфа": "Республика Башкортостан",
  "стерлитамак": "Республика Башкортостан",
  // Автономии/округа
  "биробиджан": "Еврейская автономная область",
  "нарьян-мар": "Ненецкий автономный округ",
};

export async function parseRussianAddress(address: string): Promise<ParsedAddress> {
  if (!address || typeof address !== 'string') {
    return { region: 'Регион не определён', city: 'Неизвестный' };
  }

  // Step 1: Cleaning (order: artifacts first, typos, then shorts)
  let clean = address
    .toLowerCase()
    .trim()
    .replace(/\d{6}[,\s]*/g, '')  // Indexes
    .replace(/[,;]/g, ' ')  // CSV
    // Typos (common, add per data)
    .replace(/калинн?градская/g, 'калининградская')
    .replace(/калининградскаяобл/g, 'калининградская область')
    .replace(/кал-я\s+обл/g, 'калининградская область')
    .replace(/\s+/g, ' ')
    .replace(/обл\.?/g, ' область')  // Shorts after typos
    .replace(/край\.?/g, ' край')
    .replace(/респ\.?/g, ' республика')
    .replace(/авт\.?округ\.?/g, ' автономный округ')
    .replace(/р-н\b/g, ' район')
    .replace(/г\.?\s*/g, 'г ')
    .replace(/пос\.?\s*/g, 'пос ')
    .replace(/\s+/g, ' ');

  // Step 2: Explicit (greedy + for full match)
  const explicitPattern = /([а-яё\s-]+(?:область|край|республика|автономная область|автономный округ|город федерального значения))/i;
  let region = 'Регион не определён';
  const explicitMatch = clean.match(explicitPattern);
  if (explicitMatch) {
    let rawRegion = explicitMatch[1].trim();
    region = normalizeRegion(rawRegion);  // Ваш util для consistency
  }

  // Step 3: City (full until ул/дом, no trailing cut)
  const cityPatterns = [/г\s+([а-яё\s\-]+)/i, /пос\s+([а-яё\s\-]+)/i, /п\s+([а-яё\s\-]+)/i];
  let city = region;
  for (const pattern of cityPatterns) {
    const match = clean.match(pattern);
    if (match && match[1]) {
      let cityStr = match[1].trim();
      // Cut at ул/пер/дом etc.
      const cutIndex = cityStr.search(/\s+(ул|пер|б-р|пр-?кт|дом|кв|р-?н|п\.?гт)/i);
      if (cutIndex > 0) cityStr = cityStr.substring(0, cutIndex);
      city = cityStr.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      break;
    }
  }

  // Step 4: Fallback (better key: full words)
  if (region === 'Регион не определён') {
    const words = clean.split(' ');
    for (const word of words) {
      let cityKey = word.replace(/[^а-яё-]/g, '').replace(/\s+/g, '-');
      if (extendedRegionCenters[cityKey]) {
        region = extendedRegionCenters[cityKey];
        if (city === region) {
          city = cityKey.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
        break;
      }
    }
  }

  return { region, city };
}
