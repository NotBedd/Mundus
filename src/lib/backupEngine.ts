import { APP_VERSION } from '../constants';
import { appStorage, safeJsonStringify } from './storage';
import { isAndroidApp } from './platform';

export interface ProjectBackupData {
  version: string;
  exportedAt: string;
  appName: string;
  /** v0.7.94: the Worlds list itself — without it a restored backup on a
   *  fresh install leaves every document invisible (no matching mundusId). */
  projects?: any[];
  documents: any[];
  folders: any[];
  characters: any[];
  timelineEvents: any[];
  timelineConfig: any;
  timelineConfigs?: any; // v0.7.74: per-project calendar map { [mundusId]: TimelineConfig }
  codexSections?: any; // v0.7.76: legacy shared category list (fallback)
  codexSectionsByProject?: any; // v0.7.76: per-project category map { [mundusId]: CodexSection[] }
  storyLinks: any[];
  codexEntries: any[];
}

export interface BackupSnapshotMeta {
  id: string;
  timestamp: string;
  docCount: number;
  charCount: number;
  eventCount: number;
  codexCount: number;
  data: ProjectBackupData;
}

const AUTO_BACKUP_STORAGE_KEY = 'mundus_local_auto_backups';

/**
 * v0.7.92: shared writer for every backup JSON. Resolution order:
 *   1. Desktop (Electron) + user-selected backup folder → write directly via
 *      IPC, no dialog at all (the whole point of the folder setting).
 *   2. File System Access API save picker (browser support) → user picks the
 *      location per backup.
 *   3. Classic anchor download fallback (Electron without the folder setting,
 *      Firefox/Safari, Android WebView → Downloads folder).
 * v0.7.94: Android native app is handled FIRST — the WebView cannot download
 *   blob: URLs (the anchor click is silently ignored) and has no
 *   showSaveFilePicker, so the JSON is handed to the MundusNative bridge and
 *   written into the device's public Downloads folder.
 */

/** Blob → base64 (data-URL stripped) so the native bridge can decode it. */
const jsonToBase64 = (jsonString: string): Promise<string> =>
  new Promise((resolve, reject) => {
    try {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const comma = dataUrl.indexOf(',');
        resolve(comma > 0 ? dataUrl.slice(comma + 1) : '');
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to encode backup'));
      reader.readAsDataURL(blob);
    } catch (err) {
      reject(err as Error);
    }
  });

/** Android native path: hand the file to MainActivity's MundusFileBridge. */
const writeBackupViaAndroidBridge = async (
  jsonString: string,
  suggestedName: string
): Promise<BackupWriteResult | null> => {
  if (!isAndroidApp()) return null;
  if (typeof window === 'undefined' || !window.MundusNative?.saveBackupFile) return null;
  try {
    const base64 = await jsonToBase64(jsonString);
    if (!base64) return null;
    let raw: string;
    try {
      raw = window.MundusNative.saveBackupFile(suggestedName, base64);
    } catch (err) {
      console.warn('Android backup bridge threw:', err);
      raw = '';
    }
    try {
      const parsed = JSON.parse(raw || '{}');
      if (parsed?.ok) return { delivered: true, method: 'native', filePath: parsed.path || 'Downloads' };
      if (parsed?.error) console.warn('Android backup bridge error:', parsed.error);
    } catch {
      // Non-JSON reply — treat as failure but keep the ladder moving.
    }
    return { delivered: false, method: 'native' };
  } catch (err) {
    console.warn('Android backup bridge failed:', err);
    return null;
  }
};
export interface BackupWriteResult {
  delivered: boolean;
  method: 'folder' | 'picker' | 'download' | 'native';
  filePath?: string;
}

export const writeBackupJsonToFile = async (
  jsonString: string,
  suggestedName: string,
  options?: { backupDirPath?: string | null }
): Promise<BackupWriteResult> => {
  // 0. Android native app — the WebView ignores anchor downloads entirely.
  const androidResult = await writeBackupViaAndroidBridge(jsonString, suggestedName);
  if (androidResult) return androidResult;

  // 1. Direct write into the user-selected backup folder (Electron only).
  if (options?.backupDirPath && typeof window !== 'undefined' && window.electronAPI?.writeBackupFile) {
    try {
      const res = await window.electronAPI.writeBackupFile(options.backupDirPath, suggestedName, jsonString);
      if (res?.success) return { delivered: true, method: 'folder', filePath: res.filePath };
      console.warn('Direct backup write failed, falling back to picker/download:', res?.error);
    } catch (err) {
      console.warn('Direct backup write threw, falling back to picker/download:', err);
    }
  }

  // 2. Desktop (Electron): use the native save dialog over IPC.
  //    v0.7.93 fix: the web File System Access picker must NEVER run inside
  //    Electron — on Linux (Fedora/GTK) it opened a first dialog whose
  //    writable stream silently failed (empty file), then the anchor-download
  //    fallback popped a second dialog. The native dialog writes the real
  //    content in one step, exactly once.
  if (typeof window !== 'undefined' && window.electronAPI?.saveFile) {
    try {
      const ok = await window.electronAPI.saveFile(suggestedName, jsonString);
      return ok
        ? { delivered: true, method: 'picker' }
        : { delivered: false, method: 'picker' }; // user cancelled the native dialog
    } catch (err) {
      console.warn('Native save dialog failed, falling back:', err);
    }
  }

  // 3. Per-save location picker when the browser supports it.
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: [{
          description: 'Mundus Backup JSON',
          accept: { 'application/json': ['.json'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(jsonString);
      await writable.close();
      return { delivered: true, method: 'picker' };
    } catch (e: any) {
      if (e.name === 'AbortError') return { delivered: false, method: 'picker' }; // User cancelled
    }
  }

  // 4. Standard fallback browser download link
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = suggestedName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return { delivered: true, method: 'download' };
};

/**
 * Downloads full project backup as a clean JSON file, allowing path/file picker when available.
 * v0.7.92: accepts an optional backup folder path (Settings → Backup Folder);
 * when set on desktop the file is written straight into that folder.
 * v0.7.94: also carries the Worlds (projects) list — the missing piece that
 * made restored app-wide backups show nothing on a fresh install — and
 * returns the BackupWriteResult so the UI can confirm the outcome.
 */
export const exportProjectBackupToFile = async (
  data: {
    projects?: any[]; // v0.7.94: MundusProject[] (worlds)
    documents: any[];
    folders: any[];
    characters: any[];
    timelineEvents: any[];
    timelineConfig: any;
    timelineConfigs?: any; // v0.7.74
    codexSections?: any; // v0.7.76
    codexSectionsByProject?: any; // v0.7.76
    storyLinks: any[];
    codexEntries: any[];
  },
  customPrefix: string = 'Mundus_Backup',
  usePicker: boolean = true,
  backupDirPath?: string | null
): Promise<BackupWriteResult> => {
  const fullBackup: ProjectBackupData = {
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    appName: 'Mundus Writing Studio',
    projects: data.projects || [], // v0.7.94
    documents: data.documents || [],
    folders: data.folders || [],
    characters: data.characters || [],
    timelineEvents: data.timelineEvents || [],
    timelineConfig: data.timelineConfig || {},
    timelineConfigs: data.timelineConfigs || {},
    codexSections: data.codexSections || [],
    codexSectionsByProject: data.codexSectionsByProject || {},
    storyLinks: data.storyLinks || [],
    codexEntries: data.codexEntries || []
  };

  const jsonString = JSON.stringify(fullBackup, null, 2);
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const prefix = (customPrefix || 'Mundus_Backup').replace(/[^a-zA-Z0-9_-]/g, '_');
  const suggestedName = `${prefix}_${dateStr}.json`;

  return writeBackupJsonToFile(jsonString, suggestedName, usePicker ? { backupDirPath } : { backupDirPath: null });
};

// ---------------------------------------------------------------------------
// v0.7.92: per-Mundus backup (one whole world: project record, documents,
// folder structure, characters, codex entries + sections, timeline, story
// links, map markers and the map image itself).
// ---------------------------------------------------------------------------

export interface MundusBackupProjectMeta {
  id: string;
  name: string;
  description?: string;
  genre?: string;
  color?: string;
  coverUrl?: string;
  pageFormat?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MundusBackupMapImage {
  fileName: string;
  width: number;
  height: number;
  /** Full image as a data URL so the JSON backup is completely self-contained. */
  dataUrl: string;
}

export interface MundusBackupFile {
  /** Discriminator so the Atlas importer can tell these apart from app-wide backups. */
  kind: 'mundus_backup';
  formatVersion: 1;
  version: string;
  exportedAt: string;
  appName: string;
  project: MundusBackupProjectMeta;
  documents: any[];
  folders: any[];
  characters: any[];
  timelineEvents: any[];
  timelineConfig: any;
  codexSections: any[];
  storyLinks: any[];
  codexEntries: any[];
  mapMarkers: any[];
  mapWorldName?: string;
  mapImage?: MundusBackupMapImage | null;
}

/** Assembles a scoped single-Mundus backup payload from app-state slices. */
export const buildMundusBackupFile = (input: {
  project: MundusBackupProjectMeta;
  documents: any[];
  folders: any[];
  characters: any[];
  timelineEvents: any[];
  timelineConfig: any;
  codexSections: any[];
  storyLinks: any[];
  codexEntries: any[];
  mapMarkers: any[];
  mapWorldName?: string;
  mapImage?: MundusBackupMapImage | null;
}): MundusBackupFile => ({
  kind: 'mundus_backup',
  formatVersion: 1,
  version: APP_VERSION,
  exportedAt: new Date().toISOString(),
  appName: 'Mundus Writing Studio',
  project: input.project,
  documents: input.documents || [],
  folders: input.folders || [],
  characters: input.characters || [],
  timelineEvents: input.timelineEvents || [],
  timelineConfig: input.timelineConfig || null,
  codexSections: input.codexSections || [],
  storyLinks: input.storyLinks || [],
  codexEntries: input.codexEntries || [],
  mapMarkers: input.mapMarkers || [],
  mapWorldName: input.mapWorldName,
  mapImage: input.mapImage ?? null,
});

/**
 * Writes a per-Mundus backup. Same delivery ladder as the app-wide backup
 * (selected folder on desktop → save picker → download).
 */
export const exportMundusBackupToFile = async (
  input: Parameters<typeof buildMundusBackupFile>[0],
  customPrefix: string = 'Mundus_Backup',
  backupDirPath?: string | null
): Promise<BackupWriteResult> => {
  const backup = buildMundusBackupFile(input);
  const jsonString = JSON.stringify(backup, null, 2);
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const namePart = (input.project?.name || 'Mundus').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Mundus';
  const prefix = (customPrefix || 'Mundus_Backup').replace(/[^a-zA-Z0-9_-]/g, '_');
  const suggestedName = `${prefix}_${namePart}_${dateStr}.json`;
  return writeBackupJsonToFile(jsonString, suggestedName, { backupDirPath });
};

/**
 * Parses and validates a per-Mundus backup file produced by this module.
 * Rejects app-wide backups with a helpful message so the Atlas importer can
 * point the user to Settings → Restore instead.
 */
export const parseMundusBackupFile = (file: File): Promise<MundusBackupFile> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON format');
        if (parsed.kind !== 'mundus_backup') {
          throw new Error('This is a full app backup — restore it from Settings → Project Local Backup & Recovery, not the Atlas importer.');
        }
        if (!parsed.project || typeof parsed.project.name !== 'string' || !parsed.project.name.trim()) {
          throw new Error('Backup file is missing the Mundus project record');
        }
        const restored: MundusBackupFile = {
          kind: 'mundus_backup',
          formatVersion: typeof parsed.formatVersion === 'number' ? parsed.formatVersion : 1,
          version: parsed.version || 'unknown',
          exportedAt: parsed.exportedAt || new Date().toISOString(),
          appName: parsed.appName || 'Mundus',
          project: {
            id: typeof parsed.project.id === 'string' ? parsed.project.id : `mundus-${Date.now()}`,
            name: parsed.project.name.trim(),
            description: parsed.project.description,
            genre: parsed.project.genre,
            color: parsed.project.color,
            coverUrl: parsed.project.coverUrl,
            pageFormat: parsed.project.pageFormat,
            createdAt: parsed.project.createdAt,
            updatedAt: parsed.project.updatedAt,
          },
          documents: Array.isArray(parsed.documents) ? parsed.documents : [],
          folders: Array.isArray(parsed.folders) ? parsed.folders : [],
          characters: Array.isArray(parsed.characters) ? parsed.characters : [],
          timelineEvents: Array.isArray(parsed.timelineEvents) ? parsed.timelineEvents : [],
          timelineConfig: parsed.timelineConfig ?? null,
          codexSections: Array.isArray(parsed.codexSections) ? parsed.codexSections : [],
          storyLinks: Array.isArray(parsed.storyLinks) ? parsed.storyLinks : [],
          codexEntries: Array.isArray(parsed.codexEntries) ? parsed.codexEntries : [],
          mapMarkers: Array.isArray(parsed.mapMarkers) ? parsed.mapMarkers : [],
          mapWorldName: typeof parsed.mapWorldName === 'string' ? parsed.mapWorldName : undefined,
          mapImage: (parsed.mapImage && typeof parsed.mapImage.dataUrl === 'string')
            ? {
                fileName: parsed.mapImage.fileName || 'World Map',
                width: typeof parsed.mapImage.width === 'number' ? parsed.mapImage.width : 0,
                height: typeof parsed.mapImage.height === 'number' ? parsed.mapImage.height : 0,
                dataUrl: parsed.mapImage.dataUrl,
              }
            : null,
        };
        resolve(restored);
      } catch (err: any) {
        reject(new Error(`Failed to parse Mundus backup file: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

/**
 * Parses and validates a JSON backup file
 */
export const parseBackupFile = (file: File): Promise<ProjectBackupData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid JSON format');
        }

        const restored: ProjectBackupData = {
          version: parsed.version || 'v0.1',
          exportedAt: parsed.exportedAt || new Date().toISOString(),
          appName: parsed.appName || 'Mundus',
          projects: Array.isArray(parsed.projects) ? parsed.projects : [], // v0.7.94
          documents: Array.isArray(parsed.documents) ? parsed.documents : [],
          folders: Array.isArray(parsed.folders) ? parsed.folders : [],
          characters: Array.isArray(parsed.characters) ? parsed.characters : [],
          timelineEvents: Array.isArray(parsed.timelineEvents) ? parsed.timelineEvents : [],
          timelineConfig: parsed.timelineConfig || {},
          timelineConfigs: parsed.timelineConfigs || {},
          codexSections: parsed.codexSections || [],
          codexSectionsByProject: parsed.codexSectionsByProject || {},
          storyLinks: Array.isArray(parsed.storyLinks) ? parsed.storyLinks : [],
          codexEntries: Array.isArray(parsed.codexEntries) ? parsed.codexEntries : []
        };

        resolve(restored);
      } catch (err: any) {
        reject(new Error(`Failed to parse backup file: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

function sanitizeSnapshotData<T>(obj: T, seen = new WeakSet<object>(), depth = 0): T {
  // Hard guard against excessive recursion depth
  if (depth > 4) return (Array.isArray(obj) ? [] : typeof obj === 'object' && obj !== null ? {} : obj) as any;
  if (!obj || typeof obj !== 'object') return obj;

  // Do not recurse into DOM nodes or window objects
  if (typeof Node !== 'undefined' && obj instanceof Node) return undefined as any;
  if (typeof Window !== 'undefined' && obj instanceof Window) return undefined as any;

  if (seen.has(obj as object)) {
    return '[Circular Reference]' as any;
  }
  seen.add(obj as object);

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeSnapshotData(item, seen, depth + 1)) as any;
  }

  const result: any = {};
  const keys = Object.keys(obj);
  for (const k of keys) {
    try {
      const val = (obj as any)[k];
      if (typeof val === 'string' && val.startsWith('data:image/') && val.length > 2500) {
        // Retain marker rather than duplicating raw multi-megabyte base64 strings across snapshots
        result[k] = '[Local Image]';
      } else if (typeof val === 'object' && val !== null) {
        result[k] = sanitizeSnapshotData(val, seen, depth + 1);
      } else {
        result[k] = val;
      }
    } catch {
      // Gracefully continue if property access throws
    }
  }
  return result;
}

/**
 * Saves automatic local backup snapshot to localStorage (retains max 5 recent snapshots)
 */
export const saveAutoBackupSnapshot = (data: {
  documents: any[];
  folders: any[];
  characters: any[];
  timelineEvents: any[];
  timelineConfig: any;
  timelineConfigs?: any; // v0.7.74
  codexSections?: any; // v0.7.76
  codexSectionsByProject?: any; // v0.7.76
  storyLinks: any[];
  codexEntries: any[];
}): BackupSnapshotMeta => {
  const isDesktop = appStorage.isElectron();
  const fullBackup: ProjectBackupData = {
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    appName: 'Mundus Writing Studio',
    documents: isDesktop ? (data.documents || []) : sanitizeSnapshotData(data.documents || []),
    folders: data.folders || [],
    characters: isDesktop ? (data.characters || []) : sanitizeSnapshotData(data.characters || []),
    timelineEvents: data.timelineEvents || [],
    timelineConfig: data.timelineConfig || {},
    timelineConfigs: data.timelineConfigs || {},
    codexSections: data.codexSections || [],
    codexSectionsByProject: data.codexSectionsByProject || {},
    storyLinks: data.storyLinks || [],
    codexEntries: isDesktop ? (data.codexEntries || []) : sanitizeSnapshotData(data.codexEntries || [])
  };

  const snapshot: BackupSnapshotMeta = {
    id: `snap_${Date.now()}`,
    timestamp: new Date().toISOString(),
    docCount: fullBackup.documents.length,
    charCount: fullBackup.characters.length,
    eventCount: fullBackup.timelineEvents.length,
    codexCount: fullBackup.codexEntries.length,
    data: fullBackup
  };

  try {
    const existing = getAutoBackupSnapshots();
    const updated = [snapshot, ...existing].slice(0, 5); // Keep top 5
    localStorage.setItem(AUTO_BACKUP_STORAGE_KEY, safeJsonStringify(updated));
  } catch (e) {
    console.warn('LocalStorage full, trimming auto-backup snapshots history:', e);
    try {
      // Fallback: keep only the latest 2 snapshots
      const existing = getAutoBackupSnapshots();
      const updated = [snapshot, ...existing].slice(0, 2);
      localStorage.setItem(AUTO_BACKUP_STORAGE_KEY, safeJsonStringify(updated));
    } catch {
      try {
        // Ultimate fallback: keep only the 1 latest snapshot
        localStorage.setItem(AUTO_BACKUP_STORAGE_KEY, safeJsonStringify([snapshot]));
      } catch {
        // If still full, safely ignore
      }
    }
  }

  return snapshot;
};

/**
 * Gets all saved auto-backup snapshots
 */
export const getAutoBackupSnapshots = (): BackupSnapshotMeta[] => {
  try {
    const saved = localStorage.getItem(AUTO_BACKUP_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to load auto-backup snapshots', e);
  }
  return [];
};

/**
 * Clears auto-backup snapshots
 */
export const clearAutoBackupSnapshots = () => {
  localStorage.removeItem(AUTO_BACKUP_STORAGE_KEY);
};
