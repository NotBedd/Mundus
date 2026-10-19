var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_electron = require("electron");
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var mainWindow = null;
var currentStorageDir = "";
var memoryStore = /* @__PURE__ */ new Map();
var pendingWrites = /* @__PURE__ */ new Set();
var flushTimeout = null;
var FILE_MAPPINGS = {
  "mundus_projects": "projects.json",
  "mundus_documents": "documents.json",
  "mundus_folders": "folders.json",
  "mundus_characters": "characters.json",
  "mundus_codex_entries": "codex_entries.json",
  "mundus_timeline_events": "timeline_events.json",
  "mundus_timeline_config": "timeline_config.json",
  "mundus_story_links": "story_links.json",
  "mundus_custom_dictionary": "dictionary.json",
  "mundus_custom_keybindings": "keybindings.json",
  "mundus_added_google_fonts": "google_fonts.json",
  "mundus_custom_fonts": "custom_fonts.json",
  "mundus_local_auto_backups": "auto_backups.json",
  "mundus_custom_firebase_config": "firebase_config.json"
};
var SETTINGS_KEYS = /* @__PURE__ */ new Set([
  "mundus_theme",
  "novelist_theme",
  "mundus_accent_color",
  "mundus_autosave",
  "mundus_active_id",
  "mundus_expand_sidebar_on_hover",
  "mundus_default_p_font",
  "mundus_default_h_font",
  "mundus_default_quote_font",
  "mundus_imgbb_api_key",
  "mundus_auto_backup_enabled",
  "mundus_backup_prefix",
  "mundus_auto_download_interval",
  "mundus_spellcheck_enabled",
  "mundus_sync_pending_docs"
]);
function getConfigFile() {
  return import_path.default.join(import_electron.app.getPath("userData"), "mundus-config.json");
}
function resolveDefaultStoragePath() {
  try {
    const cfgPath = getConfigFile();
    if (import_fs.default.existsSync(cfgPath)) {
      const parsed = JSON.parse(import_fs.default.readFileSync(cfgPath, "utf8"));
      if (parsed.storagePath && import_fs.default.existsSync(parsed.storagePath)) {
        return parsed.storagePath;
      }
    }
  } catch (e) {
    console.error("Failed reading mundus-config.json:", e);
  }
  try {
    const appDir = import_electron.app.isPackaged ? import_path.default.dirname(import_electron.app.getPath("exe")) : process.cwd();
    const candidate = import_path.default.join(appDir, "mundus_data");
    import_fs.default.mkdirSync(candidate, { recursive: true });
    const testFile = import_path.default.join(candidate, ".write_test");
    import_fs.default.writeFileSync(testFile, "test");
    import_fs.default.unlinkSync(testFile);
    return candidate;
  } catch {
    const fallback = import_path.default.join(import_electron.app.getPath("userData"), "mundus_data");
    import_fs.default.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}
function saveStoragePathConfig(newPath) {
  try {
    const cfgPath = getConfigFile();
    import_fs.default.mkdirSync(import_path.default.dirname(cfgPath), { recursive: true });
    import_fs.default.writeFileSync(cfgPath, JSON.stringify({ storagePath: newPath }, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to save config:", e);
  }
}
function loadStorageFromDisk() {
  memoryStore.clear();
  if (!import_fs.default.existsSync(currentStorageDir)) {
    try {
      import_fs.default.mkdirSync(currentStorageDir, { recursive: true });
    } catch (e) {
      console.error("Failed to create storage dir:", e);
      return;
    }
  }
  for (const [key, filename] of Object.entries(FILE_MAPPINGS)) {
    const filePath = import_path.default.join(currentStorageDir, filename);
    if (import_fs.default.existsSync(filePath)) {
      try {
        const raw = import_fs.default.readFileSync(filePath, "utf8");
        memoryStore.set(key, raw);
      } catch (e) {
        console.error(`Failed to read ${filename}:`, e);
      }
    }
  }
  const settingsFile = import_path.default.join(currentStorageDir, "settings.json");
  if (import_fs.default.existsSync(settingsFile)) {
    try {
      const parsed = JSON.parse(import_fs.default.readFileSync(settingsFile, "utf8"));
      for (const [k, v] of Object.entries(parsed)) {
        memoryStore.set(k, typeof v === "string" ? v : JSON.stringify(v));
      }
    } catch (e) {
      console.error("Failed to read settings.json:", e);
    }
  }
  const generalFile = import_path.default.join(currentStorageDir, "general_kv.json");
  if (import_fs.default.existsSync(generalFile)) {
    try {
      const parsed = JSON.parse(import_fs.default.readFileSync(generalFile, "utf8"));
      for (const [k, v] of Object.entries(parsed)) {
        memoryStore.set(k, typeof v === "string" ? v : JSON.stringify(v));
      }
    } catch (e) {
      console.error("Failed to read general_kv.json:", e);
    }
  }
  const snapshotsDir = import_path.default.join(currentStorageDir, "snapshots");
  if (import_fs.default.existsSync(snapshotsDir)) {
    try {
      const files = import_fs.default.readdirSync(snapshotsDir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          const docId = file.replace(".json", "");
          const key = `mundus_snapshot_${docId}`;
          const content = import_fs.default.readFileSync(import_path.default.join(snapshotsDir, file), "utf8");
          memoryStore.set(key, content);
        }
      }
    } catch (e) {
      console.error("Failed to read snapshots directory:", e);
    }
  }
}
function flushPendingWrites() {
  if (pendingWrites.size === 0) return;
  const keysToFlush = Array.from(pendingWrites);
  pendingWrites.clear();
  let settingsDirty = false;
  let generalDirty = false;
  for (const key of keysToFlush) {
    const value = memoryStore.get(key);
    if (FILE_MAPPINGS[key]) {
      const filename = FILE_MAPPINGS[key];
      const filePath = import_path.default.join(currentStorageDir, filename);
      try {
        if (value === void 0) {
          if (import_fs.default.existsSync(filePath)) import_fs.default.unlinkSync(filePath);
        } else {
          let formatted = value;
          try {
            formatted = JSON.stringify(JSON.parse(value), null, 2);
          } catch {
          }
          import_fs.default.writeFileSync(filePath, formatted, "utf8");
        }
      } catch (err) {
        console.error(`Failed to write file ${filename}:`, err);
      }
    } else if (key.startsWith("mundus_snapshot_")) {
      const docId = key.replace("mundus_snapshot_", "");
      const snapshotsDir = import_path.default.join(currentStorageDir, "snapshots");
      try {
        import_fs.default.mkdirSync(snapshotsDir, { recursive: true });
        const snapFile = import_path.default.join(snapshotsDir, `${docId}.json`);
        if (value === void 0) {
          if (import_fs.default.existsSync(snapFile)) import_fs.default.unlinkSync(snapFile);
        } else {
          import_fs.default.writeFileSync(snapFile, value, "utf8");
        }
      } catch (err) {
        console.error("Failed to write snapshot:", err);
      }
    } else if (SETTINGS_KEYS.has(key)) {
      settingsDirty = true;
    } else {
      generalDirty = true;
    }
  }
  if (settingsDirty) {
    try {
      const settingsObj = {};
      for (const k of SETTINGS_KEYS) {
        if (memoryStore.has(k)) {
          const val = memoryStore.get(k);
          try {
            settingsObj[k] = JSON.parse(val);
          } catch {
            settingsObj[k] = val;
          }
        }
      }
      import_fs.default.writeFileSync(
        import_path.default.join(currentStorageDir, "settings.json"),
        JSON.stringify(settingsObj, null, 2),
        "utf8"
      );
    } catch (e) {
      console.error("Failed to write settings.json:", e);
    }
  }
  if (generalDirty) {
    try {
      const generalObj = {};
      for (const [k, v] of memoryStore.entries()) {
        if (!FILE_MAPPINGS[k] && !SETTINGS_KEYS.has(k) && !k.startsWith("mundus_snapshot_")) {
          try {
            generalObj[k] = JSON.parse(v);
          } catch {
            generalObj[k] = v;
          }
        }
      }
      import_fs.default.writeFileSync(
        import_path.default.join(currentStorageDir, "general_kv.json"),
        JSON.stringify(generalObj, null, 2),
        "utf8"
      );
    } catch (e) {
      console.error("Failed to write general_kv.json:", e);
    }
  }
}
function scheduleFlush() {
  if (flushTimeout) clearTimeout(flushTimeout);
  flushTimeout = setTimeout(() => {
    flushPendingWrites();
  }, 100);
}
import_electron.ipcMain.on("storage:get-all-sync", (event) => {
  const result = {};
  for (const [k, v] of memoryStore.entries()) {
    result[k] = v;
  }
  event.returnValue = {
    data: result,
    storagePath: currentStorageDir
  };
});
import_electron.ipcMain.on("storage:set-item", (_event, { key, value }) => {
  memoryStore.set(key, value);
  pendingWrites.add(key);
  scheduleFlush();
});
import_electron.ipcMain.on("storage:remove-item", (_event, { key }) => {
  memoryStore.delete(key);
  pendingWrites.add(key);
  scheduleFlush();
});
import_electron.ipcMain.on("storage:clear", () => {
  memoryStore.clear();
  try {
    const files = import_fs.default.readdirSync(currentStorageDir);
    for (const f of files) {
      const p = import_path.default.join(currentStorageDir, f);
      if (import_fs.default.statSync(p).isDirectory()) {
        import_fs.default.rmSync(p, { recursive: true, force: true });
      } else {
        import_fs.default.unlinkSync(p);
      }
    }
  } catch (e) {
    console.error("Failed to clear storage directory:", e);
  }
});
import_electron.ipcMain.handle("storage:get-path", () => {
  return currentStorageDir;
});
import_electron.ipcMain.handle("storage:choose-directory", async () => {
  if (!mainWindow) return null;
  const res = await import_electron.dialog.showOpenDialog(mainWindow, {
    title: "Select Mundus Local Storage Folder",
    defaultPath: currentStorageDir,
    properties: ["openDirectory", "createDirectory"]
  });
  if (!res.canceled && res.filePaths.length > 0) {
    const newDir = res.filePaths[0];
    currentStorageDir = newDir;
    saveStoragePathConfig(newDir);
    loadStorageFromDisk();
    return newDir;
  }
  return null;
});
import_electron.ipcMain.handle("storage:set-path", async (_event, newDir) => {
  if (!import_fs.default.existsSync(newDir)) {
    try {
      import_fs.default.mkdirSync(newDir, { recursive: true });
    } catch (err) {
      console.error("Failed to create custom directory:", err);
      return false;
    }
  }
  currentStorageDir = newDir;
  saveStoragePathConfig(newDir);
  loadStorageFromDisk();
  return true;
});
import_electron.ipcMain.handle("storage:open-folder", async () => {
  if (import_fs.default.existsSync(currentStorageDir)) {
    await import_electron.shell.openPath(currentStorageDir);
  }
});
import_electron.ipcMain.handle("dialog:save-file", async (_event, defaultName, content) => {
  if (!mainWindow) return false;
  const res = await import_electron.dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: "Mundus Backup", extensions: ["json", "mundus"] }]
  });
  if (!res.canceled && res.filePath) {
    import_fs.default.writeFileSync(res.filePath, content, "utf8");
    return true;
  }
  return false;
});
function createWindow() {
  currentStorageDir = resolveDefaultStoragePath();
  loadStorageFromDisk();
  mainWindow = new import_electron.BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 880,
    minHeight: 600,
    backgroundColor: "#0f0f11",
    title: "Mundus",
    show: false,
    webPreferences: {
      preload: import_path.default.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  const isMac = process.platform === "darwin";
  const template = [
    ...isMac ? [{
      label: import_electron.app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    }] : [],
    {
      label: "File",
      submenu: [
        {
          label: "Open Storage Folder",
          accelerator: "CmdOrCtrl+Shift+O",
          click: () => {
            if (import_fs.default.existsSync(currentStorageDir)) {
              import_electron.shell.openPath(currentStorageDir);
            }
          }
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...isMac ? [
          { type: "separator" },
          { role: "front" },
          { type: "separator" },
          { role: "window" }
        ] : [
          { role: "close" }
        ]
      ]
    }
  ];
  const menu = import_electron.Menu.buildFromTemplate(template);
  import_electron.Menu.setApplicationMenu(menu);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      import_electron.shell.openExternal(url);
    }
    return { action: "deny" };
  });
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_START_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else if (!import_electron.app.isPackaged && process.env.NODE_ENV !== "production") {
    mainWindow.loadURL("http://localhost:3000").catch(() => {
      const indexPath = import_path.default.join(__dirname, "../dist/index.html");
      if (import_fs.default.existsSync(indexPath)) {
        mainWindow?.loadFile(indexPath);
      }
    });
  } else {
    mainWindow.loadFile(import_path.default.join(__dirname, "../dist/index.html"));
  }
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
import_electron.app.whenReady().then(() => {
  createWindow();
  import_electron.app.on("activate", () => {
    if (import_electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
import_electron.app.on("before-quit", () => {
  flushPendingWrites();
});
import_electron.app.on("window-all-closed", () => {
  flushPendingWrites();
  if (process.platform !== "darwin") {
    import_electron.app.quit();
  }
});
//# sourceMappingURL=main.js.map
