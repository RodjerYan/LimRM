
import { AggregatedDataRow, UnidentifiedRow, OkbDataRow, OkbStatus, FilterState } from '../types';

const DB_NAME = 'LimkormAnalyticsDB';
// Increase version to trigger schema upgrade if needed (though we just use object store)
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
      // Clean up old cache store if it exists
      if (db.objectStoreNames.contains('okb_cache')) {
        db.deleteObjectStore('okb_cache');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Saves the analytics state to IndexedDB.
 */
export const saveAnalyticsState = async (state: {
  allData: AggregatedDataRow[];
  unidentifiedRows: UnidentifiedRow[];
  okbRegionCounts: Record<string, number> | null;
  okbData: OkbDataRow[];
  okbStatus: OkbStatus | null;
  dateRange?: string;
  totalRowsProcessed: number;
  processedFileIds?: string[]; 
  versionHash: string;
  filters?: FilterState;
  lastSync?: number;
}) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  // Exclude heavy data that shouldn't be persisted here or is static
  const { okbData, okbStatus, ...stateToSave } = state; 
  
  store.put(stateToSave, 'current_state');
  
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

/**
 * Loads the saved analytics state.
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
              // Return empty okbData to trigger fetch in component if needed, 
              // or rely on component to re-fetch/re-hydrate
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
 * Clears the analytics state from DB.
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
