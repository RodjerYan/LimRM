
import { AggregatedDataRow, UnidentifiedRow, OkbDataRow, OkbStatus } from '../types';

const DB_NAME = 'LimkormAnalyticsDB';
// Увеличиваем версию, чтобы триггернуть обновление схемы
const DB_VERSION = 5; 
const STORE_NAME = 'app_state';

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      // Очищаем старое хранилище кэша, если оно есть
      if (db.objectStoreNames.contains('okb_cache')) {
        db.deleteObjectStore('okb_cache');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Сохранение состояния аналитики.
 */
export const saveAnalyticsState = async (state: {
  allData: AggregatedDataRow[];
  unidentifiedRows: UnidentifiedRow[];
  okbRegionCounts: Record<string, number> | null;
  okbData: OkbDataRow[];
  okbStatus: OkbStatus | null;
  dateRange?: string;
  totalRowsProcessed: number;
  processedFileIds?: string[]; // NEW
  versionHash: string;
}) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  // Исключаем "тяжелые" данные из сохранения в IndexedDB
  const { okbData, okbStatus, ...stateToSave } = state; 
  
  store.put(stateToSave, 'current_state');
  
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

/**
 * Загрузка сохраненного состояния.
 */
export const loadAnalyticsState = async (): Promise<any | null> => {
  const db = await initDB();
  
  const tx = db.transaction(STORE_NAME, 'readonly');
  const stateStore = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
      const req = stateStore.get('current_state');
      req.onsuccess = () => {
          const result = req.result;
          if (result) {
              // Возвращаем пустые okbData, чтобы спровоцировать fetch в компоненте
              resolve({ 
                  ...result, 
                  okbData: [],
                  okbStatus: null 
              });
          } else {
              resolve(null);
          }
      };
      req.onerror = () => reject(req.error);
  });
};

/**
 * Полная очистка состояния аналитики из БД.
 */
export const clearAnalyticsState = async () => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  return new Promise<void>((resolve, reject) => {
    const req = store.delete('current_state');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};
