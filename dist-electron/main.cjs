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
var APP_PROTOCOL = "app";
var APP_HOST = "mundus";
import_electron.protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
      corsEnabled: true
    }
  }
]);
var DIST_DIR = import_path.default.join(__dirname, "../dist");
var APP_MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
  ".txt": "text/plain"
};
function serveAppFile(url) {
  try {
    const parsed = new URL(url);
    let rel = decodeURIComponent(parsed.pathname).replace(/^\//, "");
    if (!rel || rel.endsWith("/")) rel += "index.html";
    let filePath = import_path.default.normalize(import_path.default.join(DIST_DIR, rel));
    if (!filePath.startsWith(DIST_DIR)) filePath = import_path.default.join(DIST_DIR, "index.html");
    if (!import_fs.default.existsSync(filePath) || import_fs.default.statSync(filePath).isDirectory()) {
      filePath = import_path.default.join(DIST_DIR, "index.html");
    }
    const ext = import_path.default.extname(filePath).toLowerCase();
    const type = APP_MIME[ext] || "application/octet-stream";
    return new Response(import_fs.default.readFileSync(filePath), {
      headers: { "Content-Type": type }
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
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
  const mapsDir = import_path.default.join(currentStorageDir, "maps");
  if (import_fs.default.existsSync(mapsDir)) {
    try {
      const files = import_fs.default.readdirSync(mapsDir);
      for (const file of files) {
        if (file.endsWith(".dat")) {
          const key = file.replace(".dat", "");
          const content = import_fs.default.readFileSync(import_path.default.join(mapsDir, file), "utf8");
          memoryStore.set(key, content);
        }
      }
    } catch (e) {
      console.error("Failed to read maps directory:", e);
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
          if (import_fs.default.existsSync(filePath)) import_fs.default.unlink(filePath, () => {
          });
        } else {
          let formatted = value;
          try {
            formatted = JSON.stringify(JSON.parse(value), null, 2);
          } catch {
          }
          import_fs.default.writeFile(filePath, formatted, "utf8", (err) => {
            if (err) console.error(`Failed to write file ${filename}:`, err);
          });
        }
      } catch (err) {
        console.error(`Failed to write file ${filename}:`, err);
      }
    } else if (key.startsWith("mundus_snapshot_") || key.startsWith("mundus_snapshots_")) {
      const docId = key.replace(/^mundus_snapshots?_/, "");
      const snapshotsDir = import_path.default.join(currentStorageDir, "snapshots");
      try {
        import_fs.default.mkdirSync(snapshotsDir, { recursive: true });
        const snapFile = import_path.default.join(snapshotsDir, `${docId}.json`);
        if (value === void 0) {
          if (import_fs.default.existsSync(snapFile)) import_fs.default.unlink(snapFile, () => {
          });
        } else {
          import_fs.default.writeFile(snapFile, value, "utf8", (err) => {
            if (err) console.error("Failed to write snapshot:", err);
          });
        }
      } catch (err) {
        console.error("Failed to write snapshot:", err);
      }
    } else if (key.startsWith("mundus_map_image_") && !key.endsWith("_name")) {
      const safeKey = key.replace(/[^a-zA-Z0-9_\-]/g, "_");
      const mapsDir = import_path.default.join(currentStorageDir, "maps");
      try {
        import_fs.default.mkdirSync(mapsDir, { recursive: true });
        const mapFile = import_path.default.join(mapsDir, `${safeKey}.dat`);
        if (value === void 0) {
          if (import_fs.default.existsSync(mapFile)) import_fs.default.unlink(mapFile, () => {
          });
        } else {
          import_fs.default.writeFile(mapFile, value, "utf8", (err) => {
            if (err) console.error("Failed to write map image:", err);
          });
        }
      } catch (err) {
        console.error("Failed to write map image:", err);
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
      import_fs.default.writeFile(
        import_path.default.join(currentStorageDir, "settings.json"),
        JSON.stringify(settingsObj, null, 2),
        "utf8",
        (err) => {
          if (err) console.error("Failed to write settings.json:", err);
        }
      );
    } catch (e) {
      console.error("Failed to write settings.json:", e);
    }
  }
  if (generalDirty) {
    try {
      const generalObj = {};
      for (const [k, v] of memoryStore.entries()) {
        if (!FILE_MAPPINGS[k] && !SETTINGS_KEYS.has(k) && !k.startsWith("mundus_snapshot_") && !(k.startsWith("mundus_map_image_") && !k.endsWith("_name"))) {
          try {
            generalObj[k] = JSON.parse(v);
          } catch {
            generalObj[k] = v;
          }
        }
      }
      import_fs.default.writeFile(
        import_path.default.join(currentStorageDir, "general_kv.json"),
        JSON.stringify(generalObj, null, 2),
        "utf8",
        (err) => {
          if (err) console.error("Failed to write general_kv.json:", err);
        }
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
  }, 1200);
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
import_electron.ipcMain.handle("backup:choose-directory", async () => {
  if (!mainWindow) return null;
  const res = await import_electron.dialog.showOpenDialog(mainWindow, {
    title: "Select Backup Folder",
    defaultPath: currentStorageDir,
    properties: ["openDirectory", "createDirectory"]
  });
  if (!res.canceled && res.filePaths.length > 0) {
    return res.filePaths[0];
  }
  return null;
});
import_electron.ipcMain.handle("backup:write-file", async (_event, payload) => {
  try {
    if (!payload || typeof payload.dir !== "string" || !payload.dir.trim()) {
      return { success: false, error: "No backup folder selected" };
    }
    if (typeof payload.fileName !== "string" || !payload.fileName.trim() || typeof payload.content !== "string") {
      return { success: false, error: "Invalid backup file request" };
    }
    const targetDir = import_path.default.resolve(payload.dir.trim());
    const target = import_path.default.resolve(targetDir, import_path.default.basename(payload.fileName));
    if (target !== targetDir && !target.startsWith(targetDir + import_path.default.sep)) {
      return { success: false, error: "Invalid backup path" };
    }
    if (!import_fs.default.existsSync(targetDir)) {
      import_fs.default.mkdirSync(targetDir, { recursive: true });
    }
    import_fs.default.writeFileSync(target, payload.content, "utf8");
    return { success: true, filePath: target };
  } catch (err) {
    console.error("[backup:write-file] failed:", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});
import_electron.ipcMain.handle("export:pdf", async (_event, payload) => {
  if (!mainWindow) return { success: false, error: "No active window" };
  try {
    const rawTitle = payload.title || "Untitled Document";
    const safeTitle = rawTitle.replace(/[^a-zA-Z0-9_\-\s]/g, "").trim().replace(/\s+/g, "_") || "document";
    const res = await import_electron.dialog.showSaveDialog(mainWindow, {
      title: "Export Document as PDF",
      defaultPath: `${safeTitle}.pdf`,
      filters: [{ name: "PDF Document (*.pdf)", extensions: ["pdf"] }]
    });
    if (res.canceled || !res.filePath) {
      return { success: false, canceled: true };
    }
    const printWin = new import_electron.BrowserWindow({
      show: false,
      webPreferences: {
        offscreen: true,
        webSecurity: false
      }
    });
    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(payload.html)}`);
    await new Promise((resolve) => setTimeout(resolve, 400));
    let pageSize = "Letter";
    const fmt = (payload.pageFormat || "").toLowerCase();
    if (fmt === "a4") pageSize = "A4";
    else if (fmt === "a5") pageSize = "A5";
    const pdfBuffer = await printWin.webContents.printToPDF({
      pageSize,
      preferCSSPageSize: true,
      printBackground: true,
      margins: {
        top: 0.4,
        bottom: 0.4,
        left: 0.4,
        right: 0.4
      }
    });
    printWin.close();
    import_fs.default.writeFileSync(res.filePath, pdfBuffer);
    return { success: true, filePath: res.filePath };
  } catch (err) {
    console.error("Failed to export PDF in electron:", err);
    return { success: false, error: err?.message || "Print error" };
  }
});
function createWindow() {
  currentStorageDir = resolveDefaultStoragePath();
  loadStorageFromDisk();
  const candidateIcons = [
    import_path.default.join(__dirname, "icon.ico"),
    import_path.default.join(__dirname, "icon.png"),
    import_path.default.join(__dirname, "../build/icon.ico"),
    import_path.default.join(__dirname, "../build/icon.png"),
    import_path.default.join(__dirname, "../public/icon-512.png"),
    import_path.default.join(__dirname, "../public/icon.png"),
    import_path.default.join(import_electron.app.getAppPath(), "dist-electron/icon.ico"),
    import_path.default.join(import_electron.app.getAppPath(), "dist-electron/icon.png"),
    import_path.default.join(import_electron.app.getAppPath(), "build/icon.ico"),
    import_path.default.join(import_electron.app.getAppPath(), "build/icon.png"),
    import_path.default.join(import_electron.app.getAppPath(), "public/icon-512.png"),
    import_path.default.join(import_electron.app.getAppPath(), "dist/icon-512.png"),
    import_path.default.join(process.resourcesPath, "build/icon.ico"),
    import_path.default.join(process.resourcesPath, "build/icon.png"),
    import_path.default.join(process.resourcesPath, "icon.ico"),
    import_path.default.join(process.resourcesPath, "icon.png")
  ];
  let appIcon = void 0;
  for (const candidate of candidateIcons) {
    if (import_fs.default.existsSync(candidate)) {
      try {
        const img = import_electron.nativeImage.createFromPath(candidate);
        if (!img.isEmpty()) {
          appIcon = img;
          break;
        }
      } catch {
        appIcon = candidate;
        break;
      }
    }
  }
  if (appIcon && process.platform === "darwin" && import_electron.app.dock) {
    try {
      import_electron.app.dock.setIcon(appIcon);
    } catch {
    }
  }
  mainWindow = new import_electron.BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 880,
    minHeight: 600,
    icon: appIcon,
    backgroundColor: "#000000",
    title: "Mundus v0.7.98",
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "default",
    titleBarOverlay: process.platform === "win32" ? {
      color: "#000000",
      symbolColor: "#ffffff",
      height: 32
    } : void 0,
    webPreferences: {
      preload: import_path.default.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  import_electron.Menu.setApplicationMenu(null);
  mainWindow.setMenu(null);
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
        mainWindow?.loadURL(`${APP_PROTOCOL}://${APP_HOST}/index.html`);
      }
    });
  } else {
    mainWindow.loadURL(`${APP_PROTOCOL}://${APP_HOST}/index.html`);
  }
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
import_electron.app.whenReady().then(() => {
  import_electron.protocol.handle(APP_PROTOCOL, (request) => serveAppFile(request.url));
  const permissionAllowlist = /* @__PURE__ */ new Set(["media", "fullscreen", "clipboard-sanitized-write"]);
  import_electron.session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permissionAllowlist.has(permission));
  });
  import_electron.session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permissionAllowlist.has(permission));
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
//# sourceMappingURL=main.cjs.map
