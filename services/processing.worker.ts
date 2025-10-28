
import * as XLSX from 'xlsx';
import { AggregatedDataRow, OkbDataRow } from '../types';
import { normalizeString, findBestOkbMatch, extractRegionFromOkb } from '../utils/dataUtils';

// Интерфейс для промежуточной сгруппированной по регионам структуры
interface RegionGroupedRow {
    rm: string;
    brand: string;
    region: string;
    fact: number;
    potential: number;
    clients: string[]; // Список исходных клиентов/адресов в группе
}

// Ожидаемые названия колонок для надёжности
const COLUMNS = {
    RM: 'РМ',
    CLIENT_NAME: 'Клиент',
    BRAND: 'Бренд',
    CITY: 'Город',
    FACT: 'Факт',
    POTENTIAL: 'Потенциал'
};

self.onmessage = async (e: MessageEvent<{ file: File, okbData: OkbDataRow[] }>) => {
    const { file, okbData } = e.data;

    try {
        postMessage({ type: 'progress', payload: { percentage: 5, message: 'Чтение файла...' } });
        
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        // Используем { raw: false } для чтения отформатированных строк, что помогает с числами вида "0,400"
        const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { raw: false });

        if (jsonData.length === 0) {
            throw new Error('Файл пуст или имеет неверный формат.');
        }
        
        postMessage({ type: 'progress', payload: { percentage: 15, message: 'Нормализация данных ОКБ...' } });

        const normalizedOkbData = okbData.map(okb => ({
            ...okb,
            normalizedName: normalizeString(okb['Наименование']),
        }));

        postMessage({ type: 'progress', payload: { percentage: 25, message: 'Анализ и группировка по регионам...' } });
        
        const groupedData: Map<string, RegionGroupedRow> = new Map();
        const totalRows = jsonData.length;

        jsonData.forEach((row, index) => {
            const clientName = row[COLUMNS.CLIENT_NAME] || 'Не указан';
            if (clientName === 'Не указан') return; // Пропускаем строки без имени клиента

            const rm = row[COLUMNS.RM] || 'Не указан';
            const brand = row[COLUMNS.BRAND] || 'Не указан';
            const city = row[COLUMNS.CITY] || 'Не указан';
            
            // Обрабатываем запятую как десятичный разделитель
            const factStr = String(row[COLUMNS.FACT] || '0').replace(',', '.');
            const potentialStr = String(row[COLUMNS.POTENTIAL] || '0').replace(',', '.');
            
            const fact = parseFloat(factStr) || 0;
            let potential = parseFloat(potentialStr) || 0;
            
            // Если потенциал не указан, рассчитываем его с ростом 15%
            if (potential === 0 && fact > 0) {
                potential = fact * 1.15;
            }

            // Ключевой шаг: определяем регион для каждой строки
            const okbMatch = findBestOkbMatch(clientName, city, normalizedOkbData);
            const region = okbMatch ? extractRegionFromOkb(okbMatch) : 'Регион не определен';
            
            // Новый ключ группировки: РЕГИОН-БРЕНД-РМ
            const groupKey = `${region}|${brand}|${rm}`;

            if (!groupedData.has(groupKey)) {
                groupedData.set(groupKey, {
                    rm,
                    brand,
                    region,
                    fact: 0,
                    potential: 0,
                    clients: [],
                });
            }

            const group = groupedData.get(groupKey)!;
            group.fact += fact;
            group.potential += potential;
            
            // Сохраняем оригинальные данные клиента для модального окна
            const clientDetailString = `${clientName}, ${city}`;
            group.clients.push(clientDetailString);

            if (index > 0 && index % 100 === 0) {
                const percentage = 25 + Math.round((index / totalRows) * 60);
                postMessage({ type: 'progress', payload: { percentage, message: `Обработано ${index} из ${totalRows} строк...` } });
            }
        });

        postMessage({ type: 'progress', payload: { percentage: 90, message: 'Формирование итогов...' } });

        const aggregatedResults: AggregatedDataRow[] = [];
        for (const [key, group] of groupedData.entries()) {
            const growthPotential = Math.max(0, group.potential - group.fact);
            const growthPercentage = group.potential > 0 ? (growthPotential / group.potential) * 100 : 0;

            aggregatedResults.push({
                key: key,
                rm: group.rm,
                clientName: `${group.region} (${group.brand})`, // Отображаемое имя группы
                brand: group.brand,
                city: group.region, // Для обратной совместимости, но теперь содержит регион
                region: group.region,
                fact: group.fact,
                potential: group.potential,
                growthPotential,
                growthPercentage,
                clients: [...new Set(group.clients)], // Уникальные клиенты
            });
        }

        postMessage({ type: 'progress', payload: { percentage: 100, message: 'Готово!' } });
        postMessage({ type: 'result', payload: aggregatedResults });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Произошла неизвестная ошибка в воркере.';
        console.error('Processing worker error:', error);
        postMessage({ type: 'error', payload: errorMessage });
    }
};
