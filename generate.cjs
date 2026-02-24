const fs = require('fs');

const dataStr = `
Москва — Кошки 62% / Собаки 38%
Московская область — 58% / 42%
Белгородская область — 52% / 48%
Брянская область — 53% / 47%
Владимирская область — 54% / 46%
Воронежская область — 53% / 47%
Ивановская область — 55% / 45%
Калужская область — 56% / 44%
Костромская область — 54% / 46%
Курская область — 52% / 48%
Липецкая область — 53% / 47%
Орловская область — 53% / 47%
Рязанская область — 54% / 46%
Смоленская область — 54% / 46%
Тамбовская область — 52% / 48%
Тверская область — 55% / 45%
Тульская область — 54% / 46%
Ярославская область — 56% / 44%
Санкт-Петербург — 64% / 36%
Ленинградская область — 57% / 43%
Калининградская область — 56% / 44%
Республика Карелия — 55% / 45%
Республика Коми — 53% / 47%
Архангельская область — 54% / 46%
Вологодская область — 55% / 45%
Мурманская область — 58% / 42%
Новгородская область — 55% / 45%
Псковская область — 54% / 46%
Краснодарский край — 48% / 52%
Ростовская область — 49% / 51%
Волгоградская область — 51% / 49%
Астраханская область — 50% / 50%
Республика Адыгея — 47% / 53%
Республика Калмыкия — 46% / 54%
Республика Крым — 50% / 50%
Севастополь — 52% / 48%
Ставропольский край — 48% / 52%
Республика Дагестан — 44% / 56%
Чеченская Республика — 43% / 57%
Республика Ингушетия — 44% / 56%
Кабардино-Балкарская Республика — 46% / 54%
Карачаево-Черкесская Республика — 46% / 54%
Республика Северная Осетия — Алания — 47% / 53%
Республика Татарстан — 53% / 47%
Башкортостан — 51% / 49%
Самарская область — 54% / 46%
Саратовская область — 52% / 48%
Нижегородская область — 55% / 45%
Пермский край — 53% / 47%
Оренбургская область — 50% / 50%
Пензенская область — 52% / 48%
Ульяновская область — 53% / 47%
Кировская область — 54% / 46%
Республика Марий Эл — 52% / 48%
Республика Мордовия — 51% / 49%
Удмуртская Республика — 52% / 48%
Чувашская Республика — 52% / 48%
Свердловская область — 55% / 45%
Челябинская область — 54% / 46%
Тюменская область — 52% / 48%
Курганская область — 51% / 49%
Ханты-Мансийский автономный округ — Югра — 53% / 47%
Ямало-Ненецкий автономный округ — 52% / 48%
Новосибирская область — 55% / 45%
Красноярский край — 54% / 46%
Иркутская область — 53% / 47%
Кемеровская область — 52% / 48%
Омская область — 53% / 47%
Томская область — 56% / 44%
Алтайский край — 50% / 50%
Республика Алтай — 48% / 52%
Республика Тыва — 47% / 53%
Республика Хакасия — 51% / 49%
Приморский край — 55% / 45%
Хабаровский край — 54% / 46%
Амурская область — 52% / 48%
Сахалинская область — 56% / 44%
Камчатский край — 54% / 46%
Магаданская область — 53% / 47%
Республика Саха (Якутия) — 51% / 49%
Еврейская автономная область — 52% / 48%
Чукотский автономный округ — 50% / 50%
Забайкальский край — 52% / 48%
Республика Бурятия — 51% / 49%
Республика Беларусь — 58% / 42%
Республика Казахстан — 48% / 52%
Азербайджан — 46% / 54%
Армения — 45% / 55%
Кыргызская Республика — 44% / 56%
Республика Таджикистан — 43% / 57%
Республика Узбекистан — 47% / 53%
Республика Молдова — 49% / 51%
`;

const lines = dataStr.trim().split('\n');
const result = {};
for (const line of lines) {
    const match = line.match(/(.+) — (?:Кошки )?(\d+)% \/ (?:Собаки )?(\d+)%/);
    if (match) {
        let name = match[1].trim();
        if (name === 'Башкортостан') name = 'Республика Башкортостан';
        const catShare = parseInt(match[2], 10);
        result[name] = catShare;
    }
}

const existingData = {
    "Москва": { regionName: "Москва", petDensityIndex: 97, competitorDensityIndex: 99, eComPenetration: 68, avgOwnerAge: 39, catShare: 75 }, 
    "Московская область": { regionName: "Московская область", petDensityIndex: 93, competitorDensityIndex: 95, eComPenetration: 59, avgOwnerAge: 41, catShare: 65 },
    "Белгородская область": { regionName: "Белгородская область", petDensityIndex: 79, competitorDensityIndex: 72, eComPenetration: 35, avgOwnerAge: 43, catShare: 55 },
    "Брянская область": { regionName: "Брянская область", petDensityIndex: 66, competitorDensityIndex: 60, eComPenetration: 28, avgOwnerAge: 45, catShare: 58 },
    "Владимирская область": { regionName: "Владимирская область", petDensityIndex: 71, competitorDensityIndex: 68, eComPenetration: 32, avgOwnerAge: 45, catShare: 62 },
    "Воронежская область": { regionName: "Воронежская область", petDensityIndex: 81, competitorDensityIndex: 75, eComPenetration: 34, avgOwnerAge: 44, catShare: 50 },
    "Ивановская область": { regionName: "Ивановская область", petDensityIndex: 62, competitorDensityIndex: 55, eComPenetration: 28, avgOwnerAge: 46, catShare: 65 },
    "Калужская область": { regionName: "Калужская область", petDensityIndex: 76, competitorDensityIndex: 70, eComPenetration: 36, avgOwnerAge: 43, catShare: 60 },
    "Костромская область": { regionName: "Костромская область", petDensityIndex: 58, competitorDensityIndex: 48, eComPenetration: 22, avgOwnerAge: 45, catShare: 62 },
    "Курская область": { regionName: "Курская область", petDensityIndex: 72, competitorDensityIndex: 65, eComPenetration: 30, avgOwnerAge: 44, catShare: 55 },
    "Липецкая область": { regionName: "Липецкая область", petDensityIndex: 74, competitorDensityIndex: 68, eComPenetration: 31, avgOwnerAge: 44, catShare: 55 },
    "Орловская область": { regionName: "Орловская область", petDensityIndex: 61, competitorDensityIndex: 55, eComPenetration: 25, avgOwnerAge: 45, catShare: 58 },
    "Рязанская область": { regionName: "Рязанская область", petDensityIndex: 68, competitorDensityIndex: 62, eComPenetration: 29, avgOwnerAge: 46, catShare: 60 }, 
    "Смоленская область": { regionName: "Смоленская область", petDensityIndex: 64, competitorDensityIndex: 58, eComPenetration: 26, avgOwnerAge: 45, catShare: 61 },
    "Тамбовская область": { regionName: "Тамбовская область", petDensityIndex: 62, competitorDensityIndex: 54, eComPenetration: 23, avgOwnerAge: 47, catShare: 54 }, 
    "Тверская область": { regionName: "Тверская область", petDensityIndex: 69, competitorDensityIndex: 60, eComPenetration: 28, avgOwnerAge: 46, catShare: 63 },
    "Тульская область": { regionName: "Тульская область", petDensityIndex: 77, competitorDensityIndex: 72, eComPenetration: 33, avgOwnerAge: 47, catShare: 58 }, 
    "Ярославская область": { regionName: "Ярославская область", petDensityIndex: 75, competitorDensityIndex: 68, eComPenetration: 32, avgOwnerAge: 44, catShare: 64 },
    "Санкт-Петербург": { regionName: "Санкт-Петербург", petDensityIndex: 95, competitorDensityIndex: 97, eComPenetration: 63, avgOwnerAge: 40, catShare: 80 }, 
    "Ленинградская область": { regionName: "Ленинградская область", petDensityIndex: 86, competitorDensityIndex: 82, eComPenetration: 46, avgOwnerAge: 42, catShare: 65 },
    "Калининградская область": { regionName: "Калининградская область", petDensityIndex: 83, competitorDensityIndex: 75, eComPenetration: 39, avgOwnerAge: 41, catShare: 60 },
    "Мурманская область": { regionName: "Мурманская область", petDensityIndex: 70, competitorDensityIndex: 60, eComPenetration: 35, avgOwnerAge: 39, catShare: 58 },
    "Архангельская область": { regionName: "Архангельская область", petDensityIndex: 60, competitorDensityIndex: 55, eComPenetration: 30, avgOwnerAge: 41, catShare: 60 },
    "Вологодская область": { regionName: "Вологодская область", petDensityIndex: 65, competitorDensityIndex: 58, eComPenetration: 28, avgOwnerAge: 43, catShare: 59 },
    "Республика Карелия": { regionName: "Республика Карелия", petDensityIndex: 58, competitorDensityIndex: 50, eComPenetration: 27, avgOwnerAge: 44, catShare: 57 },
    "Республика Коми": { regionName: "Республика Коми", petDensityIndex: 55, competitorDensityIndex: 48, eComPenetration: 25, avgOwnerAge: 40, catShare: 55 },
    "Новгородская область": { regionName: "Новгородская область", petDensityIndex: 62, competitorDensityIndex: 54, eComPenetration: 26, avgOwnerAge: 45, catShare: 61 },
    "Псковская область": { regionName: "Псковская область", petDensityIndex: 58, competitorDensityIndex: 50, eComPenetration: 24, avgOwnerAge: 46, catShare: 58 },
    "Краснодарский край": { regionName: "Краснодарский край", petDensityIndex: 95, competitorDensityIndex: 92, eComPenetration: 43, avgOwnerAge: 42, catShare: 45 },
    "Ростовская область": { regionName: "Ростовская область", petDensityIndex: 89, competitorDensityIndex: 85, eComPenetration: 37, avgOwnerAge: 42, catShare: 48 },
    "Волгоградская область": { regionName: "Волгоградская область", petDensityIndex: 78, competitorDensityIndex: 75, eComPenetration: 30, avgOwnerAge: 43, catShare: 52 },
    "Астраханская область": { regionName: "Астраханская область", petDensityIndex: 65, competitorDensityIndex: 62, eComPenetration: 24, avgOwnerAge: 40, catShare: 50 },
    "Республика Крым": { regionName: "Республика Крым", petDensityIndex: 83, competitorDensityIndex: 70, eComPenetration: 29, avgOwnerAge: 44, catShare: 55 },
    "Севастополь": { regionName: "Севастополь", petDensityIndex: 90, competitorDensityIndex: 75, eComPenetration: 33, avgOwnerAge: 42, catShare: 65 },
    "Республика Дагестан": { regionName: "Республика Дагестан", petDensityIndex: 55, competitorDensityIndex: 50, eComPenetration: 20, avgOwnerAge: 31, catShare: 40 },
    "Чеченская Республика": { regionName: "Чеченская Республика", petDensityIndex: 50, competitorDensityIndex: 40, eComPenetration: 18, avgOwnerAge: 29, catShare: 35 }, 
    "Республика Ингушетия": { regionName: "Республика Ингушетия", petDensityIndex: 45, competitorDensityIndex: 35, eComPenetration: 15, avgOwnerAge: 30, catShare: 35 },
    "Кабардино-Балкарская Республика": { regionName: "Кабардино-Балкарская Республика", petDensityIndex: 60, competitorDensityIndex: 55, eComPenetration: 22, avgOwnerAge: 35, catShare: 42 },
    "Ставропольский край": { regionName: "Ставропольский край", petDensityIndex: 81, competitorDensityIndex: 72, eComPenetration: 29, avgOwnerAge: 40, catShare: 48 },
    "Республика Татарстан": { regionName: "Республика Татарстан", petDensityIndex: 89, competitorDensityIndex: 86, eComPenetration: 43, avgOwnerAge: 39, catShare: 60 },
    "Нижегородская область": { regionName: "Нижегородская область", petDensityIndex: 85, competitorDensityIndex: 82, eComPenetration: 38, avgOwnerAge: 44, catShare: 63 },
    "Самарская область": { regionName: "Самарская область", petDensityIndex: 83, competitorDensityIndex: 80, eComPenetration: 36, avgOwnerAge: 42, catShare: 60 },
    "Республика Башкортостан": { regionName: "Республика Башкортостан", petDensityIndex: 82, competitorDensityIndex: 78, eComPenetration: 33, avgOwnerAge: 39, catShare: 58 },
    "Пермский край": { regionName: "Пермский край", petDensityIndex: 78, competitorDensityIndex: 74, eComPenetration: 32, avgOwnerAge: 40, catShare: 62 },
    "Кировская область": { regionName: "Кировская область", petDensityIndex: 65, competitorDensityIndex: 60, eComPenetration: 25, avgOwnerAge: 44, catShare: 59 },
    "Свердловская область": { regionName: "Свердловская область", petDensityIndex: 88, competitorDensityIndex: 88, eComPenetration: 41, avgOwnerAge: 40, catShare: 65 },
    "Челябинская область": { regionName: "Челябинская область", petDensityIndex: 84, competitorDensityIndex: 82, eComPenetration: 34, avgOwnerAge: 41, catShare: 60 },
    "Тюменская область": { regionName: "Тюменская область", petDensityIndex: 81, competitorDensityIndex: 76, eComPenetration: 39, avgOwnerAge: 38, catShare: 62 },
    "Ханты-Мансийский автономный округ — Югра": { regionName: "Ханты-Мансийский автономный округ — Югра", petDensityIndex: 76, competitorDensityIndex: 70, eComPenetration: 46, avgOwnerAge: 35, catShare: 55 },
    "Ямало-Ненецкий автономный округ": { regionName: "Ямало-Ненецкий автономный округ", petDensityIndex: 71, competitorDensityIndex: 60, eComPenetration: 49, avgOwnerAge: 34, catShare: 50 },
    "Новосибирская область": { regionName: "Новосибирская область", petDensityIndex: 87, competitorDensityIndex: 88, eComPenetration: 43, avgOwnerAge: 40, catShare: 64 },
    "Красноярский край": { regionName: "Красноярский край", petDensityIndex: 78, competitorDensityIndex: 75, eComPenetration: 32, avgOwnerAge: 39, catShare: 60 },
    "Республика Тыва": { regionName: "Республика Тыва", petDensityIndex: 40, competitorDensityIndex: 30, eComPenetration: 15, avgOwnerAge: 30, catShare: 45 },
    "Приморский край": { regionName: "Приморский край", petDensityIndex: 80, competitorDensityIndex: 75, eComPenetration: 34, avgOwnerAge: 40, catShare: 55 },
    "Хабаровский край": { regionName: "Хабаровский край", petDensityIndex: 75, competitorDensityIndex: 70, eComPenetration: 31, avgOwnerAge: 39, catShare: 58 },
    "Республика Саха (Якутия)": { regionName: "Республика Саха (Якутия)", petDensityIndex: 68, competitorDensityIndex: 60, eComPenetration: 40, avgOwnerAge: 34, catShare: 45 },
    "Республика Беларусь": { regionName: "Республика Беларусь", petDensityIndex: 78, competitorDensityIndex: 70, eComPenetration: 28, avgOwnerAge: 42, catShare: 60 },
    "Республика Казахстан": { regionName: "Республика Казахстан", petDensityIndex: 72, competitorDensityIndex: 65, eComPenetration: 24, avgOwnerAge: 32, catShare: 50 },
    "Республика Узбекистан": { regionName: "Республика Узбекистан", petDensityIndex: 55, competitorDensityIndex: 48, eComPenetration: 15, avgOwnerAge: 29, catShare: 40 },
    "Кыргызская Республика": { regionName: "Кыргызская Республика", petDensityIndex: 50, competitorDensityIndex: 42, eComPenetration: 12, avgOwnerAge: 28, catShare: 45 },
    "Республика Таджикистан": { regionName: "Республика Таджикистан", petDensityIndex: 45, competitorDensityIndex: 38, eComPenetration: 10, avgOwnerAge: 26, catShare: 35 },
    "Азербайджан": { regionName: "Азербайджан", petDensityIndex: 60, competitorDensityIndex: 55, eComPenetration: 18, avgOwnerAge: 33, catShare: 45 },
    "Армения": { regionName: "Армения", petDensityIndex: 62, competitorDensityIndex: 56, eComPenetration: 20, avgOwnerAge: 36, catShare: 50 },
};

let output = 'export const REAL_MARKET_DATA: Record<string, MarketData> = {\n';

for (const [region, catShare] of Object.entries(result)) {
    const existing = existingData[region] || {
        regionName: region,
        petDensityIndex: 60,
        competitorDensityIndex: 60,
        eComPenetration: 30,
        avgOwnerAge: 40
    };
    output += `    "${region}": { regionName: "${region}", petDensityIndex: ${existing.petDensityIndex}, competitorDensityIndex: ${existing.competitorDensityIndex}, eComPenetration: ${existing.eComPenetration}, avgOwnerAge: ${existing.avgOwnerAge}, catShare: ${catShare} },\n`;
}

output += '};\n';

fs.writeFileSync('new_market_data.txt', output);
