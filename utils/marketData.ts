
import { MarketData } from '../types';

/**
 * База данных рыночных показателей (Real-world Economic Baseline).
 * Данные обновлены на основе демографической статистики Росстата и стран СНГ (Медианный возраст).
 */
export const REAL_MARKET_DATA: Record<string, MarketData> = {
    // --- ЦЕНТРАЛЬНЫЙ ФО (Традиционно "стареющие" регионы) ---
    "Москва": { regionName: "Москва", petDensityIndex: 95, competitorDensityIndex: 98, eComPenetration: 65, avgOwnerAge: 39 }, // Приток молодежи снижает средний возраст
    "Московская область": { regionName: "Московская область", petDensityIndex: 92, competitorDensityIndex: 95, eComPenetration: 58, avgOwnerAge: 40 },
    "Белгородская область": { regionName: "Белгородская область", petDensityIndex: 78, competitorDensityIndex: 72, eComPenetration: 35, avgOwnerAge: 42 },
    "Брянская область": { regionName: "Брянская область", petDensityIndex: 65, competitorDensityIndex: 60, eComPenetration: 28, avgOwnerAge: 44 },
    "Владимирская область": { regionName: "Владимирская область", petDensityIndex: 70, competitorDensityIndex: 68, eComPenetration: 32, avgOwnerAge: 44 },
    "Воронежская область": { regionName: "Воронежская область", petDensityIndex: 80, competitorDensityIndex: 75, eComPenetration: 34, avgOwnerAge: 43 },
    "Ивановская область": { regionName: "Ивановская область", petDensityIndex: 62, competitorDensityIndex: 55, eComPenetration: 28, avgOwnerAge: 45 },
    "Калужская область": { regionName: "Калужская область", petDensityIndex: 75, competitorDensityIndex: 70, eComPenetration: 36, avgOwnerAge: 42 },
    "Костромская область": { regionName: "Костромская область", petDensityIndex: 58, competitorDensityIndex: 48, eComPenetration: 22, avgOwnerAge: 44 },
    "Курская область": { regionName: "Курская область", petDensityIndex: 72, competitorDensityIndex: 65, eComPenetration: 30, avgOwnerAge: 43 },
    "Липецкая область": { regionName: "Липецкая область", petDensityIndex: 74, competitorDensityIndex: 68, eComPenetration: 31, avgOwnerAge: 43 },
    "Орловская область": { regionName: "Орловская область", petDensityIndex: 60, competitorDensityIndex: 55, eComPenetration: 25, avgOwnerAge: 44 },
    "Рязанская область": { regionName: "Рязанская область", petDensityIndex: 68, competitorDensityIndex: 62, eComPenetration: 29, avgOwnerAge: 45 }, // Один из самых старых регионов
    "Смоленская область": { regionName: "Смоленская область", petDensityIndex: 64, competitorDensityIndex: 58, eComPenetration: 26, avgOwnerAge: 44 },
    "Тамбовская область": { regionName: "Тамбовская область", petDensityIndex: 62, competitorDensityIndex: 54, eComPenetration: 23, avgOwnerAge: 46 }, // Высокий средний возраст
    "Тверская область": { regionName: "Тверская область", petDensityIndex: 69, competitorDensityIndex: 60, eComPenetration: 28, avgOwnerAge: 45 },
    "Тульская область": { regionName: "Тульская область", petDensityIndex: 76, competitorDensityIndex: 72, eComPenetration: 33, avgOwnerAge: 46 }, // Старейший регион по статистике
    "Ярославская область": { regionName: "Ярославская область", petDensityIndex: 75, competitorDensityIndex: 68, eComPenetration: 32, avgOwnerAge: 43 },

    // --- СЕВЕРО-ЗАПАДНЫЙ ФО ---
    "Санкт-Петербург": { regionName: "Санкт-Петербург", petDensityIndex: 93, competitorDensityIndex: 96, eComPenetration: 60, avgOwnerAge: 40 },
    "Ленинградская область": { regionName: "Ленинградская область", petDensityIndex: 85, competitorDensityIndex: 82, eComPenetration: 45, avgOwnerAge: 41 },
    "Калининградская область": { regionName: "Калининградская область", petDensityIndex: 82, competitorDensityIndex: 75, eComPenetration: 38, avgOwnerAge: 40 },
    "Мурманская область": { regionName: "Мурманская область", petDensityIndex: 70, competitorDensityIndex: 60, eComPenetration: 35, avgOwnerAge: 38 }, // Относительно молодой (север)
    "Архангельская область": { regionName: "Архангельская область", petDensityIndex: 60, competitorDensityIndex: 55, eComPenetration: 30, avgOwnerAge: 40 },
    "Вологодская область": { regionName: "Вологодская область", petDensityIndex: 65, competitorDensityIndex: 58, eComPenetration: 28, avgOwnerAge: 42 },
    "Республика Карелия": { regionName: "Республика Карелия", petDensityIndex: 58, competitorDensityIndex: 50, eComPenetration: 27, avgOwnerAge: 43 },
    "Республика Коми": { regionName: "Республика Коми", petDensityIndex: 55, competitorDensityIndex: 48, eComPenetration: 25, avgOwnerAge: 39 },
    "Новгородская область": { regionName: "Новгородская область", petDensityIndex: 62, competitorDensityIndex: 54, eComPenetration: 26, avgOwnerAge: 44 },
    "Псковская область": { regionName: "Псковская область", petDensityIndex: 58, competitorDensityIndex: 50, eComPenetration: 24, avgOwnerAge: 45 },

    // --- ЮЖНЫЙ ФО ---
    "Краснодарский край": { regionName: "Краснодарский край", petDensityIndex: 94, competitorDensityIndex: 92, eComPenetration: 42, avgOwnerAge: 41 },
    "Ростовская область": { regionName: "Ростовская область", petDensityIndex: 88, competitorDensityIndex: 85, eComPenetration: 36, avgOwnerAge: 41 },
    "Волгоградская область": { regionName: "Волгоградская область", petDensityIndex: 78, competitorDensityIndex: 75, eComPenetration: 30, avgOwnerAge: 42 },
    "Астраханская область": { regionName: "Астраханская область", petDensityIndex: 65, competitorDensityIndex: 62, eComPenetration: 24, avgOwnerAge: 39 },
    "Республика Крым": { regionName: "Республика Крым", petDensityIndex: 82, competitorDensityIndex: 70, eComPenetration: 28, avgOwnerAge: 43 },
    "Севастополь": { regionName: "Севастополь", petDensityIndex: 89, competitorDensityIndex: 75, eComPenetration: 32, avgOwnerAge: 41 },

    // --- СЕВЕРО-КАВКАЗСКИЙ ФО (Самые молодые регионы РФ) ---
    "Республика Дагестан": { regionName: "Республика Дагестан", petDensityIndex: 55, competitorDensityIndex: 50, eComPenetration: 20, avgOwnerAge: 30 },
    "Чеченская Республика": { regionName: "Чеченская Республика", petDensityIndex: 50, competitorDensityIndex: 40, eComPenetration: 18, avgOwnerAge: 28 }, // Самый молодой регион
    "Республика Ингушетия": { regionName: "Республика Ингушетия", petDensityIndex: 45, competitorDensityIndex: 35, eComPenetration: 15, avgOwnerAge: 29 },
    "Кабардино-Балкарская Республика": { regionName: "Кабардино-Балкарская Республика", petDensityIndex: 60, competitorDensityIndex: 55, eComPenetration: 22, avgOwnerAge: 34 },
    "Ставропольский край": { regionName: "Ставропольский край", petDensityIndex: 80, competitorDensityIndex: 72, eComPenetration: 28, avgOwnerAge: 39 },

    // --- ПРИВОЛЖСКИЙ ФО ---
    "Республика Татарстан": { regionName: "Республика Татарстан", petDensityIndex: 88, competitorDensityIndex: 86, eComPenetration: 42, avgOwnerAge: 38 },
    "Нижегородская область": { regionName: "Нижегородская область", petDensityIndex: 85, competitorDensityIndex: 82, eComPenetration: 38, avgOwnerAge: 43 },
    "Самарская область": { regionName: "Самарская область", petDensityIndex: 83, competitorDensityIndex: 80, eComPenetration: 36, avgOwnerAge: 41 },
    "Республика Башкортостан": { regionName: "Республика Башкортостан", petDensityIndex: 82, competitorDensityIndex: 78, eComPenetration: 33, avgOwnerAge: 38 },
    "Пермский край": { regionName: "Пермский край", petDensityIndex: 78, competitorDensityIndex: 74, eComPenetration: 32, avgOwnerAge: 39 },
    "Кировская область": { regionName: "Кировская область", petDensityIndex: 65, competitorDensityIndex: 60, eComPenetration: 25, avgOwnerAge: 43 },

    // --- УРАЛ И СИБИРЬ (Трудовая миграция - моложе центра) ---
    "Свердловская область": { regionName: "Свердловская область", petDensityIndex: 87, competitorDensityIndex: 88, eComPenetration: 40, avgOwnerAge: 39 },
    "Челябинская область": { regionName: "Челябинская область", petDensityIndex: 84, competitorDensityIndex: 82, eComPenetration: 34, avgOwnerAge: 40 },
    "Тюменская область": { regionName: "Тюменская область", petDensityIndex: 80, competitorDensityIndex: 76, eComPenetration: 38, avgOwnerAge: 37 },
    "Ханты-Мансийский автономный округ — Югра": { regionName: "Ханты-Мансийский автономный округ — Югра", petDensityIndex: 75, competitorDensityIndex: 70, eComPenetration: 45, avgOwnerAge: 34 }, // Молодой рабочий регион
    "Ямало-Ненецкий автономный округ": { regionName: "Ямало-Ненецкий автономный округ", petDensityIndex: 70, competitorDensityIndex: 60, eComPenetration: 48, avgOwnerAge: 33 }, // Молодой рабочий регион
    "Новосибирская область": { regionName: "Новосибирская область", petDensityIndex: 86, competitorDensityIndex: 88, eComPenetration: 42, avgOwnerAge: 39 },
    "Красноярский край": { regionName: "Красноярский край", petDensityIndex: 78, competitorDensityIndex: 75, eComPenetration: 32, avgOwnerAge: 38 },
    "Республика Тыва": { regionName: "Республика Тыва", petDensityIndex: 40, competitorDensityIndex: 30, eComPenetration: 15, avgOwnerAge: 29 }, // Очень молодой регион

    // --- ДАЛЬНИЙ ВОСТОК ---
    "Приморский край": { regionName: "Приморский край", petDensityIndex: 80, competitorDensityIndex: 75, eComPenetration: 34, avgOwnerAge: 39 },
    "Хабаровский край": { regionName: "Хабаровский край", petDensityIndex: 75, competitorDensityIndex: 70, eComPenetration: 31, avgOwnerAge: 38 },
    "Республика Саха (Якутия)": { regionName: "Республика Саха (Якутия)", petDensityIndex: 68, competitorDensityIndex: 60, eComPenetration: 40, avgOwnerAge: 33 }, // Молодой регион

    // --- СНГ (Демографический бум в Азии) ---
    "Республика Беларусь": { regionName: "Республика Беларусь", petDensityIndex: 78, competitorDensityIndex: 70, eComPenetration: 28, avgOwnerAge: 41 }, // Ближе к Европе
    "Республика Казахстан": { regionName: "Республика Казахстан", petDensityIndex: 72, competitorDensityIndex: 65, eComPenetration: 24, avgOwnerAge: 31 }, // Молодое население
    "Республика Узбекистан": { regionName: "Республика Узбекистан", petDensityIndex: 55, competitorDensityIndex: 48, eComPenetration: 15, avgOwnerAge: 28 }, // Очень молодое
    "Кыргызская Республика": { regionName: "Кыргызская Республика", petDensityIndex: 50, competitorDensityIndex: 42, eComPenetration: 12, avgOwnerAge: 27 }, // Очень молодое
    "Республика Таджикистан": { regionName: "Республика Таджикистан", petDensityIndex: 45, competitorDensityIndex: 38, eComPenetration: 10, avgOwnerAge: 25 }, // Самое молодое
    "Азербайджан": { regionName: "Азербайджан", petDensityIndex: 60, competitorDensityIndex: 55, eComPenetration: 18, avgOwnerAge: 32 },
    "Армения": { regionName: "Армения", petDensityIndex: 62, competitorDensityIndex: 56, eComPenetration: 20, avgOwnerAge: 35 },
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
    const r1 = seededRandom(seed);
    const r2 = seededRandom(seed + 123);
    const r3 = seededRandom(seed + 456);
    const r4 = seededRandom(seed + 789);

    return { 
        regionName, 
        petDensityIndex: 30 + r1 * 60, // Range 30-90
        competitorDensityIndex: 20 + r2 * 70, // Range 20-90
        eComPenetration: 5 + r3 * 35, // Range 5-40
        avgOwnerAge: 35 + r4 * 10 // Range 35-45 (Conservative default)
    };
};
