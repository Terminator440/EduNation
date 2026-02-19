/**
 * Persistență IndexedDB pentru coada de acțiuni offline.
 * La eșec de rețea, mutațiile sunt salvate aici și refăcute la reconectare.
 */

const DB_NAME = "edunation_offline_queue";
const STORE_NAME = "queue";
const DB_VERSION = 1;

export type OfflineQueueItemType =
  | "add_grade"
  | "update_grade"
  | "delete_grade"
  | "add_attendance"
  | "update_attendance"
  | "delete_attendance";

export interface OfflineQueueItem {
  id: string;
  type: OfflineQueueItemType;
  payload: unknown;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => T | Promise<T>
): Promise<T> {
  return openDb().then((db) => {
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const result = fn(store);
      const done = (value: T) => {
        db.close();
        resolve(value);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      if (result instanceof Promise) {
        result.then(done).catch((err) => {
          db.close();
          reject(err);
        });
      } else {
        tx.oncomplete = () => done(result as T);
      }
    });
  });
}

export function addToOfflineQueue(item: Omit<OfflineQueueItem, "createdAt">): Promise<void> {
  const full: OfflineQueueItem = {
    ...item,
    createdAt: Date.now(),
  };
  return withStore("readwrite", (store) => {
    store.add(full);
  });
}

export function getOfflineQueue(): Promise<OfflineQueueItem[]> {
  return withStore("readonly", (store) => {
    return new Promise<OfflineQueueItem[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as OfflineQueueItem[]) || [];
        rows.sort((a, b) => a.createdAt - b.createdAt);
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

export function removeFromOfflineQueue(id: string): Promise<void> {
  return withStore("readwrite", (store) => {
    store.delete(id);
  });
}

export function clearOfflineQueue(): Promise<void> {
  return withStore("readwrite", (store) => {
    store.clear();
  });
}

export function getOfflineQueueLength(): Promise<number> {
  return withStore("readonly", (store) => {
    return new Promise<number>((resolve, reject) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}
