import { AggregatedDataRow } from '../types';

type DataRow = Record<string, any>;

// Безопасное преобразование в число
function safeNum(value: any): number {
    const num = Number(value);
    return isFinite(num) ? num : 0;
}

// Группировка массива объектов по ключу
export function groupBy<T extends DataRow>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const val = String(item[key] ?? 'N/A');
    if (!acc[val]) acc[val] = [];
    acc[val].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

// Суммирование значений по ключу в массиве объектов
export function sum<T extends DataRow>(arr: T[], key: keyof T): number {
  return arr.reduce((s, i) => s + safeNum(i[key]), 0);
}

// Поиск топ-элемента в сгруппированных данных
export function findTop<T extends DataRow>(groups: Record<string, T[]>, key: keyof T): { name: string, total: number } {
  const top = Object.entries(groups)
    .map(([name, rows]) => ({ name, total: sum(rows, key) }))
    .sort((a, b) => b.total - a.total)[0];
  return top || { name: 'N/A', total: 0 };
}

// Комплексный расчет всех основных метрик
export function calculateMetrics(data: AggregatedDataRow[]): {
    totalSales: number;
    totalWeight: number;
    avgSales: number;
    avgWeight: number;
    topRM: { name: string; total: number; };
    topBrand: { name: string; total: number; };
    regionPerformance: { region: string; sales: number; kg: number; }[];
} {
  const totalSales = sum(data, "fact");
  const totalWeight = sum(data, "potential"); // Пример, можно использовать 'fact' или 'potential'
  const byRM = groupBy(data, "rm");
  const byRegion = groupBy(data, "city");
  const byBrand = groupBy(data, "brand");

  return {
    totalSales,
    totalWeight,
    avgSales: totalSales / data.length || 0,
    avgWeight: totalWeight / data.length || 0,
    topRM: findTop(byRM, "fact"),
    topBrand: findTop(byBrand, "fact"),
    regionPerformance: Object.entries(byRegion).map(([region, rows]) => ({
      region,
      sales: sum(rows, "fact"),
      kg: sum(rows, "potential"),
    })),
  };
}