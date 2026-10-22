import { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeImage, protocol, session } from 'electron';
import path from 'path';
import fs from 'fs';

// v0.7.91-NIGHTLY: serve the built renderer over a privileged `app://`
// scheme instead of file://. WASM engines (Harper, Whistle/cactus-needle)
// need fetch + CacheStorage + module workers, none of which work reliably
// under a file:// origin.
const APP_PROTOCOL = 'app';
const APP_HOST = 'mundus';
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
      corsEnabled: true,
    },
  },
]);

const DIST_DIR = path.join(__dirname, '../dist');
const APP_MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json',
  '.txt': 'text/plain',
};

function serveAppFile(url: string): Response {
  try {
    const parsed = new URL(url);
    let rel = decodeURIComponent(parsed.pathname).replace(/^\//, '');
    if (!rel || rel.endsWith('/')) rel += 'index.html';
    let filePath = path.normalize(path.join(DIST_DIR, rel));
    if (!filePath.startsWith(DIST_DIR)) filePath = path.join(DIST_DIR, 'index.html');
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      // SPA fallback: unknown paths get the shell.
      filePath = path.join(DIST_DIR, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = APP_MIME[ext] || 'application/octet-stream';
    return new Response(fs.readFileSync(filePath), {
      headers: { 'Content-Type': type },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

let mainWindow: BrowserWindow | null = null;
let currentStorageDir = '';
const memoryStore = new Map<string, string>();
const pendingWrites = new Set<string>();
let flushTimeout: NodeJS.Timeout | null = null;

// Clean JSON mapping for file storage on local disk
const FILE_MAPPINGS: Record<string, string> = {
  'mundus_projects': 'projects.json',
  'mundus_documents': 'documents.json',
  'mundus_folders': 'folders.json',
  'mundus_characters': 'characters.json',
  'mundus_codex_entries': 'codex_entries.json',
  'mundus_timeline_events': 'timeline_events.json',
  'mundus_timeline_config': 'timeline_config.json',
  'mundus_story_links': 'story_links.json',
  'mundus_custom_dictionary': 'dictionary.json',
  'mundus_custom_keybindings': 'keybindings.json',
  'mundus_added_google_fonts': 'google_fonts.json',
  'mundus_custom_fonts': 'custom_fonts.json',
  'mundus_local_auto_backups': 'auto_backups.json',
  'mundus_custom_firebase_config': 'firebase_config.json',
};

const SETTINGS_KEYS = new Set([
  'mundus_theme',
  'novelist_theme',
  'mundus_accent_color',
  'mundus_autosave',
  'mundus_active_id',
  'mundus_expand_sidebar_on_hover',
  'mundus_default_p_font',
  'mundus_default_h_font',
  'mundus_default_quote_font',
  'mundus_imgbb_api_key',
  'mundus_auto_backup_enabled',
  'mundus_backup_prefix',
  'mundus_auto_download_interval',
  'mundus_spellcheck_enabled',
  'mundus_sync_pending_docs',
]);

function getConfigFile(): string {
  return path.join(app.getPath('userData'), 'mundus-config.json');
}

function resolveDefaultStoragePath(): string {
  // First check if a custom path is saved in mundus-config.json
  try {
    const cfgPath = getConfigFile();
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (parsed.storagePath && fs.existsSync(parsed.storagePath)) {
        return parsed.storagePath;
      }
    }
  } catch (e) {
    console.error('Failed reading mundus-config.json:', e);
  }

  // Default: try to place storage in an adjacent folder next to the app/executable
  try {
    const appDir = app.isPackaged ? path.dirname(app.getPath('exe')) : process.cwd();
    const candidate = path.join(appDir, 'mundus_data');
    fs.mkdirSync(candidate, { recursive: true });

    // Test write permission
    const testFile = path.join(candidate, '.write_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return candidate;
  } catch {
    // If adjacent directory is not writable (e.g. system Program Files or read-only container),
    // safely fall back to user's AppData / Documents directory
    const fallback = path.join(app.getPath('userData'), 'mundus_data');
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

function saveStoragePathConfig(newPath: string) {
  try {
    const cfgPath = getConfigFile();
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify({ storagePath: newPath }, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

// Load all files from disk into in-memory store
function loadStorageFromDisk() {
  memoryStore.clear();
  if (!fs.existsSync(currentStorageDir)) {
    try {
      fs.mkdirSync(currentStorageDir, { recursive: true });
    } catch (e) {
      console.error('Failed to create storage dir:', e);
      return;
    }
  }

  // 1. Load dedicated JSON files
  for (const [key, filename] of Object.entries(FILE_MAPPINGS)) {
    const filePath = path.join(currentStorageDir, filename);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        memoryStore.set(key, raw);
      } catch (e) {
        console.error(`Failed to read ${filename}:`, e);
      }
    }
  }

  // 2. Load settings.json
  const settingsFile = path.join(currentStorageDir, 'settings.json');
  if (fs.existsSync(settingsFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      for (const [k, v] of Object.entries(parsed)) {
        memoryStore.set(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
    } catch (e) {
      console.error('Failed to read settings.json:', e);
    }
  }

  // 3. Load general key-value store
  const generalFile = path.join(currentStorageDir, 'general_kv.json');
  if (fs.existsSync(generalFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(generalFile, 'utf8'));
      for (const [k, v] of Object.entries(parsed)) {
        memoryStore.set(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
    } catch (e) {
      console.error('Failed to read general_kv.json:', e);
    }
  }

  // 4. Load snapshots folder
  const snapshotsDir = path.join(currentStorageDir, 'snapshots');
  if (fs.existsSync(snapshotsDir)) {
    try {
      const files = fs.readdirSync(snapshotsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const docId = file.replace('.json', '');
          const key = `mundus_snapshot_${docId}`;
          const content = fs.readFileSync(path.join(snapshotsDir, file), 'utf8');
          memoryStore.set(key, content);
        }
      }
    } catch (e) {
      console.error('Failed to read snapshots directory:', e);
    }
  }

  // 5. Load dedicated maps folder
  const mapsDir = path.join(currentStorageDir, 'maps');
  if (fs.existsSync(mapsDir)) {
    try {
      const files = fs.readdirSync(mapsDir);
      for (const file of files) {
        if (file.endsWith('.dat')) {
          const key = file.replace('.dat', '');
          const content = fs.readFileSync(path.join(mapsDir, file), 'utf8');
          memoryStore.set(key, content);
        }
      }
    } catch (e) {
      console.error('Failed to read maps directory:', e);
    }
  }
}

// Flush pending writes to disk
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
      const filePath = path.join(currentStorageDir, filename);
      try {
        if (value === undefined) {
          if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
        } else {
          // Format JSON if possible for human readability on local disk
          let formatted = value;
          try {
            formatted = JSON.stringify(JSON.parse(value), null, 2);
          } catch {
            // Keep original string if not JSON
          }
          fs.writeFile(filePath, formatted, 'utf8', (err) => {
            if (err) console.error(`Failed to write file ${filename}:`, err);
          });
        }
      } catch (err) {
        console.error(`Failed to write file ${filename}:`, err);
      }
    } else if (key.startsWith('mundus_snapshot_') || key.startsWith('mundus_snapshots_')) {
      const docId = key.replace(/^mundus_snapshots?_/, '');
      const snapshotsDir = path.join(currentStorageDir, 'snapshots');
      try {
        fs.mkdirSync(snapshotsDir, { recursive: true });
        const snapFile = path.join(snapshotsDir, `${docId}.json`);
        if (value === undefined) {
          if (fs.existsSync(snapFile)) fs.unlink(snapFile, () => {});
        } else {
          fs.writeFile(snapFile, value, 'utf8', (err) => {
            if (err) console.error('Failed to write snapshot:', err);
          });
        }
      } catch (err) {
        console.error('Failed to write snapshot:', err);
      }
    } else if (key.startsWith('mundus_map_image_') && !key.endsWith('_name')) {
      // Store large map images in a dedicated folder as separate files
      // Never contaminate general_kv.json with multi-megabyte image strings
      const safeKey = key.replace(/[^a-zA-Z0-9_\-]/g, '_');
      const mapsDir = path.join(currentStorageDir, 'maps');
      try {
        fs.mkdirSync(mapsDir, { recursive: true });
        const mapFile = path.join(mapsDir, `${safeKey}.dat`);
        if (value === undefined) {
          if (fs.existsSync(mapFile)) fs.unlink(mapFile, () => {});
        } else {
          fs.writeFile(mapFile, value, 'utf8', (err) => {
            if (err) console.error('Failed to write map image:', err);
          });
        }
      } catch (err) {
        console.error('Failed to write map image:', err);
      }
    } else if (SETTINGS_KEYS.has(key)) {
      settingsDirty = true;
    } else {
      generalDirty = true;
    }
  }

  // Flush settings.json if needed
  if (settingsDirty) {
    try {
      const settingsObj: Record<string, any> = {};
      for (const k of SETTINGS_KEYS) {
        if (memoryStore.has(k)) {
          const val = memoryStore.get(k)!;
          try {
            settingsObj[k] = JSON.parse(val);
          } catch {
            settingsObj[k] = val;
          }
        }
      }
      fs.writeFile(
        path.join(currentStorageDir, 'settings.json'),
        JSON.stringify(settingsObj, null, 2),
        'utf8',
        (err) => {
          if (err) console.error('Failed to write settings.json:', err);
        }
      );
    } catch (e) {
      console.error('Failed to write settings.json:', e);
    }
  }

  // Flush general_kv.json if needed (strictly excludes heavy map images)
  if (generalDirty) {
    try {
      const generalObj: Record<string, any> = {};
      for (const [k, v] of memoryStore.entries()) {
        if (
          !FILE_MAPPINGS[k] &&
          !SETTINGS_KEYS.has(k) &&
          !k.startsWith('mundus_snapshot_') &&
          !(k.startsWith('mundus_map_image_') && !k.endsWith('_name'))
        ) {
          try {
            generalObj[k] = JSON.parse(v);
          } catch {
            generalObj[k] = v;
          }
        }
      }
      fs.writeFile(
        path.join(currentStorageDir, 'general_kv.json'),
        JSON.stringify(generalObj, null, 2),
        'utf8',
        (err) => {
          if (err) console.error('Failed to write general_kv.json:', err);
        }
      );
    } catch (e) {
      console.error('Failed to write general_kv.json:', e);
    }
  }
}

function scheduleFlush() {
  if (flushTimeout) clearTimeout(flushTimeout);
  flushTimeout = setTimeout(() => {
    flushPendingWrites();
  }, 1200);
}

// IPC Handlers
ipcMain.on('storage:get-all-sync', (event) => {
  const result: Record<string, string> = {};
  for (const [k, v] of memoryStore.entries()) {
    result[k] = v;
  }
  event.returnValue = {
    data: result,
    storagePath: currentStorageDir
  };
});

ipcMain.on('storage:set-item', (_event, { key, value }: { key: string; value: string }) => {
  memoryStore.set(key, value);
  pendingWrites.add(key);
  scheduleFlush();
});

ipcMain.on('storage:remove-item', (_event, { key }: { key: string }) => {
  memoryStore.delete(key);
  pendingWrites.add(key);
  scheduleFlush();
});

ipcMain.on('storage:clear', () => {
  memoryStore.clear();
  try {
    const files = fs.readdirSync(currentStorageDir);
    for (const f of files) {
      const p = path.join(currentStorageDir, f);
      if (fs.statSync(p).isDirectory()) {
        fs.rmSync(p, { recursive: true, force: true });
      } else {
        fs.unlinkSync(p);
      }
    }
  } catch (e) {
    console.error('Failed to clear storage directory:', e);
  }
});

ipcMain.handle('storage:get-path', () => {
  return currentStorageDir;
});

ipcMain.handle('storage:choose-directory', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Mundus Local Storage Folder',
    defaultPath: currentStorageDir,
    properties: ['openDirectory', 'createDirectory']
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

ipcMain.handle('storage:set-path', async (_event, newDir: string) => {
  if (!fs.existsSync(newDir)) {
    try {
      fs.mkdirSync(newDir, { recursive: true });
    } catch (err) {
      console.error('Failed to create custom directory:', err);
      return false;
    }
  }
  currentStorageDir = newDir;
  saveStoragePathConfig(newDir);
  loadStorageFromDisk();
  return true;
});

ipcMain.handle('storage:open-folder', async () => {
  if (fs.existsSync(currentStorageDir)) {
    await shell.openPath(currentStorageDir);
  }
});

ipcMain.handle('dialog:save-file', async (_event, defaultName: string, content: string) => {
  if (!mainWindow) return false;
  const res = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: 'Mundus Backup', extensions: ['json', 'mundus'] }]
  });
  if (!res.canceled && res.filePath) {
    fs.writeFileSync(res.filePath, content, 'utf8');
    return true;
  }
  return false;
});

// v0.7.92: pick the folder backups are written into (Settings → backups).
// Pure picker — unlike storage:choose-directory it must NOT switch the app's
// localStorage persistence directory.
ipcMain.handle('backup:choose-directory', async () => {
  if (!mainWindow) return null;
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Backup Folder',
    defaultPath: currentStorageDir,
    properties: ['openDirectory', 'createDirectory']
  });
  if (!res.canceled && res.filePaths.length > 0) {
    return res.filePaths[0];
  }
  return null;
});

// v0.7.92: write a backup JSON straight into the user-selected folder
// (no save dialog per backup). Path is resolved against the chosen folder and
// the file name is flattened to its basename so the write can never escape it.
ipcMain.handle('backup:write-file', async (_event, payload: { dir: string; fileName: string; content: string }) => {
  try {
    if (!payload || typeof payload.dir !== 'string' || !payload.dir.trim()) {
      return { success: false, error: 'No backup folder selected' };
    }
    if (typeof payload.fileName !== 'string' || !payload.fileName.trim() || typeof payload.content !== 'string') {
      return { success: false, error: 'Invalid backup file request' };
    }
    const targetDir = path.resolve(payload.dir.trim());
    const target = path.resolve(targetDir, path.basename(payload.fileName));
    if (target !== targetDir && !target.startsWith(targetDir + path.sep)) {
      return { success: false, error: 'Invalid backup path' };
    }
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(target, payload.content, 'utf8');
    return { success: true, filePath: target };
  } catch (err) {
    console.error('[backup:write-file] failed:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('export:pdf', async (_event, payload: { title: string; html: string; pageFormat?: string }) => {
  if (!mainWindow) return { success: false, error: 'No active window' };
  try {
    const rawTitle = payload.title || 'Untitled Document';
    const safeTitle = rawTitle.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_') || 'document';

    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Document as PDF',
      defaultPath: `${safeTitle}.pdf`,
      filters: [{ name: 'PDF Document (*.pdf)', extensions: ['pdf'] }]
    });

    if (res.canceled || !res.filePath) {
      return { success: false, canceled: true };
    }

    const printWin = new BrowserWindow({
      show: false,
      webPreferences: {
        offscreen: true,
        webSecurity: false,
      }
    });

    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(payload.html)}`);

    // Give web fonts and styles a brief moment to settle
    await new Promise((resolve) => setTimeout(resolve, 400));

    let pageSize: 'A4' | 'A5' | 'Letter' = 'Letter';
    const fmt = (payload.pageFormat || '').toLowerCase();
    if (fmt === 'a4') pageSize = 'A4';
    else if (fmt === 'a5') pageSize = 'A5';

    const pdfBuffer = await printWin.webContents.printToPDF({
      pageSize,
      preferCSSPageSize: true,
      printBackground: true,
      margins: {
        top: 0.4,
        bottom: 0.4,
        left: 0.4,
        right: 0.4,
      }
    });

    printWin.close();
    fs.writeFileSync(res.filePath, pdfBuffer);
    return { success: true, filePath: res.filePath };
  } catch (err: any) {
    console.error('Failed to export PDF in electron:', err);
    return { success: false, error: err?.message || 'Print error' };
  }
});

function createWindow() {
  currentStorageDir = resolveDefaultStoragePath();
  loadStorageFromDisk();

  // Resolve application icon across dev, unpackaged, and packaged production modes
  const candidateIcons = [
    path.join(__dirname, 'icon.ico'),
    path.join(__dirname, 'icon.png'),
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../public/icon-512.png'),
    path.join(__dirname, '../public/icon.png'),
    path.join(app.getAppPath(), 'dist-electron/icon.ico'),
    path.join(app.getAppPath(), 'dist-electron/icon.png'),
    path.join(app.getAppPath(), 'build/icon.ico'),
    path.join(app.getAppPath(), 'build/icon.png'),
    path.join(app.getAppPath(), 'public/icon-512.png'),
    path.join(app.getAppPath(), 'dist/icon-512.png'),
    path.join(process.resourcesPath, 'build/icon.ico'),
    path.join(process.resourcesPath, 'build/icon.png'),
    path.join(process.resourcesPath, 'icon.ico'),
    path.join(process.resourcesPath, 'icon.png'),
  ];

  let appIcon: Electron.NativeImage | string | undefined = undefined;
  for (const candidate of candidateIcons) {
    if (fs.existsSync(candidate)) {
      try {
        const img = nativeImage.createFromPath(candidate);
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

  if (appIcon && process.platform === 'darwin' && app.dock) {
    try {
      app.dock.setIcon(appIcon as any);
    } catch {}
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 880,
    minHeight: 600,
    icon: appIcon,
    backgroundColor: '#000000',
    title: 'Mundus v0.8.3',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    titleBarOverlay: process.platform === 'win32' ? {
      color: '#000000',
      symbolColor: '#ffffff',
      height: 32
    } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Remove the top application menu bar (File, Edit, View, Window)
  Menu.setApplicationMenu(null);
  mainWindow.setMenu(null);

  // Prevent new window popups from opening in electron; route external links to user's browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Determine whether to load dev server or static build
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_START_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else if (!app.isPackaged && process.env.NODE_ENV !== 'production') {
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      // Fall back to built file if vite dev server is not running
      const indexPath = path.join(__dirname, '../dist/index.html');
      if (fs.existsSync(indexPath)) {
        mainWindow?.loadURL(`${APP_PROTOCOL}://${APP_HOST}/index.html`);
      }
    });
  } else {
    mainWindow.loadURL(`${APP_PROTOCOL}://${APP_HOST}/index.html`);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // v0.7.91-NIGHTLY: custom protocol handler + microphone permission for the
  // Whistle dictation feature.
  protocol.handle(APP_PROTOCOL, (request) => serveAppFile(request.url));

  const permissionAllowlist = new Set(['media', 'fullscreen', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permissionAllowlist.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permissionAllowlist.has(permission));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  flushPendingWrites();
});

app.on('window-all-closed', () => {
  flushPendingWrites();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
