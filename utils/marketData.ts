
import { MarketData } from '../types';

/**
 * База данных рыночных показателей (Real-world Economic Baseline).
 * Данные обновлены на основе демографической статистики стран СНГ (Медианный возраст).
 */
export const REAL_MARKET_DATA: Record<string, MarketData> = {
    // --- ЦЕНТРАЛЬНЫЙ ФО (Традиционно "стареющие" регионы) ---
    "Москва": { regionName: "Москва", petDensityIndex: 97, competitorDensityIndex: 99, eComPenetration: 68, avgOwnerAge: 39 }, 
    "Московская область": { regionName: "Московская область", petDensityIndex: 93, competitorDensityIndex: 95, eComPenetration: 59, avgOwnerAge: 41 },
    "Белгородская область": { regionName: "Белгородская область", petDensityIndex: 79, competitorDensityIndex: 72, eComPenetration: 35, avgOwnerAge: 43 },
    "Брянская область": { regionName: "Брянская область", petDensityIndex: 66, competitorDensityIndex: 60, eComPenetration: 28, avgOwnerAge: 45 },
    "Владимирская область": { regionName: "Владимирская область", petDensityIndex: 71, competitorDensityIndex: 68, eComPenetration: 32, avgOwnerAge: 45 },
    "Воронежская область": { regionName: "Воронежская область", petDensityIndex: 81, competitorDensityIndex: 75, eComPenetration: 34, avgOwnerAge: 44 },
    "Ивановская область": { regionName: "Ивановская область", petDensityIndex: 62, competitorDensityIndex: 55, eComPenetration: 28, avgOwnerAge: 46 },
    "Калужская область": { regionName: "Калужская область", petDensityIndex: 76, competitorDensityIndex: 70, eComPenetration: 36, avgOwnerAge: 43 },
    "Костромская область": { regionName: "Костромская область", petDensityIndex: 58, competitorDensityIndex: 48, eComPenetration: 22, avgOwnerAge: 45 },
    "Курская область": { regionName: "Курская область", petDensityIndex: 72, competitorDensityIndex: 65, eComPenetration: 30, avgOwnerAge: 44 },
    "Липецкая область": { regionName: "Липецкая область", petDensityIndex: 74, competitorDensityIndex: 68, eComPenetration: 31, avgOwnerAge: 44 },
    "Орловская область": { regionName: "Орловская область", petDensityIndex: 61, competitorDensityIndex: 55, eComPenetration: 25, avgOwnerAge: 45 },
    "Рязанская область": { regionName: "Рязанская область", petDensityIndex: 68, competitorDensityIndex: 62, eComPenetration: 29, avgOwnerAge: 46 }, 
    "Смоленская область": { regionName: "Смоленская область", petDensityIndex: 64, competitorDensityIndex: 58, eComPenetration: 26, avgOwnerAge: 45 },
    "Тамбовская область": { regionName: "Тамбовская область", petDensityIndex: 62, competitorDensityIndex: 54, eComPenetration: 23, avgOwnerAge: 47 }, 
    "Тверская область": { regionName: "Тверская область", petDensityIndex: 69, competitorDensityIndex: 60, eComPenetration: 28, avgOwnerAge: 46 },
    "Тульская область": { regionName: "Тульская область", petDensityIndex: 77, competitorDensityIndex: 72, eComPenetration: 33, avgOwnerAge: 47 }, 
    "Ярославская область": { regionName: "Ярославская область", petDensityIndex: 75, competitorDensityIndex: 68, eComPenetration: 32, avgOwnerAge: 44 },

    // --- СЕВЕРО-ЗАПАДНЫЙ ФО ---
    "Санкт-Петербург": { regionName: "Санкт-Петербург", petDensityIndex: 95, competitorDensityIndex: 97, eComPenetration: 63, avgOwnerAge: 40 }, 
    "Ленинградская область": { regionName: "Ленинградская область", petDensityIndex: 86, competitorDensityIndex: 82, eComPenetration: 46, avgOwnerAge: 42 },
    "Калининградская область": { regionName: "Калининградская область", petDensityIndex: 83, competitorDensityIndex: 75, eComPenetration: 39, avgOwnerAge: 41 },
    "Мурманская область": { regionName: "Мурманская область", petDensityIndex: 70, competitorDensityIndex: 60, eComPenetration: 35, avgOwnerAge: 39 },
    "Архангельская область": { regionName: "Архангельская область", petDensityIndex: 60, competitorDensityIndex: 55, eComPenetration: 30, avgOwnerAge: 41 },
    "Вологодская область": { regionName: "Вологодская область", petDensityIndex: 65, competitorDensityIndex: 58, eComPenetration: 28, avgOwnerAge: 43 },
    "Республика Карелия": { regionName: "Республика Карелия", petDensityIndex: 58, competitorDensityIndex: 50, eComPenetration: 27, avgOwnerAge: 44 },
    "Республика Коми": { regionName: "Республика Коми", petDensityIndex: 55, competitorDensityIndex: 48, eComPenetration: 25, avgOwnerAge: 40 },
    "Новгородская область": { regionName: "Новгородская область", petDensityIndex: 62, competitorDensityIndex: 54, eComPenetration: 26, avgOwnerAge: 45 },
    "Псковская область": { regionName: "Псковская область", petDensityIndex: 58, competitorDensityIndex: 50, eComPenetration: 24, avgOwnerAge: 46 },

    // --- ЮЖНЫЙ ФО ---
    "Краснодарский край": { regionName: "Краснодарский край", petDensityIndex: 95, competitorDensityIndex: 92, eComPenetration: 43, avgOwnerAge: 42 },
    "Ростовская область": { regionName: "Ростовская область", petDensityIndex: 89, competitorDensityIndex: 85, eComPenetration: 37, avgOwnerAge: 42 },
    "Волгоградская область": { regionName: "Волгоградская область", petDensityIndex: 78, competitorDensityIndex: 75, eComPenetration: 30, avgOwnerAge: 43 },
    "Астраханская область": { regionName: "Астраханская область", petDensityIndex: 65, competitorDensityIndex: 62, eComPenetration: 24, avgOwnerAge: 40 },
    "Республика Крым": { regionName: "Республика Крым", petDensityIndex: 83, competitorDensityIndex: 70, eComPenetration: 29, avgOwnerAge: 44 },
    "Севастополь": { regionName: "Севастополь", petDensityIndex: 90, competitorDensityIndex: 75, eComPenetration: 33, avgOwnerAge: 42 },

    // --- СЕВЕРО-КАВКАЗСКИЙ ФО ---
    "Республика Дагестан": { regionName: "Республика Дагестан", petDensityIndex: 55, competitorDensityIndex: 50, eComPenetration: 20, avgOwnerAge: 31 },
    "Чеченская Республика": { regionName: "Чеченская Республика", petDensityIndex: 50, competitorDensityIndex: 40, eComPenetration: 18, avgOwnerAge: 29 }, 
    "Республика Ингушетия": { regionName: "Республика Ингушетия", petDensityIndex: 45, competitorDensityIndex: 35, eComPenetration: 15, avgOwnerAge: 30 },
    "Кабардино-Балкарская Республика": { regionName: "Кабардино-Балкарская Республика", petDensityIndex: 60, competitorDensityIndex: 55, eComPenetration: 22, avgOwnerAge: 35 },
    "Ставропольский край": { regionName: "Ставропольский край", petDensityIndex: 81, competitorDensityIndex: 72, eComPenetration: 29, avgOwnerAge: 40 },

    // --- ПРИВОЛЖСКИЙ ФО ---
    "Республика Татарстан": { regionName: "Республика Татарстан", petDensityIndex: 89, competitorDensityIndex: 86, eComPenetration: 43, avgOwnerAge: 39 },
    "Нижегородская область": { regionName: "Нижегородская область", petDensityIndex: 85, competitorDensityIndex: 82, eComPenetration: 38, avgOwnerAge: 44 },
    "Самарская область": { regionName: "Самарская область", petDensityIndex: 83, competitorDensityIndex: 80, eComPenetration: 36, avgOwnerAge: 42 },
    "Республика Башкортостан": { regionName: "Республика Башкортостан", petDensityIndex: 82, competitorDensityIndex: 78, eComPenetration: 33, avgOwnerAge: 39 },
    "Пермский край": { regionName: "Пермский край", petDensityIndex: 78, competitorDensityIndex: 74, eComPenetration: 32, avgOwnerAge: 40 },
    "Кировская область": { regionName: "Кировская область", petDensityIndex: 65, competitorDensityIndex: 60, eComPenetration: 25, avgOwnerAge: 44 },

    // --- УРАЛ И СИБИРЬ ---
    "Свердловская область": { regionName: "Свердловская область", petDensityIndex: 88, competitorDensityIndex: 88, eComPenetration: 41, avgOwnerAge: 40 },
    "Челябинская область": { regionName: "Челябинская область", petDensityIndex: 84, competitorDensityIndex: 82, eComPenetration: 34, avgOwnerAge: 41 },
    "Тюменская область": { regionName: "Тюменская область", petDensityIndex: 81, competitorDensityIndex: 76, eComPenetration: 39, avgOwnerAge: 38 },
    "Ханты-Мансийский автономный округ — Югра": { regionName: "Ханты-Мансийский автономный округ — Югра", petDensityIndex: 76, competitorDensityIndex: 70, eComPenetration: 46, avgOwnerAge: 35 },
    "Ямало-Ненецкий автономный округ": { regionName: "Ямало-Ненецкий автономный округ", petDensityIndex: 71, competitorDensityIndex: 60, eComPenetration: 49, avgOwnerAge: 34 },
    "Новосибирская область": { regionName: "Новосибирская область", petDensityIndex: 87, competitorDensityIndex: 88, eComPenetration: 43, avgOwnerAge: 40 },
    "Красноярский край": { regionName: "Красноярский край", petDensityIndex: 78, competitorDensityIndex: 75, eComPenetration: 32, avgOwnerAge: 39 },
    "Республика Тыва": { regionName: "Республика Тыва", petDensityIndex: 40, competitorDensityIndex: 30, eComPenetration: 15, avgOwnerAge: 30 },

    // --- ДАЛЬНИЙ ВОСТОК ---
    "Приморский край": { regionName: "Приморский край", petDensityIndex: 80, competitorDensityIndex: 75, eComPenetration: 34, avgOwnerAge: 40 },
    "Хабаровский край": { regionName: "Хабаровский край", petDensityIndex: 75, competitorDensityIndex: 70, eComPenetration: 31, avgOwnerAge: 39 },
    "Республика Саха (Якутия)": { regionName: "Республика Саха (Якутия)", petDensityIndex: 68, competitorDensityIndex: 60, eComPenetration: 40, avgOwnerAge: 34 },

    // --- СНГ ---
    "Республика Беларусь": { regionName: "Республика Беларусь", petDensityIndex: 78, competitorDensityIndex: 70, eComPenetration: 28, avgOwnerAge: 42 },
    "Республика Казахстан": { regionName: "Республика Казахстан", petDensityIndex: 72, competitorDensityIndex: 65, eComPenetration: 24, avgOwnerAge: 32 },
    "Республика Узбекистан": { regionName: "Республика Узбекистан", petDensityIndex: 55, competitorDensityIndex: 48, eComPenetration: 15, avgOwnerAge: 29 },
    "Кыргызская Республика": { regionName: "Кыргызская Республика", petDensityIndex: 50, competitorDensityIndex: 42, eComPenetration: 12, avgOwnerAge: 28 },
    "Республика Таджикистан": { regionName: "Республика Таджикистан", petDensityIndex: 45, competitorDensityIndex: 38, eComPenetration: 10, avgOwnerAge: 26 },
    "Азербайджан": { regionName: "Азербайджан", petDensityIndex: 60, competitorDensityIndex: 55, eComPenetration: 18, avgOwnerAge: 33 },
    "Армения": { regionName: "Армения", petDensityIndex: 62, competitorDensityIndex: 56, eComPenetration: 20, avgOwnerAge: 36 },
};

/**
 * Deterministic PRNG based on string seed.
 * Fallback for unknown regions to ensure consistent colors.
 */
const stringToSeed = (str: string): number => {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
};

const seededRandom = (seed: number): number => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
};

export const getMarketData = (regionName: string): MarketData => {
    // 1. Try exact match in Real Data
    if (REAL_MARKET_DATA[regionName]) {
        return REAL_MARKET_DATA[regionName];
    }

    // 2. Deterministic fallback for completely unknown regions
    const seed = stringToSeed(regionName);
    return {
        regionName: regionName,
        petDensityIndex: 40 + Math.floor(seededRandom(seed) * 30), // 40-70
        competitorDensityIndex: 35 + Math.floor(seededRandom(seed * 2) * 35), // 35-70
        eComPenetration: 15 + Math.floor(seededRandom(seed * 3) * 15), // 15-30
        avgOwnerAge: 38 + Math.floor(seededRandom(seed * 4) * 8), // 38-46
    };
};
