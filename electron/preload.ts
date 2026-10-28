import { contextBridge, ipcRenderer } from 'electron';

// Fetch all existing persisted data synchronously on boot
let initialPayload = { data: {} as Record<string, string>, storagePath: '' };
try {
  initialPayload = ipcRenderer.sendSync('storage:get-all-sync');
} catch (err) {
  console.error('[Preload] Failed to fetch synchronous storage payload:', err);
}

const localCache = new Map<string, string>();
if (initialPayload && initialPayload.data) {
  for (const [k, v] of Object.entries(initialPayload.data)) {
    localCache.set(k, v);
  }
}

// Expose storage API directly to renderer window
contextBridge.exposeInMainWorld('electronStorage', {
  getItem: (key: string): string | null => {
    return localCache.has(key) ? localCache.get(key)! : null;
  },
  setItem: (key: string, value: string): void => {
    const strVal = String(value);
    localCache.set(key, strVal);
    ipcRenderer.send('storage:set-item', { key, value: strVal });
  },
  removeItem: (key: string): void => {
    localCache.delete(key);
    ipcRenderer.send('storage:remove-item', { key });
  },
  clear: (): void => {
    localCache.clear();
    ipcRenderer.send('storage:clear');
  },
  getAllKeys: (): string[] => {
    return Array.from(localCache.keys());
  },
  getStoragePath: (): string => {
    return initialPayload.storagePath || '';
  }
});

// Expose native window and system operations
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  getStoragePath: () => ipcRenderer.invoke('storage:get-path'),
  setStoragePath: (newPath: string) => ipcRenderer.invoke('storage:set-path', newPath),
  selectStorageDirectory: () => ipcRenderer.invoke('storage:choose-directory'),
  openStorageFolder: () => ipcRenderer.invoke('storage:open-folder'),
  saveFile: (defaultName: string, content: string) => ipcRenderer.invoke('dialog:save-file', defaultName, content),
  exportPdf: (payload: { title: string; html: string; pageFormat?: string }) => ipcRenderer.invoke('export:pdf', payload),
  // v0.7.92: user-selected backup folder (Settings → Project Local Backup & Recovery)
  chooseBackupDirectory: () => ipcRenderer.invoke('backup:choose-directory'),
  writeBackupFile: (dir: string, fileName: string, content: string) => ipcRenderer.invoke('backup:write-file', { dir, fileName, content }),
});
