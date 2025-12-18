
import { AggregatedDataRow, UnidentifiedRow, MapPoint } from '../types';

const DB_NAME = 'LimkormAnalyticsDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';

/**
 * Инициализация базы данных IndexedDB
 */
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Сохранение всего состояния данных
 */
export const saveAnalyticsState = async (state: {
  allData: AggregatedDataRow[];
  unidentifiedRows: UnidentifiedRow[];
  okbRegionCounts: Record<string, number> | null;
  dateRange?: string;
  versionHash: string;
}) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  store.put(state, 'current_state');
  
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

/**
 * Загрузка сохраненного состояния
 */
export const loadAnalyticsState = async (): Promise<any | null> => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const request = store.get('current_state');

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Очистка базы (при необходимости)
 */
export const clearAnalyticsState = async () => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.delete('current_state');
};
