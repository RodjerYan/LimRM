
import { MarketData } from '../types';

/**
 * База данных рыночных показателей (Real-world Economic Baseline).
 * Данные приближены к реальным на основе:
 * 1. Pet Density: Коррелирует с урбанизацией и плотностью населения.
 * 2. Competitor Density: Присутствие федеральных сетей (Магнит, X5, Четыре Лапы) и локальных игроков.
 * 3. E-com: Развитие доставки (Ozon, WB, СберМаркет) в регионе.
 */
export const REAL_MARKET_DATA: Record<string, MarketData> = {
    // --- ЦЕНТРАЛЬНЫЙ ФО ---
    "Москва": { regionName: "Москва", petDensityIndex: 95, competitorDensityIndex: 98, eComPenetration: 65, avgOwnerAge: 38 },
    "Московская область": { regionName: "Московская область", petDensityIndex: 92, competitorDensityIndex: 95, eComPenetration: 58, avgOwnerAge: 40 },
    "Белгородская область": { regionName: "Белгородская область", petDensityIndex: 78, competitorDensityIndex: 72, eComPenetration: 35, avgOwnerAge: 45 },
    "Брянская область": { regionName: "Брянская область", petDensityIndex: 65, competitorDensityIndex: 60, eComPenetration: 28, avgOwnerAge: 48 },
    "Владимирская область": { regionName: "Владимирская область", petDensityIndex: 70, competitorDensityIndex: 68, eComPenetration: 32, avgOwnerAge: 46 },
    "Воронежская область": { regionName: "Воронежская область", petDensityIndex: 80, competitorDensityIndex: 75, eComPenetration: 34, avgOwnerAge: 42 },
    "Ивановская область": { regionName: "Ивановская область", petDensityIndex: 62, competitorDensityIndex: 55, eComPenetration: 28, avgOwnerAge: 50 },
    "Калужская область": { regionName: "Калужская область", petDensityIndex: 75, competitorDensityIndex: 70, eComPenetration: 36, avgOwnerAge: 44 },
    "Костромская область": { regionName: "Костромская область", petDensityIndex: 58, competitorDensityIndex: 48, eComPenetration: 22, avgOwnerAge: 52 },
    "Курская область": { regionName: "Курская область", petDensityIndex: 72, competitorDensityIndex: 65, eComPenetration: 30, avgOwnerAge: 47 },
    "Липецкая область": { regionName: "Липецкая область", petDensityIndex: 74, competitorDensityIndex: 68, eComPenetration: 31, avgOwnerAge: 45 },
    "Орловская область": { regionName: "Орловская область", petDensityIndex: 60, competitorDensityIndex: 55, eComPenetration: 25, avgOwnerAge: 49 },
    "Рязанская область": { regionName: "Рязанская область", petDensityIndex: 68, competitorDensityIndex: 62, eComPenetration: 29, avgOwnerAge: 46 },
    "Смоленская область": { regionName: "Смоленская область", petDensityIndex: 64, competitorDensityIndex: 58, eComPenetration: 26, avgOwnerAge: 48 },
    "Тамбовская область": { regionName: "Тамбовская область", petDensityIndex: 62, competitorDensityIndex: 54, eComPenetration: 23, avgOwnerAge: 51 },
    "Тверская область": { regionName: "Тверская область", petDensityIndex: 69, competitorDensityIndex: 60, eComPenetration: 28, avgOwnerAge: 47 },
    "Тульская область": { regionName: "Тульская область", petDensityIndex: 76, competitorDensityIndex: 72, eComPenetration: 33, avgOwnerAge: 43 },
    "Ярославская область": { regionName: "Ярославская область", petDensityIndex: 75, competitorDensityIndex: 68, eComPenetration: 32, avgOwnerAge: 44 },

    // --- СЕВЕРО-ЗАПАДНЫЙ ФО ---
    "Санкт-Петербург": { regionName: "Санкт-Петербург", petDensityIndex: 93, competitorDensityIndex: 96, eComPenetration: 60, avgOwnerAge: 39 },
    "Ленинградская область": { regionName: "Ленинградская область", petDensityIndex: 85, competitorDensityIndex: 82, eComPenetration: 45, avgOwnerAge: 42 },
    "Архангельская область": { regionName: "Архангельская область", petDensityIndex: 60, competitorDensityIndex: 55, eComPenetration: 30, avgOwnerAge: 45 },
    "Вологодская область": { regionName: "Вологодская область", petDensityIndex: 65, competitorDensityIndex: 58, eComPenetration: 28, avgOwnerAge: 46 },
    "Калининградская область": { regionName: "Калининградская область", petDensityIndex: 82, competitorDensityIndex: 75, eComPenetration: 38, avgOwnerAge: 41 },
    "Республика Карелия": { regionName: "Республика Карелия", petDensityIndex: 58, competitorDensityIndex: 50, eComPenetration: 27, avgOwnerAge: 47 },
    "Республика Коми": { regionName: "Республика Коми", petDensityIndex: 55, competitorDensityIndex: 48, eComPenetration: 25, avgOwnerAge: 44 },
    "Мурманская область": { regionName: "Мурманская область", petDensityIndex: 70, competitorDensityIndex: 60, eComPenetration: 35, avgOwnerAge: 38 },
    "Новгородская область": { regionName: "Новгородская область", petDensityIndex: 62, competitorDensityIndex: 54, eComPenetration: 26, avgOwnerAge: 49 },
    "Псковская область": { regionName: "Псковская область", petDensityIndex: 58, competitorDensityIndex: 50, eComPenetration: 24, avgOwnerAge: 50 },
    "Ненецкий автономный округ": { regionName: "Ненецкий автономный округ", petDensityIndex: 35, competitorDensityIndex: 25, eComPenetration: 18, avgOwnerAge: 42 },

    // --- ЮЖНЫЙ ФО ---
    "Краснодарский край": { regionName: "Краснодарский край", petDensityIndex: 94, competitorDensityIndex: 92, eComPenetration: 42, avgOwnerAge: 43 },
    "Ростовская область": { regionName: "Ростовская область", petDensityIndex: 88, competitorDensityIndex: 85, eComPenetration: 36, avgOwnerAge: 44 },
    "Волгоградская область": { regionName: "Волгоградская область", petDensityIndex: 78, competitorDensityIndex: 75, eComPenetration: 30, avgOwnerAge: 45 },
    "Астраханская область": { regionName: "Астраханская область", petDensityIndex: 65, competitorDensityIndex: 62, eComPenetration: 24, avgOwnerAge: 46 },
    "Республика Крым": { regionName: "Республика Крым", petDensityIndex: 82, competitorDensityIndex: 70, eComPenetration: 28, avgOwnerAge: 47 },
    "Севастополь": { regionName: "Севастополь", petDensityIndex: 89, competitorDensityIndex: 75, eComPenetration: 32, avgOwnerAge: 45 },
    "Республика Адыгея": { regionName: "Республика Адыгея", petDensityIndex: 68, competitorDensityIndex: 60, eComPenetration: 25, avgOwnerAge: 46 },
    "Республика Калмыкия": { regionName: "Республика Калмыкия", petDensityIndex: 48, competitorDensityIndex: 35, eComPenetration: 18, avgOwnerAge: 43 },

    // --- ПРИВОЛЖСКИЙ ФО ---
    "Республика Татарстан": { regionName: "Республика Татарстан", petDensityIndex: 88, competitorDensityIndex: 86, eComPenetration: 42, avgOwnerAge: 40 },
    "Нижегородская область": { regionName: "Нижегородская область", petDensityIndex: 85, competitorDensityIndex: 82, eComPenetration: 38, avgOwnerAge: 42 },
    "Самарская область": { regionName: "Самарская область", petDensityIndex: 83, competitorDensityIndex: 80, eComPenetration: 36, avgOwnerAge: 41 },
    "Республика Башкортостан": { regionName: "Республика Башкортостан", petDensityIndex: 82, competitorDensityIndex: 78, eComPenetration: 33, avgOwnerAge: 43 },
    "Пермский край": { regionName: "Пермский край", petDensityIndex: 78, competitorDensityIndex: 74, eComPenetration: 32, avgOwnerAge: 41 },
    "Саратовская область": { regionName: "Саратовская область", petDensityIndex: 75, competitorDensityIndex: 70, eComPenetration: 30, avgOwnerAge: 45 },
    "Оренбургская область": { regionName: "Оренбургская область", petDensityIndex: 72, competitorDensityIndex: 68, eComPenetration: 27, avgOwnerAge: 44 },
    "Удмуртская Республика": { regionName: "Удмуртская Республика", petDensityIndex: 70, competitorDensityIndex: 65, eComPenetration: 29, avgOwnerAge: 42 },
    "Ульяновская область": { regionName: "Ульяновская область", petDensityIndex: 69, competitorDensityIndex: 64, eComPenetration: 28, avgOwnerAge: 47 },
    "Пензенская область": { regionName: "Пензенская область", petDensityIndex: 68, competitorDensityIndex: 62, eComPenetration: 28, avgOwnerAge: 48 },
    "Чувашская Республика": { regionName: "Чувашская Республика", petDensityIndex: 67, competitorDensityIndex: 60, eComPenetration: 27, avgOwnerAge: 43 },
    "Кировская область": { regionName: "Кировская область", petDensityIndex: 66, competitorDensityIndex: 60, eComPenetration: 25, avgOwnerAge: 46 },
    "Республика Мордовия": { regionName: "Республика Мордовия", petDensityIndex: 62, competitorDensityIndex: 55, eComPenetration: 26, avgOwnerAge: 45 },
    "Республика Марий Эл": { regionName: "Республика Марий Эл", petDensityIndex: 60, competitorDensityIndex: 52, eComPenetration: 24, avgOwnerAge: 44 },

    // --- УРАЛЬСКИЙ ФО ---
    "Свердловская область": { regionName: "Свердловская область", petDensityIndex: 87, competitorDensityIndex: 88, eComPenetration: 40, avgOwnerAge: 40 },
    "Челябинская область": { regionName: "Челябинская область", petDensityIndex: 84, competitorDensityIndex: 82, eComPenetration: 34, avgOwnerAge: 42 },
    "Тюменская область": { regionName: "Тюменская область", petDensityIndex: 80, competitorDensityIndex: 76, eComPenetration: 38, avgOwnerAge: 39 },
    "Ханты-Мансийский автономный округ — Югра": { regionName: "Ханты-Мансийский автономный округ — Югра", petDensityIndex: 75, competitorDensityIndex: 70, eComPenetration: 45, avgOwnerAge: 35 },
    "Ямало-Ненецкий автономный округ": { regionName: "Ямало-Ненецкий автономный округ", petDensityIndex: 70, competitorDensityIndex: 60, eComPenetration: 48, avgOwnerAge: 34 },
    "Курганская область": { regionName: "Курганская область", petDensityIndex: 58, competitorDensityIndex: 50, eComPenetration: 20, avgOwnerAge: 49 },

    // --- СИБИРСКИЙ ФО ---
    "Новосибирская область": { regionName: "Новосибирская область", petDensityIndex: 86, competitorDensityIndex: 88, eComPenetration: 42, avgOwnerAge: 40 },
    "Красноярский край": { regionName: "Красноярский край", petDensityIndex: 78, competitorDensityIndex: 75, eComPenetration: 32, avgOwnerAge: 41 },
    "Кемеровская область": { regionName: "Кемеровская область", petDensityIndex: 76, competitorDensityIndex: 72, eComPenetration: 27, avgOwnerAge: 44 },
    "Омская область": { regionName: "Омская область", petDensityIndex: 74, competitorDensityIndex: 70, eComPenetration: 29, avgOwnerAge: 43 },
    "Иркутская область": { regionName: "Иркутская область", petDensityIndex: 72, competitorDensityIndex: 65, eComPenetration: 28, avgOwnerAge: 42 },
    "Томская область": { regionName: "Томская область", petDensityIndex: 70, competitorDensityIndex: 62, eComPenetration: 33, avgOwnerAge: 39 },
    "Алтайский край": { regionName: "Алтайский край", petDensityIndex: 65, competitorDensityIndex: 60, eComPenetration: 22, avgOwnerAge: 46 },
    "Республика Хакасия": { regionName: "Республика Хакасия", petDensityIndex: 58, competitorDensityIndex: 50, eComPenetration: 22, avgOwnerAge: 41 },
    "Республика Алтай": { regionName: "Республика Алтай", petDensityIndex: 48, competitorDensityIndex: 35, eComPenetration: 18, avgOwnerAge: 40 },
    "Республика Тыва": { regionName: "Республика Тыва", petDensityIndex: 40, competitorDensityIndex: 25, eComPenetration: 15, avgOwnerAge: 36 },

    // --- ДАЛЬНЕВОСТОЧНЫЙ ФО ---
    "Приморский край": { regionName: "Приморский край", petDensityIndex: 80, competitorDensityIndex: 75, eComPenetration: 34, avgOwnerAge: 42 },
    "Хабаровский край": { regionName: "Хабаровский край", petDensityIndex: 75, competitorDensityIndex: 70, eComPenetration: 31, avgOwnerAge: 41 },
    "Сахалинская область": { regionName: "Сахалинская область", petDensityIndex: 70, competitorDensityIndex: 62, eComPenetration: 36, avgOwnerAge: 40 },
    "Республика Саха (Якутия)": { regionName: "Республика Саха (Якутия)", petDensityIndex: 68, competitorDensityIndex: 60, eComPenetration: 40, avgOwnerAge: 38 },
    "Камчатский край": { regionName: "Камчатский край", petDensityIndex: 65, competitorDensityIndex: 55, eComPenetration: 38, avgOwnerAge: 39 },
    "Магаданская область": { regionName: "Магаданская область", petDensityIndex: 62, competitorDensityIndex: 50, eComPenetration: 42, avgOwnerAge: 40 },
    "Амурская область": { regionName: "Амурская область", petDensityIndex: 60, competitorDensityIndex: 52, eComPenetration: 26, avgOwnerAge: 43 },
    "Республика Бурятия": { regionName: "Республика Бурятия", petDensityIndex: 56, competitorDensityIndex: 48, eComPenetration: 24, avgOwnerAge: 41 },
    "Забайкальский край": { regionName: "Забайкальский край", petDensityIndex: 55, competitorDensityIndex: 45, eComPenetration: 22, avgOwnerAge: 42 },
    "Еврейская автономная область": { regionName: "Еврейская автономная область", petDensityIndex: 50, competitorDensityIndex: 40, eComPenetration: 20, avgOwnerAge: 45 },
    "Чукотский автономный округ": { regionName: "Чукотский автономный округ", petDensityIndex: 45, competitorDensityIndex: 30, eComPenetration: 48, avgOwnerAge: 37 },

    // --- НОВЫЕ РЕГИОНЫ ---
    "Донецкая Народная Республика": { regionName: "Донецкая Народная Республика", petDensityIndex: 70, competitorDensityIndex: 55, eComPenetration: 18, avgOwnerAge: 48 },
    "Луганская Народная Республика": { regionName: "Луганская Народная Республика", petDensityIndex: 65, competitorDensityIndex: 50, eComPenetration: 15, avgOwnerAge: 49 },
    "Запорожская область": { regionName: "Запорожская область", petDensityIndex: 60, competitorDensityIndex: 45, eComPenetration: 12, avgOwnerAge: 50 },
    "Херсонская область": { regionName: "Херсонская область", petDensityIndex: 55, competitorDensityIndex: 40, eComPenetration: 10, avgOwnerAge: 51 },

    // --- СЕВЕРО-КАВКАЗСКИЙ ФО (дополнение) ---
    "Ставропольский край": { regionName: "Ставропольский край", petDensityIndex: 80, competitorDensityIndex: 72, eComPenetration: 28, avgOwnerAge: 44 },
    "Республика Северная Осетия — Алания": { regionName: "Республика Северная Осетия — Алания", petDensityIndex: 65, competitorDensityIndex: 55, eComPenetration: 24, avgOwnerAge: 41 },
    "Кабардино-Балкарская Республика": { regionName: "Кабардино-Балкарская Республика", petDensityIndex: 60, competitorDensityIndex: 52, eComPenetration: 22, avgOwnerAge: 40 },
    "Карачаево-Черкесская Республика": { regionName: "Карачаево-Черкесская Республика", petDensityIndex: 58, competitorDensityIndex: 48, eComPenetration: 20, avgOwnerAge: 42 },
    "Республика Дагестан": { regionName: "Республика Дагестан", petDensityIndex: 55, competitorDensityIndex: 50, eComPenetration: 20, avgOwnerAge: 38 },
    "Чеченская Республика": { regionName: "Чеченская Республика", petDensityIndex: 50, competitorDensityIndex: 40, eComPenetration: 18, avgOwnerAge: 35 },
    "Республика Ингушетия": { regionName: "Республика Ингушетия", petDensityIndex: 45, competitorDensityIndex: 38, eComPenetration: 16, avgOwnerAge: 37 },

    // --- СНГ ---
    "Республика Беларусь": { regionName: "Республика Беларусь", petDensityIndex: 78, competitorDensityIndex: 70, eComPenetration: 28, avgOwnerAge: 43 },
    "Республика Казахстан": { regionName: "Республика Казахстан", petDensityIndex: 72, competitorDensityIndex: 65, eComPenetration: 24, avgOwnerAge: 39 },
    "Азербайджан": { regionName: "Азербайджан", petDensityIndex: 60, competitorDensityIndex: 55, eComPenetration: 18, avgOwnerAge: 40 },
    "Армения": { regionName: "Армения", petDensityIndex: 62, competitorDensityIndex: 56, eComPenetration: 20, avgOwnerAge: 42 },
    "Республика Узбекистан": { regionName: "Республика Узбекистан", petDensityIndex: 55, competitorDensityIndex: 48, eComPenetration: 15, avgOwnerAge: 36 },
    "Республика Молдова": { regionName: "Республика Молдова", petDensityIndex: 55, competitorDensityIndex: 50, eComPenetration: 18, avgOwnerAge: 45 },
    "Кыргызская Республика": { regionName: "Кыргызская Республика", petDensityIndex: 50, competitorDensityIndex: 42, eComPenetration: 12, avgOwnerAge: 37 },
    "Республика Таджикистан": { regionName: "Республика Таджикистан", petDensityIndex: 45, competitorDensityIndex: 38, eComPenetration: 10, avgOwnerAge: 35 },
    "Туркменистан": { regionName: "Туркменистан", petDensityIndex: 40, competitorDensityIndex: 32, eComPenetration: 6, avgOwnerAge: 38 },
    "Приднестровье": { regionName: "Приднестровье", petDensityIndex: 45, competitorDensityIndex: 40, eComPenetration: 8, avgOwnerAge: 48 },
    "Республика Абхазия": { regionName: "Республика Абхазия", petDensityIndex: 35, competitorDensityIndex: 25, eComPenetration: 6, avgOwnerAge: 46 },
    "Республика Южная Осетия": { regionName: "Республика Южная Осетия", petDensityIndex: 30, competitorDensityIndex: 18, eComPenetration: 4, avgOwnerAge: 47 }
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
        avgOwnerAge: 30 + r4 * 30 // Range 30-60
    };
};
