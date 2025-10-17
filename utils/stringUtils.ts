import * as fuzz from 'fuzzball';

/**
 * Нормализует строку адреса для сравнения: приводит к нижнему регистру,
 * удаляет распространенные префиксы ('ул', 'дом' и т.д.), знаки препинания и лишние пробелы.
 */
export const normalizeAddress = (address: string): string => {
  if (!address) return '';
  return address
    .toLowerCase()
    .replace(/ул\.?|улица|проспект|д\.?|дом|литера|офис|г\.?|р-н|область|край|республика/gi, '')
    .replace(/[^a-zа-я0-9\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Нормализует строку названия для сравнения: приводит к нижнему регистру,
 * удаляет знаки препинания и лишние пробелы.
 */
export const normalizeName = (name: string): string => {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-zа-я0-9\s]/gi, '').trim();
};

/**
 * Сравнивает две строки на схожесть с использованием алгоритма Левенштейна.
 * @param threshold - Порог схожести (от 0 до 100).
 * @returns `true`, если строки похожи больше, чем на `threshold` процентов.
 */
export const isSimilar = (a: string, b: string, threshold = 85): boolean => {
  return fuzz.ratio(a, b) >= threshold;
};