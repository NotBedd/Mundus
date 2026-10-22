import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import type { NovelDocument, ActiveSection, Folder, AutoSaveInterval, CustomFont, DocumentSnapshot, Character, TimelineEvent, TimelineConfig, StoryNodeLink, SceneTimelineInfo, CodexEntry, CodexSection, MundusProject, GoogleFontItem, PageFormat } from './types';
import { INITIAL_DOCUMENTS, INITIAL_FOLDERS, INITIAL_CHARACTERS, INITIAL_TIMELINE_EVENTS, INITIAL_STORY_LINKS, INITIAL_CODEX_ENTRIES, INITIAL_MUNDUS_PROJECTS } from './lib/initialData';
import { DEFAULT_PAGE_FORMAT } from './lib/pageFormats';
import { setActivePageFormatGlobal } from './lib/exportUtils';
import { 
  DEFAULT_AUTHOR_ID,
  isFirebaseConfigured,
  fetchUserDocuments, 
  saveUserDocument, 
  deleteUserDocument,
  fetchUserFolders,
  saveUserFolder,
  deleteUserFolder,
  testFirestoreConnection,
  createDocumentSnapshot,
  fetchDocumentSnapshots,
  deleteDocumentSnapshot,
  fetchUserCharacters,
  saveUserCharacter,
  deleteUserCharacter,
  fetchUserCodexEntries,
  saveUserCodexEntry,
  deleteUserCodexEntry,
  fetchUserCustomWords,
  saveUserCustomWords,
  fetchUserTimelineData,
  saveUserTimelineData,
  fetchUserCodexSections,
  saveUserCodexSections,
  fetchUserImgbbApiKey,
  saveUserImgbbApiKey,
  fetchUserFontPrefs,
  saveUserFontPrefs,
  fetchUserTargetBarPrefs,
  saveUserTargetBarPrefs,
  fetchUserGoogleFonts,
  saveUserGoogleFonts,
  fetchUserMundusProjects,
  saveUserMundusProject,
  deleteUserMundusProject,
  subscribeToUserDocuments,
  subscribeToUserCharacters,
  subscribeToUserFolders,
  subscribeToUserMundusProjects,
  subscribeToUserCustomFonts,
  fetchUserCustomFonts,
  saveUserCustomFont,
  uploadUserMapImage
} from './lib/firebase';
import { estimateStorageUsage } from './lib/storageEstimate';
import { getCustomDictionary, saveCustomDictionary, getCharacterNameHighlightEnabled, setCharacterNameHighlightEnabled } from './lib/dictionaryManager';
import { getDynamicTargetBarColorEnabled, setDynamicTargetBarColorEnabled, collectLocalTargetBarPrefs, stampLocalTargetBarPrefs, applyTargetBarPrefsToLocalStorage, mergeTargetBarPrefs } from './lib/targetProgress';
import {
  loadLegacyTimelineConfig,
  loadTimelineConfigMap,
  saveTimelineConfigMap,
  saveLegacyTimelineConfig,
  resolveTimelineConfig,
  mergeTimelineConfigMaps,
  normalizeTimelineConfig,
  normalizeTimelineConfigMap,
  type TimelineConfigMap
} from './lib/timelineConfigStore';
import {
  loadLegacyCodexSections,
  loadCodexSectionsMap,
  saveCodexSectionsMap,
  saveLegacyCodexSections,
  resolveCodexSections,
  mergeCodexSectionMaps,
  stampCodexSections,
  normalizeCodexSections,
  normalizeCodexSectionsMap,
  type CodexSectionsMap
} from './lib/codexSectionsStore';
import { 
  isBrowserOnline, 
  subscribeToOnlineStatus, 
  getPendingSyncDocIds, 
  markDocPendingSync, 
  clearDocPendingSync,
  getPendingSyncCharacterIds,
  markCharacterPendingSync,
  clearCharacterPendingSync,
  markCharacterDeleted,
  isCharacterDeleted,
  getDeletedCharacterIds,
  pruneCharacterTombstones,
  mergeCharacterRosters,
  normalizeCharacterTimestamps
} from './lib/syncManager';
import { initializeCustomFonts, uploadCustomFontFile, removeCustomFont, syncAndRegisterCustomFonts } from './lib/fontManager';
import { sanitizeCharacter, pickCharacterFields } from './lib/characterSanitize';
import { syncRelativesAcrossCharacters, purgeDeletedCharacterReferences } from './utils/characterRelativesSync';
import { resolveFontCss } from './utils/defaultFonts';
import { CURATED_GOOGLE_FONTS, loadGoogleFont, isValidGoogleFontItem } from './data/googleFonts';
import { collectLocalFontPrefs, stampLocalFontPrefs, applyFontPrefsToLocalStorage, mergeFontPrefs } from './lib/fontPrefs';
import { 
  exportProjectBackupToFile, 
  parseBackupFile, 
  mergeSnapshotItems,
  saveAutoBackupSnapshot, 
  getAutoBackupSnapshots, 
  exportMundusBackupToFile,
  parseMundusBackupFile,
  AUTO_BACKUP_STORAGE_KEY,
  type BackupSnapshotMeta,
  type MundusBackupFile 
} from './lib/backupEngine';
import { getLocalMapImage, saveLocalMapImage, deleteLocalMapImage } from './lib/mapStorage';
import {
  readStoryFlowLayout,
  writeStoryFlowLayout,
  normalizeStoryFlowLayout,
  remapStoryFlowLayout,
  mergeStoryFlowLayouts,
  clearStoryFlowLayout,
  type StoryFlowLayout,
} from './lib/storyFlowLayout';
import { addWordToCustomDictionary } from './lib/spellCheckEngine';
import { safeJsonStringify } from './lib/storage';
import { getKeybindings, matchesBinding } from './lib/shortcutManager';
import { ToastContainer, type ToastItem } from './components/Toast';
import { ConfirmDialogHost, showConfirmDialog } from './components/ConfirmDialog';
import { Sidebar } from './components/Sidebar';
import { FirebaseConfigModal } from './components/FirebaseConfigModal';
import { TextEditor } from './components/TextEditor';
import { StartMenu } from './components/StartMenu';
import { SectionPreview } from './components/SectionPreview';
import { CharactersMode } from './components/characters/CharactersMode';
import { LoreMode } from './components/lore/LoreMode';
import { MapMode } from './components/map/MapMode';
import { SettingsModal } from './components/SettingsModal';
import { MundusAtlas } from './components/MundusAtlas';

/**
 * v0.7.93: focuses the first actually-visible focusable element inside `root`
 * (used by the Alt+Up / Alt+Down "cursor to top/bottom bar" shortcuts —
 * hidden mobile/desktop toolbar variants must be skipped).
 */
const focusFirstVisibleElement = (root: HTMLElement | null): boolean => {
  if (!root) return false;
  const candidates = root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  );
  for (const el of Array.from(candidates)) {
    if (el.getClientRects().length > 0) {
      el.focus();
      return true;
    }
  }
  return false;
};

export default function App() {
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('mundus_theme') || localStorage.getItem('novelist_theme');
    return saved ? saved === 'dark' : false;
  });

  // Settings & hover expand preference
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [expandSidebarOnHover, setExpandSidebarOnHover] = useState<boolean>(() => {
    const saved = localStorage.getItem('mundus_expand_sidebar_on_hover');
    return saved !== null ? saved === 'true' : false;
  });

  const handleToggleExpandSidebarOnHover = (enabled: boolean) => {
    setExpandSidebarOnHover(enabled);
    localStorage.setItem('mundus_expand_sidebar_on_hover', String(enabled));
  };

  // Character name badge-color highlight setting (Editor & Scene Detection)
  const [characterNameHighlightEnabled, setCharacterNameHighlightState] = useState<boolean>(() => getCharacterNameHighlightEnabled());

  const handleToggleCharacterNameHighlight = (enabled: boolean) => {
    setCharacterNameHighlightState(enabled);
    setCharacterNameHighlightEnabled(enabled);
  };

  // v0.8.1: Harper suggestion popup layout (Editor & Scene Detection).
  // false (default) = horizontal cycle with ←/→; true = all candidates stacked
  // vertically, chosen with ↑/↓. Local-only preference, read by TextEditor
  // through a prop so an open editor reacts immediately.
  const [harperSuggestionsVertical, setHarperSuggestionsVertical] = useState<boolean>(() => {
    try { return localStorage.getItem('mundus_harper_vertical') === 'true'; } catch { return false; }
  });

  const handleToggleHarperSuggestionsVertical = (enabled: boolean) => {
    setHarperSuggestionsVertical(enabled);
    try { localStorage.setItem('mundus_harper_vertical', String(enabled)); } catch { /* private mode */ }
  };

  // v0.7.84: dynamic writing-target bar coloring (Editor & Scene Detection).
  // v0.7.85: the toggle SYNCS across devices - same last-write-wins pattern as
  // font prefs (local stamp + /users/{id}/settings/targetBarPrefs, fire-and-forget).
  const [dynamicTargetBarColorEnabled, setDynamicTargetBarColorState] = useState<boolean>(() => getDynamicTargetBarColorEnabled());

  const stampAndPushTargetBarPrefs = () => {
    stampLocalTargetBarPrefs();
    saveUserTargetBarPrefs(DEFAULT_AUTHOR_ID, collectLocalTargetBarPrefs());
  };

  const handleToggleDynamicTargetBarColor = (enabled: boolean) => {
    setDynamicTargetBarColorState(enabled);
    setDynamicTargetBarColorEnabled(enabled);
    stampAndPushTargetBarPrefs();
  };

  // Default typography state
  const [defaultParagraphFont, setDefaultParagraphFont] = useState<string>(() => localStorage.getItem('mundus_default_p_font') || 'serif');
  const [defaultHeadingFont, setDefaultHeadingFont] = useState<string>(() => localStorage.getItem('mundus_default_h_font') || 'serif');
  const [defaultQuoteFont, setDefaultQuoteFont] = useState<string>(() => localStorage.getItem('mundus_default_quote_font') || 'serif');

  // v0.7.83: every font-preference change stamps mundus_font_prefs_updated and
  // pushes the full set to /users/{id}/settings/fontPrefs (fire-and-forget, like
  // the original cloud helpers). Startup merge (below) resolves conflicts
  // last-write-wins, so the most recent edit wins on every device.
  const stampAndPushFontPrefs = () => {
    stampLocalFontPrefs();
    saveUserFontPrefs(DEFAULT_AUTHOR_ID, collectLocalFontPrefs());
  };
  const handleUpdateParagraphFont = (val: string) => { setDefaultParagraphFont(val); localStorage.setItem('mundus_default_p_font', val); stampAndPushFontPrefs(); };
  const handleUpdateHeadingFont = (val: string) => { setDefaultHeadingFont(val); localStorage.setItem('mundus_default_h_font', val); stampAndPushFontPrefs(); };
  const handleUpdateQuoteFont = (val: string) => { setDefaultQuoteFont(val); localStorage.setItem('mundus_default_quote_font', val); stampAndPushFontPrefs(); };

  // Custom fonts state
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);

  // Apply typography CSS variables
  useEffect(() => {
    document.documentElement.style.setProperty('--default-p-font', resolveFontCss(defaultParagraphFont, customFonts));
    document.documentElement.style.setProperty('--default-h-font', resolveFontCss(defaultHeadingFont, customFonts));
    document.documentElement.style.setProperty('--default-quote-font', resolveFontCss(defaultQuoteFont, customFonts));
  }, [defaultParagraphFont, defaultHeadingFont, defaultQuoteFont, customFonts]);

  // Auto-save interval preference
  const [autoSaveInterval, setAutoSaveInterval] = useState<AutoSaveInterval>(() => {
    const saved = localStorage.getItem('mundus_autosave');
    return (saved as AutoSaveInterval) || 'every_edit';
  });

  // Mundus Projects (Worlds) state
  const [mundusProjects, setMundusProjects] = useState<MundusProject[]>(() => {
    const local = localStorage.getItem('mundus_projects');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          return parsed.filter((p: MundusProject) => p.id !== 'mundus-prima');
        }
      } catch (e) {
        console.error('Failed to parse local mundus projects:', e);
      }
    }
    return INITIAL_MUNDUS_PROJECTS;
  });

  const [activeMundusId, setActiveMundusId] = useState<string>(() => {
    const saved = localStorage.getItem('mundus_active_id');
    if (saved && saved !== 'mundus-prima') return saved;
    return mundusProjects[0]?.id || '';
  });

  // App starts on the Mundus Atlas hub view
  const [isInAtlasView, setIsInAtlasView] = useState<boolean>(true);

  // Persist mundus projects
  useEffect(() => {
    try {
      localStorage.setItem('mundus_projects', JSON.stringify(mundusProjects));
    } catch (e) {
      console.error('Failed to persist mundus projects locally:', e);
    }
  }, [mundusProjects]);

  useEffect(() => {
    try {
      localStorage.setItem('mundus_active_id', activeMundusId);
    } catch (e) {
      console.error('Failed to persist active mundus ID locally:', e);
    }
  }, [activeMundusId]);

  // Folders state
  const [folders, setFolders] = useState<Folder[]>(() => {
    const local = localStorage.getItem('mundus_folders');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          return parsed.filter((f: Folder) => Boolean(f.mundusId) && f.mundusId !== 'mundus-prima');
        }
      } catch (e) {
        console.error('Failed to parse local folders:', e);
      }
    }
    return INITIAL_FOLDERS;
  });

  // Documents state
  const [documents, setDocuments] = useState<NovelDocument[]>(() => {
    const local = localStorage.getItem('mundus_documents') || localStorage.getItem('novelist_documents');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          return parsed.filter((d: NovelDocument) => Boolean(d.mundusId) && d.mundusId !== 'mundus-prima' && d.id !== 'doc-chapter-1');
        }
      } catch (e) {
        console.error('Failed to parse local documents:', e);
      }
    }
    return INITIAL_DOCUMENTS;
  });

  const [activeDocId, setActiveDocId] = useState<string>(() => {
    return documents[0]?.id || '';
  });

  // Characters state (v0.2)
  // v0.7.75: the initial load also drops tombstoned (deleted) ids so a stale
  // stored roster can never briefly resurrect a character the user deleted.
  // Every loaded character is sanitized (whitelisted fields only) — historical
  // rosters can carry React event/fiber junk from the old create flow, which
  // bloated entries to hundreds of KB and broke storage/quota/cloud writes.
  const [characters, setCharacters] = useState<Character[]>(() => {
    const local = localStorage.getItem('mundus_characters');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          return parsed
            .filter(
              (c: Character) =>
                Boolean(c?.mundusId) && c.mundusId !== 'mundus-prima' && !isCharacterDeleted(c.id)
            )
            .map(sanitizeCharacter)
            .filter((c): c is Character => Boolean(c));
        }
      } catch (e) {
        console.error('Failed to parse local characters:', e);
      }
    }
    return INITIAL_CHARACTERS;
  });

  // v0.7.75: persist characters by MERGING with what is already in localStorage
  // instead of blind-overwriting. A second tab/window keeps its own roster; the
  // old code let a stale tab's save ERASE characters created in another tab
  // before their cloud writes succeeded (they then vanished on every device).
  // Rules: per-id newest updatedAt wins, the live state wins ties, ids that
  // exist only in storage are KEPT (they may belong to the other tab) unless
  // tombstoned as deleted. On quota failure, free backup cache space and retry.
  const persistCharactersMerged = useCallback((stateChars: Character[]) => {
    try {
      let stored: Character[] = [];
      try {
        const raw = localStorage.getItem('mundus_characters');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) stored = parsed;
        }
      } catch {}
      const merged = mergeCharacterRosters(stateChars, stored, getDeletedCharacterIds());
      try {
        localStorage.setItem('mundus_characters', safeJsonStringify(merged));
      } catch (quotaErr) {
        console.warn('LocalStorage full when persisting characters, freeing backup space:', quotaErr);
        localStorage.removeItem(AUTO_BACKUP_STORAGE_KEY);
        localStorage.setItem('mundus_characters', safeJsonStringify(merged));
      }
    } catch (e) {
      console.error('Failed to persist characters locally:', e);
    }
  }, []);

  // Persist characters to local storage (debounced to avoid blocking the main
  // thread with a full JSON serialization on every keystroke; flushed on unload)
  useEffect(() => {
    const timer = setTimeout(() => {
      persistCharactersMerged(characters);
    }, 350);
    return () => clearTimeout(timer);
  }, [characters, persistCharactersMerged]);

  // Flush characters to localStorage immediately when the app is closed/backgrounded
  useEffect(() => {
    const flushCharactersToStorage = () => {
      persistCharactersMerged(charactersRef.current);
    };
    // Fire any debounced cloud saves that have not run yet. With the persistent
    // Firestore cache the write is durably queued in IndexedDB even if the app
    // is killed mid-flight, so nothing is lost when Android freezes the WebView.
    const flushPendingCharacterCloudSaves = () => {
      const timers = characterSaveTimersRef.current;
      timers.forEach((timer, id) => clearTimeout(timer));
      timers.clear();
      if (isFirebaseConfigured) {
        charactersRef.current.forEach((char) => {
          void syncCharacterToCloudRef.current(char);
        });
      }
    };
    const handlePageHide = () => {
      flushCharactersToStorage();
      flushPendingCharacterCloudSaves();
    };
    window.addEventListener('beforeunload', handlePageHide);
    // pagehide fires reliably on mobile (Android/iOS) when the WebView is frozen or killed
    window.addEventListener('pagehide', handlePageHide);
    // v0.7.95: named handler + cleanup — this listener used to be registered
    // inline and never removed (the only unbalanced listener in the file).
    const handleVisibilityFlush = () => {
      if (document.visibilityState === 'hidden') handlePageHide();
    };
    document.addEventListener('visibilitychange', handleVisibilityFlush);
    return () => {
      window.removeEventListener('beforeunload', handlePageHide);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityFlush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lore & Timeline state (v0.3)
  // v0.7.74: the calendar is now INDEPENDENT PER PROJECT.
  //  - timelineConfigMap: per-project calendars that were explicitly edited ({ [mundusId]: TimelineConfig })
  //  - legacyTimelineConfig: the pre-0.7.74 shared calendar, kept as fallback for projects
  //    whose calendar was never edited (zero-surprise migration; old behavior preserved)
  //  - timelineConfig below is the RESOLVED calendar of the active project and keeps the
  //    exact same shape that every consumer (Lore, Characters, Editor) received before.
  const [timelineConfigMap, setTimelineConfigMap] = useState<TimelineConfigMap>(() => loadTimelineConfigMap());
  const [legacyTimelineConfig, setLegacyTimelineConfig] = useState<TimelineConfig | null>(() => loadLegacyTimelineConfig());

  const timelineConfig = useMemo<TimelineConfig>(
    () => resolveTimelineConfig(timelineConfigMap, legacyTimelineConfig, activeMundusId),
    [timelineConfigMap, legacyTimelineConfig, activeMundusId]
  );

  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>(() => {
    const local = localStorage.getItem('mundus_timeline_events');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          return parsed.filter((t: TimelineEvent) => Boolean(t.mundusId) && t.mundusId !== 'mundus-prima');
        }
      } catch (e) {
        console.error('Failed to parse timeline events:', e);
      }
    }
    return INITIAL_TIMELINE_EVENTS;
  });

  const [storyLinks, setStoryLinks] = useState<StoryNodeLink[]>(() => {
    const local = localStorage.getItem('mundus_story_links');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          return parsed.filter((l: StoryNodeLink) => Boolean(l.mundusId) && l.mundusId !== 'mundus-prima');
        }
      } catch (e) {
        console.error('Failed to parse story links:', e);
      }
    }
    return INITIAL_STORY_LINKS;
  });

  const [codexEntries, setCodexEntries] = useState<CodexEntry[]>(() => {
    const local = localStorage.getItem('mundus_codex_entries');
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          return parsed.filter((entry: CodexEntry) => Boolean(entry.mundusId) && entry.mundusId !== 'mundus-prima');
        }
      } catch (e) {
        console.error('Failed to parse codex entries:', e);
      }
    }
    return INITIAL_CODEX_ENTRIES;
  });

  // Persist lore data to local storage
  const codexEntriesRef = useRef<CodexEntry[]>(codexEntries);
  codexEntriesRef.current = codexEntries;

  // Persist per-project calendars (v0.7.74) ...
  useEffect(() => {
    saveTimelineConfigMap(timelineConfigMap);
  }, [timelineConfigMap]);

  // v0.7.81 BUGFIX: this effect used to mirror the ACTIVE project's resolved
  // calendar into the legacy shared key, which made every project that never
  // edited its calendar silently follow the active project's calendar (they
  // leaked into each other across projects AND devices). The legacy key is now
  // a FROZEN shared fallback: it is only re-persisted when the fallback itself
  // changes (old-format backup restore, cloud seed on a fresh install, or a
  // save while no project is active). Per-project calendars live exclusively
  // in timelineConfigMap.
  useEffect(() => {
    if (legacyTimelineConfig) saveLegacyTimelineConfig(legacyTimelineConfig);
  }, [legacyTimelineConfig]);

  // v0.7.76: Codex categories (sections) are now INDEPENDENT PER PROJECT — same
  // zero-surprise migration as the per-project calendars above:
  //  - codexSectionsMap: per-project lists that were explicitly edited ({ [mundusId]: CodexSection[] })
  //  - legacyCodexSections: the pre-0.7.76 shared list, kept as fallback for projects
  //    whose categories were never edited (old behavior preserved)
  //  - codexSections below is the RESOLVED list of the active project, threaded to
  //    CodexMode / MapMode / TextEditor exactly like timelineConfig is.
  const [codexSectionsMap, setCodexSectionsMap] = useState<CodexSectionsMap>(() => loadCodexSectionsMap());
  const [legacyCodexSections, setLegacyCodexSections] = useState<CodexSection[] | null>(() => loadLegacyCodexSections());

  const codexSections = useMemo<CodexSection[]>(
    () => resolveCodexSections(codexSectionsMap, legacyCodexSections, activeMundusId),
    [codexSectionsMap, legacyCodexSections, activeMundusId]
  );

  // Keep a hot ref of the map for fire-and-forget cloud pushes.
  const codexSectionsMapRef = useRef<CodexSectionsMap>(codexSectionsMap);
  codexSectionsMapRef.current = codexSectionsMap;

  // Hot refs for the lore cloud bag (debounced post-edit pushes, v0.7.76).
  const legacyCodexSectionsRef = useRef<CodexSection[] | null>(legacyCodexSections);
  legacyCodexSectionsRef.current = legacyCodexSections;
  const timelineConfigMapRef = useRef<TimelineConfigMap>(timelineConfigMap);
  timelineConfigMapRef.current = timelineConfigMap;
  // Hot ref of the SHARED FALLBACK calendar (v0.7.81) for cloud pushes and the
  // startup cloud merge. NOTE: this is NOT the active project's resolved
  // calendar — per-project saves must never touch the shared fallback.
  const legacyTimelineConfigRef = useRef<TimelineConfig | null>(legacyTimelineConfig);
  legacyTimelineConfigRef.current = legacyTimelineConfig;
  const timelineEventsRef = useRef<TimelineEvent[]>(timelineEvents);
  timelineEventsRef.current = timelineEvents;
  const storyLinksRef = useRef<StoryNodeLink[]>(storyLinks);
  storyLinksRef.current = storyLinks;

  // v0.7.76: debounced cloud pushes for the lore settings docs. Before this,
  // timeline data was only pushed to Firestore during the very first startup
  // sync (fetch-else-push), so calendar/event/story-flow edits never reached
  // other devices; codex categories get the same push path from day one.
  const loreCloudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleLoreCloudSave = useCallback(() => {
    if (!isFirebaseConfigured) return;
    if (loreCloudSaveTimerRef.current) clearTimeout(loreCloudSaveTimerRef.current);
    loreCloudSaveTimerRef.current = setTimeout(() => {
      loreCloudSaveTimerRef.current = null;
      // v0.7.81: push the FROZEN SHARED FALLBACK (not the active project's
      // calendar/list) into the legacy cloud fields, and omit the fields
      // entirely when no local fallback exists (an undefined value would
      // become deleteField() and erase the cloud fallback for fresh devices).
      void saveUserTimelineData(DEFAULT_AUTHOR_ID, {
        ...(legacyTimelineConfigRef.current ? { config: legacyTimelineConfigRef.current } : {}),
        configByProject: timelineConfigMapRef.current,
        events: timelineEventsRef.current,
        links: storyLinksRef.current
      });
      void saveUserCodexSections(DEFAULT_AUTHOR_ID, {
        ...(legacyCodexSectionsRef.current ? { sections: legacyCodexSectionsRef.current } : {}),
        sectionsByProject: codexSectionsMapRef.current
      });
    }, 1500);
  }, []);

  // Flush a pending lore cloud push when the app is closed / hidden.
  useEffect(() => {
    const flushLoreCloudSave = () => {
      if (!loreCloudSaveTimerRef.current) return;
      clearTimeout(loreCloudSaveTimerRef.current);
      loreCloudSaveTimerRef.current = null;
      if (!isFirebaseConfigured) return;
      // v0.7.81: same frozen-fallback semantics as the debounced push above.
      void saveUserTimelineData(DEFAULT_AUTHOR_ID, {
        ...(legacyTimelineConfigRef.current ? { config: legacyTimelineConfigRef.current } : {}),
        configByProject: timelineConfigMapRef.current,
        events: timelineEventsRef.current,
        links: storyLinksRef.current
      });
      void saveUserCodexSections(DEFAULT_AUTHOR_ID, {
        ...(legacyCodexSectionsRef.current ? { sections: legacyCodexSectionsRef.current } : {}),
        sectionsByProject: codexSectionsMapRef.current
      });
    };
    window.addEventListener('pagehide', flushLoreCloudSave);
    return () => {
      window.removeEventListener('pagehide', flushLoreCloudSave);
      if (loreCloudSaveTimerRef.current) clearTimeout(loreCloudSaveTimerRef.current);
    };
  }, []);

  // Persist per-project categories ...
  useEffect(() => {
    saveCodexSectionsMap(codexSectionsMap);
  }, [codexSectionsMap]);

  // v0.7.81 BUGFIX (the "new category appears in every project" bug): this
  // effect used to mirror the ACTIVE project's resolved category list into the
  // legacy shared keys ('mundus_codex_categories' / 'mundus_codex_sections'),
  // so any project that had never edited its categories picked up the active
  // project's categories on the next launch — a category created in one
  // project appeared in all others (entries stayed unshared because they are
  // filtered by mundusId, which is exactly the reported asymmetry).
  // The legacy keys are now a FROZEN shared fallback: they are only re-written
  // when the fallback itself changes (old-format backup restore, cloud seed on
  // a fresh install, or a save while no project is active). Per-project
  // category lists live exclusively in codexSectionsMap.
  useEffect(() => {
    if (legacyCodexSections) saveLegacyCodexSections(legacyCodexSections);
  }, [legacyCodexSections]);

  useEffect(() => {
    try {
      localStorage.setItem('mundus_codex_entries', JSON.stringify(codexEntries));
    } catch (e) {
      console.warn('LocalStorage full when persisting codex entries, freeing stale backups:', e);
      try {
        // v0.7.95 FIX: this fallback used to remove 'mundus_auto_backups', a key
        // that never existed (the real key is 'mundus_local_auto_backups'), so
        // the retry freed no space at all and the entries still failed to save.
        localStorage.removeItem(AUTO_BACKUP_STORAGE_KEY);
        localStorage.setItem('mundus_codex_entries', JSON.stringify(codexEntries));
      } catch (retryErr) {
        console.error('Failed to persist codex entries locally after cache clearing:', retryErr);
      }
    }
  }, [codexEntries]);

  useEffect(() => {
    try {
      localStorage.setItem('mundus_timeline_events', JSON.stringify(timelineEvents));
    } catch (e) {
      console.error('Failed to persist timeline events locally:', e);
    }
  }, [timelineEvents]);

  useEffect(() => {
    try {
      localStorage.setItem('mundus_story_links', JSON.stringify(storyLinks));
    } catch (e) {
      console.error('Failed to persist story links locally:', e);
    }
  }, [storyLinks]);

  // Navigation & UI state
  const [activeSection, setActiveSection] = useState<ActiveSection>('editor');
  const [isStartMenuOpen, setIsStartMenuOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isZenMode, setIsZenMode] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'offline' | 'error'>(() => isFirebaseConfigured ? 'synced' : 'offline');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(() => new Date());

  // Online / Offline connectivity & pending sync state
  const [isOnline, setIsOnline] = useState<boolean>(isBrowserOnline());
  const [pendingSyncDocIds, setPendingSyncDocIds] = useState<string[]>(() => getPendingSyncDocIds());
  const [loreResetKey, setLoreResetKey] = useState<number>(0);
  const [charactersResetKey, setCharactersResetKey] = useState<number>(0);
  const [charactersInitialCharacterId, setCharactersInitialCharacterId] = useState<string | null>(null);
  const [initialMapMarkerId, setInitialMapMarkerId] = useState<string | null>(null);
  const [initialMapCodexId, setInitialMapCodexId] = useState<string | null>(null);

  const handleNavigateToMap = (codexId?: string, markerId?: string) => {
    setInitialMapCodexId(codexId || null);
    setInitialMapMarkerId(markerId || null);
    setActiveSection('world');
  };

  // Document snapshots state for active document
  const [snapshots, setSnapshots] = useState<DocumentSnapshot[]>([]);

  // Dirty state tracking for periodic auto-save
  const isDirtyRef = useRef<boolean>(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveTimeRef = useRef<number>(Date.now());
  const documentsRef = useRef<NovelDocument[]>(documents);
  documentsRef.current = documents;
  const activeDocIdRef = useRef<string>(activeDocId);
  activeDocIdRef.current = activeDocId;
  // Latest characters snapshot, readable from async/cloud-sync code outside the render cycle
  const charactersRef = useRef<Character[]>(characters);
  charactersRef.current = characters;
  // Debounced per-character cloud-save timers (id -> timeout handle)
  const characterSaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Late-bound reference to syncCharacterToCloud (declared below; used by the pagehide flush effect above it)
  const syncCharacterToCloudRef = useRef<((char: Character) => Promise<void>) | null>(null);

  // ---------------------------------------------------------------------------
  // Reliable character cloud-sync pipeline (fixes "characters disappear after
  // reloading on Android"):
  // 1. Cloud writes are DEBOUNCED per character (typing no longer fires one
  //    Firestore write per keystroke).
  // 2. A failed/offline write is never silent: the character id is persisted in
  //    a pending-sync queue and re-pushed on startup / focus / 'online'.
  // 3. The startup cloud fetch MERGES by updatedAt instead of replacing local
  //    data, so locally-created characters can never be wiped by a stale cloud.
  // ---------------------------------------------------------------------------
  const syncCharacterToCloud = useCallback((char: Character): Promise<void> => {
    if (!isFirebaseConfigured) return Promise.resolve();
    // v0.7.75: save the SANITIZED character — historical objects can carry
    // React event/fiber junk (see lib/characterSanitize.ts) that bloats the
    // Firestore document past the 1MB limit and makes writes fail forever.
    const clean = sanitizeCharacter(char);
    if (!clean) return Promise.resolve();
    return saveUserCharacter(DEFAULT_AUTHOR_ID, { ...clean, userId: DEFAULT_AUTHOR_ID })
      .then(() => {
        clearCharacterPendingSync(char.id);
      })
      .catch((err) => {
        console.warn(`[CharacterSync] Cloud write failed for "${char.name}" (queued for retry):`, err);
        markCharacterPendingSync(char.id);
      });
  }, []);
  syncCharacterToCloudRef.current = syncCharacterToCloud;

  const flushPendingCharacterSaves = useCallback(async (): Promise<void> => {
    if (!isFirebaseConfigured || !isBrowserOnline()) return;
    const pendingIds = getPendingSyncCharacterIds();
    if (pendingIds.length === 0) return;
    for (const id of pendingIds) {
      const char = charactersRef.current.find((c) => c.id === id);
      if (char) {
        await syncCharacterToCloud(char);
      } else {
        // Character no longer exists locally (deleted while offline) — drop from queue
        clearCharacterPendingSync(id);
      }
    }
  }, [syncCharacterToCloud]);

  const queueCharacterCloudSave = useCallback((id: string): void => {
    if (!isFirebaseConfigured) return;
    const timers = characterSaveTimersRef.current;
    const existing = timers.get(id);
    if (existing) clearTimeout(existing);
    timers.set(id, setTimeout(() => {
      timers.delete(id);
      const char = charactersRef.current.find((c) => c.id === id);
      if (char) {
        void syncCharacterToCloud(char);
      }
    }, 800));
  }, [syncCharacterToCloud]);

  // Initialize custom fonts on app load
  useEffect(() => {
    initializeCustomFonts().then(fonts => {
      setCustomFonts(fonts);
    });
  }, []);

  // Apply dark mode class to html document
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('mundus_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('mundus_theme', 'light');
    }
  }, [isDarkMode]);

  const [accentColor, setAccentColor] = useState<string>(() => {
    return localStorage.getItem('mundus_accent_color') || '#8b5cf6';
  });

  useEffect(() => {
    localStorage.setItem('mundus_accent_color', accentColor);
    // Setting CSS variable on root for wider accessibility if needed
    document.documentElement.style.setProperty('--mundus-accent', accentColor);
  }, [accentColor]);

  // Local Project Backup Engine State & Handlers
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(() => {
    return localStorage.getItem('mundus_auto_backup_enabled') !== 'false';
  });
  const [backupFilePrefix, setBackupFilePrefix] = useState<string>(() => {
    return localStorage.getItem('mundus_backup_prefix') || 'Mundus_Backup';
  });
  const [autoDownloadBackupInterval, setAutoDownloadBackupInterval] = useState<string>(() => {
    return localStorage.getItem('mundus_auto_download_interval') || 'off';
  });
  const [backupSnapshots, setBackupSnapshots] = useState<BackupSnapshotMeta[]>(() => {
    return getAutoBackupSnapshots();
  });

  const handleUpdateBackupFilePrefix = (prefix: string) => {
    setBackupFilePrefix(prefix);
    localStorage.setItem('mundus_backup_prefix', prefix);
  };

  const handleUpdateAutoDownloadBackupInterval = (interval: string) => {
    setAutoDownloadBackupInterval(interval);
    localStorage.setItem('mundus_auto_download_interval', interval);
  };

  // v0.7.92: user-selected backup folder (desktop). Backups skip the save
  // dialog and are written straight into this folder via Electron IPC.
  const [backupDirPath, setBackupDirPath] = useState<string | null>(() => {
    return localStorage.getItem('mundus_backup_dir') || null;
  });
  const isDesktopApp = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);

  const handleChooseBackupFolder = async () => {
    if (!window.electronAPI?.chooseBackupDirectory) return;
    try {
      const dir = await window.electronAPI.chooseBackupDirectory();
      if (dir) {
        setBackupDirPath(dir);
        localStorage.setItem('mundus_backup_dir', dir);
      }
    } catch (err) {
      console.warn('Failed to choose backup folder:', err);
    }
  };

  const handleClearBackupFolder = () => {
    setBackupDirPath(null);
    localStorage.removeItem('mundus_backup_dir');
  };

  // ImgBB API Key for Image Hosting (v0.5)
  const [imgbbApiKey, setImgbbApiKey] = useState<string>(() => {
    return localStorage.getItem('mundus_imgbb_api_key') || '';
  });

  // Custom Added Google Fonts state (v0.6.14)
  const [addedGoogleFonts, setAddedGoogleFonts] = useState<GoogleFontItem[]>(() => {
    try {
      const stored = localStorage.getItem('mundus_added_google_fonts');
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter(isValidGoogleFontItem);
        if (cleaned.length !== parsed.length) {
          try {
            localStorage.setItem('mundus_added_google_fonts', JSON.stringify(cleaned));
          } catch {}
        }
        return cleaned;
      }
      return [];
    } catch {
      return [];
    }
  });

  const handleSaveGoogleFonts = async (fonts: GoogleFontItem[]) => {
    const validFonts = fonts.filter(isValidGoogleFontItem);
    setAddedGoogleFonts(validFonts);
    try {
      localStorage.setItem('mundus_added_google_fonts', JSON.stringify(validFonts));
    } catch (e) {
      console.warn('Failed to save Google fonts to localStorage', e);
    }
    if (isFirebaseConfigured) {
      try {
        await saveUserGoogleFonts(DEFAULT_AUTHOR_ID, validFonts);
      } catch (err) {
        console.error('Failed to sync Google fonts to Firestore', err);
      }
    }
  };

  const handleUpdateImgbbApiKey = async (newKey: string) => {
    const trimmed = newKey.trim();
    setImgbbApiKey(trimmed);
    localStorage.setItem('mundus_imgbb_api_key', trimmed);
    if (isFirebaseConfigured) {
      try {
        await saveUserImgbbApiKey(DEFAULT_AUTHOR_ID, trimmed);
      } catch (err) {
        console.error('Failed to sync ImgBB API key to Firestore:', err);
      }
    }
  };

  // v0.7.94: async so the Settings UI can confirm the outcome with a toast
  // (mirrors the per-Mundus backup UX) instead of staying silent.
  const handleExportBackup = async (usePicker: boolean = true) => {
    try {
      // v0.7.96: every world's Story Flow Graph layout rides along, so a
      // restored app keeps its arranged graphs (was localStorage-only before).
      const storyFlowLayouts: Record<string, StoryFlowLayout> = {};
      mundusProjects.forEach((p) => {
        const layout = readStoryFlowLayout(p.id);
        if (layout) storyFlowLayouts[p.id] = layout;
      });
      const result = await exportProjectBackupToFile({
        projects: mundusProjects, // v0.7.94: the Worlds list — restore needs it
        documents,
        folders,
        characters,
        timelineEvents,
        // v0.7.81: the legacy backup field carries the FROZEN SHARED FALLBACK
        // (not the active project's calendar) so restoring cannot plant one
        // project's calendar into other projects' fallback.
        timelineConfig: legacyTimelineConfig || timelineConfig,
        timelineConfigs: timelineConfigMap,
        codexSections: legacyCodexSections || codexSections,
        codexSectionsByProject: codexSectionsMap,
        storyLinks,
        codexEntries,
        storyFlowLayouts
      }, backupFilePrefix, usePicker, backupDirPath);

      if (!result.delivered) {
        // User cancelled the save dialog / bridge reported failure — the
        // failure case below covers real errors; cancellations stay quiet.
        if (result.method === 'native') {
          pushToast({ kind: 'error', title: 'Backup could not be saved', message: 'The Android backup bridge reported an error. Check the Downloads folder and app logs.' });
        }
        return;
      }
      if (result.method === 'folder' && result.filePath) {
        pushToast({ kind: 'success', title: 'Full app backup saved', message: result.filePath, duration: 8000 });
      } else if (result.method === 'native') {
        pushToast({ kind: 'success', title: 'Full app backup saved to Downloads', message: result.filePath || "The backup JSON is in your device's Downloads folder.", duration: 8000 });
      } else if (result.method === 'download') {
        pushToast({ kind: 'success', title: 'Full app backup downloaded', message: 'The backup JSON file was downloaded.' });
      } else {
        pushToast({ kind: 'success', title: 'Full app backup saved', message: 'Every world, document, character, codex entry and calendar is in the backup file.', duration: 8000 });
      }
    } catch (err: any) {
      pushToast({ kind: 'error', title: 'Failed to create backup', message: String(err?.message || err) });
    }
  };

  // -----------------------------------------------------------------------
  // v0.7.92: per-Mundus backup & import. The sidebar backup button exports
  // ONLY the active world (project record, documents, folder structure,
  // characters, codex entries + sections, timeline, story links, map markers
  // and the full-resolution map image). The Atlas imports such files; when a
  // Mundus with the same name already exists the user is asked to confirm a
  // merge (matching items are overwritten with the backup's versions).
  // -----------------------------------------------------------------------
  const [isExportingMundusBackup, setIsExportingMundusBackup] = useState(false);
  const [isImportingMundus, setIsImportingMundus] = useState(false);
  const [pendingMundusImport, setPendingMundusImport] = useState<{ data: MundusBackupFile; existing: MundusProject } | null>(null);

  // v0.7.93: modern toast notifications (bottom-left, above the sync status
  // icon) — replace raw alert() popups for backup / import confirmations.
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimersRef = useRef<Map<string, number>>(new Map());
  const dismissToast = useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const pushToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
    const timer = window.setTimeout(() => dismissToast(id), toast.duration ?? 6000);
    toastTimersRef.current.set(id, timer);
  }, [dismissToast]);
  useEffect(() => () => {
    toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    toastTimersRef.current.clear();
  }, []);

  const handleExportMundusBackup = async () => {
    const projectId = activeMundusId;
    const project = mundusProjects.find((p) => p.id === projectId);
    if (!project || isExportingMundusBackup) return;
    setIsExportingMundusBackup(true);
    try {
      const inScope = <T extends { mundusId?: string }>(items: T[] | undefined): T[] =>
        (items || []).filter((it) => (it.mundusId || 'mundus-prima') === projectId);

      // Map data: markers + realm name live in localStorage, the full-res map
      // image lives in IndexedDB (mundus_maps store) — include all of them.
      let mapMarkers: any[] = [];
      try {
        const parsed = JSON.parse(localStorage.getItem(`mundus_map_markers_${projectId}`) || '[]');
        if (Array.isArray(parsed)) mapMarkers = parsed;
      } catch { mapMarkers = []; }
      const mapWorldName = localStorage.getItem(`mundus_map_world_name_${projectId}`) || undefined;
      let mapImage: { fileName: string; width: number; height: number; dataUrl: string } | null = null;
      try {
        const localMap = await getLocalMapImage(projectId);
        if (localMap?.blob) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('Failed to read map image'));
            reader.readAsDataURL(localMap.blob);
          });
          if (dataUrl) {
            mapImage = { fileName: localMap.fileName, width: localMap.width, height: localMap.height, dataUrl };
          }
        }
      } catch (err) {
        console.warn('Map image will be missing from this Mundus backup:', err);
      }
      // v0.7.93 fallback: IndexedDB can legitimately hold no record while the
      // map only exists as the cached image URL (e.g. synced from Firebase on
      // this device and never re-uploaded locally). Pull the cached URL so
      // every Mundus backup actually carries the map image.
      if (!mapImage) {
        try {
          const cachedUrl = localStorage.getItem(`mundus_map_image_${projectId}`);
          if (cachedUrl && /^(data|https?|blob):/i.test(cachedUrl)) {
            const cachedResp = await fetch(cachedUrl);
            const cachedBlob = await cachedResp.blob();
            const cachedDataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || ''));
              reader.onerror = () => reject(reader.error || new Error('Failed to read cached map image'));
              reader.readAsDataURL(cachedBlob);
            });
            if (cachedDataUrl && cachedDataUrl.length > 24) {
              const dims = await new Promise<{ width: number; height: number }>((resolve) => {
                const img = new window.Image();
                img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
                img.onerror = () => resolve({ width: 0, height: 0 });
                img.src = cachedDataUrl;
              });
              mapImage = {
                fileName: localStorage.getItem(`mundus_map_image_${projectId}_name`) || 'World Map',
                width: dims.width,
                height: dims.height,
                dataUrl: cachedDataUrl,
              };
            }
          }
        } catch (err) {
          console.warn('Cached map image could not be embedded into this Mundus backup:', err);
        }
      }

      const result = await exportMundusBackupToFile({
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          genre: project.genre,
          color: project.color,
          coverUrl: project.coverUrl,
          pageFormat: project.pageFormat,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
        documents: inScope(documents),
        folders: inScope(folders),
        characters: inScope(characters),
        timelineEvents: inScope(timelineEvents),
        timelineConfig: timelineConfigMap[projectId] || null,
        codexSections: codexSectionsMap[projectId] || [],
        storyLinks: inScope(storyLinks),
        codexEntries: inScope(codexEntries),
        mapMarkers,
        mapWorldName,
        mapImage,
        storyFlowLayout: readStoryFlowLayout(projectId), // v0.7.96: graph layout travels with the world
      }, backupFilePrefix, backupDirPath);

      if (!result.delivered) {
        // User cancelled the save dialog — nothing written, no noise.
      } else if (result.method === 'folder' && result.filePath) {
        pushToast({
          kind: 'success',
          title: `Backup of "${project.name}" saved`,
          message: result.filePath,
          duration: 8000,
        });
      } else if (result.method === 'download') {
        pushToast({
          kind: 'success',
          title: `Backup of "${project.name}" downloaded`,
          message: 'The Mundus backup file was downloaded.',
        });
      } else {
        pushToast({
          kind: 'success',
          title: `Backup of "${project.name}" saved`,
          message: 'Everything in this Mundus (documents, folders, characters, codex, map…) is in the backup file.',
          duration: 8000,
        });
      }
    } catch (err: any) {
      pushToast({ kind: 'error', title: `Failed to create Mundus backup`, message: String(err?.message || err) });
    } finally {
      setIsExportingMundusBackup(false);
    }
  };

  /** Upsert `incoming` into `current` by id — backup wins for matching ids, new ids are appended. */
  const upsertById = (current: any[], incoming: any[]): any[] => {
    const byId = new Map(current.map((it) => [it.id, it]));
    for (const it of incoming) byId.set(it.id, it);
    const merged = current.map((it) => byId.get(it.id)!);
    const existingIds = new Set(current.map((it) => it.id));
    const additions = incoming.filter((it) => !existingIds.has(it.id));
    return [...merged, ...additions];
  };

  const applyMundusImport = async (data: MundusBackupFile, existing: MundusProject | null) => {
    if (isImportingMundus) return;
    setIsImportingMundus(true);
    try {
      const now = new Date().toISOString();
      let targetId = existing ? existing.id : data.project.id;
      if (!existing && mundusProjects.some((p) => p.id === targetId)) {
        // Same id but a different world owns it — mint a fresh project id.
        targetId = `mundus-${Date.now()}`;
      }

      // Every imported item belongs to the target world: force a real
      // mundusId (per-project storage ignores the 'mundus-prima' fallback).
      const scopeItems = <T extends { mundusId?: string }>(items: T[] | undefined): T[] =>
        (items || []).map((it) => ({ ...it, mundusId: targetId }));
      const documentsIn = scopeItems(data.documents).map((d: any) => {
        // v0.7.96: derive missing stat fields. Backups from hand-edited or
        // third-party JSON can omit wordCount/characterCount; the editor's
        // status bar rendered them unguarded and a missing field blanked the
        // whole app (no error boundary). Normalize on the way in.
        if (!d) return d;
        const plain = typeof d.plainText === 'string' ? d.plainText : '';
        return {
          ...d,
          wordCount: typeof d.wordCount === 'number' ? d.wordCount : (plain.trim() ? plain.trim().split(/\s+/).length : 0),
          characterCount: typeof d.characterCount === 'number' ? d.characterCount : plain.length,
        };
      });
      const foldersIn = scopeItems(data.folders);
      const charactersIn = scopeItems(data.characters);
      const timelineIn = scopeItems(data.timelineEvents);
      const linksIn = scopeItems(data.storyLinks);
      const codexIn = scopeItems(data.codexEntries);
      const markersIn = scopeItems(data.mapMarkers);

      // Safety net: an incoming id that already exists in a DIFFERENT world is
      // renamed instead of silently overwriting foreign data. The rename is
      // cascaded through every reference field inside the backup payload.
      const renameMap = new Map<string, string>();
      const isForeign = (collection: any[], id: string) => {
        const owner = collection.find((it: any) => it?.id === id);
        return Boolean(owner && (owner.mundusId || 'mundus-prima') !== targetId);
      };
      const nextId = (prefix: string, i: number) => `${prefix}-${Date.now()}-${i}`;
      [
        [documents, documentsIn, 'doc'] as const,
        [folders, foldersIn, 'folder'] as const,
        [characters, charactersIn, 'char'] as const,
        [timelineEvents, timelineIn, 'event'] as const,
        [storyLinks, linksIn, 'link'] as const,
        [codexEntries, codexIn, 'codex'] as const,
      ].forEach(([currentCollection, incoming, prefix], colIdx) => {
        incoming.forEach((it, i) => {
          if (it && isForeign(currentCollection, it.id)) {
            renameMap.set(it.id, nextId(`${prefix}${colIdx}`, i));
          }
        });
      });
      if (renameMap.size > 0) {
        const remap = (id: string | undefined) => (id && renameMap.has(id) ? renameMap.get(id)! : id);
        const remapList = (ids: string[] | undefined) => (ids ? ids.map(remap) : ids);
        const applyRefs = (item: any) => {
          if (!item || typeof item !== 'object') return item;
          const out = { ...item, id: remap(item.id) ?? item.id };
          if ('folderId' in out) out.folderId = remap(out.folderId);
          if ('fromDocId' in out) out.fromDocId = remap(out.fromDocId);
          if ('toDocId' in out) out.toDocId = remap(out.toDocId);
          if ('sceneId' in out) out.sceneId = remap(out.sceneId);
          if ('linkedCodexId' in out) out.linkedCodexId = remap(out.linkedCodexId);
          if (Array.isArray(out.characterIds)) out.characterIds = remapList(out.characterIds);
          if (Array.isArray(out.linkedCharacterIds)) out.linkedCharacterIds = remapList(out.linkedCharacterIds);
          if (Array.isArray(out.linkedDocumentIds)) out.linkedDocumentIds = remapList(out.linkedDocumentIds);
          if (Array.isArray(out.relatedCharacterIds)) out.relatedCharacterIds = remapList(out.relatedCharacterIds);
          if (Array.isArray(out.relatedLocationIds)) out.relatedLocationIds = remapList(out.relatedLocationIds);
          if (Array.isArray(out.relatedDocumentIds)) out.relatedDocumentIds = remapList(out.relatedDocumentIds);
          return out;
        };
        const remapAll = (items: any[]) => items.map(applyRefs);
        documentsIn.splice(0, documentsIn.length, ...remapAll(documentsIn));
        foldersIn.splice(0, foldersIn.length, ...remapAll(foldersIn));
        charactersIn.splice(0, charactersIn.length, ...remapAll(charactersIn));
        timelineIn.splice(0, timelineIn.length, ...remapAll(timelineIn));
        linksIn.splice(0, linksIn.length, ...remapAll(linksIn));
        codexIn.splice(0, codexIn.length, ...remapAll(codexIn));
        markersIn.splice(0, markersIn.length, ...remapAll(markersIn));
      }

      // Project record: created fresh, or left untouched on merge (the name
      // already matches — the merge is about the world's CONTENT).
      if (!existing) {
        const newProject: MundusProject = {
          id: targetId,
          userId: DEFAULT_AUTHOR_ID,
          name: data.project.name,
          description: data.project.description,
          genre: data.project.genre,
          color: data.project.color,
          coverUrl: data.project.coverUrl,
          pageFormat: (data.project.pageFormat as PageFormat) || DEFAULT_PAGE_FORMAT,
          createdAt: data.project.createdAt || now,
          updatedAt: now,
        };
        setMundusProjects((prev) => [...prev, newProject]);
        if (isFirebaseConfigured) {
          saveUserMundusProject(DEFAULT_AUTHOR_ID, newProject);
        }
      }

      setDocuments((prev) => upsertById(prev, documentsIn));
      setFolders((prev) => upsertById(prev, foldersIn));
      const mergedCharacters = upsertById(charactersRef.current, charactersIn);
      charactersRef.current = mergedCharacters;
      setCharacters(mergedCharacters);
      setTimelineEvents((prev) => upsertById(prev, timelineIn));
      setStoryLinks((prev) => upsertById(prev, linksIn));
      setCodexEntries((prev) => upsertById(prev, codexIn));

      // Calendar + codex categories are per-project maps: the backup's version
      // of THIS world's calendar replaces the current one (merge = backup wins).
      const incomingConfig = normalizeTimelineConfig(data.timelineConfig);
      if (incomingConfig) {
        setTimelineConfigMap((prev) => ({ ...prev, [targetId]: { ...incomingConfig, mundusId: targetId } }));
      }
      if (data.codexSections.length > 0) {
        setCodexSectionsMap((prev) => ({ ...prev, [targetId]: upsertById(prev[targetId] || [], data.codexSections) }));
      }

      // Map markers (localStorage per world) + realm name + full-res map image.
      // v0.7.96: the Story Flow Graph layout travels too — ids are remapped
      // through the same rename table as the items, then merged over whatever
      // layout the target world already had (backup wins for shared scenes).
      const backupLayout = normalizeStoryFlowLayout(data.storyFlowLayout);
      if (backupLayout) {
        const remappedLayout = remapStoryFlowLayout(backupLayout, renameMap);
        const currentLayout = readStoryFlowLayout(targetId);
        writeStoryFlowLayout(targetId, mergeStoryFlowLayouts(currentLayout, remappedLayout));
      }
      if (markersIn.length > 0) {
        let existingMarkers: any[] = [];
        try {
          const parsed = JSON.parse(localStorage.getItem(`mundus_map_markers_${targetId}`) || '[]');
          if (Array.isArray(parsed)) existingMarkers = parsed;
        } catch { /* start fresh */ }
        try {
          localStorage.setItem(`mundus_map_markers_${targetId}`, JSON.stringify(upsertById(existingMarkers, markersIn)));
        } catch (err) {
          console.warn('Failed to persist imported map markers:', err);
        }
      }
      if (data.mapWorldName) {
        try { localStorage.setItem(`mundus_map_world_name_${targetId}`, data.mapWorldName); } catch { /* ignore */ }
      }
      if (data.mapImage?.dataUrl) {
        try {
          const blob = await (await fetch(data.mapImage.dataUrl)).blob();
          await saveLocalMapImage(targetId, blob, {
            fileName: data.mapImage.fileName,
            width: data.mapImage.width,
            height: data.mapImage.height,
            worldName: data.mapWorldName,
          });
          try {
            localStorage.setItem(`mundus_map_image_${targetId}`, data.mapImage.dataUrl);
            localStorage.setItem(`mundus_map_image_${targetId}_name`, data.mapImage.fileName || 'World Map');
          } catch { /* IndexedDB copy is authoritative */ }
          // v0.7.93: also push the restored map to Firebase Storage — without
          // this, the map view's cloud fetch immediately overrides the freshly
          // restored image with the stale cloud copy on sync-enabled devices.
          if (isFirebaseConfigured) {
            try {
              await uploadUserMapImage(DEFAULT_AUTHOR_ID, targetId, blob, data.mapImage.fileName || 'World Map', {
                width: data.mapImage.width,
                height: data.mapImage.height,
              });
            } catch (cloudErr) {
              console.warn('Restored map image could not be pushed to cloud storage:', cloudErr);
            }
          }
        } catch (err) {
          console.warn('Failed to restore the map image from backup:', err);
        }
      }

      const countsSummary = [
        `${documentsIn.length} document${documentsIn.length === 1 ? '' : 's'}`,
        `${foldersIn.length} folder${foldersIn.length === 1 ? '' : 's'}`,
        `${charactersIn.length} character${charactersIn.length === 1 ? '' : 's'}`,
        `${codexIn.length} codex entr${codexIn.length === 1 ? 'y' : 'ies'}`,
        `${timelineIn.length} timeline event${timelineIn.length === 1 ? '' : 's'}`,
        `${markersIn.length} map marker${markersIn.length === 1 ? '' : 's'}`,
      ].join(', ');
      if (existing) {
        pushToast({
          kind: 'success',
          title: `Backup merged into "${existing.name}"`,
          message: `Matching items were overwritten with the backup's versions and new items were added (${countsSummary}).`,
          duration: 9000,
        });
      } else {
        pushToast({
          kind: 'success',
          title: `Imported "${data.project.name}"`,
          message: `Placed in your Atlas (${countsSummary}).`,
          duration: 9000,
        });
      }
    } catch (err: any) {
      pushToast({ kind: 'error', title: `Failed to import Mundus backup`, message: String(err?.message || err) });
    } finally {
      setIsImportingMundus(false);
      setPendingMundusImport(null);
    }
  };

  const handleImportMundusBackupFile = async (file: File) => {
    try {
      const data = await parseMundusBackupFile(file);
      const existing = mundusProjects.find(
        (p) => p.name.trim().toLowerCase() === data.project.name.trim().toLowerCase()
      );
      if (existing) {
        setPendingMundusImport({ data, existing });
      } else {
        await applyMundusImport(data, null);
      }
    } catch (err: any) {
      pushToast({ kind: 'error', title: `Failed to import Mundus backup`, message: String(err?.message || err) });
    }
  };

  // v0.7.96: gather every world's Story Flow Graph canvas layout for backup
  // payloads (snapshots + scheduled downloads), so restores keep arranged graphs.
  const collectStoryFlowLayouts = (): Record<string, StoryFlowLayout> => {
    const layouts: Record<string, StoryFlowLayout> = {};
    mundusProjects.forEach((p) => {
      const layout = readStoryFlowLayout(p.id);
      if (layout) layouts[p.id] = layout;
    });
    return layouts;
  };

  // Instant manual local snapshot generator
  const handleCreateInstantSnapshot = () => {
    try {
      saveAutoBackupSnapshot({
        projects: mundusProjects, // v0.7.95: snapshots must carry the Worlds list
        documents,
        folders,
        characters,
        timelineEvents,
        timelineConfig: legacyTimelineConfig || timelineConfig,
        timelineConfigs: timelineConfigMap,
        codexSections: legacyCodexSections || codexSections,
        codexSectionsByProject: codexSectionsMap,
        storyLinks,
        codexEntries,
        storyFlowLayouts: collectStoryFlowLayouts() // v0.7.96
      });
      setBackupSnapshots(getAutoBackupSnapshots());
    } catch (err) {
      console.warn('Manual snapshot skipped:', err);
    }
  };

  // Clear local snapshots from browser storage
  const handleClearSnapshots = () => {
    localStorage.removeItem(AUTO_BACKUP_STORAGE_KEY);
    setBackupSnapshots([]);
  };

  // Auto-save rolling local snapshot when project data changes
  useEffect(() => {
    if (!autoBackupEnabled) return;

    const currentSnaps = getAutoBackupSnapshots();
    if (currentSnaps.length === 0) {
      try {
        saveAutoBackupSnapshot({
          projects: mundusProjects, // v0.7.95: snapshots must carry the Worlds list
          documents,
          folders,
          characters,
          timelineEvents,
          timelineConfig: legacyTimelineConfig || timelineConfig,
          timelineConfigs: timelineConfigMap,
          codexSections: legacyCodexSections || codexSections,
          codexSectionsByProject: codexSectionsMap,
          storyLinks,
          codexEntries,
          storyFlowLayouts: collectStoryFlowLayouts() // v0.7.96
        });
        setBackupSnapshots(getAutoBackupSnapshots());
      } catch (err) {
        console.warn('Initial auto-backup snapshot skipped:', err);
      }
    }

    const timer = setTimeout(() => {
      try {
        saveAutoBackupSnapshot({
          projects: mundusProjects, // v0.7.95: snapshots must carry the Worlds list
          documents,
          folders,
          characters,
          timelineEvents,
          timelineConfig: legacyTimelineConfig || timelineConfig,
          timelineConfigs: timelineConfigMap,
          codexSections: legacyCodexSections || codexSections,
          codexSectionsByProject: codexSectionsMap,
          storyLinks,
          codexEntries,
          storyFlowLayouts: collectStoryFlowLayouts() // v0.7.96
        });
        setBackupSnapshots(getAutoBackupSnapshots());
      } catch (err) {
        console.warn('Scheduled auto-backup snapshot skipped:', err);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [autoBackupEnabled, documents, folders, characters, timelineEvents, timelineConfig, legacyTimelineConfig, legacyCodexSections, timelineConfigMap, storyLinks, codexEntries]);

  // Scheduled auto-download backup timer
  useEffect(() => {
    if (autoDownloadBackupInterval === 'off') return;

    let ms = 0;
    switch (autoDownloadBackupInterval) {
      case '15min': ms = 15 * 60 * 1000; break;
      case '30min': ms = 30 * 60 * 1000; break;
      case '1hour': ms = 60 * 60 * 1000; break;
      case 'daily': ms = 24 * 60 * 60 * 1000; break;
    }

    if (ms <= 0) return;

    const timer = setInterval(() => {
      exportProjectBackupToFile({
        projects: mundusProjects, // v0.7.94: worlds list, same as manual backups
        documents,
        folders,
        characters,
        timelineEvents,
        timelineConfig: legacyTimelineConfig || timelineConfig,
        timelineConfigs: timelineConfigMap,
        codexSections: legacyCodexSections || codexSections,
        codexSectionsByProject: codexSectionsMap,
        storyLinks,
        codexEntries,
        storyFlowLayouts: collectStoryFlowLayouts() // v0.7.96
      }, backupFilePrefix, false);
    }, ms);

    return () => clearInterval(timer);
  }, [autoDownloadBackupInterval, backupFilePrefix, mundusProjects, documents, folders, characters, timelineEvents, timelineConfig, legacyTimelineConfig, legacyCodexSections, timelineConfigMap, storyLinks, codexEntries]);

  const handleImportBackupFile = async (file: File) => {
    try {
      const restored = await parseBackupFile(file);

      // v0.7.94 FIX: restore the Worlds (projects) list. The app-wide backup
      // used to omit it entirely, so restoring on a fresh install left the
      // Atlas empty and every restored document invisible — the editor
      // filters strictly by mundusId, and none of the restored mundusIds
      // matched the (empty) local world list.
      let restoredProjects: MundusProject[] = [];
      if (Array.isArray(restored.projects) && restored.projects.length > 0) {
        restoredProjects = restored.projects
          .filter((p: any) => p && typeof p.id === 'string' && p.id && typeof p.name === 'string')
          .map((p: any) => ({ ...p })) as MundusProject[];
        setMundusProjects(restoredProjects);
      }

      if (restored.documents.length > 0) setDocuments(restored.documents);
      if (restored.folders.length > 0) setFolders(restored.folders);
      if (restored.characters.length > 0) {
        charactersRef.current = restored.characters;
        setCharacters(restored.characters);
      }
      if (restored.timelineEvents.length > 0) setTimelineEvents(restored.timelineEvents);
      // v0.7.74: restore per-project calendars when present; legacy single-calendar
      // backups restore into the shared fallback (entry-less projects follow it)
      const restoredConfigs = normalizeTimelineConfigMap(restored.timelineConfigs);
      if (Object.keys(restoredConfigs).length > 0) {
        setTimelineConfigMap((prev) => ({ ...prev, ...restoredConfigs }));
      }
      const restoredLegacy = normalizeTimelineConfig(restored.timelineConfig);
      if (restoredLegacy) setLegacyTimelineConfig(restoredLegacy);
      // v0.7.76: restore per-project codex categories when present; legacy
      // single-list backups restore into the shared fallback (entry-less
      // projects keep following it, identical to pre-0.7.76 behavior)
      const restoredSectionsMap = normalizeCodexSectionsMap(restored.codexSectionsByProject);
      if (Object.keys(restoredSectionsMap).length > 0) {
        setCodexSectionsMap((prev) => ({ ...prev, ...restoredSectionsMap }));
      }
      const restoredSectionsLegacy = normalizeCodexSections(restored.codexSections);
      if (restoredSectionsLegacy) setLegacyCodexSections(restoredSectionsLegacy);
      if (restored.storyLinks.length > 0) setStoryLinks(restored.storyLinks);
      if (restored.codexEntries.length > 0) setCodexEntries(restored.codexEntries);

      // v0.7.96: restore each world's Story Flow Graph canvas layout into its
      // localStorage keys so the graph repositions scenes exactly as arranged
      // when the backup was made (layouts were invisible to backups before).
      Object.entries(restored.storyFlowLayouts || {}).forEach(([mundusId, layout]) => {
        writeStoryFlowLayout(mundusId, layout);
      });

      // v0.7.94 FIX: keep the active world valid. If the current
      // activeMundusId points nowhere ('' on a fresh install, or a world that
      // only existed on the machine that made the backup), switch to the most
      // recently updated restored world so the restored content is on screen
      // immediately. 'mundus-prima' is a built-in world and always valid.
      const validActive =
        activeMundusId === 'mundus-prima' ||
        restoredProjects.some((p) => p.id === activeMundusId) ||
        (!restoredProjects.length && mundusProjects.some((p) => p.id === activeMundusId));
      if (!validActive && restoredProjects.length > 0) {
        const newest = [...restoredProjects].sort((a, b) =>
          String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
        );
        setActiveMundusId(newest[0].id);
      }

      // v0.7.94: legacy app-wide backups (pre-0.7.94) carry no worlds list at
      // all. Recover a world record for every mundusId referenced by the
      // restored items that has no matching world, so even old backup files
      // become fully visible instead of restoring into an invisible void.
      const knownWorldIds = new Set<string>([
        ...restoredProjects.map((p) => p.id),
        ...mundusProjects.map((p) => p.id),
      ]);
      const usedMundusIds = new Set<string>();
      const collectOwnerIds = (items: any[]) => {
        for (const it of items || []) {
          const owner = it?.mundusId;
          if (typeof owner === 'string' && owner && owner !== 'mundus-prima') usedMundusIds.add(owner);
        }
      };
      collectOwnerIds(restored.documents);
      collectOwnerIds(restored.folders);
      collectOwnerIds(restored.characters);
      collectOwnerIds(restored.codexEntries);
      collectOwnerIds(restored.timelineEvents);
      collectOwnerIds(restored.storyLinks);
      const missingWorldIds = [...usedMundusIds].filter((id) => !knownWorldIds.has(id));
      if (missingWorldIds.length > 0) {
        const recoveredWorlds: MundusProject[] = missingWorldIds.map((id, i) => ({
          id,
          userId: DEFAULT_AUTHOR_ID,
          name: missingWorldIds.length > 1 ? `Recovered World ${i + 1}` : 'Recovered World',
          description: 'World record recovered from an app-wide backup — rename it in the Atlas.',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        restoredProjects = [...restoredProjects, ...recoveredWorlds];
        setMundusProjects(restoredProjects);
        if (!activeMundusId || (!validActive && !restoredProjects.some((p) => p.id === activeMundusId))) {
          setActiveMundusId(restoredProjects[restoredProjects.length - 1].id);
        }
      }

      const countsSummary = [
        restoredProjects.length > 0 ? `${restoredProjects.length} world${restoredProjects.length === 1 ? '' : 's'}` : null,
        `${restored.documents.length} document${restored.documents.length === 1 ? '' : 's'}`,
        `${restored.folders.length} folder${restored.folders.length === 1 ? '' : 's'}`,
        `${restored.characters.length} character${restored.characters.length === 1 ? '' : 's'}`,
        `${restored.codexEntries.length} codex entr${restored.codexEntries.length === 1 ? 'y' : 'ies'}`,
        `${restored.timelineEvents.length} timeline event${restored.timelineEvents.length === 1 ? '' : 's'}`,
      ].filter(Boolean).join(', ');

      pushToast({
        kind: 'success',
        title: 'Full app backup restored',
        message: `From ${new Date(restored.exportedAt).toLocaleString()} — ${countsSummary}.`,
        duration: 9000,
      });
    } catch (e: any) {
      pushToast({
        kind: 'error',
        title: 'Failed to restore backup',
        message: String(e?.message || e),
      });
    }
  };

  // v0.7.96: the restore confirmation uses the modern in-app ConfirmDialog
  // (promise-based) instead of the native window.confirm box.
  const handleRestoreBackupSnapshot = async (snap: BackupSnapshotMeta) => {
    const confirmed = await showConfirmDialog({
      title: 'Restore this snapshot?',
      message: 'Your current state will be overwritten with the snapshot\u2019s contents. Unsaved changes will be lost.',
      detail: `Saved ${new Date(snap.timestamp).toLocaleString()}`,
      confirmLabel: 'Restore Snapshot',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    const data = snap.data;
    // v0.7.95: restore the Worlds list too. Snapshots carried no projects
    // before this version, so restoring one on a fresh install left every
    // document invisible (the editor filters strictly by mundusId and none of
    // the restored ids matched the empty world list). Same replace semantics
    // and active-world validation as the app-wide backup restore above.
    let snapProjects: MundusProject[] = [];
    if (Array.isArray(data.projects) && data.projects.length > 0) {
      snapProjects = data.projects
        .filter((p: any) => p && typeof p.id === 'string' && p.id && typeof p.name === 'string')
        .map((p: any) => ({ ...p })) as MundusProject[];
      if (snapProjects.length > 0) {
        setMundusProjects(snapProjects);
      }
    }
    if (data.documents?.length > 0) setDocuments(mergeSnapshotItems(data.documents, documents));
    if (data.folders?.length > 0) setFolders(data.folders);
    if (data.characters?.length > 0) {
      // v0.8.0: merge instead of replace — browser/Android snapshots store
      // '[Local Image]' markers instead of oversized base64 image URLs, and a
      // plain replace used to clobber the live avatars with dead markers.
      const mergedSnapChars = mergeSnapshotItems(data.characters, charactersRef.current);
      charactersRef.current = mergedSnapChars;
      setCharacters(mergedSnapChars);
    }
    if (data.timelineEvents?.length > 0) setTimelineEvents(data.timelineEvents);
    // v0.7.74: per-project calendars (snapshot restore)
    const snapConfigs = normalizeTimelineConfigMap(data.timelineConfigs);
    if (Object.keys(snapConfigs).length > 0) {
      setTimelineConfigMap((prev) => ({ ...prev, ...snapConfigs }));
    }
    const snapLegacy = normalizeTimelineConfig(data.timelineConfig);
    if (snapLegacy) setLegacyTimelineConfig(snapLegacy);
    // v0.7.76: per-project codex categories (snapshot restore)
    const snapSectionsMap = normalizeCodexSectionsMap(data.codexSectionsByProject);
    if (Object.keys(snapSectionsMap).length > 0) {
      setCodexSectionsMap((prev) => ({ ...prev, ...snapSectionsMap }));
    }
    const snapSectionsLegacy = normalizeCodexSections(data.codexSections);
    if (snapSectionsLegacy) setLegacyCodexSections(snapSectionsLegacy);
    if (data.storyLinks?.length > 0) setStoryLinks(data.storyLinks);
    if (data.codexEntries?.length > 0) {
      // v0.8.0: same image-marker merge as characters (see above).
      setCodexEntries((prev) => mergeSnapshotItems(data.codexEntries, prev));
    }

    // v0.7.96: restore every world's Story Flow Graph layout so scenes keep
    // their arranged positions instead of piling into default spots.
    Object.entries(data.storyFlowLayouts || {}).forEach(([mundusId, layout]) => {
      writeStoryFlowLayout(mundusId, layout);
    });

    // v0.7.95: keep the active world valid after the restore. 'mundus-prima'
    // is a built-in world and always valid; otherwise fall back to the most
    // recently updated restored world so the content is on screen immediately.
    const validActiveSnap =
      activeMundusId === 'mundus-prima' ||
      snapProjects.some((p) => p.id === activeMundusId) ||
      (!snapProjects.length && mundusProjects.some((p) => p.id === activeMundusId));
    if (!validActiveSnap && snapProjects.length > 0) {
      const newestSnap = [...snapProjects].sort((a, b) =>
        String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
      );
      setActiveMundusId(newestSnap[0].id);
    }
  };

  // Persist auto-save preference
  const handleChangeAutoSaveInterval = (interval: AutoSaveInterval) => {
    setAutoSaveInterval(interval);
    localStorage.setItem('mundus_autosave', interval);
  };

  // Custom font upload handler
  const handleUploadCustomFont = async (file: File): Promise<CustomFont> => {
    const font = await uploadCustomFontFile(file, DEFAULT_AUTHOR_ID);
    setCustomFonts(prev => [...prev.filter(f => f.name !== font.name), font]);
    return font;
  };

  const handleRemoveCustomFont = (fontId: string) => {
    const remaining = removeCustomFont(fontId, DEFAULT_AUTHOR_ID);
    setCustomFonts(remaining);
  };

  // Mobile edge swipe gesture to open sidebar (only applies on touch devices)
  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;
    let isEdgeSwipe = false;

    const handleGlobalTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        // Edge swipe must start within 35px from left edge
        isEdgeSwipe = touchStartX <= 35;
      }
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (!isEdgeSwipe || e.touches.length !== 1) return;
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const deltaX = currentX - touchStartX;
      const deltaY = currentY - touchStartY;

      // Swiped right by > 45px from left edge with mostly horizontal motion
      if (deltaX > 45 && Math.abs(deltaY) < 50) {
        setIsMobileSidebarOpen(true);
        isEdgeSwipe = false;
      }
    };

    window.addEventListener('touchstart', handleGlobalTouchStart, { passive: true });
    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleGlobalTouchStart);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
    };
  }, []);

  // Initialize cloud sync when Firebase is configured
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setSyncStatus('offline');
      return;
    }

    const initializeCloudSync = async () => {
      setSyncStatus('saving');
      const isConnected = await testFirestoreConnection();
      if (!isConnected) {
        setSyncStatus('offline');
        return;
      }

      try {
        const authorId = DEFAULT_AUTHOR_ID;
        // Fetch Cloud Mundus Projects
        const cloudProjects = await fetchUserMundusProjects(authorId);
        if (cloudProjects && cloudProjects.length > 0) {
          setMundusProjects(cloudProjects);
        } else {
          for (const proj of mundusProjects) {
            await saveUserMundusProject(authorId, { ...proj, userId: authorId });
          }
        }

        // Fetch Cloud folders
        const cloudFolders = await fetchUserFolders(authorId);
        if (cloudFolders && cloudFolders.length > 0) {
          setFolders(cloudFolders);
        } else {
          for (const folder of folders) {
            await saveUserFolder(authorId, { ...folder, userId: authorId });
          }
        }

        // Fetch Cloud documents
        const cloudDocs = await fetchUserDocuments(authorId);
        if (cloudDocs && cloudDocs.length > 0) {
          setDocuments(cloudDocs);
          if (!cloudDocs.find(d => d.id === activeDocId)) {
            setActiveDocId(cloudDocs[0].id);
          }
        } else {
          for (const doc of documents) {
            const updated = { ...doc, userId: authorId };
            await saveUserDocument(authorId, updated);
          }
        }

        // Fetch Cloud characters (v0.2)
        // MERGE by updatedAt instead of blindly replacing local characters:
        // a failed/offline cloud write (typical on Android when the app is
        // killed before the write flushes) must never erase local characters.
        // Newer side wins per character; local-only characters are kept and
        // pushed to the cloud so other devices receive them.
        // v0.7.75: local wins TIES (clock skew must not discard local work),
        // tombstoned (deleted) ids never resurrect, and characters missing
        // createdAt/updatedAt are repaired (their cloud docs used to be
        // excluded from ordered fetches — the "characters don't sync" bug).
        pruneCharacterTombstones();
        const nowIso = new Date().toISOString();
        const cloudCharsRaw = await fetchUserCharacters(authorId);
        // v0.7.75: sanitize both sides — cloud docs saved by older versions can
        // carry React event/fiber junk, and timestamp-less docs need repair.
        const cloudChars = (cloudCharsRaw || [])
          .map(sanitizeCharacter)
          .filter((c): c is Character => Boolean(c))
          .map((c) => normalizeCharacterTimestamps(c, nowIso));
        const localChars = charactersRef.current
          .map(sanitizeCharacter)
          .filter((c): c is Character => Boolean(c));
        const cloudCharMap = new Map<string, Character>();
        (cloudChars || []).forEach((c) => cloudCharMap.set(c.id, c));

        if (cloudCharMap.size > 0 || localChars.length > 0) {
          const mergedMap = new Map<string, Character>();
          localChars.forEach((c) => mergedMap.set(c.id, c));
          cloudCharMap.forEach((cloudChar, id) => {
            const existing = mergedMap.get(id);
            if (!existing || new Date(cloudChar.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
              mergedMap.set(id, cloudChar);
            }
          });
          const deadIds = getDeletedCharacterIds();
          const mergedChars = Array.from(mergedMap.values())
            .filter((c) => c && !deadIds.includes(c.id));
          charactersRef.current = mergedChars;
          setCharacters(mergedChars);

          // Push characters that are local-only or locally-newer to the cloud
          // (this also repairs/replaces junked cloud docs with clean copies).
          const charsToPush = mergedChars.filter((c) => {
            const cloud = cloudCharMap.get(c.id);
            if (!cloud) return true;
            return new Date(c.updatedAt || 0) > new Date(cloud.updatedAt || 0);
          });
          for (const char of charsToPush) {
            await syncCharacterToCloud(char);
          }
          if (charsToPush.length > 0) {
            console.log(`[CharacterSync] Pushed ${charsToPush.length} local character(s) to the cloud on startup.`);
          }
        }

        // Re-push characters whose cloud writes failed in a previous session
        await flushPendingCharacterSaves();

        // Fetch Cloud codex entries (v0.4)
        const cloudCodex = await fetchUserCodexEntries(authorId);
        if (cloudCodex && cloudCodex.length > 0) {
          setCodexEntries((localPrev) => {
            const mergedMap = new Map<string, CodexEntry>();
            localPrev.forEach((e) => mergedMap.set(e.id, e));
            cloudCodex.forEach((e: CodexEntry) => {
              const existing = mergedMap.get(e.id);
              // v0.7.75: local wins ties (consistent with the character merge)
              if (!existing || new Date(e.updatedAt || 0) > new Date(existing.updatedAt || 0)) {
                mergedMap.set(e.id, e);
              }
            });
            const mergedList = Array.from(mergedMap.values());
            try {
              localStorage.setItem('mundus_codex_entries', JSON.stringify(mergedList));
            } catch (err) {}
            return mergedList;
          });
        } else {
          for (const entry of codexEntries) {
            const updated = { ...entry, userId: authorId };
            await saveUserCodexEntry(authorId, updated);
          }
        }

        // Fetch Cloud custom dictionary words (v0.4)
        const cloudWords = await fetchUserCustomWords(authorId);
        const localWords = getCustomDictionary();
        const mergedWords = Array.from(new Set([...cloudWords, ...localWords]));
        if (mergedWords.length > 0) {
          saveCustomDictionary(mergedWords);
          if (mergedWords.length > cloudWords.length) {
            await saveUserCustomWords(authorId, mergedWords);
          }
        }

        // Fetch Cloud timeline data (v0.4; per-project calendars since v0.7.74)
        const cloudTimeline = await fetchUserTimelineData(authorId);
        if (cloudTimeline) {
          // Per-project calendars: merge cloud entries into the local map (newer updatedAt wins)
          const cloudConfigs = cloudTimeline.configByProject;
          if (cloudConfigs) {
            setTimelineConfigMap((prev) => mergeTimelineConfigMaps(prev, cloudConfigs).map);
          }
          // Shared fallback calendar (v0.7.81): the fallback is FROZEN — seed it
          // from the cloud only when this device has none (fresh install), so
          // it can never be clobbered by another project's calendar.
          const cloudLegacy = normalizeTimelineConfig(cloudTimeline.config);
          if (cloudLegacy && !legacyTimelineConfigRef.current) setLegacyTimelineConfig(cloudLegacy);
          if (cloudTimeline.events && cloudTimeline.events.length > 0) setTimelineEvents(cloudTimeline.events);
          if (cloudTimeline.links && cloudTimeline.links.length > 0) setStoryLinks(cloudTimeline.links);
        } else {
          await saveUserTimelineData(authorId, {
            config: timelineConfig,
            configByProject: timelineConfigMap,
            events: timelineEvents,
            links: storyLinks
          });
        }

        // Fetch Cloud codex categories (v0.7.76; per-project lists)
        const cloudCodexSections = await fetchUserCodexSections(authorId);
        if (cloudCodexSections) {
          // Per-project lists: merge cloud entries into the local map (newer revision wins)
          const cloudSectionsMap = cloudCodexSections.sectionsByProject;
          if (cloudSectionsMap) {
            setCodexSectionsMap((prev) => mergeCodexSectionMaps(prev, cloudSectionsMap).map);
          }
          // Shared fallback list (v0.7.81): FROZEN — seed from the cloud only
          // when this device has none (fresh install); never clobber it with
          // another project's category list.
          const cloudSectionsLegacy = normalizeCodexSections(cloudCodexSections.sections);
          if (cloudSectionsLegacy && !legacyCodexSectionsRef.current) setLegacyCodexSections(cloudSectionsLegacy);
        } else {
          await saveUserCodexSections(authorId, {
            sections: legacyCodexSections || codexSections,
            sectionsByProject: codexSectionsMap
          });
        }

        // Fetch Cloud ImgBB API Key (v0.5)
        const cloudImgbbKey = await fetchUserImgbbApiKey(authorId);
        if (cloudImgbbKey) {
          setImgbbApiKey(cloudImgbbKey);
          localStorage.setItem('mundus_imgbb_api_key', cloudImgbbKey);
        } else {
          const localKey = localStorage.getItem('mundus_imgbb_api_key') || '';
          if (localKey) {
            await saveUserImgbbApiKey(authorId, localKey);
          }
        }

        // Fetch & merge Cloud font preferences (v0.7.83): default paragraph /
        // heading / quote fonts, LAST-WRITE-WINS by updatedAt — the device that
        // edited its font most recently wins everywhere. Cloud empty -> publish
        // local; local never stamped or cloud newer -> apply cloud; local newer
        // -> push local; equal -> nothing to do.
        try {
          const cloudFontPrefs = await fetchUserFontPrefs(authorId);
          const localFontPrefs = collectLocalFontPrefs();
          const resolvedFonts = mergeFontPrefs(localFontPrefs, cloudFontPrefs);
          if (resolvedFonts.action === 'apply-cloud') {
            applyFontPrefsToLocalStorage(resolvedFonts.prefs);
            setDefaultParagraphFont(resolvedFonts.prefs.paragraphFont);
            setDefaultHeadingFont(resolvedFonts.prefs.headingFont);
            setDefaultQuoteFont(resolvedFonts.prefs.quoteFont);
            // Make sure any applied Google font is registered immediately so
            // the UI renders with it on this first paint (gfont_<id> values).
            const knownGoogleFonts = new Map<string, GoogleFontItem>();
            CURATED_GOOGLE_FONTS.forEach(f => knownGoogleFonts.set(f.id, f));
            try {
              const rawAdded = localStorage.getItem('mundus_added_google_fonts');
              if (rawAdded) {
                const parsedAdded = JSON.parse(rawAdded);
                if (Array.isArray(parsedAdded)) {
                  parsedAdded.filter(isValidGoogleFontItem).forEach(f => knownGoogleFonts.set(f.id, f));
                }
              }
            } catch (e) {}
            for (const fontValue of [resolvedFonts.prefs.paragraphFont, resolvedFonts.prefs.headingFont, resolvedFonts.prefs.quoteFont]) {
              if (typeof fontValue === 'string' && fontValue.startsWith('gfont_')) {
                const gfontId = fontValue.slice('gfont_'.length);
                const fontItem = knownGoogleFonts.get(gfontId);
                if (fontItem) loadGoogleFont(fontItem);
              }
            }
          } else if (resolvedFonts.action === 'push-local') {
            await saveUserFontPrefs(authorId, resolvedFonts.prefs);
          }
        } catch (fontPrefsErr) {
          console.warn('Failed initial font preferences sync:', fontPrefsErr);
        }

        // Fetch & merge Cloud target-bar preference (v0.7.85): last-write-wins,
        // identical semantics to the font-preferences merge above. The device
        // that toggled most recently wins on every device.
        try {
          const cloudTargetBar = await fetchUserTargetBarPrefs(authorId);
          const resolvedTargetBar = mergeTargetBarPrefs(collectLocalTargetBarPrefs(), cloudTargetBar);
          if (resolvedTargetBar.action === 'apply-cloud') {
            applyTargetBarPrefsToLocalStorage(resolvedTargetBar.prefs);
            setDynamicTargetBarColorState(resolvedTargetBar.prefs.dynamicTargetBarColor);
          } else if (resolvedTargetBar.action === 'push-local') {
            await saveUserTargetBarPrefs(authorId, resolvedTargetBar.prefs);
          }
        } catch (targetBarErr) {
          console.warn('Failed initial target-bar preference sync:', targetBarErr);
        }

        // Fetch Cloud Added Google Fonts (v0.6.14)
        const cloudGoogleFonts = (await fetchUserGoogleFonts(authorId)).filter(isValidGoogleFontItem);
        let localGoogleFonts: GoogleFontItem[] = [];
        try {
          const raw = localStorage.getItem('mundus_added_google_fonts');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) localGoogleFonts = parsed.filter(isValidGoogleFontItem);
          }
        } catch (e) {}

        const fontMap = new Map<string, GoogleFontItem>();
        cloudGoogleFonts.forEach(f => fontMap.set(f.id, f));
        localGoogleFonts.forEach(f => {
          if (!fontMap.has(f.id)) fontMap.set(f.id, f);
        });
        const mergedGoogleFonts = Array.from(fontMap.values()).filter(isValidGoogleFontItem);

        if (mergedGoogleFonts.length > 0) {
          setAddedGoogleFonts(mergedGoogleFonts);
          localStorage.setItem('mundus_added_google_fonts', JSON.stringify(mergedGoogleFonts));
          mergedGoogleFonts.forEach(f => loadGoogleFont(f));
          if (mergedGoogleFonts.length > cloudGoogleFonts.length) {
            await saveUserGoogleFonts(authorId, mergedGoogleFonts);
          }
        } else {
          localStorage.setItem('mundus_added_google_fonts', JSON.stringify([]));
        }

        // Fetch & sync custom fonts across devices
        try {
          const cloudCustomFonts = await fetchUserCustomFonts(authorId);
          if (cloudCustomFonts.length > 0) {
            const fontMap = new Map<string, CustomFont>();
            customFonts.forEach(f => fontMap.set(f.id, f));
            cloudCustomFonts.forEach(f => fontMap.set(f.id, f));
            const mergedCustomFonts = Array.from(fontMap.values());
            await syncAndRegisterCustomFonts(mergedCustomFonts);
            setCustomFonts(mergedCustomFonts);

            // Upload any local-only fonts to Firebase
            for (const localF of customFonts) {
              if (!cloudCustomFonts.some(cF => cF.id === localF.id || cF.name === localF.name)) {
                await saveUserCustomFont(authorId, localF);
              }
            }
          } else if (customFonts.length > 0) {
            // Upload initial local fonts to cloud so other devices get them
            for (const localF of customFonts) {
              await saveUserCustomFont(authorId, localF);
            }
          }
        } catch (fontErr) {
          console.warn('Failed initial custom fonts sync:', fontErr);
        }

        setSyncStatus('synced');
        setLastSavedAt(new Date());

        // Flush documents that were marked pending-sync (failed offline write)
        // from a previous session. The 'online' event listener below only fires
        // on a connectivity TRANSITION, so without this startup flush, pending
        // docs were never re-synced when the app restarted already online.
        try {
          const pendingDocIds = getPendingSyncDocIds();
          if (pendingDocIds.length > 0) {
            const rawDocs = localStorage.getItem('mundus_documents');
            const localDocs: NovelDocument[] = rawDocs ? JSON.parse(rawDocs) : [];
            for (const docId of pendingDocIds) {
              const docToSync = localDocs.find((d) => d.id === docId);
              if (docToSync) {
                await saveUserDocument(authorId, { ...docToSync, userId: authorId });
                clearDocPendingSync(docId);
              }
            }
            setPendingSyncDocIds(getPendingSyncDocIds());
          }
        } catch (pendingErr) {
          console.warn('Failed to flush pending document syncs on startup:', pendingErr);
        }

        // Real-Time Cross-Device Synchronization Listeners (Phone <-> Desktop)
        // Automatically updates documents, folders, custom fonts, and worlds without having to reload the app!
        unsubFonts = subscribeToUserCustomFonts(authorId, async (cloudCustomFonts) => {
          if (!cloudCustomFonts) return;
          await syncAndRegisterCustomFonts(cloudCustomFonts);
          setCustomFonts(cloudCustomFonts);
        });

        unsubDocs = subscribeToUserDocuments(authorId, (cloudDocs) => {
          if (!cloudDocs) return;
          setDocuments((prevDocs) => {
            const currentActiveId = activeDocIdRef.current;
            const isEditingActive = isDirtyRef.current;

            const map = new Map<string, NovelDocument>();
            prevDocs.forEach((d) => map.set(d.id, d));

            let changed = false;
            cloudDocs.forEach((cDoc) => {
              const existing = map.get(cDoc.id);
              if (!existing) {
                // Brand new document created from another device!
                map.set(cDoc.id, cDoc);
                changed = true;
              } else {
                // Existing document: update if not currently being actively typed with unsaved edits
                const isThisDocActiveAndDirty = existing.id === currentActiveId && isEditingActive;
                if (!isThisDocActiveAndDirty) {
                  const cloudTime = new Date(cDoc.updatedAt || 0).getTime();
                  const localTime = new Date(existing.updatedAt || 0).getTime();
                  if (cloudTime > localTime || cDoc.title !== existing.title || cDoc.content !== existing.content) {
                    map.set(cDoc.id, cDoc);
                    changed = true;
                  }
                }
              }
            });

            if (!changed) return prevDocs;
            const merged = Array.from(map.values());
            try {
              localStorage.setItem('mundus_documents', JSON.stringify(merged));
            } catch (err) {}
            return merged;
          });
        });

        unsubFolders = subscribeToUserFolders(authorId, (cloudFolders) => {
          if (!cloudFolders) return;
          setFolders((prevFolders) => {
            const map = new Map<string, Folder>();
            prevFolders.forEach((f) => map.set(f.id, f));
            let changed = false;
            cloudFolders.forEach((cF) => {
              if (!map.has(cF.id) || JSON.stringify(map.get(cF.id)) !== JSON.stringify(cF)) {
                map.set(cF.id, cF);
                changed = true;
              }
            });
            if (!changed) return prevFolders;
            const merged = Array.from(map.values());
            try {
              localStorage.setItem('mundus_folders', JSON.stringify(merged));
            } catch (err) {}
            return merged;
          });
        });

        unsubProjects = subscribeToUserMundusProjects(authorId, (cloudProjects) => {
          if (!cloudProjects) return;
          setMundusProjects((prevProjects) => {
            const map = new Map<string, MundusProject>();
            prevProjects.forEach((p) => map.set(p.id, p));
            let changed = false;
            cloudProjects.forEach((cP) => {
              if (!map.has(cP.id)) {
                map.set(cP.id, cP);
                changed = true;
              }
            });
            if (!changed) return prevProjects;
            const merged = Array.from(map.values());
            try {
              localStorage.setItem('mundus_projects', JSON.stringify(merged));
            } catch (err) {}
            return merged;
          });
        });

        // v0.7.75: REAL-TIME CROSS-DEVICE CHARACTER SYNC. Characters previously
        // had no live listener — a character created on one device never reached
        // the others until a full reload, and remote deletions never propagated.
        // Merge rules: per-character updatedAt-wins (STRICTLY newer only, so our
        // own echoes are no-ops); ids with an in-flight debounced save are
        // skipped (their local state is newer than what was last pushed and will
        // be pushed within 800ms); remote deletions are tombstoned and applied
        // unless a local save is in flight for that id.
        unsubChars = subscribeToUserCharacters(authorId, (cloudCharList, removedIds) => {
          const pendingRemovals = (removedIds || []).filter((id) => {
            if (characterSaveTimersRef.current.has(id)) return false;
            markCharacterDeleted(id);
            clearCharacterPendingSync(id);
            return true;
          });
          setCharacters((prevChars) => {
            const map = new Map<string, Character>();
            prevChars.forEach((c) => map.set(c.id, c));
            let changed = false;
            if (pendingRemovals.length > 0) {
              pendingRemovals.forEach((id) => {
                if (map.delete(id)) changed = true;
              });
            }
            (cloudCharList || []).forEach((cloudCharRaw) => {
              // v0.7.75: sanitize remote characters (older devices may push
              // event/fiber-junked objects) before they enter local state.
              const cloudChar = sanitizeCharacter(cloudCharRaw);
              if (!cloudChar || typeof cloudChar.id !== 'string') return;
              if (isCharacterDeleted(cloudChar.id)) return;
              if (characterSaveTimersRef.current.has(cloudChar.id)) return;
              const existing = map.get(cloudChar.id);
              if (!existing) {
                map.set(cloudChar.id, normalizeCharacterTimestamps(cloudChar, new Date().toISOString()));
                changed = true;
              } else if (
                new Date(cloudChar.updatedAt || 0) > new Date(existing.updatedAt || 0)
              ) {
                map.set(cloudChar.id, cloudChar);
                changed = true;
              }
            });
            if (!changed) return prevChars;
            return Array.from(map.values());
          });
        });

      } catch (error) {
        console.error('Error fetching user data from Firestore:', error);
        setSyncStatus('offline');
      }
    };

    let unsubFonts: (() => void) | undefined;
    let unsubDocs: (() => void) | undefined;
    let unsubFolders: (() => void) | undefined;
    let unsubProjects: (() => void) | undefined;
    let unsubChars: (() => void) | undefined;

    initializeCloudSync();

    // Re-verify connectivity and refresh when app window regains focus.
    // Also re-pushes any characters whose cloud writes previously failed —
    // this is what rescues characters saved while Android was offline.
    const handleWindowFocus = () => {
      if (isFirebaseConfigured) {
        testFirestoreConnection().then((connected) => {
          if (connected) {
            setSyncStatus('synced');
            void flushPendingCharacterSaves();
          }
        });
      }
    };
    window.addEventListener('focus', handleWindowFocus);

    // Android/Capacitor: returning to the app does not always fire a 'focus'
    // event in the WebView — 'visibilitychange' does. Re-push failed character
    // writes when the user comes back to the app.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void flushPendingCharacterSaves();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubFonts?.();
      unsubDocs?.();
      unsubFolders?.();
      unsubProjects?.();
      unsubChars?.();
    };
  }, []);

  // Listen to browser network connectivity and automatically process pending sync queue
  useEffect(() => {
    const unsubscribe = subscribeToOnlineStatus(async (online) => {
      setIsOnline(online);
      if (online) {
        // Automatically sync any offline pending documents to Firebase!
        const pending = getPendingSyncDocIds();
        if (pending.length > 0 && isFirebaseConfigured) {
          setSyncStatus('saving');
          try {
            const rawDocs = localStorage.getItem('mundus_documents');
            const localDocs: NovelDocument[] = rawDocs ? JSON.parse(rawDocs) : [];
            for (const docId of pending) {
              const docToSync = localDocs.find((d) => d.id === docId);
              if (docToSync) {
                await saveUserDocument(DEFAULT_AUTHOR_ID, { ...docToSync, userId: DEFAULT_AUTHOR_ID });
                clearDocPendingSync(docId);
              }
            }
            setPendingSyncDocIds(getPendingSyncDocIds());
            setSyncStatus('synced');
            setLastSavedAt(new Date());
          } catch (e) {
            console.error('Error auto-syncing pending offline docs:', e);
            setSyncStatus('error');
          }
        } else if (isFirebaseConfigured) {
          setSyncStatus('synced');
        }

        // Automatically re-push characters whose cloud writes failed while offline
        void flushPendingCharacterSaves();
      } else {
        setSyncStatus('offline');
      }
    });

    return () => unsubscribe();
  }, []);

  // Save to localStorage whenever documents change (debounced to avoid blocking main thread & IPC during typing)
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('mundus_documents', JSON.stringify(documents));
    }, 1000);
    return () => clearTimeout(timer);
  }, [documents]);

  // Flush documents to localStorage on page/window unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      localStorage.setItem('mundus_documents', JSON.stringify(documentsRef.current));
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Save to localStorage whenever folders change
  useEffect(() => {
    localStorage.setItem('mundus_folders', JSON.stringify(folders));
  }, [folders]);

  // Active Mundus Project & Scoped collections for the active world
  const activeMundusProject = mundusProjects.find((p) => p.id === activeMundusId) || mundusProjects[0] || null;

  // Keep the export layer's page-format fallback in sync (used by Start Menu exports)
  useEffect(() => {
    setActivePageFormatGlobal(activeMundusProject?.pageFormat || DEFAULT_PAGE_FORMAT);
  }, [activeMundusProject?.pageFormat]);

  const currentMundusDocs = React.useMemo(() => {
    if (!activeMundusId) return [];
    return documents.filter((d) => d.mundusId === activeMundusId);
  }, [documents, activeMundusId]);

  const currentMundusFolders = React.useMemo(() => {
    if (!activeMundusId) return [];
    return folders.filter((f) => f.mundusId === activeMundusId);
  }, [folders, activeMundusId]);

  // v0.8.1: REAL storage usage for the sidebar "Cloud storage" popup —
  // per-Mundus numbers now measure actual data (documents, lore, map keys,
  // snapshots, config maps) instead of a hardcoded 16 KB constant, and the
  // app-wide total is their true sum. Recomputed only when project data
  // actually changes; localStorage is scanned once per recompute.
  const storageUsage = React.useMemo(() => estimateStorageUsage({
    documents,
    folders,
    characters,
    codexEntries,
    timelineEvents,
    storyLinks,
    mundusIds: mundusProjects.map((p) => p.id),
  }), [documents, folders, characters, codexEntries, timelineEvents, storyLinks, mundusProjects]);

  const currentMundusCharacters = React.useMemo(() => {
    if (!activeMundusId) return [];
    return characters.filter((c) => c.mundusId === activeMundusId);
  }, [characters, activeMundusId]);

  const currentMundusCodex = React.useMemo(() => {
    if (!activeMundusId) return [];
    return codexEntries.filter((e) => e.mundusId === activeMundusId);
  }, [codexEntries, activeMundusId]);

  const currentMundusTimeline = React.useMemo(() => {
    if (!activeMundusId) return [];
    return timelineEvents.filter((t) => t.mundusId === activeMundusId);
  }, [timelineEvents, activeMundusId]);

  const currentMundusStoryLinks = React.useMemo(() => {
    if (!activeMundusId) return [];
    return storyLinks.filter((l) => l.mundusId === activeMundusId);
  }, [storyLinks, activeMundusId]);

  // Current active document scoped to active Mundus
  const activeDocument = currentMundusDocs.find((d) => d.id === activeDocId) || currentMundusDocs[0];
  const activeDocumentRef = useRef<NovelDocument | undefined>(activeDocument);
  activeDocumentRef.current = activeDocument;

  // Mundus Project Hub Handlers
  const handleSelectMundusProject = (projectId: string) => {
    setActiveMundusId(projectId);
    setIsInAtlasView(false);

    const projectDocs = documents.filter((d) => d.mundusId === projectId);
    if (projectDocs.length > 0) {
      setActiveDocId(projectDocs[0].id);
    } else {
      const proj = mundusProjects.find((p) => p.id === projectId);
      const projName = proj?.name || 'New World';
      const newDocId = `doc-${Date.now()}`;
      const newDoc: NovelDocument = {
        id: newDocId,
        userId: DEFAULT_AUTHOR_ID,
        mundusId: projectId,
        title: 'Chapter 1: The Beginning',
        category: 'Manuscript',
        status: 'draft',
        isFavorite: false,
        fontFamily: 'serif',
        fontSize: 16,
        content: `<h1>Chapter 1: The Beginning</h1><p>Begin writing the chronicle of ${projName} here...</p>`,
        plainText: `Chapter 1: The Beginning\n\nBegin writing the chronicle of ${projName} here...`,
        wordCount: 11,
        characterCount: 65,
        readingTimeMinutes: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setDocuments((prev) => [newDoc, ...prev]);
      setActiveDocId(newDocId);
      if (isFirebaseConfigured) {
        saveUserDocument(DEFAULT_AUTHOR_ID, newDoc);
      }
    }
  };

  const handleCreateMundusProject = (projectData: { name: string; description: string; genre: string; color: string; pageFormat?: PageFormat }) => {
    const newProjectId = `mundus-${Date.now()}`;
    const newProject: MundusProject = {
      id: newProjectId,
      userId: DEFAULT_AUTHOR_ID,
      name: projectData.name,
      description: projectData.description,
      genre: projectData.genre,
      color: projectData.color,
      pageFormat: projectData.pageFormat || DEFAULT_PAGE_FORMAT,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const initialDoc: NovelDocument = {
      id: `doc-${Date.now()}`,
      userId: DEFAULT_AUTHOR_ID,
      mundusId: newProjectId,
      title: 'Chapter 1: The Beginning',
      category: 'Manuscript',
      status: 'draft',
      isFavorite: false,
      fontFamily: 'serif',
      fontSize: 16,
      content: `<h1>Chapter 1: The Beginning</h1><p>Begin writing the chronicle of ${projectData.name} here...</p>`,
      plainText: `Chapter 1: The Beginning\n\nBegin writing the chronicle of ${projectData.name} here...`,
      wordCount: 11,
      characterCount: 65,
      readingTimeMinutes: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setMundusProjects((prev) => [...prev, newProject]);
    setDocuments((prev) => [initialDoc, ...prev]);
    setActiveMundusId(newProjectId);
    setActiveDocId(initialDoc.id);

    if (isFirebaseConfigured) {
      saveUserMundusProject(DEFAULT_AUTHOR_ID, newProject);
      saveUserDocument(DEFAULT_AUTHOR_ID, initialDoc);
    }
  };

  const handleUpdateMundusProject = (projectId: string, updates: Partial<MundusProject>) => {
    setMundusProjects((prev) =>
      prev.map((p) => {
        if (p.id === projectId) {
          const updated = { ...p, ...updates, updatedAt: new Date().toISOString() };
          if (isFirebaseConfigured) {
            saveUserMundusProject(DEFAULT_AUTHOR_ID, updated);
          }
          return updated;
        }
        return p;
      })
    );
  };

  const handleDeleteMundusProject = (projectId: string) => {
    const remaining = mundusProjects.filter((p) => p.id !== projectId);
    setMundusProjects(remaining);

    if (remaining.length === 0) {
      setActiveMundusId('');
      setIsInAtlasView(true);
      if (isFirebaseConfigured) {
        deleteUserMundusProject(DEFAULT_AUTHOR_ID, projectId);
      }
    } else {
      if (activeMundusId === projectId) {
        setActiveMundusId(remaining[0].id);
      }
      if (isFirebaseConfigured) {
        deleteUserMundusProject(DEFAULT_AUTHOR_ID, projectId);
      }
    }

    // Clean up elements associated with that Mundus
    // v0.7.75: tombstone the project's characters so storage merges / cloud
    // merges / the live listener cannot resurrect them on any device.
    const doomedChars = charactersRef.current.filter((c) => c.mundusId === projectId);
    doomedChars.forEach((c) => markCharacterDeleted(c.id));
    // v0.7.95 FIX: cloud-side cleanup. The startup merge REPLACES local
    // documents/folders from Firestore and MERGES codex entries & characters
    // back in, so without these deletes a deleted world's content resurrected
    // on the next launch (documents/folders immediately; entries on merge;
    // characters once the local tombstone TTL pruned them).
    if (isFirebaseConfigured) {
      doomedChars.forEach((c) => {
        deleteUserCharacter(DEFAULT_AUTHOR_ID, c.id).catch((err) => {
          console.warn('[CharacterSync] Cloud delete failed (local deletion kept):', err);
        });
      });
      documents
        .filter((d) => d.mundusId === projectId)
        .forEach((d) => {
          deleteUserDocument(DEFAULT_AUTHOR_ID, d.id).catch(() => undefined);
        });
      folders
        .filter((f) => f.mundusId === projectId)
        .forEach((f) => {
          deleteUserFolder(DEFAULT_AUTHOR_ID, f.id).catch(() => undefined);
        });
      codexEntries
        .filter((en) => en.mundusId === projectId)
        .forEach((en) => {
          deleteUserCodexEntry(DEFAULT_AUTHOR_ID, en.id).catch(() => undefined);
        });
    }
    // v0.7.95 FIX: timeline events & story links live in a single cloud lore
    // doc — push the cleaned lists (the deleted world's events and links used
    // to be restored from the cloud on the next launch).
    scheduleLoreCloudSave();
    // v0.7.95 FIX: remove the world's map data (markers + realm name in
    // localStorage, full-resolution map image in IndexedDB). They used to be
    // orphaned forever, silently consuming storage after the world was gone.
    try { localStorage.removeItem(`mundus_map_markers_${projectId}`); } catch { /* ignore */ }
    try { localStorage.removeItem(`mundus_map_world_name_${projectId}`); } catch { /* ignore */ }
    void deleteLocalMapImage(projectId).catch(() => undefined);
    // v0.7.96: also drop the world's Story Flow Graph layout keys.
    clearStoryFlowLayout(projectId);

    setDocuments((prev) => prev.filter((d) => d.mundusId !== projectId));
    setFolders((prev) => prev.filter((f) => f.mundusId !== projectId));
    setCharacters((prev) => prev.filter((c) => c.mundusId !== projectId));
    setCodexEntries((prev) => prev.filter((e) => e.mundusId !== projectId));
    setTimelineEvents((prev) => prev.filter((t) => t.mundusId !== projectId));
    setStoryLinks((prev) => prev.filter((l) => l.mundusId !== projectId));
    // v0.7.74: drop the deleted project's independent calendar
    setTimelineConfigMap((prev) => {
      if (!prev[projectId]) return prev;
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
    // v0.7.76: drop the deleted project's independent codex categories
    setCodexSectionsMap((prev) => {
      if (!prev[projectId]) return prev;
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      
      // If typing normal characters in an editable area without modifiers, exit immediately for 0 latency
      if (isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        return;
      }

      const bindings = getKeybindings();

      if (matchesBinding(e, bindings.zenMode)) {
        e.preventDefault();
        setIsZenMode(prev => !prev);
        return;
      }

      if (matchesBinding(e, bindings.navWriting)) {
        e.preventDefault();
        setActiveSection('editor');
        return;
      }
      
      if (matchesBinding(e, bindings.navCharacters)) {
        e.preventDefault();
        setActiveSection('characters');
        return;
      }
      
      if (matchesBinding(e, bindings.navLore)) {
        e.preventDefault();
        setActiveSection('lore');
        return;
      }
      
      if (matchesBinding(e, bindings.navWorldBuilding)) {
        e.preventDefault();
        setActiveSection('world');
        return;
      }
      
      if (matchesBinding(e, bindings.navMundus)) {
        e.preventDefault();
        setIsStartMenuOpen(true);
        return;
      }

      // ---- v0.7.93: interface & focus shortcuts -------------------------
      if (matchesBinding(e, bindings.toggleSidebar)) {
        e.preventDefault();
        if (window.innerWidth < 768) {
          setIsMobileSidebarOpen((prev) => !prev);
        } else {
          setIsSidebarCollapsed((prev) => !prev);
        }
        return;
      }

      if (matchesBinding(e, bindings.focusTopBar)) {
        e.preventDefault();
        focusFirstVisibleElement(window.document.getElementById('editor-toolbar'));
        return;
      }

      if (matchesBinding(e, bindings.focusBottomBar)) {
        e.preventDefault();
        focusFirstVisibleElement(window.document.getElementById('editor-footer'));
        return;
      }

      if (matchesBinding(e, bindings.focusSidebar)) {
        e.preventDefault();
        if (window.innerWidth < 768) {
          setIsMobileSidebarOpen(true);
        } else {
          setIsSidebarCollapsed(false);
        }
        // Wait for the expand/collapse transition to lay out the list, then
        // put the cursor on the first document so arrows can pick any doc.
        window.setTimeout(() => {
          const sidebar = window.document.getElementById('app-sidebar');
          const firstDoc = sidebar?.querySelector<HTMLElement>('[data-sidebar-doc-id]');
          firstDoc?.focus();
        }, 160);
        return;
      }

      // We skip editor-specific shortcuts if not in an editor context,
      // but if we are in an editor context, we might want to handle them there, 
      // not here, to avoid conflicting with TextEditor.tsx's internal logic.
    };

    window.addEventListener('keydown', handleGlobalShortcuts, true);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts, true);
  }, []);

  // Fetch snapshots when active document changes
  useEffect(() => {
    if (!activeDocId) {
      setSnapshots([]);
      return;
    }
    setSnapshots([]); // Clear previous document's snapshots immediately so they never leak into the view
    const authorId = DEFAULT_AUTHOR_ID;
    fetchDocumentSnapshots(authorId, activeDocId)
      .then((snaps) => {
        // Enforce strict documentId filtering
        setSnapshots(snaps.filter((s) => s && s.documentId === activeDocId));
      })
      .catch((err) => {
        console.warn('Failed to load snapshots:', err);
        setSnapshots([]);
      });
  }, [activeDocId]);

  const handleCreateSnapshot = async (name: string, description?: string) => {
    if (!activeDocument) return;
    const authorId = DEFAULT_AUTHOR_ID;
    const newSnapshot: DocumentSnapshot = {
      id: `snap-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      documentId: activeDocument.id,
      userId: authorId,
      name,
      description: description || undefined,
      content: activeDocument.content,
      plainText: activeDocument.plainText,
      wordCount: activeDocument.wordCount,
      characterCount: activeDocument.characterCount,
      visualImages: activeDocument.visualImages ? JSON.parse(JSON.stringify(activeDocument.visualImages)) : [],
      createdAt: new Date().toISOString()
    };

    await createDocumentSnapshot(authorId, newSnapshot);
    setSnapshots((prev) => [newSnapshot, ...prev]);
  };

  const handleRestoreSnapshot = async (snapshot: DocumentSnapshot) => {
    if (!activeDocument) return;
    const authorId = DEFAULT_AUTHOR_ID;
    
    // Create an automatic safety checkpoint of current document before restoring
    const safetySnapshot: DocumentSnapshot = {
      id: `snap-${Date.now()}-safety`,
      documentId: activeDocument.id,
      userId: authorId,
      name: `Pre-Revert Safety (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
      description: `Auto-saved safety checkpoint before reverting to "${snapshot.name}"`,
      content: activeDocument.content,
      plainText: activeDocument.plainText,
      wordCount: activeDocument.wordCount,
      characterCount: activeDocument.characterCount,
      visualImages: activeDocument.visualImages ? JSON.parse(JSON.stringify(activeDocument.visualImages)) : [],
      createdAt: new Date().toISOString()
    };
    await createDocumentSnapshot(authorId, safetySnapshot);

    // Apply snapshot content and visualImages to active document
    const restoredImages = snapshot.visualImages ? JSON.parse(JSON.stringify(snapshot.visualImages)) : [];

    handleUpdateDocument({
      content: snapshot.content,
      plainText: snapshot.plainText,
      wordCount: snapshot.wordCount,
      characterCount: snapshot.characterCount,
      visualImages: restoredImages,
    });

    const updated = await fetchDocumentSnapshots(authorId, activeDocument.id);
    setSnapshots(updated);
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!activeDocument) return;
    const authorId = DEFAULT_AUTHOR_ID;
    await deleteDocumentSnapshot(authorId, activeDocument.id, snapshotId);
    setSnapshots((prev) => prev.filter((s) => s.id !== snapshotId));
  };

  // Core save function
  const performSave = useCallback(async (docToSave: NovelDocument) => {
    if (isFirebaseConfigured) {
      setSyncStatus('saving');
    }
    try {
      if (isFirebaseConfigured && isBrowserOnline()) {
        await saveUserDocument(DEFAULT_AUTHOR_ID, docToSave);
        clearDocPendingSync(docToSave.id);
        setPendingSyncDocIds(getPendingSyncDocIds());
        setSyncStatus('synced');
      } else {
        if (isFirebaseConfigured) {
          markDocPendingSync(docToSave.id);
          setPendingSyncDocIds(getPendingSyncDocIds());
        }
        localStorage.setItem('mundus_documents', JSON.stringify(documentsRef.current));
        setSyncStatus('offline');
      }
      isDirtyRef.current = false;
      lastSaveTimeRef.current = Date.now();
      setLastSavedAt(new Date());
    } catch (err) {
      console.warn('Save failed or offline, marked for pending sync:', err);
      if (isFirebaseConfigured) {
        markDocPendingSync(docToSave.id);
        setPendingSyncDocIds(getPendingSyncDocIds());
      }
      setSyncStatus('offline');
    }
  }, []);

  // Manual save trigger (Save button or Ctrl+S)
  const handleSaveNow = useCallback(async () => {
    if (!activeDocument) return;
    await performSave(activeDocument);
  }, [activeDocument, performSave]);

  // Periodic Auto-Save Timer Engine for time-based intervals (1m, 3m, 5m, 10m)
  useEffect(() => {
    if (autoSaveInterval === 'off' || autoSaveInterval === 'every_edit') {
      return;
    }

    const intervalMap: Record<string, number> = {
      '1m': 60 * 1000,
      '3m': 3 * 60 * 1000,
      '5m': 5 * 60 * 1000,
      '10m': 10 * 60 * 1000,
    };
    const intervalMs = intervalMap[autoSaveInterval] || 60 * 1000;

    const timer = setInterval(() => {
      const now = Date.now();
      if (isDirtyRef.current && (now - lastSaveTimeRef.current >= intervalMs)) {
        if (activeDocumentRef.current) {
          performSave(activeDocumentRef.current);
        }
      }
    }, 4000);

    return () => clearInterval(timer);
  }, [autoSaveInterval, performSave]);

  // Update document (active or specified by targetDocId)
  const handleUpdateDocument = useCallback((changes: Partial<NovelDocument>, targetDocId?: string) => {
    isDirtyRef.current = true;
    const docIdToUpdate = targetDocId || activeDocId;

    setDocuments((prevDocs) => {
      return prevDocs.map((d) => {
        if (d.id === docIdToUpdate) {
          const updated = { ...d, ...changes, updatedAt: new Date().toISOString() };

          // If autoSave is set to 'every_edit', save with 1000ms debounce
          if (autoSaveInterval === 'every_edit' && docIdToUpdate === activeDocId) {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(async () => {
              await performSave(updated);
            }, 1000);
          }

          return updated;
        }
        return d;
      });
    });
  }, [activeDocId, autoSaveInterval, performSave]);

  // Document creation
  const handleCreateDocument = (templateType: string = 'blank', folderId?: string) => {
    let title = 'Untitled Document';
    let content = '<p><br></p>';
    let plainText = '';
    let category = 'Manuscript';

    if (templateType === 'chapter') {
      title = `Chapter ${documents.length + 1}: The Unfolding Path`;
      category = 'Manuscript';
      content = `<h1>${title}</h1>
<p><em>Scene Setting: Dawn breaks across the stone towers.</em></p>
<p>Begin your chapter here...</p>`;
      plainText = `${title}\n\nScene Setting: Dawn breaks across the stone towers.\n\nBegin your chapter here...`;
    } else if (templateType === 'world') {
      title = 'World Lore: New Region';
      category = 'World Notes';
      content = `<h2>New Region / Lore Dossier</h2>
<p><strong>Geography:</strong> High mountain passes and ancient pines.</p>
<p><strong>Factions:</strong> The Order of the Silver Quill.</p>
<p>Notes and historical lore details...</p>`;
      plainText = `New Region / Lore Dossier\n\nGeography: High mountain passes and ancient pines.\nFactions: The Order of the Silver Quill.\nNotes and historical lore details...`;
    }

    const newDoc: NovelDocument = {
      id: `doc-${Date.now()}`,
      userId: DEFAULT_AUTHOR_ID,
      mundusId: activeMundusId,
      folderId: folderId,
      title,
      category,
      status: 'draft',
      isFavorite: false,
      fontFamily: 'serif',
      fontSize: 16,
      content,
      plainText,
      wordCount: plainText ? plainText.trim().split(/\s+/).length : 0,
      characterCount: plainText.length,
      readingTimeMinutes: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setDocuments((prev) => [newDoc, ...prev]);
    setActiveDocId(newDoc.id);
    setActiveSection('editor');

    if (isFirebaseConfigured) {
      saveUserDocument(DEFAULT_AUTHOR_ID, newDoc);
    }
  };

  // Import document from external file directly into Loose Files folder (folderId: undefined)
  const handleImportDocument = (imported: Partial<NovelDocument>) => {
    const newId = `doc-${Date.now()}`;
    const now = new Date().toISOString();
    const plain = imported.plainText || (imported.content ? imported.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
    const words = imported.wordCount !== undefined ? imported.wordCount : (plain ? plain.trim().split(/\s+/).filter(Boolean).length : 0);
    const chars = imported.characterCount !== undefined ? imported.characterCount : plain.length;

    const newDoc: NovelDocument = {
      id: newId,
      userId: DEFAULT_AUTHOR_ID,
      mundusId: activeMundusId,
      folderId: undefined, // Loose files folder
      title: (imported.title || 'Imported Document').trim(),
      category: imported.category || 'Manuscript',
      status: imported.status || 'draft',
      isFavorite: Boolean(imported.isFavorite),
      fontFamily: imported.fontFamily || 'serif',
      fontSize: imported.fontSize || 16,
      content: imported.content || `<p>${plain}</p>`,
      plainText: plain,
      wordCount: words,
      characterCount: chars,
      readingTimeMinutes: Math.ceil(words / 200) || 1,
      createdAt: now,
      updatedAt: now,
      visualImages: imported.visualImages || [],
      timelineInfo: imported.timelineInfo,
      targetType: imported.targetType,
      targetCount: imported.targetCount,
    };

    setDocuments((prev) => [newDoc, ...prev]);
    setActiveDocId(newDoc.id);
    setActiveSection('editor');

    if (isFirebaseConfigured) {
      saveUserDocument(DEFAULT_AUTHOR_ID, newDoc);
    }
  };

  // Duplicate document
  const handleDuplicateDocument = (targetDoc: NovelDocument) => {
    const duplicated: NovelDocument = {
      ...targetDoc,
      id: `doc-${Date.now()}`,
      title: `${targetDoc.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setDocuments((prev) => [duplicated, ...prev]);
    setActiveDocId(duplicated.id);

    if (isFirebaseConfigured) {
      saveUserDocument(DEFAULT_AUTHOR_ID, duplicated);
    }
  };

  // Delete document
  const handleDeleteDocument = (docId: string) => {
    setDocuments((prev) => {
      const filtered = prev.filter((d) => d.id !== docId);
      const remainingInMundus = filtered.filter((d) => (d.mundusId || activeMundusId) === activeMundusId);
      if (remainingInMundus.length === 0) {
        const fallbackDoc: NovelDocument = {
          id: `doc-${Date.now()}`,
          userId: DEFAULT_AUTHOR_ID,
          mundusId: activeMundusId,
          title: 'Untitled Document',
          category: 'Manuscript',
          status: 'draft',
          isFavorite: false,
          fontFamily: 'serif',
          fontSize: 16,
          content: '<p><br></p>',
          plainText: '',
          wordCount: 0,
          characterCount: 0,
          readingTimeMinutes: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setActiveDocId(fallbackDoc.id);
        if (isFirebaseConfigured) {
          saveUserDocument(DEFAULT_AUTHOR_ID, fallbackDoc);
        }
        return [...filtered, fallbackDoc];
      }
      if (activeDocId === docId) {
        setActiveDocId(remainingInMundus[0]?.id || '');
      }
      return filtered;
    });

    // Clean up any narrative story links attached to this deleted document
    setStoryLinks((prev) => prev.filter((l) => l.fromDocId !== docId && l.toDocId !== docId));
    // v0.7.95 FIX: push the cleaned links to the cloud. The startup merge
    // REPLACES the local story-link list from Firestore, so without this push
    // the deleted document's links came back on the next launch.
    scheduleLoreCloudSave();

    if (isFirebaseConfigured) {
      deleteUserDocument(DEFAULT_AUTHOR_ID, docId);
    }
  };

  // Toggle favorite
  const handleToggleFavorite = (docId: string) => {
    setDocuments((prev) =>
      prev.map((d) => {
        if (d.id === docId) {
          const updated = { ...d, isFavorite: !d.isFavorite };
          if (isFirebaseConfigured) saveUserDocument(DEFAULT_AUTHOR_ID, updated);
          return updated;
        }
        return d;
      })
    );
  };

  // Move document to folder
  const handleMoveDocument = (docId: string, folderId: string | undefined) => {
    setDocuments((prev) =>
      prev.map((d) => {
        if (d.id === docId) {
          const updated = { ...d, folderId, updatedAt: new Date().toISOString() };
          if (isFirebaseConfigured) saveUserDocument(DEFAULT_AUTHOR_ID, updated);
          return updated;
        }
        return d;
      })
    );
  };

  // Folder Operations
  const handleCreateFolder = (name: string, description?: string) => {
    const newFolder: Folder = {
      id: `folder-${Date.now()}`,
      userId: DEFAULT_AUTHOR_ID,
      mundusId: activeMundusId,
      name,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      orderIndex: folders.length
    };

    setFolders((prev) => [...prev, newFolder]);
    if (isFirebaseConfigured) {
      saveUserFolder(DEFAULT_AUTHOR_ID, newFolder);
    }
  };

  const handleRenameFolder = (folderId: string, newName: string) => {
    setFolders((prev) =>
      prev.map((f) => {
        if (f.id === folderId) {
          const updated = { ...f, name: newName, updatedAt: new Date().toISOString() };
          if (isFirebaseConfigured) saveUserFolder(DEFAULT_AUTHOR_ID, updated);
          return updated;
        }
        return f;
      })
    );
  };

  const handleDeleteFolder = (folderId: string) => {
    // 1. Remove folder
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    // 2. Unfile any contained documents
    setDocuments((prev) =>
      prev.map((doc) => {
        if (doc.folderId === folderId) {
          const unfiled = { ...doc, folderId: undefined, updatedAt: new Date().toISOString() };
          if (isFirebaseConfigured) saveUserDocument(DEFAULT_AUTHOR_ID, unfiled);
          return unfiled;
        }
        return doc;
      })
    );

    if (isFirebaseConfigured) {
      deleteUserFolder(DEFAULT_AUTHOR_ID, folderId);
    }
  };

  // Character Management Handlers (v0.2)
  // Unique character id helper (v0.7.75): ids are timestamp-based, so two rapid
  // creations (create + duplicate, scripted flows) could collide and silently
  // overwrite each other in Firestore (same document id) — a "disappeared"
  // character. Ensures the id is not already in the roster.
  const nextCharacterId = (): string => {
    let id = `char-${Date.now()}`;
    while (charactersRef.current.some((c) => c.id === id)) {
      id = `char-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    }
    return id;
  };

  const handleCreateCharacter = (initialDataOrName?: unknown) => {
    let nameToUse = 'New Character';
    let overrides: Partial<Character> = {};

    if (typeof initialDataOrName === 'string') {
      const trimmed = initialDataOrName.trim();
      if (trimmed) nameToUse = trimmed;
    } else if (initialDataOrName && typeof initialDataOrName === 'object') {
      // v0.7.75 ROOT-CAUSE FIX: copy ONLY recognized character fields.
      // CharactersMode wires the "New Character" button as onClick={onCreateCharacter},
      // so this handler RECEIVES THE REACT CLICK EVENT — the old code spread the
      // whole event (DOM node + fiber tree + app state) into the new character,
      // bloating it to hundreds of KB: Firestore writes exceeded the 1MB doc limit
      // (characters never reached other devices) and localStorage quota exploded
      // (characters vanished on reload). Codex entries were unaffected because
      // they receive plain data objects — exactly the reported asymmetry.
      overrides = pickCharacterFields(initialDataOrName);
      if (overrides.name && overrides.name.trim()) {
        nameToUse = overrides.name.trim();
      }
    }

    const newChar: Character = {
      id: nextCharacterId(),
      userId: DEFAULT_AUTHOR_ID,
      mundusId: activeMundusId,
      name: nameToUse,
      aliases: '',
      sex: 'Male',
      status: 'alive',
      roles: ['Supporting'],
      factions: [],
      families: [],
      tags: [],
      birthTime: '',
      birthPlace: '',
      deathTime: '',
      deathPlace: '',
      appearance: '',
      overview: '',
      notes: '',
      avatarColor: '#8b5cf6',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };

    // v0.7.75: coalesce undefined optional fields back to ''. The character
    // card drawer passes `field: value || undefined` for empty inputs, and an
    // explicit undefined in the overrides spread CLOBBERS the '' defaults.
    // undefined values are deleteField()-ed in Firestore, so those keys were
    // being permanently stripped from the cloud copy of new characters.
    newChar.aliases = newChar.aliases ?? '';
    newChar.birthTime = newChar.birthTime ?? '';
    newChar.birthPlace = newChar.birthPlace ?? '';
    newChar.deathTime = newChar.deathTime ?? '';
    newChar.deathPlace = newChar.deathPlace ?? '';
    newChar.appearance = newChar.appearance ?? '';
    newChar.notes = newChar.notes ?? '';
    newChar.avatarColor = newChar.avatarColor ?? '#8b5cf6';
    newChar.roles = Array.isArray(newChar.roles) ? newChar.roles : ['Supporting'];
    newChar.factions = Array.isArray(newChar.factions) ? newChar.factions : [];
    newChar.families = Array.isArray(newChar.families) ? newChar.families : [];
    newChar.tags = Array.isArray(newChar.tags) ? newChar.tags : [];
    newChar.createdAt = newChar.createdAt || new Date().toISOString();
    newChar.updatedAt = newChar.updatedAt || newChar.createdAt;

    const nextAfterCreate = [newChar, ...charactersRef.current];
    charactersRef.current = nextAfterCreate;
    setCharacters(nextAfterCreate);
    // Reliable cloud save: debounced/queued with automatic retry on failure
    void syncCharacterToCloud(newChar);
    return newChar;
  };

  const handleUpdateCharacter = (id: string, changes: Partial<Character>) => {
    const prev = charactersRef.current;
    const target = prev.find((c) => c.id === id);
    if (!target) return;

    const updatedTarget: Character = {
      ...target,
      ...changes,
      updatedAt: new Date().toISOString()
    };

    // Only run the expensive full-roster relatives synchronization when the
    // change can actually affect family links (relatives or sex). Ordinary
    // field edits (name, notes, appearance, tags, ...) used to clone and
    // JSON-compare EVERY character on EVERY keystroke — a major source of the
    // Android typing lag. References are canonicalized to character IDs, so
    // renames never break reciprocal links.
    const touchesFamilyTree = 'relatives' in changes || 'sex' in changes;

    if (touchesFamilyTree) {
      const syncedList = syncRelativesAcrossCharacters(prev, id, updatedTarget);
      // Update the ref immediately so rapid successive edits never build on a stale roster
      charactersRef.current = syncedList;
      setCharacters(syncedList);

      // Cloud-save the edited character plus any character whose relatives changed
      syncedList.forEach((char) => {
        const oldChar = prev.find((c) => c.id === char.id);
        if (!oldChar || JSON.stringify(oldChar.relatives) !== JSON.stringify(char.relatives) || char.id === id) {
          queueCharacterCloudSave(char.id);
        }
      });
    } else {
      const nextList = prev.map((c) => (c.id === id ? updatedTarget : c));
      charactersRef.current = nextList;
      setCharacters(nextList);
      queueCharacterCloudSave(id);
    }
  };

  const handleDeleteCharacter = (id: string) => {
    // v0.7.95: purge every reference to the deleted character from the
    // survivors (father/mother strings, siblings/partners/children arrays).
    // The raw id used to survive inside the roster and was then displayed
    // verbatim ("Partner: char-1729…") by the cards and the mention drawer.
    const deleted = charactersRef.current.find((char) => char.id === id);
    const survivors = charactersRef.current.filter((char) => char.id !== id);
    const { list: nextAfterDelete, changedIds } = purgeDeletedCharacterReferences(
      survivors,
      id,
      deleted?.name
    );
    charactersRef.current = nextAfterDelete;
    setCharacters(nextAfterDelete);
    // Persist the cleaned survivors (the debounced local write covers storage;
    // cloud needs an explicit push per changed character, same as edits do).
    changedIds.forEach((changedId) => queueCharacterCloudSave(changedId));
    // v0.7.75: tombstone the deletion so storage merges, the startup cloud
    // merge and the live listener never resurrect this character.
    markCharacterDeleted(id);
    clearCharacterPendingSync(id);
    if (isFirebaseConfigured) {
      deleteUserCharacter(DEFAULT_AUTHOR_ID, id).catch((err) => {
        console.warn('[CharacterSync] Cloud delete failed (local deletion kept):', err);
      });
    }
  };

  const handleDuplicateCharacter = (char: Character) => {
    // v0.7.75: sanitize the source (historical characters can carry event/fiber
    // junk) so duplicates are always clean.
    const cleanSource = sanitizeCharacter(char) || char;
    const duplicated: Character = {
      ...cleanSource,
      id: nextCharacterId(),
      userId: DEFAULT_AUTHOR_ID,
      name: `${cleanSource.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const nextAfterDuplicate = [duplicated, ...charactersRef.current];
    charactersRef.current = nextAfterDuplicate;
    setCharacters(nextAfterDuplicate);
    void syncCharacterToCloud(duplicated);
  };

  // Lore & Timeline handlers (v0.3)
  const handleSaveTimelineEvent = (eventData: Partial<TimelineEvent>) => {
    setTimelineEvents((prev) => {
      const exists = eventData.id ? prev.some((e) => e.id === eventData.id) : false;
      if (exists) {
        return prev.map((e) =>
          e.id === eventData.id
            ? ({ ...e, ...eventData, updatedAt: new Date().toISOString() } as TimelineEvent)
            : e
        );
      } else {
        const newEvent: TimelineEvent = {
          id: eventData.id || `evt-${Date.now()}`,
          userId: DEFAULT_AUTHOR_ID,
          mundusId: activeMundusId,
          title: eventData.title || 'Untitled Milestone Event',
          timeCoordinate: eventData.timeCoordinate ?? (timelineConfig.baseYear || 400),
          timeDisplay: eventData.timeDisplay || `${timelineConfig.majorUnitName || 'Year'} ${eventData.timeCoordinate || timelineConfig.baseYear}`,
          category: eventData.category || 'milestone',
          description: eventData.description || '',
          color: eventData.color || '#3b82f6',
          characterIds: eventData.characterIds || [],
          sceneId: eventData.sceneId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return [...prev, newEvent];
      }
    });
    scheduleLoreCloudSave();
  };

  const handleDeleteTimelineEvent = (id: string) => {
    setTimelineEvents((prev) => prev.filter((e) => e.id !== id));
    scheduleLoreCloudSave();
  };

  const handleSaveSceneTimelineInfo = (docId: string, info: SceneTimelineInfo) => {
    setDocuments((prev) =>
      prev.map((doc) => {
        if (doc.id === docId) {
          const updated = {
            ...doc,
            timelineInfo: info,
            updatedAt: new Date().toISOString(),
          };
          if (isFirebaseConfigured) saveUserDocument(DEFAULT_AUTHOR_ID, updated);
          return updated;
        }
        return doc;
      })
    );
  };

  const handleSaveTimelineConfig = (config: TimelineConfig) => {
    // v0.7.74: save the calendar for the ACTIVE project only (independent per-project calendars).
    // v0.7.81 BUGFIX: this used to also write the active project's calendar into
    // the shared fallback (setLegacyTimelineConfig), which made every
    // never-edited project follow it. The fallback is now frozen; it only
    // changes when no project is active (the pre-0.7.74 global-edit path below).
    if (!activeMundusId) {
      const normalized = normalizeTimelineConfig(config);
      if (normalized) setLegacyTimelineConfig(normalized);
      return;
    }
    const stamped: TimelineConfig = { ...config, mundusId: activeMundusId, updatedAt: new Date().toISOString() };
    setTimelineConfigMap((prev) => ({ ...prev, [activeMundusId]: stamped }));
    scheduleLoreCloudSave();
  };

  // v0.7.76: per-project Codex categories. Saves the list for the ACTIVE project
  // (stamped with a revision timestamp).
  // v0.7.81 BUGFIX (the "new category appears in every project" bug): this
  // handler used to also write the active project's list into the shared
  // fallback (setLegacyCodexSections), so projects that never edited their
  // categories picked up the new category too. The fallback is now frozen; it
  // only changes when no project is active (the legacy global-edit path below).
  const handleSaveCodexSections = (sections: CodexSection[]) => {
    const normalized = normalizeCodexSections(sections);
    if (!normalized) return;
    if (!activeMundusId) {
      setLegacyCodexSections(normalized);
      scheduleLoreCloudSave();
      return;
    }
    const stamped = stampCodexSections(normalized, new Date().toISOString());
    setCodexSectionsMap((prev) => ({ ...prev, [activeMundusId]: stamped }));
    scheduleLoreCloudSave();
  };

  const handleSaveStoryLink = (linkData: Partial<StoryNodeLink>) => {
    setStoryLinks((prev) => {
      const existingLinkIndex = linkData.id ? prev.findIndex((l) => l.id === linkData.id) : -1;

      if (existingLinkIndex >= 0) {
        return prev.map((l) =>
          l.id === linkData.id
            ? ({ ...l, ...linkData, updatedAt: new Date().toISOString() } as StoryNodeLink)
            : l
        );
      } else if (linkData.fromDocId && linkData.toDocId) {
        const existingPair = prev.find((l) => l.fromDocId === linkData.fromDocId && l.toDocId === linkData.toDocId);
        if (existingPair) {
          return prev.map((l) =>
            l.id === existingPair.id
              ? ({ ...l, ...linkData, updatedAt: new Date().toISOString() } as StoryNodeLink)
              : l
          );
        }
        const newLink: StoryNodeLink = {
          id: linkData.id || `link-${Date.now()}`,
          userId: DEFAULT_AUTHOR_ID,
          mundusId: activeMundusId,
          fromDocId: linkData.fromDocId,
          toDocId: linkData.toDocId,
          linkType: linkData.linkType || 'leads_to',
          label: linkData.label || '',
          notes: linkData.notes || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return [...prev, newLink];
      }
      return prev;
    });
    scheduleLoreCloudSave();
  };

  const handleDeleteStoryLink = (linkId: string) => {
    setStoryLinks((prev) => prev.filter((l) => l.id !== linkId));
    scheduleLoreCloudSave();
  };

  // Codex Entries handlers
  const handleCreateCodexEntry = (entryData: Partial<CodexEntry>): CodexEntry => {
    if (entryData.title) {
      addWordToCustomDictionary(entryData.title);
    }
    const newEntry: CodexEntry = {
      id: `codex-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: DEFAULT_AUTHOR_ID,
      mundusId: activeMundusId,
      title: entryData.title || 'Untitled Entry',
      category: entryData.category || 'regions',
      subtitle: entryData.subtitle,
      overview: entryData.overview || '',
      content: entryData.content || '',
      themeColor: entryData.themeColor || '#3b82f6',
      tags: entryData.tags || [],
      imageUrl: entryData.imageUrl, // v0.7.88: was silently dropped on create (pre-existing bug)
      images: entryData.images, // v0.7.88: image gallery
      relatedCharacterIds: entryData.relatedCharacterIds,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const nextCodex = [newEntry, ...codexEntriesRef.current];
    codexEntriesRef.current = nextCodex;
    setCodexEntries(nextCodex);
    if (isFirebaseConfigured) {
      saveUserCodexEntry(DEFAULT_AUTHOR_ID, newEntry).catch((err) => {
        console.warn('[CodexSync] Cloud write failed for entry (kept locally):', err);
      });
    }
    return newEntry;
  };

  const handleUpdateCodexEntry = (id: string, entryData: Partial<CodexEntry>) => {
    if (entryData.title) {
      addWordToCustomDictionary(entryData.title);
    }
    setCodexEntries((prev) =>
      prev.map((e) => {
        if (e.id === id) {
          const updated = { ...e, ...entryData, updatedAt: new Date().toISOString() } as CodexEntry;
          if (isFirebaseConfigured) saveUserCodexEntry(DEFAULT_AUTHOR_ID, updated);
          return updated;
        }
        return e;
      })
    );
  };

  const handleDeleteCodexEntry = (id: string) => {
    setCodexEntries((prev) => prev.filter((e) => e.id !== id));
    if (isFirebaseConfigured) {
      deleteUserCodexEntry(DEFAULT_AUTHOR_ID, id);
    }
  };

  const [loreInitialSubView, setLoreInitialSubView] = useState<'hub' | 'timeline' | 'story_flow' | 'codex'>('hub');
  const [loreInitialCodexEntryId, setLoreInitialCodexEntryId] = useState<string | null>(null);

  const handleSaveCustomWords = (words: string[]) => {
    if (isFirebaseConfigured) {
      saveUserCustomWords(DEFAULT_AUTHOR_ID, words);
    }
  };

  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [isFirebaseConfigModalOpen, setIsFirebaseConfigModalOpen] = useState(false);

  // Mobile swipe from left edge to open sidebar
  const edgeTouchStartXRef = useRef<number | null>(null);
  const edgeTouchStartYRef = useRef<number | null>(null);

  const handleEdgeTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && !isMobileSidebarOpen) {
      const clientX = e.touches[0].clientX;
      // Generous trigger zone: up to 80px from the left edge of the screen
      if (clientX <= 80) {
        edgeTouchStartXRef.current = clientX;
        edgeTouchStartYRef.current = e.touches[0].clientY;
      }
    }
  };

  const handleEdgeTouchMove = (e: React.TouchEvent) => {
    if (edgeTouchStartXRef.current === null || edgeTouchStartYRef.current === null) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - edgeTouchStartXRef.current;
    const deltaY = currentY - edgeTouchStartYRef.current;

    // Swiped right from left edge with minimal vertical angle
    if (deltaX > 30 && Math.abs(deltaY) < 70) {
      edgeTouchStartXRef.current = null;
      edgeTouchStartYRef.current = null;
      setIsMobileSidebarOpen(true);
    }
  };

  const handleEdgeTouchEnd = () => {
    edgeTouchStartXRef.current = null;
    edgeTouchStartYRef.current = null;
  };

  // If in Mundus Atlas mode, render the world hub starting page
  // (v0.7.91: the settings modal element is shared with the main app view so
  // the Atlas top-right settings button works too — the Atlas is an early
  // return, so a modal rendered only in the main return would never show.)
  const settingsModalElement = (
    <SettingsModal
      isOpen={isSettingsOpen}
      onClose={() => setIsSettingsOpen(false)}
      expandSidebarOnHover={expandSidebarOnHover}
      onToggleExpandSidebarOnHover={handleToggleExpandSidebarOnHover}
      isDarkMode={isDarkMode}
      accentColor={accentColor}
      onUpdateAccentColor={setAccentColor}
      defaultParagraphFont={defaultParagraphFont}
      onUpdateParagraphFont={handleUpdateParagraphFont}
      defaultHeadingFont={defaultHeadingFont}
      onUpdateHeadingFont={handleUpdateHeadingFont}
      defaultQuoteFont={defaultQuoteFont}
      onUpdateQuoteFont={handleUpdateQuoteFont}
      customFonts={customFonts}
      googleFonts={CURATED_GOOGLE_FONTS}
      onExportBackup={handleExportBackup}
      onImportBackup={handleImportBackupFile}
      autoBackupEnabled={autoBackupEnabled}
      onToggleAutoBackup={(enabled) => {
        setAutoBackupEnabled(enabled);
        localStorage.setItem('mundus_auto_backup_enabled', String(enabled));
      }}
      backupFilePrefix={backupFilePrefix}
      onUpdateBackupFilePrefix={handleUpdateBackupFilePrefix}
      autoDownloadBackupInterval={autoDownloadBackupInterval}
      onUpdateAutoDownloadBackupInterval={handleUpdateAutoDownloadBackupInterval}
      backupSnapshots={backupSnapshots}
      onRestoreSnapshot={handleRestoreBackupSnapshot}
      onCreateInstantSnapshot={handleCreateInstantSnapshot}
      onClearSnapshots={handleClearSnapshots}
      imgbbApiKey={imgbbApiKey}
      onUpdateImgbbApiKey={handleUpdateImgbbApiKey}
      onOpenFirebaseConfig={() => setIsFirebaseConfigModalOpen(true)}
      characterNameHighlightEnabled={characterNameHighlightEnabled}
      onToggleCharacterNameHighlight={handleToggleCharacterNameHighlight}
      harperSuggestionsVertical={harperSuggestionsVertical}
      onToggleHarperSuggestionsVertical={handleToggleHarperSuggestionsVertical}
      dynamicTargetBarColorEnabled={dynamicTargetBarColorEnabled}
      onToggleDynamicTargetBarColor={handleToggleDynamicTargetBarColor}
      backupDirPath={backupDirPath}
      onChooseBackupFolder={handleChooseBackupFolder}
      onClearBackupFolder={handleClearBackupFolder}
      backupFolderAvailable={isDesktopApp}
    />
  );

  // v0.7.96 FIX: the Firebase configuration modal used to be rendered ONLY in
  // the writing-mode branch. Opening Settings from the Atlas (no Mundus open)
  // and clicking "Configure Firebase" set the open state, but the modal was
  // not part of the Atlas early-return tree — it silently waited and appeared
  // only after the user opened a world. It is now a shared element rendered in
  // BOTH branches, exactly like the settings modal itself.
  const firebaseConfigModalElement = (
    <FirebaseConfigModal
      isOpen={isFirebaseConfigModalOpen}
      onClose={() => {
        setIsFirebaseConfigModalOpen(false);
        setAuthErrorMessage(null);
      }}
      isDarkMode={isDarkMode}
      errorMessage={authErrorMessage}
    />
  );

  // v0.7.92: confirmation popup shown when an imported Mundus backup has the
  // same name as an existing world — merge only after the user agrees.
  const mundusImportModalElement = pendingMundusImport ? (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className={`w-full max-w-md rounded-2xl border shadow-2xl p-5 ${
          isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-900'
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-500 border border-amber-500/30 flex items-center justify-center shrink-0">
            <AlertCircle className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold">A Mundus named “{pendingMundusImport.existing.name}” already exists</h3>
        </div>
        <p className="text-xs leading-relaxed opacity-80">
          Importing will <span className="font-semibold">merge</span> the backup into the existing Mundus: items with matching
          IDs (documents, folders, characters, codex entries, timeline events, story links, map markers) are overwritten
          with the backup's versions, and new items are added. Everything else is kept.
        </p>
        <div className={`mt-3 p-2.5 rounded-lg text-[11px] font-mono ${
          isDarkMode ? 'bg-neutral-800/80 text-neutral-300' : 'bg-neutral-100 text-neutral-600'
        }`}>
          Backup from {pendingMundusImport.data.exportedAt ? new Date(pendingMundusImport.data.exportedAt).toLocaleString() : 'unknown date'}
          {' · '}{pendingMundusImport.data.documents.length} docs
          {' · '}{pendingMundusImport.data.characters.length} characters
          {' · '}{pendingMundusImport.data.codexEntries.length} codex entries
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setPendingMundusImport(null)}
            className={`px-3.5 py-2 rounded-xl border font-medium text-xs transition-colors cursor-pointer ${
              isDarkMode ? 'border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-750' : 'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100'
            }`}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isImportingMundus}
            onClick={() => void applyMundusImport(pendingMundusImport.data, pendingMundusImport.existing)}
            className="px-3.5 py-2 rounded-xl bg-accent text-white font-semibold text-xs transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-90"
          >
            {isImportingMundus ? 'Merging…' : 'Merge & Import'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // If in Mundus Atlas mode, render the world hub starting page
  if (isInAtlasView) {
    return (
      <>
        {settingsModalElement}
        {firebaseConfigModalElement}
        {mundusImportModalElement}
        <ConfirmDialogHost isDarkMode={isDarkMode} />
        <MundusAtlas
          projects={mundusProjects}
          activeProjectId={activeMundusId}
          documents={documents}
          characters={characters}
          codexEntries={codexEntries}
          timelineEvents={timelineEvents}
          folders={folders}
          onSelectProject={handleSelectMundusProject}
          onCreateProject={handleCreateMundusProject}
          onUpdateProject={handleUpdateMundusProject}
          onDeleteProject={handleDeleteMundusProject}
          isDarkMode={isDarkMode}
          onToggleTheme={() => setIsDarkMode(!isDarkMode)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onImportMundusBackup={handleImportMundusBackupFile}
        />
      </>
    );
  }

  return (
    <div
      id="app-root"
      onTouchStart={handleEdgeTouchStart}
      onTouchMove={handleEdgeTouchMove}
      onTouchEnd={handleEdgeTouchEnd}
      className={`flex h-screen w-screen overflow-hidden transition-colors ${
        isDarkMode ? 'bg-[#0a0a0a] text-neutral-100' : 'bg-[#f7f7f7] text-neutral-900'
      }`}
    >
      {/* Word-style Backstage / Start Menu Overlay with Folder Structure */}
      <StartMenu
        isOpen={isStartMenuOpen}
        onClose={() => setIsStartMenuOpen(false)}
        documents={currentMundusDocs}
        folders={currentMundusFolders}
        activeDocumentId={activeDocId}
        activeMundusProject={activeMundusProject}
        onOpenAtlas={() => setIsInAtlasView(true)}
        onSelectDocument={(id) => {
          setActiveDocId(id);
          setActiveSection('editor');
        }}
        onCreateDocument={handleCreateDocument}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onMoveDocument={handleMoveDocument}
        onUpdateDocument={(docId, updates) => handleUpdateDocument(updates, docId)}
        onDeleteDocument={handleDeleteDocument}
        onDuplicateDocument={handleDuplicateDocument}
        onToggleFavorite={handleToggleFavorite}
        onBackupMundus={() => void handleExportMundusBackup()}
        isDarkMode={isDarkMode}
      />

      {/* Two-Column Layout: Left Navigation Sidebar with Mobile Drawer & Gestures */}
      {!isZenMode && (
        <Sidebar
          documents={currentMundusDocs}
          folders={currentMundusFolders}
          allDocuments={documents}
          allFolders={folders}
          storageUsage={storageUsage}
          activeDocId={activeDocId}
          activeSection={activeSection}
          activeMundusProject={activeMundusProject}
          onOpenAtlas={() => setIsInAtlasView(true)}
          onSelectSection={(section) => {
            setIsStartMenuOpen(false);
            setIsInAtlasView(false);
            if (section === 'lore') {
              setLoreInitialSubView('hub');
              setLoreInitialCodexEntryId(null);
              setLoreResetKey((k) => k + 1);
            }
            if (section === 'characters') {
              setCharactersResetKey((k) => k + 1);
            }
            setActiveSection(section);
          }}
          onSelectDocument={(id) => {
            setActiveDocId(id);
            setActiveSection('editor');
            setIsStartMenuOpen(false);
            setIsInAtlasView(false);
          }}
          onCreateDocument={(folderId) => handleCreateDocument('blank', folderId)}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onDeleteDocument={handleDeleteDocument}
          onMoveDocument={handleMoveDocument}
          onOpenStartMenu={() => setIsStartMenuOpen(true)}
          isDarkMode={isDarkMode}
          onToggleTheme={() => setIsDarkMode(!isDarkMode)}
          syncStatus={syncStatus}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          expandSidebarOnHover={expandSidebarOnHover}
          onOpenSettings={() => setIsSettingsOpen(true)}
          accentColor={accentColor}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        expandSidebarOnHover={expandSidebarOnHover}
        onToggleExpandSidebarOnHover={handleToggleExpandSidebarOnHover}
        isDarkMode={isDarkMode}
        accentColor={accentColor}
        onUpdateAccentColor={setAccentColor}
        defaultParagraphFont={defaultParagraphFont}
        onUpdateParagraphFont={handleUpdateParagraphFont}
        defaultHeadingFont={defaultHeadingFont}
        onUpdateHeadingFont={handleUpdateHeadingFont}
        defaultQuoteFont={defaultQuoteFont}
        onUpdateQuoteFont={handleUpdateQuoteFont}
        customFonts={customFonts}
        googleFonts={CURATED_GOOGLE_FONTS}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackupFile}
        autoBackupEnabled={autoBackupEnabled}
        onToggleAutoBackup={(enabled) => {
          setAutoBackupEnabled(enabled);
          localStorage.setItem('mundus_auto_backup_enabled', String(enabled));
        }}
        backupFilePrefix={backupFilePrefix}
        onUpdateBackupFilePrefix={handleUpdateBackupFilePrefix}
        autoDownloadBackupInterval={autoDownloadBackupInterval}
        onUpdateAutoDownloadBackupInterval={handleUpdateAutoDownloadBackupInterval}
        backupDirPath={backupDirPath}
        onChooseBackupFolder={handleChooseBackupFolder}
        onClearBackupFolder={handleClearBackupFolder}
        backupFolderAvailable={isDesktopApp}
        backupSnapshots={backupSnapshots}
        onRestoreSnapshot={handleRestoreBackupSnapshot}
        onCreateInstantSnapshot={handleCreateInstantSnapshot}
        onClearSnapshots={handleClearSnapshots}
        imgbbApiKey={imgbbApiKey}
        onUpdateImgbbApiKey={handleUpdateImgbbApiKey}
        onOpenFirebaseConfig={() => setIsFirebaseConfigModalOpen(true)}
        characterNameHighlightEnabled={characterNameHighlightEnabled}
        onToggleCharacterNameHighlight={handleToggleCharacterNameHighlight}
        harperSuggestionsVertical={harperSuggestionsVertical}
        onToggleHarperSuggestionsVertical={handleToggleHarperSuggestionsVertical}
        dynamicTargetBarColorEnabled={dynamicTargetBarColorEnabled}
        onToggleDynamicTargetBarColor={handleToggleDynamicTargetBarColor}
      />

      {mundusImportModalElement}

      {/* v0.7.93: toast notifications — bottom-left, above the sync status icon */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} isDarkMode={isDarkMode} />

      {/* Main Active Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {activeSection === 'editor' && activeDocument ? (
          <TextEditor
            document={activeDocument}
            documents={currentMundusDocs}
            folders={currentMundusFolders}
            pageFormat={activeMundusProject?.pageFormat || DEFAULT_PAGE_FORMAT}
            customFonts={customFonts}
            snapshots={snapshots}
            onCreateSnapshot={handleCreateSnapshot}
            onRestoreSnapshot={handleRestoreSnapshot}
            onDeleteSnapshot={handleDeleteSnapshot}
            isPendingSync={pendingSyncDocIds.includes(activeDocId)}
            isOnline={isOnline}
            onUploadCustomFont={handleUploadCustomFont}
            onRemoveCustomFont={handleRemoveCustomFont}
            onSelectDocument={(id) => setActiveDocId(id)}
            onCreateDocumentInFolder={(folderId) => handleCreateDocument('blank', folderId)}
            onImportDocument={handleImportDocument}
            onUpdateDocument={handleUpdateDocument}
            onSaveNow={handleSaveNow}
            isSaving={syncStatus === 'saving'}
            autoSaveInterval={autoSaveInterval}
            onChangeAutoSaveInterval={handleChangeAutoSaveInterval}
            lastSavedAt={lastSavedAt}
            isDarkMode={isDarkMode}
            isZenMode={isZenMode}
            onToggleZenMode={() => setIsZenMode((prev) => !prev)}
            onOpenStartMenu={() => setIsStartMenuOpen(true)}
            onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
            timelineConfig={timelineConfig}
            codexSections={codexSections}
            onSaveTimelineInfo={handleSaveSceneTimelineInfo}
            onCreateCodexEntry={handleCreateCodexEntry}
            onUpdateCodexEntry={handleUpdateCodexEntry}
            onCreateCharacter={handleCreateCharacter}
            onUpdateCharacter={handleUpdateCharacter}
            onGoToCharactersMode={(charId) => {
              if (charId) setCharactersInitialCharacterId(charId);
              setCharactersResetKey((k) => k + 1);
              setActiveSection('characters');
            }}
            characters={currentMundusCharacters}
            codexEntries={currentMundusCodex}
            onSelectCodexEntry={(entry) => {
              setLoreInitialSubView('codex');
              setLoreInitialCodexEntryId(entry.id);
              setLoreResetKey((k) => k + 1);
              setActiveSection('lore');
            }}
            onSaveCustomWords={handleSaveCustomWords}
            imgbbApiKey={imgbbApiKey}
            onOpenSettings={() => setIsSettingsOpen(true)}
            accentColor={accentColor}
            addedGoogleFonts={addedGoogleFonts}
            onSaveGoogleFonts={handleSaveGoogleFonts}
            activeMundusId={activeMundusId}
            onNavigateToMap={handleNavigateToMap}
            characterNameHighlightEnabled={characterNameHighlightEnabled}
            harperSuggestionsVertical={harperSuggestionsVertical}
            dynamicTargetBarColorEnabled={dynamicTargetBarColorEnabled}
          />
        ) : activeSection === 'characters' ? (
          <CharactersMode
            key={charactersResetKey}
            characters={currentMundusCharacters}
            initialCharacterId={charactersInitialCharacterId}
            codexEntries={currentMundusCodex}
            timelineConfig={timelineConfig}
            documents={currentMundusDocs}
            folders={currentMundusFolders}
            imgbbApiKey={imgbbApiKey}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onCreateCharacter={handleCreateCharacter}
            onUpdateCharacter={handleUpdateCharacter}
            onDeleteCharacter={handleDeleteCharacter}
            onDuplicateCharacter={handleDuplicateCharacter}
            onCreateCodexEntry={handleCreateCodexEntry}
            onReturnToEditor={() => setActiveSection('editor')}
            onSelectDocumentForEditor={(docId) => {
              setActiveDocId(docId);
              setActiveSection('editor');
            }}
            isDarkMode={isDarkMode}
          />
        ) : activeSection === 'lore' ? (
          <LoreMode
            key={loreResetKey}
            activeMundusId={activeMundusId}
            onNavigateToMap={handleNavigateToMap}
            initialSubView={loreInitialSubView}
            initialCodexEntryId={loreInitialCodexEntryId}
            documents={currentMundusDocs}
            folders={currentMundusFolders}
            characters={currentMundusCharacters}
            timelineEvents={currentMundusTimeline}
            timelineConfig={timelineConfig}
            storyLinks={currentMundusStoryLinks}
            codexEntries={currentMundusCodex}
            imgbbApiKey={imgbbApiKey}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onSaveTimelineEvent={handleSaveTimelineEvent}
            onDeleteTimelineEvent={handleDeleteTimelineEvent}
            onSaveSceneTimelineInfo={handleSaveSceneTimelineInfo}
            onSaveTimelineConfig={handleSaveTimelineConfig}
            codexSections={codexSections}
            onSaveCodexSections={handleSaveCodexSections}
            onSaveStoryLink={handleSaveStoryLink}
            onDeleteStoryLink={handleDeleteStoryLink}
            onCreateCodexEntry={handleCreateCodexEntry}
            onUpdateCodexEntry={handleUpdateCodexEntry}
            onDeleteCodexEntry={handleDeleteCodexEntry}
            onUpdateCharacter={handleUpdateCharacter}
            onSelectDocumentForEditor={(docId) => {
              setActiveDocId(docId);
              setActiveSection('editor');
            }}
            onReturnToEditor={() => setActiveSection('editor')}
            isDarkMode={isDarkMode}
          />
        ) : activeSection === 'world' ? (
          <MapMode
            activeMundusId={activeMundusId}
            activeMundusProject={activeMundusProject}
            isDarkMode={isDarkMode}
            accentColor={accentColor}
            codexSections={codexSections}
            codexEntries={currentMundusCodex}
            characters={currentMundusCharacters}
            documents={currentMundusDocs}
            folders={currentMundusFolders}
            initialFocusMarkerId={initialMapMarkerId}
            initialFocusCodexId={initialMapCodexId}
            onCreateCodexEntry={handleCreateCodexEntry}
            onUpdateCodexEntry={handleUpdateCodexEntry}
            onDeleteCodexEntry={handleDeleteCodexEntry}
            onNavigateToCodex={(codexId) => {
              setLoreInitialSubView('codex');
              setLoreInitialCodexEntryId(codexId);
              setLoreResetKey((k) => k + 1);
              setActiveSection('lore');
            }}
            onNavigateToCharacter={(characterId) => {
              setCharactersResetKey((k) => k + 1);
              setActiveSection('characters');
            }}
            onReturnToEditor={() => setActiveSection('editor')}
            imgbbApiKey={imgbbApiKey}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        ) : (
          <SectionPreview
            section={activeSection}
            onReturnToEditor={() => setActiveSection('editor')}
            isDarkMode={isDarkMode}
          />
        )}
      </div>

      {firebaseConfigModalElement}
      <ConfirmDialogHost isDarkMode={isDarkMode} />
    </div>
  );
}
