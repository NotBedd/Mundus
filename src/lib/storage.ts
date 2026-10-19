/**
 * Universal Storage Layer for Mundus.
 * 
 * In Electron Desktop Mode:
 * - Uses native local filesystem storage via window.electronStorage.
 * - Reads/writes directly to organized, human-readable JSON files on your disk
 *   (e.g., documents.json, characters.json, codex_entries.json, settings.json).
 * - Overrides window.localStorage so all systems automatically persist to disk.
 * - Allows users to choose their custom local storage directory (e.g. app directory,
 *   Documents folder, Dropbox, external drive).
 * 
 * In Web Browser / AI Studio Mode:
 * - Gracefully persists to browser localStorage with no errors or latency.
 */

/**
 * Safely stringifies objects breaking cyclic references and limiting depth
 */
export function safeJsonStringify(data: any): string {
  const seen = new WeakSet();
  try {
    return JSON.stringify(data, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return undefined; // cycle broken
        }
        seen.add(value);
      }
      return value;
    });
  } catch (err) {
    console.warn('[safeJsonStringify] Fallback due to serialization issue:', err);
    return JSON.stringify(Array.isArray(data) ? [] : {});
  }
}

class UniversalStorage {
  private inMemoryCache: Map<string, string> = new Map();
  private _isElectronCache: boolean | null = null;
  private nativeLocalStorage: Storage | null = null;

  constructor() {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        this.nativeLocalStorage = window.localStorage;
      } catch {
        // Storage access blocked or restricted
      }
    }
    this.init();
  }

  private init() {
    // If running under Electron with native preload storage
    if (typeof window !== 'undefined' && window.electronStorage) {
      try {
        const keys = window.electronStorage.getAllKeys();
        for (const k of keys) {
          const val = window.electronStorage.getItem(k);
          if (val !== null) {
            this.inMemoryCache.set(k, val);
          }
        }

        // Install seamless proxy/override on window.localStorage
        this.installLocalStorageShim();
      } catch (err) {
        console.error('Failed to initialize Electron local storage:', err);
      }
    }
  }

  private installLocalStorageShim() {
    if (typeof window === 'undefined' || !window.electronStorage) return;

    try {
      const originalStorage = window.localStorage;
      
      // Override methods on localStorage so any existing code or third-party libraries
      // immediately write to Electron's real disk files
      const storageShim = {
        getItem: (key: string): string | null => {
          return this.getItem(key);
        },
        setItem: (key: string, value: string): void => {
          this.setItem(key, value);
        },
        removeItem: (key: string): void => {
          this.removeItem(key);
        },
        clear: (): void => {
          this.clear();
        },
        key: (index: number): string | null => {
          const keys = window.electronStorage ? window.electronStorage.getAllKeys() : [];
          return keys[index] || null;
        },
        get length(): number {
          const keys = window.electronStorage ? window.electronStorage.getAllKeys() : [];
          return keys.length;
        }
      };

      Object.defineProperty(window, 'localStorage', {
        value: new Proxy(originalStorage, {
          get: (target, prop: string) => {
            if (prop in storageShim) {
              return (storageShim as any)[prop];
            }
            return (target as any)[prop];
          }
        }),
        configurable: true,
        writable: true
      });
    } catch (e) {
      console.warn('Could not wrap window.localStorage with Electron storage proxy:', e);
    }
  }

  getItem(key: string): string | null {
    if (typeof window !== 'undefined' && window.electronStorage) {
      const val = window.electronStorage.getItem(key);
      if (val !== null) return val;
      if (this.inMemoryCache.has(key)) return this.inMemoryCache.get(key)!;
      return null;
    }
    
    if (this.nativeLocalStorage) {
      try {
        return this.nativeLocalStorage.getItem(key);
      } catch {
        // Storage access blocked or restricted
      }
    } else {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(key);
        }
      } catch {
        // Storage access blocked or restricted
      }
    }
    return this.inMemoryCache.get(key) || null;
  }

  setItem(key: string, value: string): void {
    const strVal = String(value);
    this.inMemoryCache.set(key, strVal);

    if (typeof window !== 'undefined' && window.electronStorage) {
      try {
        window.electronStorage.setItem(key, strVal);
      } catch (err) {
        console.error(`[ElectronStorage] Error saving key "${key}":`, err);
      }
      return;
    }

    if (this.nativeLocalStorage) {
      try {
        this.nativeLocalStorage.setItem(key, strVal);
      } catch (err) {
        // Ignore browser quota errors or restricted environment
      }
    } else {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, strVal);
        }
      } catch (err) {
        // Ignore browser quota errors or restricted environment
      }
    }
  }

  removeItem(key: string): void {
    this.inMemoryCache.delete(key);

    if (typeof window !== 'undefined' && window.electronStorage) {
      try {
        window.electronStorage.removeItem(key);
      } catch (err) {
        console.error(`[ElectronStorage] Error removing key "${key}":`, err);
      }
      return;
    }

    if (this.nativeLocalStorage) {
      try {
        this.nativeLocalStorage.removeItem(key);
      } catch {
        // Ignore
      }
    } else {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
        }
      } catch {
        // Ignore
      }
    }
  }

  clear(): void {
    this.inMemoryCache.clear();

    if (typeof window !== 'undefined' && window.electronStorage) {
      try {
        window.electronStorage.clear();
      } catch (err) {
        console.error('[ElectronStorage] Error clearing storage:', err);
      }
      return;
    }

    if (this.nativeLocalStorage) {
      try {
        this.nativeLocalStorage.clear();
      } catch {
        // Ignore
      }
    } else {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.clear();
        }
      } catch {
        // Ignore
      }
    }
  }

  isElectron(): boolean {
    if (this._isElectronCache !== null) return this._isElectronCache;
    this._isElectronCache = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);
    return this._isElectronCache;
  }

  async getStoragePath(): Promise<string> {
    if (this.isElectron() && window.electronAPI) {
      return await window.electronAPI.getStoragePath();
    }
    return 'Browser LocalStorage';
  }

  async selectDirectory(): Promise<string | null> {
    if (this.isElectron() && window.electronAPI) {
      return await window.electronAPI.selectStorageDirectory();
    }
    return null;
  }

  async openStorageFolder(): Promise<void> {
    if (this.isElectron() && window.electronAPI) {
      await window.electronAPI.openStorageFolder();
    }
  }
}

export const appStorage = new UniversalStorage();
