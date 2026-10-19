import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore,
  initializeFirestore,
  disableNetwork,
  enableNetwork, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  getDoc,
  deleteDoc, 
  query, 
  orderBy,
  getDocFromServer,
  deleteField,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Unsubscribe
} from 'firebase/firestore';
import { 
  getStorage, 
  ref as storageRef, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import type { NovelDocument, Folder, DocumentSnapshot, Character, MundusProject, GoogleFontItem, CustomFont } from '../types';
import type { FontPrefs } from './fontPrefs';
import type { TargetBarPrefs } from './targetProgress';
import { saveLocalSnapshot, getLocalSnapshots, deleteLocalSnapshot } from './syncManager';

export const DEFAULT_AUTHOR_ID = 'author';

// Initialize Firebase App
function sanitizeForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item));
  }
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      sanitized[key] = deleteField();
    } else {
      sanitized[key] = sanitizeForFirestore(value);
    }
  }
  return sanitized;
}

export interface CustomFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  firestoreDatabaseId?: string;
}

export function getCustomStoredFirebaseConfig(): CustomFirebaseConfig | null {
  try {
    const raw = localStorage.getItem('mundus_custom_firebase_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.apiKey && parsed.projectId) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse custom Firebase config:', e);
  }
  return null;
}

export function saveCustomFirebaseConfig(config: CustomFirebaseConfig): void {
  localStorage.setItem('mundus_custom_firebase_config', JSON.stringify(config));
}

export function clearCustomFirebaseConfig(): void {
  localStorage.removeItem('mundus_custom_firebase_config');
}

export function generateEnvFileContent(config: CustomFirebaseConfig): string {
  return `# Custom Firebase Configuration for Mundus
VITE_FIREBASE_API_KEY="${config.apiKey || ''}"
VITE_FIREBASE_AUTH_DOMAIN="${config.authDomain || ''}"
VITE_FIREBASE_PROJECT_ID="${config.projectId || ''}"
VITE_FIREBASE_STORAGE_BUCKET="${config.storageBucket || ''}"
VITE_FIREBASE_MESSAGING_SENDER_ID="${config.messagingSenderId || ''}"
VITE_FIREBASE_APP_ID="${config.appId || ''}"
VITE_FIREBASE_DATABASE_ID="${config.firestoreDatabaseId || '(default)'}"
`;
}

export function downloadEnvFile(config: CustomFirebaseConfig): void {
  const content = generateEnvFileContent(config);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '.env';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const metaEnv = (import.meta as any).env || {};
const customStoredConfig = getCustomStoredFirebaseConfig();
const hasEnvConfig = Boolean(metaEnv.VITE_FIREBASE_API_KEY && metaEnv.VITE_FIREBASE_PROJECT_ID);
const hasCustomConfig = Boolean(customStoredConfig?.apiKey && customStoredConfig?.projectId);

export const isFirebaseConfigured = hasCustomConfig || hasEnvConfig;

const resolvedFirebaseConfig = hasCustomConfig ? {
  apiKey: customStoredConfig!.apiKey,
  authDomain: customStoredConfig!.authDomain,
  projectId: customStoredConfig!.projectId,
  storageBucket: customStoredConfig!.storageBucket,
  messagingSenderId: customStoredConfig!.messagingSenderId,
  appId: customStoredConfig!.appId,
  firestoreDatabaseId: customStoredConfig!.firestoreDatabaseId
} : (hasEnvConfig ? {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY,
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID,
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: metaEnv.VITE_FIREBASE_APP_ID,
  firestoreDatabaseId: metaEnv.VITE_FIREBASE_DATABASE_ID || '(default)'
} : {
  apiKey: "unconfigured-api-key",
  authDomain: "unconfigured.firebaseapp.com",
  projectId: "unconfigured-project"
});

const app = getApps().length > 0 ? getApp() : initializeApp(resolvedFirebaseConfig);

// Initialize Firestore with configured database ID and long-polling enabled to avoid WebChannel stream timeouts.
// A PERSISTENT local cache is critical on Android/Capacitor: with the default memory cache, any write that has not
// been flushed to the backend before the WebView is killed (app backgrounded, reload, crash) is lost forever.
// With persistentLocalCache the mutation queue survives page death in IndexedDB and is automatically drained
// the next time the app starts, so characters/documents created or edited offline-or-killed still reach Firestore.
const dbId = (resolvedFirebaseConfig as any).firestoreDatabaseId?.trim();
const firestoreSettings: any = {
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
};
export const db = (dbId && dbId !== '(default)')
  ? initializeFirestore(app, firestoreSettings, dbId)
  : initializeFirestore(app, firestoreSettings);

// Initialize Firebase Storage
function getResolvedStorage() {
  try {
    const rawBucket = resolvedFirebaseConfig.storageBucket?.trim();
    if (rawBucket) {
      const formatted = rawBucket.startsWith('gs://') ? rawBucket : `gs://${rawBucket}`;
      return getStorage(app, formatted);
    }
    if (resolvedFirebaseConfig.projectId && resolvedFirebaseConfig.projectId !== 'unconfigured-project') {
      return getStorage(app, `gs://${resolvedFirebaseConfig.projectId}.appspot.com`);
    }
    return getStorage(app);
  } catch (e) {
    try {
      return getStorage(app);
    } catch {
      return null as any;
    }
  }
}

export const storage = getResolvedStorage();

// When not configured, immediately disable Firestore network listeners so it stays local/offline
// and never attempts background connections to unconfigured-project that cause the 10s backend timeout error.
if (!isFirebaseConfigured) {
  disableNetwork(db).catch(() => {});
}

// Connectivity check test
export async function testFirestoreConnection(): Promise<boolean> {
  if (!isFirebaseConfigured) return false;
  try {
    await enableNetwork(db).catch(() => {});
    // Check against /users/{authorId} which is permitted by security rules
    await getDocFromServer(doc(db, 'users', DEFAULT_AUTHOR_ID, 'system', 'connection_test'));
    return true;
  } catch (error: any) {
    if (error?.code === 'permission-denied') {
      console.warn('Firestore connected but permission was denied. Verify your security rules under /users/{userId}.');
      return false;
    }
    if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('Could not reach Cloud Firestore') || error.message.includes('NOT_FOUND'))) {
      console.warn('Firestore is currently offline or connecting in cache mode:', error.message);
      return false;
    }
    // If the document simply doesn't exist (not-found), the server connection succeeded!
    return true;
  }
}

// Live diagnostic test for modal inputs
export async function testCustomFirebaseConfig(config: CustomFirebaseConfig): Promise<{ success: boolean; message?: string }> {
  try {
    if (!config.apiKey?.trim()) return { success: false, message: 'API Key is required.' };
    if (!config.projectId?.trim()) return { success: false, message: 'Project ID is required.' };

    const tempAppName = `test_app_${Date.now()}`;
    const tempApp = initializeApp({
      apiKey: config.apiKey.trim(),
      authDomain: config.authDomain?.trim() || `${config.projectId.trim()}.firebaseapp.com`,
      projectId: config.projectId.trim(),
      storageBucket: config.storageBucket?.trim(),
      messagingSenderId: config.messagingSenderId?.trim(),
      appId: config.appId?.trim() || '1:123456789:web:abcdef',
    }, tempAppName);

    const tempDbId = config.firestoreDatabaseId?.trim();
    const tempDb = (tempDbId && tempDbId !== '(default)')
      ? initializeFirestore(tempApp, { experimentalForceLongPolling: true }, tempDbId)
      : initializeFirestore(tempApp, { experimentalForceLongPolling: true });

    // Attempt a server-side read with timeout
    const testPromise = getDocFromServer(doc(tempDb, 'users', DEFAULT_AUTHOR_ID, 'system', 'connection_test'));
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timed out. Please check your Project ID and Database ID.')), 7000)
    );

    await Promise.race([testPromise, timeoutPromise]);
    return { success: true, message: 'Connected successfully to Firestore!' };
  } catch (err: any) {
    console.error('Test Firebase Config Error:', err);
    if (err?.code === 'permission-denied') {
      return { success: false, message: 'Connected to Firestore, but access was denied by security rules. Make sure your rules allow read/write to /users/{userId}.' };
    }
    if (err?.message?.includes('NOT_FOUND') || err?.code === 'not-found') {
      return { success: false, message: 'Database not found. If your Firestore database has a custom name (e.g. ai-studio-...), please enter its exact name in "Database ID".' };
    }
    if (err?.code === 'auth/invalid-api-key' || err?.message?.includes('API_KEY_INVALID')) {
      return { success: false, message: 'Invalid API Key. Please copy the API key from your Firebase Console project settings.' };
    }
    return { success: false, message: err?.message || 'Failed to connect to Firebase.' };
  }
}

// Documents Collection Reference: /users/{userId}/documents/{documentId}
export async function fetchUserDocuments(userId: string): Promise<NovelDocument[]> {
  if (!isFirebaseConfigured) return [];
  try {
    const docsRef = collection(db, 'users', userId, 'documents');
    const q = query(docsRef, orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    
    const docs: NovelDocument[] = [];
    snapshot.forEach((docSnap) => {
      docs.push(docSnap.data() as NovelDocument);
    });
    return docs;
  } catch (error) {
    console.error('Failed to load documents from Firestore:', error);
    throw error;
  }
}

// Real-time listener for user documents across devices (phone <-> desktop sync)
export function subscribeToUserDocuments(
  userId: string,
  onUpdate: (docs: NovelDocument[]) => void,
  onError?: (error: any) => void
): Unsubscribe {
  if (!isFirebaseConfigured || !userId || userId === 'guest') {
    return () => {};
  }
  try {
    const docsRef = collection(db, 'users', userId, 'documents');
    const q = query(docsRef, orderBy('updatedAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const docs: NovelDocument[] = [];
      snapshot.forEach((docSnap) => {
        docs.push(docSnap.data() as NovelDocument);
      });
      onUpdate(docs);
    }, (error) => {
      console.warn('Real-time documents listener error:', error);
      onError?.(error);
    });
  } catch (e) {
    console.warn('Failed to attach real-time documents listener:', e);
    return () => {};
  }
}

export async function saveUserDocument(userId: string, document: NovelDocument): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    const docRef = doc(db, 'users', userId, 'documents', document.id);
    const safeData = sanitizeForFirestore(document);
    await setDoc(docRef, safeData, { merge: true });
  } catch (error) {
    console.error('Failed to save document to Firestore:', error);
    throw error;
  }
}

export async function deleteUserDocument(userId: string, documentId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    const docRef = doc(db, 'users', userId, 'documents', documentId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Failed to delete document from Firestore:', error);
    throw error;
  }
}

// Folders Collection Reference: /users/{userId}/folders/{folderId}
export async function fetchUserFolders(userId: string): Promise<Folder[]> {
  if (!isFirebaseConfigured) return [];
  try {
    const foldersRef = collection(db, 'users', userId, 'folders');
    const q = query(foldersRef, orderBy('createdAt', 'asc'));
    const snapshot = await getDocs(q);
    
    const folders: Folder[] = [];
    snapshot.forEach((docSnap) => {
      folders.push(docSnap.data() as Folder);
    });
    return folders;
  } catch (error) {
    console.error('Failed to load folders from Firestore:', error);
    throw error;
  }
}

// Real-time listener for user folders across devices
export function subscribeToUserFolders(
  userId: string,
  onUpdate: (folders: Folder[]) => void
): Unsubscribe {
  if (!isFirebaseConfigured || !userId || userId === 'guest') {
    return () => {};
  }
  try {
    const foldersRef = collection(db, 'users', userId, 'folders');
    const q = query(foldersRef, orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snapshot) => {
      const folders: Folder[] = [];
      snapshot.forEach((docSnap) => {
        folders.push(docSnap.data() as Folder);
      });
      onUpdate(folders);
    }, (error) => {
      console.warn('Real-time folders listener error:', error);
    });
  } catch (e) {
    console.warn('Failed to attach real-time folders listener:', e);
    return () => {};
  }
}

export async function saveUserFolder(userId: string, folder: Folder): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    const folderRef = doc(db, 'users', userId, 'folders', folder.id);
    const safeData = sanitizeForFirestore(folder);
    await setDoc(folderRef, safeData, { merge: true });
  } catch (error) {
    console.error('Failed to save folder to Firestore:', error);
    throw error;
  }
}

export async function deleteUserFolder(userId: string, folderId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    const folderRef = doc(db, 'users', userId, 'folders', folderId);
    await deleteDoc(folderRef);
  } catch (error) {
    console.error('Failed to delete folder from Firestore:', error);
    throw error;
  }
}

// Document Snapshots / Checkpoints Collection: /users/{userId}/documents/{documentId}/snapshots/{snapshotId}
export async function createDocumentSnapshot(userId: string, snapshot: DocumentSnapshot): Promise<void> {
  // Always save to local cache for offline resilience
  saveLocalSnapshot(snapshot);

  if (!isFirebaseConfigured || !userId || userId === 'guest') {
    return;
  }

  try {
    const snapshotRef = doc(db, 'users', userId, 'documents', snapshot.documentId, 'snapshots', snapshot.id);
    const safeData = sanitizeForFirestore(snapshot);
    await setDoc(snapshotRef, safeData);
  } catch (error) {
    console.warn('Could not save snapshot to Firestore immediately (will be saved locally):', error);
  }
}

export async function fetchDocumentSnapshots(userId: string, documentId: string): Promise<DocumentSnapshot[]> {
  if (!documentId) return [];
  const localSnapshots = getLocalSnapshots(documentId);

  if (!isFirebaseConfigured || !userId || userId === 'guest') {
    return localSnapshots;
  }

  try {
    const snapshotsRef = collection(db, 'users', userId, 'documents', documentId, 'snapshots');
    const q = query(snapshotsRef, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);

    const cloudSnapshots: DocumentSnapshot[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data() as DocumentSnapshot;
      if (data && (data.documentId === documentId || !data.documentId)) {
        cloudSnapshots.push({ ...data, documentId });
      }
    });

    // Merge cloud and local snapshots (deduplicating by ID and strictly checking documentId)
    const combinedMap = new Map<string, DocumentSnapshot>();
    localSnapshots.forEach((s) => {
      if (s && (s.documentId === documentId || !s.documentId)) {
        combinedMap.set(s.id, { ...s, documentId });
      }
    });
    cloudSnapshots.forEach((s) => combinedMap.set(s.id, s));

    const result = Array.from(combinedMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return result;
  } catch (error) {
    console.warn('Could not fetch cloud snapshots, falling back to local snapshots:', error);
    return localSnapshots;
  }
}

export async function deleteDocumentSnapshot(
  userId: string,
  documentId: string,
  snapshotId: string
): Promise<void> {
  deleteLocalSnapshot(documentId, snapshotId);

  if (!isFirebaseConfigured || !userId || userId === 'guest') {
    return;
  }

  try {
    const snapshotRef = doc(db, 'users', userId, 'documents', documentId, 'snapshots', snapshotId);
    await deleteDoc(snapshotRef);
  } catch (error) {
    console.error('Failed to delete snapshot from Firestore:', error);
    throw error;
  }
}

// Characters Collection Reference: /users/{userId}/characters/{characterId}
// v0.7.75 FIX: this fetch used `orderBy('updatedAt', 'desc')`. Firestore
// silently EXCLUDES documents that are missing the ordered field, so any
// character whose cloud doc lacked `updatedAt` (saved by older versions, or
// with an undefined timestamp that sanitizeForFirestore deleteField()-ed) was
// permanently invisible to EVERY device's cloud fetch — the character existed
// in Firestore but never reached the phone or any other machine. We now fetch
// ALL character docs and sort client-side (missing timestamps sort last).
export async function fetchUserCharacters(userId: string): Promise<Character[]> {
  if (!isFirebaseConfigured) return [];
  try {
    const charsRef = collection(db, 'users', userId, 'characters');
    const snapshot = await getDocs(charsRef);

    const characters: Character[] = [];
    snapshot.forEach((docSnap) => {
      characters.push(docSnap.data() as Character);
    });
    characters.sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt || 0).getTime() -
        new Date(a.updatedAt || a.createdAt || 0).getTime()
    );
    return characters;
  } catch (error) {
    console.error('Failed to load characters from Firestore:', error);
    throw error;
  }
}

// v0.7.75 FIX: guarantee every cloud character doc carries createdAt/updatedAt.
// A character saved without these timestamps could never be fetched back
// (Firestore ordered queries exclude docs missing the ordered field).
export async function saveUserCharacter(userId: string, character: Character): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    const charRef = doc(db, 'users', userId, 'characters', character.id);
    const nowIso = new Date().toISOString();
    const withTimestamps = {
      ...character,
      createdAt: character.createdAt || character.updatedAt || nowIso,
      updatedAt: character.updatedAt || nowIso,
    };
    const safeData = sanitizeForFirestore(withTimestamps);
    await setDoc(charRef, safeData, { merge: true });
  } catch (error) {
    console.error('Failed to save character to Firestore:', error);
    throw error;
  }
}

// Real-time listener for user characters across devices (v0.7.75).
// Characters previously had NO live listener (documents/folders/projects did),
// so characters created or edited on one device only appeared on the others
// after a full reload — and remote DELETIONS never propagated at all.
// Emits the full roster plus the ids removed since the previous emission so the
// app can propagate deletions. No orderBy (see fetchUserCharacters).
export function subscribeToUserCharacters(
  userId: string,
  onUpdate: (characters: Character[], removedIds: string[]) => void,
  onError?: (error: any) => void
): Unsubscribe {
  if (!isFirebaseConfigured || !userId || userId === 'guest') {
    return () => {};
  }
  try {
    const charsRef = collection(db, 'users', userId, 'characters');
    return onSnapshot(charsRef, (snapshot) => {
      const characters: Character[] = [];
      const removedIds: string[] = [];
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'removed') removedIds.push(change.doc.id);
      });
      snapshot.forEach((docSnap) => {
        characters.push(docSnap.data() as Character);
      });
      characters.sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime()
      );
      onUpdate(characters, removedIds);
    }, (error) => {
      console.warn('Real-time characters listener error:', error);
      onError?.(error);
    });
  } catch (e) {
    console.warn('Failed to attach real-time characters listener:', e);
    return () => {};
  }
}

export async function deleteUserCharacter(userId: string, characterId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    const charRef = doc(db, 'users', userId, 'characters', characterId);
    await deleteDoc(charRef);
  } catch (error) {
    console.error('Failed to delete character from Firestore:', error);
    throw error;
  }
}

// Codex Collection Reference: /users/{userId}/codex/{codexId}
// v0.7.75: same orderBy-exclusion fix as fetchUserCharacters (defensive — a
// codex entry saved without updatedAt would be invisible to every device).
export async function fetchUserCodexEntries(userId: string): Promise<any[]> {
  if (!isFirebaseConfigured) return [];
  try {
    const ref = collection(db, 'users', userId, 'codex');
    const snapshot = await getDocs(ref);
    const entries: any[] = [];
    snapshot.forEach((docSnap) => {
      entries.push(docSnap.data());
    });
    entries.sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt || 0).getTime() -
        new Date(a.updatedAt || a.createdAt || 0).getTime()
    );
    return entries;
  } catch (error) {
    console.error('Failed to load codex entries from Firestore:', error);
    throw error;
  }
}

// v0.7.75: stamp timestamps (see saveUserCharacter).
export async function saveUserCodexEntry(userId: string, entry: any): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    const ref = doc(db, 'users', userId, 'codex', entry.id);
    const nowIso = new Date().toISOString();
    const withTimestamps = {
      ...entry,
      createdAt: entry.createdAt || entry.updatedAt || nowIso,
      updatedAt: entry.updatedAt || nowIso,
    };
    const safeData = sanitizeForFirestore(withTimestamps);
    await setDoc(ref, safeData, { merge: true });
  } catch (error) {
    console.error('Failed to save codex entry to Firestore:', error);
    throw error;
  }
}

export async function deleteUserCodexEntry(userId: string, entryId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    const ref = doc(db, 'users', userId, 'codex', entryId);
    await deleteDoc(ref);
  } catch (error) {
    console.error('Failed to delete codex entry from Firestore:', error);
    throw error;
  }
}

// Custom Dictionary Sync: /users/{userId}/settings/dictionary OR dictionary_{projectId}
export async function fetchUserCustomWords(userId: string, projectId?: string): Promise<string[]> {
  if (!isFirebaseConfigured) return [];
  try {
    const docName = projectId && projectId.trim() ? `dictionary_${projectId.trim()}` : 'dictionary';
    const ref = doc(db, 'users', userId, 'settings', docName);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.words)) {
        return data.words;
      }
    }
    return [];
  } catch (error) {
    console.error('Failed to load custom dictionary from Firestore:', error);
    return [];
  }
}

export async function saveUserCustomWords(userId: string, words: string[], projectId?: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    const docName = projectId && projectId.trim() ? `dictionary_${projectId.trim()}` : 'dictionary';
    const ref = doc(db, 'users', userId, 'settings', docName);
    await setDoc(ref, {
      words,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.error('Failed to save custom dictionary to Firestore:', error);
  }
}

// Custom Added Google Fonts Sync: /users/{userId}/settings/googleFonts
export async function fetchUserGoogleFonts(userId: string): Promise<GoogleFontItem[]> {
  if (!isFirebaseConfigured || !userId || userId === 'guest') return [];
  try {
    const ref = doc(db, 'users', userId, 'settings', 'googleFonts');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.fonts)) {
        return data.fonts as GoogleFontItem[];
      }
    }
    return [];
  } catch (error) {
    console.error('Failed to load Google fonts from Firestore:', error);
    return [];
  }
}

export async function saveUserGoogleFonts(userId: string, fonts: GoogleFontItem[]): Promise<void> {
  if (!isFirebaseConfigured || !userId || userId === 'guest') return;
  try {
    const ref = doc(db, 'users', userId, 'settings', 'googleFonts');
    const safeFonts = sanitizeForFirestore(fonts);
    await setDoc(ref, {
      fonts: safeFonts,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.error('Failed to save Google fonts to Firestore:', error);
  }
}

// Timeline & Story Links Sync: /users/{userId}/settings/timeline
// v0.7.74: `config` remains the shared fallback calendar (backward compat with
// pre-0.7.74 clients); `configByProject` holds each project's independent
// calendar as { [mundusId]: TimelineConfig } (entries carry updatedAt for merge).
export async function fetchUserTimelineData(userId: string): Promise<{ config?: any; configByProject?: Record<string, any>; events?: any[]; links?: any[] } | null> {
  if (!isFirebaseConfigured) return null;
  try {
    const ref = doc(db, 'users', userId, 'settings', 'timeline');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as any;
    }
    return null;
  } catch (error) {
    console.error('Failed to load timeline data from Firestore:', error);
    return null;
  }
}

export async function saveUserTimelineData(
  userId: string,
  data: { config?: any; configByProject?: Record<string, any>; events?: any[]; links?: any[] }
): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    const ref = doc(db, 'users', userId, 'settings', 'timeline');
    const safeData = sanitizeForFirestore({
      ...data,
      updatedAt: new Date().toISOString()
    });
    await setDoc(ref, safeData, { merge: true });
  } catch (error) {
    console.error('Failed to save timeline data to Firestore:', error);
  }
}

// Codex Categories (sections) Sync — v0.7.76: /users/{userId}/settings/codex_sections
// sections = legacy shared fallback list (pre-0.7.76 behavior)
// sectionsByProject = per-project lists { [mundusId]: CodexSection[] }
export async function fetchUserCodexSections(userId: string): Promise<{ sections?: any[]; sectionsByProject?: Record<string, any[]> } | null> {
  if (!isFirebaseConfigured) return null;
  try {
    const ref = doc(db, 'users', userId, 'settings', 'codex_sections');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as any;
    }
    return null;
  } catch (error) {
    console.error('Failed to load codex sections from Firestore:', error);
    return null;
  }
}

export async function saveUserCodexSections(
  userId: string,
  data: { sections?: any[]; sectionsByProject?: Record<string, any[]> }
): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    const ref = doc(db, 'users', userId, 'settings', 'codex_sections');
    const safeData = sanitizeForFirestore({
      ...data,
      updatedAt: new Date().toISOString()
    });
    await setDoc(ref, safeData, { merge: true });
  } catch (error) {
    console.error('Failed to save codex sections to Firestore:', error);
  }
}

// ImgBB API Key Hosting Sync: /users/{userId}/settings/imgbb
export async function fetchUserImgbbApiKey(userId: string): Promise<string> {
  if (!isFirebaseConfigured || !userId || userId === 'guest') return '';
  try {
    const ref = doc(db, 'users', userId, 'settings', 'imgbb');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      if (typeof data.apiKey === 'string') {
        return data.apiKey;
      }
    }
    return '';
  } catch (error) {
    console.error('Failed to load ImgBB API key from Firestore:', error);
    return '';
  }
}

export async function saveUserImgbbApiKey(userId: string, apiKey: string): Promise<void> {
  if (!isFirebaseConfigured || !userId || userId === 'guest') return;
  try {
    const ref = doc(db, 'users', userId, 'settings', 'imgbb');
    await setDoc(ref, {
      apiKey: apiKey.trim(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.error('Failed to save ImgBB API key to Firestore:', error);
    throw error;
  }
}

// Font Preferences Sync: /users/{userId}/settings/fontPrefs (v0.7.83)
// Default paragraph/heading/quote fonts, last-write-wins via updatedAt.
export async function fetchUserFontPrefs(userId: string): Promise<Partial<FontPrefs> | null> {
  if (!isFirebaseConfigured || !userId || userId === 'guest') return null;
  try {
    const ref = doc(db, 'users', userId, 'settings', 'fontPrefs');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const out: Partial<FontPrefs> = {};
      if (typeof data.paragraphFont === 'string') out.paragraphFont = data.paragraphFont;
      if (typeof data.headingFont === 'string') out.headingFont = data.headingFont;
      if (typeof data.quoteFont === 'string') out.quoteFont = data.quoteFont;
      if (typeof data.updatedAt === 'string') out.updatedAt = data.updatedAt;
      return out;
    }
    return null;
  } catch (error) {
    console.error('Failed to load font preferences from Firestore:', error);
    return null;
  }
}

export async function saveUserFontPrefs(userId: string, prefs: FontPrefs): Promise<void> {
  if (!isFirebaseConfigured || !userId || userId === 'guest') return;
  try {
    const ref = doc(db, 'users', userId, 'settings', 'fontPrefs');
    await setDoc(ref, {
      paragraphFont: prefs.paragraphFont,
      headingFont: prefs.headingFont,
      quoteFont: prefs.quoteFont,
      updatedAt: prefs.updatedAt
    }, { merge: true });
  } catch (error) {
    console.error('Failed to save font preferences to Firestore:', error);
  }
}

// Target-bar preference sync: /users/{userId}/settings/targetBarPrefs (v0.7.85)
// Dynamic target-bar coloring toggle, last-write-wins via updatedAt.
export async function fetchUserTargetBarPrefs(userId: string): Promise<Partial<TargetBarPrefs> | null> {
  if (!isFirebaseConfigured || !userId || userId === 'guest') return null;
  try {
    const ref = doc(db, 'users', userId, 'settings', 'targetBarPrefs');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const out: Partial<TargetBarPrefs> = {};
      if (typeof data.dynamicTargetBarColor === 'boolean') out.dynamicTargetBarColor = data.dynamicTargetBarColor;
      if (typeof data.updatedAt === 'string') out.updatedAt = data.updatedAt;
      return out;
    }
    return null;
  } catch (error) {
    console.error('Failed to load target-bar preference from Firestore:', error);
    return null;
  }
}

export async function saveUserTargetBarPrefs(userId: string, prefs: TargetBarPrefs): Promise<void> {
  if (!isFirebaseConfigured || !userId || userId === 'guest') return;
  try {
    const ref = doc(db, 'users', userId, 'settings', 'targetBarPrefs');
    await setDoc(ref, {
      dynamicTargetBarColor: prefs.dynamicTargetBarColor,
      updatedAt: prefs.updatedAt
    }, { merge: true });
  } catch (error) {
    console.error('Failed to save target-bar preference to Firestore:', error);
  }
}

// Mundus Projects (Worlds) Collection: /users/{userId}/mundusProjects/{projectId}
export async function fetchUserMundusProjects(userId: string): Promise<MundusProject[]> {
  if (!isFirebaseConfigured) return [];
  try {
    const projectsRef = collection(db, 'users', userId, 'mundusProjects');
    const q = query(projectsRef, orderBy('createdAt', 'asc'));
    const snapshot = await getDocs(q);
    
    const projects: MundusProject[] = [];
    snapshot.forEach((docSnap) => {
      projects.push(docSnap.data() as MundusProject);
    });
    return projects;
  } catch (error) {
    console.error('Failed to load mundus projects from Firestore:', error);
    throw error;
  }
}

// Real-time listener for Mundus Projects (Worlds) across devices
export function subscribeToUserMundusProjects(
  userId: string,
  onUpdate: (projects: MundusProject[]) => void
): Unsubscribe {
  if (!isFirebaseConfigured || !userId || userId === 'guest') {
    return () => {};
  }
  try {
    const projectsRef = collection(db, 'users', userId, 'mundusProjects');
    const q = query(projectsRef, orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snapshot) => {
      const projects: MundusProject[] = [];
      snapshot.forEach((docSnap) => {
        projects.push(docSnap.data() as MundusProject);
      });
      onUpdate(projects);
    }, (error) => {
      console.warn('Real-time mundus projects listener error:', error);
    });
  } catch (e) {
    console.warn('Failed to attach real-time mundus projects listener:', e);
    return () => {};
  }
}

export async function saveUserMundusProject(userId: string, project: MundusProject): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    const projectRef = doc(db, 'users', userId, 'mundusProjects', project.id);
    const safeData = sanitizeForFirestore(project);
    await setDoc(projectRef, safeData, { merge: true });
  } catch (error) {
    console.error('Failed to save mundus project to Firestore:', error);
    throw error;
  }
}

export async function deleteUserMundusProject(userId: string, projectId: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  try {
    const projectRef = doc(db, 'users', userId, 'mundusProjects', projectId);
    await deleteDoc(projectRef);
  } catch (error) {
    console.error('Failed to delete mundus project from Firestore:', error);
    throw error;
  }
}

// Custom Fonts Collection Reference: /users/{userId}/customFonts/{fontId}
export async function fetchUserCustomFonts(userId: string): Promise<CustomFont[]> {
  if (!isFirebaseConfigured || !userId || userId === 'guest') return [];
  try {
    const fontsRef = collection(db, 'users', userId, 'customFonts');
    const snapshot = await getDocs(fontsRef);
    
    const fonts: CustomFont[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && data.id && data.dataUrl) {
        fonts.push({
          id: data.id,
          name: data.name,
          fontFamily: data.fontFamily,
          dataUrl: data.dataUrl
        });
      }
    });
    return fonts;
  } catch (error) {
    console.error('Failed to load custom fonts from Firestore:', error);
    return [];
  }
}

export function subscribeToUserCustomFonts(
  userId: string,
  onUpdate: (fonts: CustomFont[]) => void,
  onError?: (error: any) => void
): Unsubscribe {
  if (!isFirebaseConfigured || !userId || userId === 'guest') {
    return () => {};
  }
  try {
    const fontsRef = collection(db, 'users', userId, 'customFonts');
    return onSnapshot(fontsRef, (snapshot) => {
      const fonts: CustomFont[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.id && data.dataUrl) {
          fonts.push({
            id: data.id,
            name: data.name,
            fontFamily: data.fontFamily,
            dataUrl: data.dataUrl
          });
        }
      });
      onUpdate(fonts);
    }, (error) => {
      console.warn('Real-time custom fonts listener error:', error);
      onError?.(error);
    });
  } catch (e) {
    console.warn('Failed to attach real-time custom fonts listener:', e);
    return () => {};
  }
}

export async function saveUserCustomFont(userId: string, font: CustomFont): Promise<void> {
  if (!isFirebaseConfigured || !userId || userId === 'guest') return;
  try {
    const fontRef = doc(db, 'users', userId, 'customFonts', font.id);
    const safeData = sanitizeForFirestore({
      ...font,
      updatedAt: new Date().toISOString()
    });
    await setDoc(fontRef, safeData, { merge: true });
  } catch (error) {
    console.error('Failed to save custom font to Firestore:', error);
  }
}

export async function deleteUserCustomFont(userId: string, fontId: string): Promise<void> {
  if (!isFirebaseConfigured || !userId || userId === 'guest') return;
  try {
    const fontRef = doc(db, 'users', userId, 'customFonts', fontId);
    await deleteDoc(fontRef);
  } catch (error) {
    console.error('Failed to delete custom font from Firestore:', error);
  }
}

// ==========================================
// MAP MODE CLOUD SYNC & FIREBASE STORAGE
// ==========================================

export interface UserMapData {
  mundusId: string;
  imageUrl: string;
  fileName?: string;
  width?: number;
  height?: number;
  worldName?: string;
  updatedAt: string;
}

// Uploads a map image to Firebase Storage and records its URL in Firestore.
// Automatically replaces/overwrites any previous map image for this Mundus project,
// ensuring only one active map image is stored on Firebase per world.
export async function uploadUserMapImage(
  userId: string,
  mundusId: string,
  file: File | Blob,
  fileName: string,
  dimensions?: { width: number; height: number }
): Promise<string> {
  if (!isFirebaseConfigured || !userId || userId === 'guest') {
    throw new Error('Firebase is not configured.');
  }

  try {
    // 1. Upload to Firebase Storage with a deterministic path that replaces any previous map for this Mundus project
    const mapPath = `maps/${userId}/${mundusId}/active_map`;
    const mapFileRef = storageRef(storage, mapPath);
    
    const metadata = {
      contentType: file.type || 'image/jpeg',
      customMetadata: {
        mundusId,
        userId,
        fileName,
        uploadedAt: new Date().toISOString(),
      },
    };

    await uploadBytes(mapFileRef, file, metadata);
    const downloadUrl = await getDownloadURL(mapFileRef);

    // 2. Save metadata in Firestore
    const mapDocRef = doc(db, 'users', userId, 'mundus_maps', mundusId);
    await setDoc(
      mapDocRef,
      sanitizeForFirestore({
        mundusId,
        imageUrl: downloadUrl,
        fileName,
        width: dimensions?.width,
        height: dimensions?.height,
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );

    return downloadUrl;
  } catch (err) {
    console.error('Failed to upload map image to Firebase Storage:', err);
    throw err;
  }
}

// Fetches the stored map data from Firestore
export async function fetchUserMapData(userId: string, mundusId: string): Promise<UserMapData | null> {
  if (!isFirebaseConfigured || !userId || userId === 'guest') return null;
  try {
    const mapDocRef = doc(db, 'users', userId, 'mundus_maps', mundusId);
    const snap = await getDoc(mapDocRef);
    if (snap.exists()) {
      return snap.data() as UserMapData;
    }
    return null;
  } catch (err) {
    console.error('Failed to fetch map data from Firestore:', err);
    return null;
  }
}

// Saves/updates map metadata (such as realm name or dimensions)
export async function saveUserMapMetadata(
  userId: string,
  mundusId: string,
  metadata: Partial<UserMapData>
): Promise<void> {
  if (!isFirebaseConfigured || !userId || userId === 'guest') return;
  try {
    const mapDocRef = doc(db, 'users', userId, 'mundus_maps', mundusId);
    await setDoc(
      mapDocRef,
      sanitizeForFirestore({
        ...metadata,
        mundusId,
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (err) {
    console.error('Failed to save map metadata to Firestore:', err);
  }
}

// Deletes the map image from Firebase Storage and removes its record from Firestore
export async function deleteUserMap(userId: string, mundusId: string): Promise<void> {
  if (!isFirebaseConfigured || !userId || userId === 'guest') return;
  try {
    // 1. Delete file from Firebase Storage
    const mapPath = `maps/${userId}/${mundusId}/active_map`;
    const mapFileRef = storageRef(storage, mapPath);
    await deleteObject(mapFileRef).catch((e) => {
      if (e?.code !== 'storage/object-not-found') {
        console.warn('Firebase storage map deletion note:', e);
      }
    });

    // 2. Delete document from Firestore
    const mapDocRef = doc(db, 'users', userId, 'mundus_maps', mundusId);
    await deleteDoc(mapDocRef);
  } catch (err) {
    console.error('Failed to delete map from Firebase:', err);
  }
}



