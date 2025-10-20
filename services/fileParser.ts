import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { RawDataRow } from '../types';

// --- START Location Normalization ---
const CITY_TO_REGION_MAP: Record<string, string> = {
    // Federal Cities (they are their own region)
    'москва': 'Москва',
    'санкт-петербург': 'Санкт-Петербург',
    'севастополь': 'Севастополь',
    
    // Republics
    'майкоп': 'Республика Адыгея',
    'горно-алтайск': 'Республика Алтай',
    'уфа': 'Республика Башкортостан',
    'стерлитамак': 'Республика Башкортостан',
    'салават': 'Республика Башкортостан',
    'улан-удэ': 'Республика Бурятия',
    'махачкала': 'Республика Дагестан',
    'дербент': 'Республика Дагестан',
    'хасавюрт': 'Республика Дагестан',
    'магас': 'Республика Ингушетия',
    'назрань': 'Республика Ингушетия',
    'нальчик': 'Кабардино-Балкарская Республика',
    'элиста': 'Республика Калмыкия',
    'черкесск': 'Карачаево-Черкесская Республика',
    'петрозаводск': 'Республика Карелия',
    'сыктывкар': 'Республика Коми',
    'ухта': 'Республика Коми',
    'симферополь': 'Республика Крым',
    'керчь': 'Республика Крым',
    'евпатория': 'Республика Крым',
    'йошкар-ола': 'Республика Марий Эл',
    'саранск': 'Республика Мордовия',
    'якутск': 'Республика Саха (Якутия)',
    'владикавказ': 'Республика Северная Осетия — Алания',
    'казань': 'Республика Татарстан',
    'набережные челны': 'Республика Татарстан',
    'нижнекамск': 'Республика Татарстан',
    'кызыл': 'Республика Тыва',
    'ижевск': 'Удмуртская Республика',
    'абакан': 'Республика Хакасия',
    'грозный': 'Чеченская Республика',
    'чебоксары': 'Чувашская Республика',
    'новочебоксары': 'Чувашская Республика',

    // Krais
    'барнаул': 'Алтайский край',
    'бийск': 'Алтайский край',
    'чита': 'Забайкальский край',
    'петропавловск-камчатский': 'Камчатский край',
    'краснодар': 'Краснодарский край',
    'сочи': 'Краснодарский край',
    'новороссийск': 'Краснодарский край',
    'красноярск': 'Красноярский край',
    'норильск': 'Красноярский край',
    'пермь': 'Пермский край',
    'владивосток': 'Приморский край',
    'уссурийск': 'Приморский край',
    'находка': 'Приморский край',
    'ставрополь': 'Ставропольский край',
    'пятигорск': 'Ставропольский край',
    'кисловодск': 'Ставропольский край',
    'хабаровск': 'Хабаровский край',
    'комсомольск-на-амуре': 'Хабаровский край',

    // Oblasts
    'благовещенск': 'Амурская область',
    'архангельск': 'Архангельская область',
    'северодвинск': 'Архангельская область',
    'астрахань': 'Астраханская область',
    'белгород': 'Белгородская область',
    'старый оскол': 'Белгородская область',
    'брянск': 'Брянская область',
    'клинцы': 'Брянская область',
    'новозыбков': 'Брянская область',
    'владимир': 'Владимирская область',
    'ковров': 'Владимирская область',
    'муром': 'Владимирская область',
    'волгоград': 'Волгоградская область',
    'волжский': 'Волгоградская область',
    'вологда': 'Вологодская область',
    'череповец': 'Вологодская область',
    'воронеж': 'Воронежская область',
    'иваново': 'Ивановская область',
    'иркутск': 'Иркутская область',
    'братск': 'Иркутская область',
    'ангарск': 'Иркутская область',
    'калининград': 'Калининградская область',
    'калуга': 'Калужская область',
    'обнинск': 'Калужская область',
    'кемерово': 'Кемеровская область - Кузбасс',
    'новокузнецк': 'Кемеровская область - Кузбасс',
    'прокопьевск': 'Кемеровская область - Кузбасс',
    'киров': 'Кировская область',
    'кострома': 'Костромская область',
    'курган': 'Курганская область',
    'курск': 'Курская область',
    'железногорск': 'Курская область',
    'липецк': 'Липецкая область',
    'елец': 'Липецкая область',
    'магадан': 'Магаданская область',
    'мурманск': 'Мурманская область',
    'нижний новгород': 'Нижегородская область',
    'дзержинск': 'Нижегородская область',
    'великий новгород': 'Новгородская область',
    'новгород': 'Новгородская область', // Common shorter name
    'новосибирск': 'Новосибирская область',
    'омск': 'Омская область',
    'оренбург': 'Оренбургская область',
    'орск': 'Оренбургская область',
    'орёл': 'Орловская область',
    'орел': 'Орловская область',
    'ливны': 'Орловская область',
    'мценск': 'Орловская область',
    'пенза': 'Пензенская область',
    'псков': 'Псковская область',
    'ростов-на-дону': 'Ростовская область',
    'таганрог': 'Ростовская область',
    'шахты': 'Ростовская область',
    'рязань': 'Рязанская область',
    'самара': 'Самарская область',
    'тольятти': 'Самарская область',
    'саратов': 'Саратовская область',
    'энгельс': 'Саратовская область',
    'южно-сахалинск': 'Сахалинская область',
    'екатеринбург': 'Свердловская область',
    'нижний тагил': 'Свердловская область',
    'каменск-уральский': 'Свердловская область',
    'смоленск': 'Смоленская область',
    'вязьма': 'Смоленская область',
    'рославль': 'Смоленская область',
    'ярцево': 'Смоленская область',
    'десногорск': 'Смоленская область',
    'смоленский район': 'Смоленская область',
    'тамбов': 'Тамбовская область',
    'тверь': 'Тверская область',
    'томск': 'Томская область',
    'тула': 'Тульская область',
    'новомосковск': 'Тульская область',
    'тюмень': 'Тюменская область',
    'тобольск': 'Тюменская область',
    'ульяновск': 'Ульяновская область',
    'димитровград': 'Ульяновская область',
    'челябинск': 'Челябинская область',
    'магнитогорск': 'Челябинская область',
    'златоуст': 'Челябинская область',
    'ярославль': 'Ярославская область',
    'рыбинск': 'Ярославская область',
    
    // Autonomous Oblast
    'биробиджан': 'Еврейская автономная область',

    // Autonomous Okrugs
    'нарьян-мар': 'Ненецкий автономный округ',
    'ханты-мансийск': 'Ханты-Мансийский автономный округ - Югра',
    'сургут': 'Ханты-Мансийский автономный округ - Югра',
    'нижневартовск': 'Ханты-Мансийский автономный округ - Югра',
    'анадырь': 'Чукотский автономный округ',
    'салехард': 'Ямало-Ненецкий автономный округ',
    'новый уренгой': 'Ямало-Ненецкий автономный округ',
    'ноябрьск': 'Ямало-Ненецкий автономный округ',
};
// --- END Location Normalization ---

const processJsonData = (json: any[]): { processedData: RawDataRow[], uniqueLocations: Set<string>, existingClientsByRegion: Record<string, string[]> } => {
    if (json.length === 0) {
        throw new Error("Файл пуст или имеет неверный формат.");
    }

    const fileHeaders = Object.keys(json[0] as object);
    const normalizeHeader = (header: string) => String(header || '').toLowerCase().trim().replace(/\s+/g, ' ');

    const HEADER_ALIASES = {
        rm: ['рм', 'региональный менеджер', 'rm', 'regional manager'],
        brand: ['бренд', 'brand', 'торговая марка'],
        city: ['адрес тт limkorm', 'город', 'city', 'адрес поставки', 'адрес'],
        fact: ['вес, кг', 'факт (кг/ед)', 'факт', 'fact', 'факт (кг)'],
    };

    const findHeaderKey = (headers: string[], aliases: string[]) => {
        for (const header of headers) {
            if (aliases.includes(normalizeHeader(header))) return header;
        }
        return null;
    };

    const headerMap = {
        rm: findHeaderKey(fileHeaders, HEADER_ALIASES.rm),
        brand: findHeaderKey(fileHeaders, HEADER_ALIASES.brand),
        city: findHeaderKey(fileHeaders, HEADER_ALIASES.city),
        fact: findHeaderKey(fileHeaders, HEADER_ALIASES.fact),
    };

    const requiredHeaders = { rm: "'РМ'", city: "'Адрес' или 'Город'", fact: "'Факт' или 'Вес, кг'" };
    const missing = Object.entries(requiredHeaders)
        .filter(([key]) => !headerMap[key as keyof typeof headerMap])
        .map(([, value]) => value)
        .join(', ');

    if (missing) {
        throw new Error(`Не найдены обязательные столбцы: ${missing}.`);
    }

    const uniqueLocations = new Set<string>();
    const existingClientsByRegion: Record<string, string[]> = {};

    const processedData = (json as any[]).map((row): RawDataRow | null => {
        const rm = String(row[headerMap.rm!] || '').trim();
        const brand = String(row[headerMap.brand!] || 'Не указан').trim();
        const factValue = String(row[headerMap.fact!] || '0').replace(',', '.');
        const fact = parseFloat(factValue) || 0;
        
        const fullAddress = String(row[headerMap.city!] || '').trim();
        
        let location = '';
        let regionFound = '';
        const addressParts = fullAddress.replace(/^\d{6},?/, '').split(',').map(p => p.trim()).filter(Boolean);

        const regionPart = addressParts.find(p => 
            /область|край|республика|автономный округ|ао|аобл/i.test(p)
        );
        if (regionPart) {
            regionFound = regionPart.trim();
        }

        const cityPart = addressParts.find(p => p.toLowerCase().startsWith('г ') || p.toLowerCase().startsWith('г.'));
        const districtPart = addressParts.find(p => p.toLowerCase().includes(' р-н') || p.toLowerCase().includes(' район'));
        
        let mainLocationPart = '';
        if (cityPart) {
            mainLocationPart = cityPart.replace(/^[г|Г]\.?\s*/, '').trim();
        } else if (districtPart) {
            mainLocationPart = districtPart.trim();
        } else {
            mainLocationPart = addressParts[1] || addressParts[0] || '';
        }
        mainLocationPart = mainLocationPart.trim();

        if (regionFound) {
            location = regionFound;
        } else {
            const normalizedLocation = mainLocationPart.toLowerCase().replace(/ё/g, 'е');
            location = CITY_TO_REGION_MAP[normalizedLocation] || '';
        }

        if (rm && location && brand) {
            uniqueLocations.add(location);
            if (!existingClientsByRegion[location]) {
                existingClientsByRegion[location] = [];
            }
            if (fullAddress && !existingClientsByRegion[location].includes(fullAddress)) {
                existingClientsByRegion[location].push(fullAddress);
            }
                return { rm, brand, city: location, fact, fullAddress };
        }
        return null;

    }).filter((item): item is RawDataRow => item !== null);
    
    if (processedData.length === 0) throw new Error("В файле не найдено корректных строк с данными, которые можно сопоставить с регионами. Проверьте адреса или содержимое столбцов.");

    return { processedData, uniqueLocations, existingClientsByRegion };
};

type ParserResult = { 
    processedData: RawDataRow[], 
    uniqueLocations: Set<string>, 
    existingClientsByRegion: Record<string, string[]> 
};

export const parseFile = (file: File): Promise<ParserResult> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Ошибка чтения файла."));

        if (file.name.toLowerCase().endsWith('.csv')) {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    try {
                        resolve(processJsonData(results.data as any[]));
                    } catch (error) {
                        reject(error);
                    }
                },
                error: (error: any) => reject(new Error(`Ошибка парсинга CSV: ${error.message}`))
            });
        } else { // Assume .xlsx, .xls
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    if (!data) return reject(new Error("Не удалось прочитать файл."));
                    
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    if (!sheetName) return reject(new Error("В файле .xlsx не найдено листов."));
                    
                    const worksheet = workbook.Sheets[sheetName];
                    const json: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                    
                    resolve(processJsonData(json));
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";
                    reject(new Error(`Не удалось разобрать файл .xlsx. Убедитесь, что он имеет корректный формат. (${errorMessage})`));
                }
            };
            reader.readAsArrayBuffer(file);
        }
    });
};