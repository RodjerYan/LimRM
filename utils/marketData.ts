
import { MarketData } from '../types';

/**
 * Mock Data simulating external market research.
 * Includes:
 * - Pet Density (Based on urbanization and household data approx)
 * - Competitor Density (Presence of major chains/brands)
 * - E-com Penetration (Ozon/WB share in the region)
 */
export const MOCK_MARKET_DATA: Record<string, MarketData> = {
    // Центральная Россия
    "Москва": { regionName: "Москва", petDensityIndex: 85, competitorDensityIndex: 95, eComPenetration: 45 },
    "Московская область": { regionName: "Московская область", petDensityIndex: 90, competitorDensityIndex: 88, eComPenetration: 38 },
    "Тульская область": { regionName: "Тульская область", petDensityIndex: 65, competitorDensityIndex: 60, eComPenetration: 25 },
    "Калужская область": { regionName: "Калужская область", petDensityIndex: 70, competitorDensityIndex: 65, eComPenetration: 28 },
    "Брянская область": { regionName: "Брянская область", petDensityIndex: 60, competitorDensityIndex: 55, eComPenetration: 20 },
    "Орловская область": { regionName: "Орловская область", petDensityIndex: 55, competitorDensityIndex: 50, eComPenetration: 18 },
    "Воронежская область": { regionName: "Воронежская область", petDensityIndex: 75, competitorDensityIndex: 70, eComPenetration: 22 },
    "Смоленская область": { regionName: "Смоленская область", petDensityIndex: 58, competitorDensityIndex: 45, eComPenetration: 19 },
    
    // Северо-Запад
    "Санкт-Петербург": { regionName: "Санкт-Петербург", petDensityIndex: 88, competitorDensityIndex: 92, eComPenetration: 42 },
    "Ленинградская область": { regionName: "Ленинградская область", petDensityIndex: 82, competitorDensityIndex: 75, eComPenetration: 30 },
    "Калининградская область": { regionName: "Калининградская область", petDensityIndex: 78, competitorDensityIndex: 65, eComPenetration: 28 },
    
    // Юг
    "Краснодарский край": { regionName: "Краснодарский край", petDensityIndex: 92, competitorDensityIndex: 85, eComPenetration: 25 },
    "Ростовская область": { regionName: "Ростовская область", petDensityIndex: 80, competitorDensityIndex: 78, eComPenetration: 24 },
    "Ставропольский край": { regionName: "Ставропольский край", petDensityIndex: 72, competitorDensityIndex: 60, eComPenetration: 18 },
    
    // Урал и Сибирь
    "Свердловская область": { regionName: "Свердловская область", petDensityIndex: 76, competitorDensityIndex: 80, eComPenetration: 32 },
    "Челябинская область": { regionName: "Челябинская область", petDensityIndex: 74, competitorDensityIndex: 75, eComPenetration: 28 },
    "Новосибирская область": { regionName: "Новосибирская область", petDensityIndex: 78, competitorDensityIndex: 82, eComPenetration: 35 },
    
    // СНГ (Mock values)
    "Республика Беларусь": { regionName: "Республика Беларусь", petDensityIndex: 70, competitorDensityIndex: 60, eComPenetration: 15 },
    "Республика Казахстан": { regionName: "Республика Казахстан", petDensityIndex: 65, competitorDensityIndex: 55, eComPenetration: 12 },
};

export const getMarketData = (regionName: string): MarketData => {
    return MOCK_MARKET_DATA[regionName] || { 
        regionName, 
        petDensityIndex: 40 + Math.random() * 30, // Random fallback
        competitorDensityIndex: 30 + Math.random() * 40,
        eComPenetration: 10 + Math.random() * 15
    };
};
