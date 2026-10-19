// electron/preload.ts
var import_electron = require("electron");
var initialPayload = { data: {}, storagePath: "" };
try {
  initialPayload = import_electron.ipcRenderer.sendSync("storage:get-all-sync");
} catch (err) {
  console.error("[Preload] Failed to fetch synchronous storage payload:", err);
}
var localCache = /* @__PURE__ */ new Map();
if (initialPayload && initialPayload.data) {
  for (const [k, v] of Object.entries(initialPayload.data)) {
    localCache.set(k, v);
  }
}
import_electron.contextBridge.exposeInMainWorld("electronStorage", {
  getItem: (key) => {
    return localCache.has(key) ? localCache.get(key) : null;
  },
  setItem: (key, value) => {
    const strVal = String(value);
    localCache.set(key, strVal);
    import_electron.ipcRenderer.send("storage:set-item", { key, value: strVal });
  },
  removeItem: (key) => {
    localCache.delete(key);
    import_electron.ipcRenderer.send("storage:remove-item", { key });
  },
  clear: () => {
    localCache.clear();
    import_electron.ipcRenderer.send("storage:clear");
  },
  getAllKeys: () => {
    return Array.from(localCache.keys());
  },
  getStoragePath: () => {
    return initialPayload.storagePath || "";
  }
});
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,
  getStoragePath: () => import_electron.ipcRenderer.invoke("storage:get-path"),
  setStoragePath: (newPath) => import_electron.ipcRenderer.invoke("storage:set-path", newPath),
  selectStorageDirectory: () => import_electron.ipcRenderer.invoke("storage:choose-directory"),
  openStorageFolder: () => import_electron.ipcRenderer.invoke("storage:open-folder"),
  saveFile: (defaultName, content) => import_electron.ipcRenderer.invoke("dialog:save-file", defaultName, content),
  exportPdf: (payload) => import_electron.ipcRenderer.invoke("export:pdf", payload),
  // v0.7.92: user-selected backup folder (Settings → Project Local Backup & Recovery)
  chooseBackupDirectory: () => import_electron.ipcRenderer.invoke("backup:choose-directory"),
  writeBackupFile: (dir, fileName, content) => import_electron.ipcRenderer.invoke("backup:write-file", { dir, fileName, content })
});
//# sourceMappingURL=preload.cjs.map
