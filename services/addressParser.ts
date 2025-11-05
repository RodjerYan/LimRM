// services/addressParser.ts
import {
    REGION_BY_CITY_WITH_INDEXES
} from '../utils/regionMap';
import { ParsedAddress } from '../types';

// Сопоставление нормализованных ключевых слов с каноническими названиями стран
const COUNTRY_KEYWORD_MAP: Record<string, string> = {
    'беларусь': 'Республика Беларусь',
    'белоруссия': 'Республика Беларусь',
    'рб': 'Республика Беларусь',
    'казахстан': 'Республика Казахстан',
    'рк': 'Республика Казахстан',
    'абхазия': 'Республика Абхазия',
};

/**
 * Капитализирует первую букву каждого слова в строке.
 * @param str Входная строка.
 * @returns Строка с заглавными буквами.
 */
const capitalize = (str: string | null): string => {
    if (!str) return '';
    return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

/**
 * Нормализует строку для поиска: приводит к нижнему регистру, заменяет 'ё' на 'е', удаляет лишние символы.
 * @param text Входная строка.
 * @returns Нормализованная строка.
 */
const normalizeText = (text: string): string => {
    return text.toLowerCase().replace(/ё/g, 'е').replace(/[,;.]/g, ' ').replace(/\s+/g, ' ').trim();
};

/**
 * Ищет страну по ключевым словам в тексте.
 * @param normalizedText Нормализованный текст для поиска.
 * @returns Название страны или null.
 */
function findCountry(normalizedText: string): string | null {
    for (const keyword in COUNTRY_KEYWORD_MAP) {
        if (new RegExp(`\\b${keyword}\\b`).test(normalizedText)) {
            return COUNTRY_KEYWORD_MAP[keyword];
        }
    }
    return null;
}

/**
 * Ищет регион по названию города из карты `REGION_BY_CITY_WITH_INDEXES`.
 * @param normalizedText Нормализованный текст для поиска.
 * @returns Объект с регионом и найденным городом, или null.
 */
function findRegionByCity(normalizedText: string): { region: string; city: string } | null {
    // Сортируем ключи от длинных к коротким, чтобы избежать частичных совпадений (например, "саки" вместо "сакский район")
    const sortedCities = Object.keys(REGION_BY_CITY_WITH_INDEXES).sort((a, b) => b.length - a.length);

    for (const city of sortedCities) {
        // Ищем город как отдельное слово
        if (new RegExp(`\\b${city}\\b`).test(normalizedText)) {
            return {
                region: REGION_BY_CITY_WITH_INDEXES[city].region,
                city: city
            };
        }
    }
    return null;
}

/**
 * Интеллектуально парсит адрес, используя данные из всей строки (включая дистрибьютора, клиента и т.д.).
 * @param row Объект, представляющий строку из файла.
 * @returns Объект `ParsedAddress` с регионом и городом.
 */
export async function parseAddressData(row: { [key: string]: any }): Promise<ParsedAddress> {
    // 1. Собираем весь возможный текстовый контекст из строки
    const contextFields = [
        row['Адрес ТТ LimKorm'],
        row['Юридический адрес'],
        row['Дистрибьютор'],
        row['Клиент'],
        row['Наименование']
    ];
    
    const combinedContext = contextFields.filter(Boolean).join(' ');
    
    if (!combinedContext.trim()) {
        return { region: 'Регион не определен', city: 'Город не определён' };
    }

    const normalizedContext = normalizeText(combinedContext);

    // 2. Приоритетный поиск: сначала ищем страну
    const country = findCountry(normalizedContext);
    if (country) {
        const cityResult = findRegionByCity(normalizedContext);
        return {
            region: country,
            city: capitalize(cityResult?.city) || 'Город не определён'
        };
    }
    
    // 3. Если страна не найдена, ищем город и по нему определяем регион РФ/СНГ
    const cityResult = findRegionByCity(normalizedContext);
    if (cityResult) {
        return {
            region: cityResult.region,
            city: capitalize(cityResult.city)
        };
    }
    
    // 4. Если ничего не найдено, возвращаем значение по умолчанию
    return { region: 'Регион не определен', city: 'Город не определён' };
}
