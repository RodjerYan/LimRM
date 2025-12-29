
import { AggregatedDataRow, UnidentifiedRow, OkbDataRow, OkbStatus } from '../types';

const DB_NAME = 'LimkormAnalyticsDB';
const DB_VERSION = 3; 
const STORE_NAME = 'app_state';

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      // Clean up old stores if they exist from previous versions
      if (db.objectStoreNames.contains('okb_cache')) {
        db.deleteObjectStore('okb_cache');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Сохранение состояния аналитики (только легкие данные: фильтры, агрегаты).
 * КРИТИЧНО: Мы НЕ сохраняем okbData, чтобы каждый раз загружать свежую версию с сервера.
 */
export const saveAnalyticsState = async (state: {
  allData: AggregatedDataRow[];
  unidentifiedRows: UnidentifiedRow[];
  okbRegionCounts: Record<string, number> | null;
  okbData: OkbDataRow[];
  okbStatus: OkbStatus | null;
  dateRange?: string;
  totalRowsProcessed: number;
  versionHash: string;
}) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  // EXCLUDE okbData and okbStatus from persistence.
  // This forces the app to re-fetch OKB from the API (which is cached on CDN) on every reload.
  const { okbData, okbStatus, ...stateToSave } = state; 
  
  store.put(stateToSave, 'current_state');
  
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
  const stateStore = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
      const req = stateStore.get('current_state');
      req.onsuccess = () => {
          const result = req.result;
          if (result) {
              // Return state with empty okbData, app will fetch it from API
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

export const clearAnalyticsState = async () => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete('current_state');
};