import { RawDataRow } from '../types';

// Стандартные названия полей, которые мы ожидаем в приложении
interface StandardFields {
    rm: string;         // Региональный менеджер
    city: string;       // Город
    brand: string;      // Бренд
    clientName: string; // Наименование клиента
    clientType: string; // Тип клиента (Зоомагазин, Ветклиника и т.д.)
    clientAddress: string; // Адрес
    salesFact: string;  // Факт продаж (в кг или ед.)
    salesPotential: string; // Потенциал продаж
}

// Карта возможных синонимов из пользовательских файлов
const MAPPING: Record<keyof StandardFields, string[]> = {
    rm: ['рм', 'региональный менеджер', 'ответственный', 'manager'],
    city: ['город', 'регион', 'city', 'region'],
    brand: ['бренд', 'brand', 'торговая марка', 'тм'],
    clientName: ['клиент', 'наименование', 'тт', 'торговая точка', 'client', 'name'],
    clientType: ['тип клиента', 'тип тт', 'тип', 'client type', 'type'],
    clientAddress: ['адрес', 'address', 'адрес тт'],
    salesFact: ['факт', 'факт кг', 'продажи', 'sales', 'fact', 'объем'],
    salesPotential: ['потенциал', 'потенциал кг', 'potential', 'sales potential'],
};

// Функция для поиска реального названия колонки в данных по синонимам
const findHeader = (headers: string[], possibleNames: string[]): string | null => {
    const lowerCaseHeaders = headers.map(h => String(h).toLowerCase().trim());
    for (const name of possibleNames) {
        // Ищем точное совпадение или частичное, если название длинное
        const foundIndex = lowerCaseHeaders.findIndex(h => h === name || (name.length > 3 && h.includes(name)));
        if (foundIndex !== -1) {
            // Возвращаем оригинальное название из файла, чтобы получить по нему доступ
            return headers[foundIndex];
        }
    }
    return null;
};

// Функция для валидации и маппинга заголовков
export const mapHeaders = (headers: string[]): { mapped: StandardFields, errors: string[] } => {
    const mapped: Partial<StandardFields> = {};
    const errors: string[] = [];
    
    (Object.keys(MAPPING) as Array<keyof StandardFields>).forEach(key => {
        const foundHeader = findHeader(headers, MAPPING[key]);
        if (foundHeader) {
            mapped[key] = foundHeader;
        } else {
            // Обязательные поля
            if (['city', 'brand', 'clientName', 'salesFact', 'salesPotential'].includes(key)) {
                errors.push(`Не найдена обязательная колонка для "${key}". Ожидались синонимы: ${MAPPING[key].join(', ')}`);
            }
        }
    });

    return { mapped: mapped as StandardFields, errors };
};


// Функция для нормализации одной строки данных
export const normalizeRow = (row: RawDataRow, mappedHeaders: StandardFields): Record<keyof StandardFields, string | number> => {
    const normalized: any = {};
    for (const key in mappedHeaders) {
        const typedKey = key as keyof StandardFields;
        const header = mappedHeaders[typedKey];
        const value = row[header];
        
        // Преобразуем числовые поля в числа, остальное оставляем как строки
        if (['salesFact', 'salesPotential'].includes(typedKey)) {
             const num = parseFloat(String(value).replace(/,/g, '.').replace(/\s/g, ''));
             normalized[typedKey] = isNaN(num) ? 0 : num;
        } else {
             normalized[typedKey] = String(value || '').trim();
        }
    }
    // Поля по умолчанию, если они не были в файле
    if (!normalized.rm) normalized.rm = 'Не назначен';
    if (!normalized.clientType) normalized.clientType = 'Не указан';
    if (!normalized.clientAddress) normalized.clientAddress = 'Не указан';
    
    return normalized;
};
