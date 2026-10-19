// IndexedDB Persistent Storage for Large Map Images & Metadata
// Allows storing full-resolution maps (32MB+) without encountering localStorage 5MB quota errors.

const DB_NAME = 'mundus_map_store_db';
const DB_VERSION = 1;
const STORE_NAME = 'mundus_maps';

export interface StoredLocalMap {
  mundusId: string;
  blob: Blob | File;
  fileName: string;
  width: number;
  height: number;
  worldName?: string;
  updatedAt: string;
}

function openMapDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not available in this environment.'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'mundusId' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB map database.'));
    };
  });
}

/**
 * Saves a map file/blob and metadata into IndexedDB for the given Mundus world.
 * Automatically replaces any previous map stored for this Mundus ID.
 */
export async function saveLocalMapImage(
  mundusId: string,
  blobOrFile: Blob | File,
  metadata: { fileName: string; width: number; height: number; worldName?: string }
): Promise<void> {
  try {
    const db = await openMapDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const record: StoredLocalMap = {
        mundusId,
        blob: blobOrFile,
        fileName: metadata.fileName || 'World Map',
        width: metadata.width,
        height: metadata.height,
        worldName: metadata.worldName,
        updatedAt: new Date().toISOString(),
      };

      const putReq = store.put(record);

      putReq.onsuccess = () => {
        resolve();
      };

      putReq.onerror = () => {
        reject(putReq.error);
      };

      tx.oncomplete = () => {
        db.close();
      };
    });
  } catch (err) {
    console.error('Failed to save map image to IndexedDB:', err);
    throw err;
  }
}

/**
 * Retrieves the local map record for the given Mundus world from IndexedDB.
 * Returns an object with an object URL (`blobUrl`) that can be safely used in `<img src>` or Leaflet.
 */
export async function getLocalMapImage(
  mundusId: string
): Promise<{ blobUrl: string; blob: Blob | File; fileName: string; width: number; height: number; worldName?: string } | null> {
  try {
    const db = await openMapDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(mundusId);

      getReq.onsuccess = () => {
        const record = getReq.result as StoredLocalMap | undefined;
        if (record && record.blob) {
          const blobUrl = URL.createObjectURL(record.blob);
          resolve({
            blobUrl,
            blob: record.blob,
            fileName: record.fileName || 'World Map',
            width: record.width,
            height: record.height,
            worldName: record.worldName,
          });
        } else {
          resolve(null);
        }
      };

      getReq.onerror = () => {
        reject(getReq.error);
      };

      tx.oncomplete = () => {
        db.close();
      };
    });
  } catch (err) {
    console.warn('Could not read map from IndexedDB:', err);
    return null;
  }
}

/**
 * Updates the local map metadata (e.g. worldName or dimensions) in IndexedDB.
 */
export async function updateLocalMapMetadata(
  mundusId: string,
  metadata: Partial<{ fileName: string; width: number; height: number; worldName: string }>
): Promise<void> {
  try {
    const db = await openMapDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(mundusId);

      getReq.onsuccess = () => {
        const record = getReq.result as StoredLocalMap | undefined;
        if (record) {
          const updated: StoredLocalMap = {
            ...record,
            ...metadata,
            updatedAt: new Date().toISOString(),
          };
          store.put(updated);
        }
        resolve();
      };

      getReq.onerror = () => {
        reject(getReq.error);
      };

      tx.oncomplete = () => {
        db.close();
      };
    });
  } catch (err) {
    console.warn('Could not update map metadata in IndexedDB:', err);
  }
}

/**
 * Deletes the local map record from IndexedDB for a given Mundus world.
 */
export async function deleteLocalMapImage(mundusId: string): Promise<void> {
  try {
    const db = await openMapDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const delReq = store.delete(mundusId);

      delReq.onsuccess = () => {
        resolve();
      };

      delReq.onerror = () => {
        reject(delReq.error);
      };

      tx.oncomplete = () => {
        db.close();
      };
    });
  } catch (err) {
    console.error('Failed to delete map from IndexedDB:', err);
  }
}
