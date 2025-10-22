import * as XLSX from 'xlsx';

// --- Helper Functions ---
const normalizeAddress = (str: string | undefined): string => {
    if (!str) return '';
    return str.toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^а-яa-z0-9]/g, '');
};

const determineCityFromAddress = (fullAddress: string): string => {
    if (!fullAddress) return 'Не определен';
    
    const parts = fullAddress.split(/[,;]/).map(p => p.trim());
    const addressWithoutIndex = parts.filter(p => !/^\d{6}$/.test(p));

    for (const part of addressWithoutIndex) {
        if (part.toLowerCase().startsWith('г.') || part.toLowerCase().startsWith('город')) {
            return part.replace(/^(г\.?|город)\s*/i, '').trim();
        }
    }

    if (addressWithoutIndex.length > 1) {
        const potentialCity = addressWithoutIndex[1];
        if (potentialCity && isNaN(parseInt(potentialCity, 10))) {
            return potentialCity;
        }
    }
    
    return addressWithoutIndex[0] || 'Не определен';
};

const MIN_GROWTH_RATE = 0.05;
const MAX_GROWTH_RATE = 0.80;
const BASE_GROWTH_RATE = 0.15;

function calculateRealisticGrowthRate(fact: number, potentialTTs: number): number {
    let growthRate = BASE_GROWTH_RATE;
    const saturationFactor = Math.max(0.1, 1 - (fact / 10000));
    growthRate *= saturationFactor;
    let cityMultiplier = 1.0;
    if (potentialTTs <= 10) cityMultiplier = 1.0;
    else if (potentialTTs <= 30) cityMultiplier = 1.3;
    else if (potentialTTs <= 100) cityMultiplier = 1.6;
    else cityMultiplier = 2.0;
    growthRate *= cityMultiplier;
    const randomVariation = 0.8 + (Math.random() * 0.4);
    growthRate *= randomVariation;
    return Math.max(MIN_GROWTH_RATE, Math.min(growthRate, MAX_GROWTH_RATE));
}

// --- File Parser for User's File (АКБ) ---
const parseUserFile = (file: File): Promise<{ processedData: any[], akbAddressSet: Set<string> }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                if (!e.target?.result) throw new Error("Не удалось прочитать файл АКБ.");
                const data = new Uint8Array(e.target.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet) as any[];

                const akbAddressSet = new Set<string>();
                const akbDataMap = new Map<string, any>();

                json.forEach((row) => {
                    const brand = String(row['Бренд'] || row['brand'] || 'Не указан').trim();
                    const fact = Number(String(row['Факт (кг/ед)'] || row['fact'] || 0).replace(',', '.'));
                    const fullAddress = String(row['Адрес'] || row['address'] || '').trim();
                    const rm = String(row['РМ'] || row['rm'] || 'Не указан').trim();
                    const city = String(row['Город'] || row['city'] || determineCityFromAddress(fullAddress)).trim();
                    
                    if(fullAddress) {
                        akbAddressSet.add(normalizeAddress(fullAddress));
                    }

                    if (rm !== 'Не указан' && city && brand !== 'Не указан') {
                        const key = `${rm}|${brand}|${city}`;
                        const existing = akbDataMap.get(key) || { rm, brand, city, fact: 0, fullAddress: city };
                        existing.fact += fact;
                        akbDataMap.set(key, existing);
                    }
                });
                
                const processedData = Array.from(akbDataMap.values());

                if (processedData.length === 0) throw new Error("В файле АКБ не найдено корректных данных. Проверьте названия колонок: 'РМ', 'Бренд', 'Город', 'Факт (кг/ед)'.");
                
                resolve({ processedData, akbAddressSet });

            } catch (error) {
                reject(error instanceof Error ? error : new Error("Не удалось разобрать файл АКБ."));
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};

// --- Main Worker Logic ---
self.onmessage = async (e: MessageEvent<{ file: File }>) => {
    const { file } = e.data;

    try {
        self.postMessage({ type: 'progress', payload: { status: 'fetching', progress: 5, text: 'Загрузка мастер-базы ОКБ...', etr: '' } });
        
        // ИСПРАВЛЕНО: Воркер сам загружает данные ОКБ, чтобы не блокировать основной поток
        const okbResponse = await fetch('/api/get-okb');
        if (!okbResponse.ok) {
            const errorData = await okbResponse.json();
            throw new Error(errorData.details || 'Не удалось загрузить базу ОКБ с сервера.');
        }
        const okbData = await okbResponse.json();
        
        if (!okbData || okbData.length === 0) {
            throw new Error('База ОКБ пуста или не была загружена. Сначала обновите её.');
        }

        self.postMessage({ type: 'progress', payload: { status: 'reading', progress: 20, text: 'Чтение и агрегация файла АКБ...', etr: '' } });
        const { processedData: akbData, akbAddressSet } = await parseUserFile(file);

        self.postMessage({ type: 'progress', payload: { status: 'aggregating', progress: 40, text: 'Поиск потенциальных клиентов...', etr: '' } });
        
        const potentialClients = okbData.filter(okbClient => 
            !akbAddressSet.has(normalizeAddress(okbClient['Адрес']))
        );

        const potentialClientsByCity = new Map<string, any[]>();
        for (const client of potentialClients) {
            // ВАЖНО: Ключом для группировки должен быть город, а не регион.
            // Структура ответа Apps Script должна содержать поле 'Город или населенный пункт'
            const city = client['Город или населенный пункт'] || client['Регион'] || 'Неизвестный город';
            if (!potentialClientsByCity.has(city)) {
                potentialClientsByCity.set(city, []);
            }
            potentialClientsByCity.get(city)!.push({
                name: client['Наименование'],
                address: client['Адрес'],
                phone: client['Контакты'],
                type: client['Категория'],
                lat: parseFloat(client['Широта']),
                lon: parseFloat(client['Долгота']),
            });
        }

        self.postMessage({ type: 'progress', payload: { status: 'aggregating', progress: 70, text: 'Расчет рыночного потенциала...', etr: '' } });
        
        const dataWithPotential = akbData.map(item => {
            const clientsForCity = potentialClientsByCity.get(item.city) || [];
            const potentialTTs = clientsForCity.length;
            
            const growthRate = calculateRealisticGrowthRate(item.fact, potentialTTs);
            const potential = item.fact * (1 + growthRate);
            const growthPotential = potential - item.fact;

            return { 
                ...item, 
                potential, 
                growthPotential, 
                growthRate: growthRate * 100, 
                potentialTTs, 
                potentialClients: clientsForCity 
            };
        });
        
        self.postMessage({ type: 'progress', payload: { status: 'done', progress: 100, text: 'Финализация результатов...', etr: '' } });
        
        self.postMessage({ type: 'result', payload: dataWithPotential });

    } catch (error) {
        self.postMessage({ type: 'error', payload: error instanceof Error ? error.message : "Произошла неизвестная ошибка в фоновом обработчике." });
    }
};
