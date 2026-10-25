export type DocumentStatus = 'draft' | 'revision' | 'complete';
export type FontFamily = 'serif' | 'sans' | 'mono' | string;
export type AutoSaveInterval = 'every_edit' | '1m' | '3m' | '5m' | '10m' | 'off';

export interface CustomFont {
  id: string;
  name: string;
  fontFamily: string;
  dataUrl: string;
}

export interface GoogleFontItem {
  id: string;
  name: string;
  category: 'serif' | 'sans-serif' | 'display' | 'handwriting' | 'monospace';
  googleFamily: string;
  fontFamily: string;
  sample?: string;
  designer?: string;
}

export interface ShortcutBinding {
  key: string;
  ctrlOrCmd?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface CustomKeybindings {
  undo: ShortcutBinding;
  redo: ShortcutBinding;
  bold: ShortcutBinding;
  italic: ShortcutBinding;
  strikethrough: ShortcutBinding;
  // v0.7.93: lists & blocks
  quote: ShortcutBinding;
  numberList: ShortcutBinding;
  bulletList: ShortcutBinding;
  // v0.7.93: colors
  highlighter: ShortcutBinding;
  // v0.7.93: modes / views (existing)
  zenMode: ShortcutBinding;
  focusMode: ShortcutBinding;
  quickSearch: ShortcutBinding;
  navWriting: ShortcutBinding;
  navLore: ShortcutBinding;
  navCharacters: ShortcutBinding;
  navWorldBuilding: ShortcutBinding;
  navMundus: ShortcutBinding;
  // v0.7.93: panels & views
  toggleSidebar: ShortcutBinding;
  spellingReview: ShortcutBinding;
  zoomIn: ShortcutBinding;
  zoomOut: ShortcutBinding;
  // v0.7.93: cursor & bars
  caretToEnd: ShortcutBinding;
  focusTopBar: ShortcutBinding;
  focusBottomBar: ShortcutBinding;
  focusSidebar: ShortcutBinding;
}

export type PageFormat = 'us_letter' | 'a4' | 'a5' | 'trade_paperback' | 'pocket_paperback';

export interface PageFormatConfig {
  id: PageFormat;
  name: string;
  dimensions: string;
  metric: string;
  description: string;
  width: number; // in px
  height: number; // in px
  topMargin: number; // in px
  bottomMargin: number; // in px
  gap: number; // in px between sheets
}

export interface MundusProject {
  id: string;
  userId: string;
  name: string; // e.g. "Prima"
  description?: string;
  genre?: string;
  color?: string;
  coverUrl?: string;
  pageFormat?: PageFormat;
  // v0.8.3: where the loose (unfiled) files block sits in Mundus View and in
  // the exported book. Toggled from the reorder panel inside Mundus View
  // (not Settings). Defaults to 'bottom', which matches the historical layout
  // (the unfiled section always rendered after the folder sections).
  looseDocsPosition?: 'top' | 'bottom';
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  userId: string;
  mundusId?: string; // ID of the Mundus project (defaults to 'mundus-prima')
  name: string;
  description?: string;
  color?: string;
  orderIndex?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSnapshot {
  id: string;
  documentId: string;
  userId: string;
  name: string;
  description?: string;
  content: string; // HTML rich text snapshot
  plainText: string;
  wordCount: number;
  characterCount: number;
  visualImages?: DocumentVisualImage[];
  createdAt: string; // ISO string
}

export type DocumentSyncState = 'synced' | 'pending_sync' | 'saving' | 'offline';

export interface SceneTimelineInfo {
  startYear?: number;
  startMonth?: number;
  startDay?: number;
  startDisplay?: string;
  duration?: number;
  durationUnit?: 'hours' | 'days' | 'weeks' | 'months' | 'years' | 'cycles';
  timeNotes?: string;
}

export interface DocumentVisualImage {
  id: string;
  url: string;
  x: number; // px from left
  y: number; // px from top
  width: number; // px width
  height?: number; // px height
  caption?: string;
  alignment?: 'center' | 'left' | 'right';
  createdAt?: string;
}

export interface NovelDocument {
  id: string;
  userId: string;
  mundusId?: string; // ID of the Mundus project (defaults to 'mundus-prima')
  folderId?: string; // ID of folder, or undefined if in unfiled root
  title: string;
  content: string; // HTML rich text
  plainText: string;
  wordCount: number;
  characterCount: number;
  readingTimeMinutes: number;
  status: DocumentStatus;
  category: string;
  isFavorite: boolean;
  fontFamily: FontFamily;
  fontSize: number; // in pt/px e.g. 16
  targetType?: 'words' | 'characters';
  targetCount?: number; // e.g. 2000
  syncStatus?: DocumentSyncState;
  timelineInfo?: SceneTimelineInfo;
  visualImages?: DocumentVisualImage[]; // Movable & resizable visual images placed on the page
  // v0.8.3: manual book order from the Mundus View reorder mode. Documents
  // WITHOUT an index sort after indexed ones (stable array order), so newly
  // created documents automatically land at the end of their scope until the
  // author places them. Drives both the Mundus View display order and the
  // Export Book sequence.
  bookOrderIndex?: number;
  createdAt: string;
  updatedAt: string;
}

export type TimelineEventCategory = 
  | 'milestone' 
  | 'character_birth' 
  | 'character_death' 
  | 'battle' 
  | 'discovery' 
  | 'political' 
  | 'cataclysm'
  | 'custom';

export interface TimelineEvent {
  id: string;
  userId: string;
  mundusId?: string; // ID of the Mundus project (defaults to 'mundus-prima')
  title: string;
  timeCoordinate: number; // Numeric time value for coordinate positioning (e.g. 1042.4)
  timeDisplay: string; // Formatted display text (e.g. "Year 1042, 14th of Frostfall")
  category: TimelineEventCategory;
  description?: string;
  color?: string; // Hex color code
  characterIds?: string[]; // Associated characters
  sceneId?: string; // Associated scene document
  createdAt: string;
  updatedAt: string;
}

export interface TimelineConfig {
  timeSystem: 'standard' | 'fantasy' | 'scifi' | 'custom';
  epochName: string; // e.g. "Third Age", "Imperial Era", "Common Era"
  majorUnitName: string; // e.g. "Year", "Cycle", "Age", "Sol"
  minorUnitName: string; // e.g. "Month", "Moon", "Segment"
  subUnitName: string; // e.g. "Day", "Tick", "Hour"
  baseYear: number; // Base reference starting coordinate, e.g. 1000
  unitsPerMajor: number; // e.g. 12 months in a year or 10 cycles
  subUnitsPerMinor: number; // e.g. 30 days in a month
  mundusId?: string; // v0.7.74: project this calendar belongs to (independent per-project calendars)
  updatedAt?: string; // v0.7.74: last-edit timestamp used for cross-device conflict resolution
}

export type StoryLinkType = 
  | 'leads_to' 
  | 'causes' 
  | 'parallel' 
  | 'flashback' 
  | 'foreshadows' 
  | 'branching';

export interface StoryNodeLink {
  id: string;
  userId: string;
  mundusId?: string; // ID of the Mundus project (defaults to 'mundus-prima')
  fromDocId: string; // Origin scene ID
  toDocId: string; // Destination scene ID
  linkType: StoryLinkType;
  label?: string; // e.g. "Direct consequence of duel"
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export type CharacterStatus = 'alive' | 'deceased' | 'missing' | 'unknown';

export interface CharacterRelatives {
  father?: string;     // Character ID or custom name
  mother?: string;     // Character ID or custom name
  siblings?: string[]; // Array of Character IDs or names
  partners?: string[]; // Array of Character IDs or names (spouses, partners)
  children?: string[]; // Array of Character IDs or names
}

export interface Character {
  id: string;
  userId: string;
  mundusId?: string; // ID of the Mundus project (defaults to 'mundus-prima')
  name: string;
  aliases?: string;
  sex: string; // e.g. 'Male', 'Female', 'Non-binary', 'Other'
  status: CharacterStatus;
  roles: string[]; // e.g. ['Protagonist', 'Alchemist']
  factions: string[]; // e.g. ['Order of the Silver Quill']
  families: string[]; // e.g. ['House Vance']
  tags: string[]; // custom tags
  relatives?: CharacterRelatives; // Father, mother, siblings, partners, children
  birthTime?: string; // e.g. 'Year 418, 14th of Frostfall'
  birthPlace?: string; // e.g. 'Oakhaven Lower Ward'
  deathTime?: string; // e.g. 'Year 440, Siege of Ashen Gate'
  deathPlace?: string; // e.g. 'The Ashen Gate'
  appearance?: string; // physical traits & distinguishing marks
  overview: string; // text overview, biography, motivation, narrative arc
  notes?: string; // author private secrets and plot notes
  avatarColor?: string; // hex color for card badge
  avatarUrl?: string; // Hosted image URL (e.g. from ImgBB) for character portrait
  createdAt: string;
  updatedAt: string;
}

export interface ImgbbSettings {
  apiKey: string;
  updatedAt?: string;
}

export interface CodexSection {
  id: string;
  label: string;
  iconName: string;
  color: string;
  desc: string;
  updatedAt?: string; // v0.7.76: per-project revision stamp (all items of one save share it)
}

export type CodexCategory = string;

export interface CodexEntry {
  id: string;
  userId: string;
  mundusId?: string; // ID of the Mundus project (defaults to 'mundus-prima')
  title: string;
  category: CodexCategory;
  subtitle?: string; // e.g. "Seat of House Vance" or "Ancient Elven Relic"
  overview: string; // short summary / dossier snippet
  content: string; // detailed encyclopedia body text
  icon?: string; // e.g. 'Castle', 'Shield', 'Crown', 'MapPin', 'Sparkles', 'Wand2', 'BookOpen'
  themeColor?: string; // badge accent color
  imageUrl?: string; // Hosted image URL (e.g. from ImgBB) that replaces the colored icon — mirrors images[0] (v0.7.88)
  images?: string[]; // v0.7.88: full image gallery; entry popup cycles through it with arrows
  tags: string[]; // custom tags e.g. ['northern', 'valyrian', 'royal']
  relatedCharacterIds?: string[]; // associated characters
  relatedLocationIds?: string[]; // linked map markers/locations
  relatedDocumentIds?: string[]; // linked scenes/manuscripts
  createdAt: string;
  updatedAt: string;
}

export type MapMarkerCategory = 'city' | 'settlement' | 'castle' | 'landmark' | 'battle' | 'dungeon' | 'region' | 'portal' | 'custom' | string;

export interface MapMarker {
  id: string;
  mundusId?: string; // ID of the Mundus project (defaults to 'mundus-prima')
  title: string;
  subtitle?: string; // e.g. "Seat of House Vance" or "Trading outpost"
  category: MapMarkerCategory;
  description?: string; // Short summary / overview
  content?: string; // Detailed lore / encyclopedia notes
  imageUrl?: string; // Hosted illustration / portrait URL (ImgBB or local)
  xPct: number; // Resolution-independent percentage (0.00% - 100.00% along width)
  yPct: number; // Resolution-independent percentage (0.00% - 100.00% along height)
  x?: number; // legacy pixel coordinate for backward compatibility
  y?: number; // legacy pixel coordinate for backward compatibility
  color?: string; // custom hex color
  icon?: string; // lucide icon identifier
  iconImageId?: string; // v0.8.64: id into the global marker icon image library (lib/markerIconLibrary.ts); when set, the uploaded image is used as the marker itself
  linkedCodexId?: string; // linked Codex entry ID
  linkedCharacterId?: string; // legacy single character
  linkedCharacterIds?: string[]; // linked characters array
  linkedDocumentIds?: string[]; // linked scenes / manuscripts
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export type ActiveSection = 'editor' | 'files' | 'world' | 'characters' | 'lore';

export interface EditorSettings {
  theme: 'light' | 'dark';
  focusMode: boolean;
  zenMode: boolean;
  spellCheckEnabled: boolean;
  pageWidth: 'narrow' | 'standard' | 'full';
  showStats: boolean;
}

export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  getStoragePath: () => Promise<string>;
  setStoragePath: (newPath: string) => Promise<boolean>;
  selectStorageDirectory: () => Promise<string | null>;
  openStorageFolder: () => Promise<void>;
  saveFile: (defaultName: string, content: string) => Promise<boolean>;
  exportPdf: (payload: { title: string; html: string; pageFormat?: string }) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  // v0.7.92: user-selected backup folder (Settings → Project Local Backup & Recovery)
  chooseBackupDirectory: () => Promise<string | null>;
  writeBackupFile: (dir: string, fileName: string, content: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
}

export interface ElectronStorageAPI {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  getAllKeys: () => string[];
  getStoragePath: () => string;
}

/**
 * v0.7.94: tiny native bridge injected by MainActivity on Android
 * (addJavascriptInterface). The WebView cannot download blob: URLs and has
 * no save picker, so backups are handed to the native layer as base64 and
 * written into the public Downloads folder.
 */
export interface MundusNativeAPI {
  /** Synchronous on purpose — writes a small JSON file and returns the result. */
  saveBackupFile: (fileName: string, base64: string) => string; // JSON: { ok, path? , error? }
  /**
   * v0.8.61: generic file delivery for exports (DOCX/PDF/HTML/MD/MUNDUS…).
   * Writes into the public Downloads folder via MediaStore with the given
   * MIME type. Returns JSON: { ok, path?, error? }.
   */
  saveFile?: (fileName: string, mime: string, base64: string) => string;
  /**
   * v0.8.61: writes into the app cache and opens the file through a
   * FileProvider ACTION_VIEW intent (PDF viewer, Word, browser…).
   * Returns JSON: { ok, error? }.
   */
  viewFile?: (fileName: string, mime: string, base64: string) => string;
  /**
   * v0.8.61: syncs the system status/navigation bar colors with the app
   * theme — black bar + light icons in dark mode, white bar + dark icons in
   * light mode. Fire-and-forget (no return value).
   */
  setSystemBarAppearance?: (isDark: boolean) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    electronStorage?: ElectronStorageAPI;
    MundusNative?: MundusNativeAPI;
  }
}
