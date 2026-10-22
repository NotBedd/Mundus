import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Settings, X, Sliders, Layout, Check, Palette, Type, HardDrive, Download, Upload, Clock, RefreshCw, AlertCircle, AlertTriangle, Keyboard, RotateCcw, Image as ImageIcon, ExternalLink, Eye, EyeOff, Key, Monitor, Folder, FolderOpen, Highlighter } from 'lucide-react';
import type { BackupSnapshotMeta } from '../lib/backupEngine';
import type { CustomKeybindings, ShortcutBinding } from '../types';
import { DEFAULT_KEYBINDINGS, findBindingConflicts, formatBinding, getKeybindings, saveKeybindings } from '../lib/shortcutManager';
import { isValidImgBBApiKeyFormat } from '../lib/imgbb';
import { isAndroidApp } from '../lib/platform';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  expandSidebarOnHover: boolean;
  onToggleExpandSidebarOnHover: (enabled: boolean) => void;
  accentColor?: string;
  onUpdateAccentColor?: (color: string) => void;
  defaultParagraphFont?: string;
  onUpdateParagraphFont?: (font: string) => void;
  defaultHeadingFont?: string;
  onUpdateHeadingFont?: (font: string) => void;
  defaultQuoteFont?: string;
  onUpdateQuoteFont?: (font: string) => void;
  customFonts?: { id: string; name: string }[];
  googleFonts?: { id: string; name: string }[];
  imgbbApiKey?: string;
  onUpdateImgbbApiKey?: (key: string) => void;
  onExportBackup?: () => void;
  onImportBackup?: (file: File) => void;
  autoBackupEnabled?: boolean;
  onToggleAutoBackup?: (enabled: boolean) => void;
  backupFilePrefix?: string;
  onUpdateBackupFilePrefix?: (prefix: string) => void;
  // v0.7.92: user-selected folder backups are written into (desktop only)
  backupDirPath?: string | null;
  onChooseBackupFolder?: () => void;
  onClearBackupFolder?: () => void;
  backupFolderAvailable?: boolean;
  autoDownloadBackupInterval?: string;
  onUpdateAutoDownloadBackupInterval?: (interval: string) => void;
  backupSnapshots?: BackupSnapshotMeta[];
  onRestoreSnapshot?: (snapshot: BackupSnapshotMeta) => void;
  onCreateInstantSnapshot?: () => void;
  onClearSnapshots?: () => void;
  onOpenFirebaseConfig?: () => void;
  characterNameHighlightEnabled?: boolean;
  harperSuggestionsVertical?: boolean;
  onToggleHarperSuggestionsVertical?: (enabled: boolean) => void;
  onToggleCharacterNameHighlight?: (enabled: boolean) => void;
  dynamicTargetBarColorEnabled?: boolean;
  onToggleDynamicTargetBarColor?: (enabled: boolean) => void;
}

const ACCENT_PRESETS = [
  { label: 'Royal Purple', color: '#8b5cf6' },
  { label: 'Sapphire Blue', color: '#3b82f6' },
  { label: 'Emerald Green', color: '#10b981' },
  { label: 'Amber Gold', color: '#f59e0b' },
  { label: 'Rose Crimson', color: '#f43f5e' },
  { label: 'Cyan Teal', color: '#06b6d4' },
];

/**
 * v0.7.96: shortcut groups lifted to module scope so the duplicate-shortcut
 * warning can map action ids to human labels (and rows can render conflict
 * badges) without duplicating the list.
 */
const KEYBINDING_GROUPS: { title: string; items: { id: keyof CustomKeybindings; label: string }[] }[] = [
  {
    title: 'Formatting',
    items: [
      { id: 'undo', label: 'Undo Action' },
      { id: 'redo', label: 'Redo Action' },
      { id: 'bold', label: 'Toggle Bold Text' },
      { id: 'italic', label: 'Toggle Italic Text' },
      { id: 'strikethrough', label: 'Toggle Strikethrough' },
    ]
  },
  {
    title: 'Lists & Blocks',
    items: [
      { id: 'quote', label: 'Toggle Quote Block' },
      { id: 'numberList', label: 'Make Selection a Number List' },
      { id: 'bulletList', label: 'Make Selection a Bullet List' },
    ]
  },
  {
    title: 'Colors',
    items: [
      { id: 'highlighter', label: 'Open Highlighter Menu (cursor inside)' },
    ]
  },
  {
    title: 'Modes & Navigation',
    items: [
      { id: 'navWriting', label: 'Navigate to Writing Mode' },
      { id: 'navCharacters', label: 'Navigate to Characters Mode' },
      { id: 'navLore', label: 'Navigate to Lore Mode' },
      { id: 'navWorldBuilding', label: 'Navigate to Map Mode' },
      { id: 'navMundus', label: 'Navigate to Mundus View' },
      { id: 'quickSearch', label: 'Global Quick Search' },
    ]
  },
  {
    title: 'Panels & Views',
    items: [
      { id: 'toggleSidebar', label: 'Open / Close Sidebar' },
      { id: 'spellingReview', label: 'Open Spelling Review Drawer' },
      { id: 'zoomIn', label: 'Zoom Page In' },
      { id: 'zoomOut', label: 'Zoom Page Out' },
      { id: 'zenMode', label: 'Toggle Zen Mode' },
      { id: 'focusMode', label: 'Toggle Focus Mode' },
    ]
  },
  {
    title: 'Cursor & Bars',
    items: [
      { id: 'caretToEnd', label: 'Cursor to End of Document Text' },
      { id: 'focusTopBar', label: 'Cursor to Top Bar (Toolbar)' },
      { id: 'focusBottomBar', label: 'Cursor to Bottom Bar (Status Bar)' },
      { id: 'focusSidebar', label: 'Cursor to Sidebar (pick documents with arrows)' },
    ]
  },
];

const KEYBINDING_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  KEYBINDING_GROUPS.forEach((g) => g.items.forEach((it) => { map[it.id] = it.label; }));
  return map;
})();

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isDarkMode,
  expandSidebarOnHover,
  onToggleExpandSidebarOnHover,
  accentColor = '#8b5cf6',
  onUpdateAccentColor,
  defaultParagraphFont = 'serif',
  onUpdateParagraphFont,
  defaultHeadingFont = 'serif',
  onUpdateHeadingFont,
  defaultQuoteFont = 'serif',
  onUpdateQuoteFont,
  customFonts = [],
  googleFonts = [],
  imgbbApiKey = '',
  onUpdateImgbbApiKey,
  onExportBackup,
  onImportBackup,
  autoBackupEnabled = true,
  onToggleAutoBackup,
  backupFilePrefix = 'Mundus_Backup',
  onUpdateBackupFilePrefix,
  backupDirPath = null,
  onChooseBackupFolder,
  onClearBackupFolder,
  backupFolderAvailable = false,
  autoDownloadBackupInterval = 'off',
  onUpdateAutoDownloadBackupInterval,
  backupSnapshots = [],
  onRestoreSnapshot,
  onCreateInstantSnapshot,
  onClearSnapshots,
  onOpenFirebaseConfig,
  characterNameHighlightEnabled = false,
  harperSuggestionsVertical = false,
  onToggleHarperSuggestionsVertical,
  onToggleCharacterNameHighlight,
  dynamicTargetBarColorEnabled = true,
  onToggleDynamicTargetBarColor
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [keybindings, setKeybindings] = useState<CustomKeybindings>(() => getKeybindings());
  const [editingKey, setEditingKey] = useState<keyof CustomKeybindings | null>(null);
  // v0.7.96: duplicate-shortcut warning shown right after a conflicting
  // keypress is recorded; auto-dismisses after a few seconds.
  const [shortcutWarning, setShortcutWarning] = useState<string | null>(null);
  const shortcutWarningTimerRef = useRef<number | null>(null);

  // ImgBB API Key state
  const [localImgbbKey, setLocalImgbbKey] = useState<string>(imgbbApiKey || '');
  const [showImgbbKey, setShowImgbbKey] = useState<boolean>(false);
  const [keySaveNotice, setKeySaveNotice] = useState<boolean>(false);

  // Electron Desktop Storage state
  const isElectron = Boolean(typeof window !== 'undefined' && window.electronAPI?.isElectron);
  const [electronStoragePath, setElectronStoragePath] = useState<string>('');

  useEffect(() => {
    if (isElectron && window.electronAPI) {
      window.electronAPI.getStoragePath().then((p) => {
        if (p) setElectronStoragePath(p);
      });
    }
  }, [isElectron, isOpen]);

  const handleChangeStorageFolder = async () => {
    if (window.electronAPI) {
      const selected = await window.electronAPI.selectStorageDirectory();
      if (selected) {
        setElectronStoragePath(selected);
      }
    }
  };

  const handleOpenStorageFolder = async () => {
    if (window.electronAPI) {
      await window.electronAPI.openStorageFolder();
    }
  };

  useEffect(() => {
    setLocalImgbbKey(imgbbApiKey || '');
  }, [imgbbApiKey, isOpen]);

  const handleSaveImgbbKey = (val: string) => {
    setLocalImgbbKey(val);
    onUpdateImgbbApiKey?.(val.trim());
    setKeySaveNotice(true);
    setTimeout(() => setKeySaveNotice(false), 2200);
  };

  // Sync keybindings state when modal opens
  useEffect(() => {
    if (isOpen) {
      setKeybindings(getKeybindings());
    }
  }, [isOpen]);

  // Handle key shortcut recording
  useEffect(() => {
    if (!editingKey) return;

    const handleRecordKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignore lone modifier presses
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

      // v0.7.96: Escape cancels recording instead of binding Esc as a shortcut.
      if (e.key === 'Escape') {
        setEditingKey(null);
        return;
      }

      const newBinding: ShortcutBinding = {
        key: e.key.toLowerCase(),
        ctrlOrCmd: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
        alt: e.altKey,
      };

      // v0.7.96: duplicate-shortcut warning — flag every OTHER action bound to
      // the exact same combination (a duplicate fires both actions at once).
      const conflicts = findBindingConflicts(keybindings, editingKey, newBinding);

      const updated = { ...keybindings, [editingKey]: newBinding };
      setKeybindings(updated);
      saveKeybindings(updated);
      setEditingKey(null);

      if (shortcutWarningTimerRef.current !== null) {
        window.clearTimeout(shortcutWarningTimerRef.current);
        shortcutWarningTimerRef.current = null;
      }
      if (conflicts.length > 0) {
        const conflictLabels = conflicts.map((id) => KEYBINDING_LABELS[id] || id);
        setShortcutWarning(
          `${formatBinding(newBinding)} is already used by "${conflictLabels.join('", "')}". Both actions will now fire together — record a different combination for one of them if that's not intended.`
        );
        shortcutWarningTimerRef.current = window.setTimeout(() => {
          setShortcutWarning(null);
          shortcutWarningTimerRef.current = null;
        }, 8000);
      } else {
        setShortcutWarning(null);
      }
    };

    window.addEventListener('keydown', handleRecordKey, true);
    return () => window.removeEventListener('keydown', handleRecordKey, true);
  }, [editingKey, keybindings]);

  useEffect(() => () => {
    if (shortcutWarningTimerRef.current !== null) window.clearTimeout(shortcutWarningTimerRef.current);
  }, []);

  // v0.7.96: ids of actions that permanently share their combination with
  // another action (persistently highlighted until the user resolves them).
  const duplicatedBindingIds = useMemo(() => {
    const ids = Object.keys(keybindings) as (keyof CustomKeybindings)[];
    const dupes = new Set<keyof CustomKeybindings>();
    ids.forEach((id) => {
      const binding = keybindings[id];
      if (!binding) return;
      if (findBindingConflicts(keybindings, id, binding).length > 0) dupes.add(id);
    });
    return dupes;
  }, [keybindings]);

  // Close on ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !editingKey) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, editingKey]);

  if (!isOpen) return null;

  return (
    <div
      id="settings-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        id="settings-modal-container"
        className={`w-full max-w-lg rounded-2xl shadow-2xl border flex flex-col overflow-hidden transition-all duration-200 ${
          isDarkMode ? 'bg-[#151515] border-neutral-800 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-900'
        }`}
      >
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between ${
          isDarkMode ? 'border-neutral-800 bg-neutral-900/50' : 'border-neutral-200 bg-neutral-50/70'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl border ${
              isDarkMode ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-accent/10 border-accent/30 text-accent'
            }`}>
              <Settings className="w-4 h-4 text-accent" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold font-display tracking-tight">Mundus Settings</h2>
              </div>
            </div>
          </div>

          <button
            id="btn-close-settings"
            onClick={onClose}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isDarkMode ? 'border-neutral-700 hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'border-neutral-200 hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Navigation & Sidebar Preferences */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider font-mono text-neutral-500 dark:text-neutral-400">
              <Layout className="w-3.5 h-3.5" />
              <span>Sidebar & Navigation</span>
            </div>

            <div className={`p-4 rounded-xl border transition-all ${
              isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/80 border-neutral-200'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <label htmlFor="toggle-expand-hover" className="text-xs font-semibold block cursor-pointer select-none">
                    Expand Sidebar on Hover
                  </label>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    When active, placing the cursor over the collapsed sidebar automatically expands it. When disabled, the sidebar only expands or collapses when clicking the Mundus logo or collapse button.
                  </p>
                </div>

                {/* Custom Accessible Toggle Switch */}
                <button
                  type="button"
                  id="toggle-expand-hover"
                  role="switch"
                  aria-checked={expandSidebarOnHover}
                  onClick={() => onToggleExpandSidebarOnHover(!expandSidebarOnHover)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                    expandSidebarOnHover
                      ? 'bg-purple-600'
                      : isDarkMode
                      ? 'bg-neutral-700'
                      : 'bg-neutral-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      expandSidebarOnHover ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Editor & Scene Detection Settings */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider font-mono text-neutral-500 dark:text-neutral-400">
              <Highlighter className="w-3.5 h-3.5" />
              <span>Editor & Scene Detection</span>
            </div>

            <div className={`p-4 rounded-xl border transition-all ${
              isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/80 border-neutral-200'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <label htmlFor="toggle-char-name-highlight" className="text-xs font-semibold block cursor-pointer select-none">
                    Highlight Character Names by Badge Color
                  </label>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    When active, character names detected in your manuscript text are tinted with the badge color from each character's card. Detection uses the same logic as the "In This Scene" system — full names, name parts (3+ characters), and aliases (2+ characters) all qualify.
                  </p>
                </div>

                <button
                  type="button"
                  id="toggle-char-name-highlight"
                  role="switch"
                  aria-checked={characterNameHighlightEnabled}
                  onClick={() => onToggleCharacterNameHighlight?.(!characterNameHighlightEnabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                    characterNameHighlightEnabled
                      ? 'bg-purple-600'
                      : isDarkMode
                      ? 'bg-neutral-700'
                      : 'bg-neutral-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      characterNameHighlightEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* v0.8.1: Harper suggestion popup layout */}
            <div className={`p-4 rounded-xl border transition-all ${
              isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/80 border-neutral-200'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <label htmlFor="toggle-harper-vertical" className="text-xs font-semibold block cursor-pointer select-none">
                    Show All Grammar Suggestions in a List
                  </label>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    Changes how the inline grammar/spelling popup presents its corrections. Off (default): one suggestion at a time, cycle with the ← → arrow keys. On: all three candidates are stacked vertically at once — pick between them with the ↑ ↓ arrow keys, then press Tab (or click) to apply the highlighted one.
                  </p>
                </div>

                <button
                  type="button"
                  id="toggle-harper-vertical"
                  role="switch"
                  aria-checked={harperSuggestionsVertical}
                  onClick={() => onToggleHarperSuggestionsVertical?.(!harperSuggestionsVertical)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                    harperSuggestionsVertical
                      ? 'bg-purple-600'
                      : isDarkMode
                      ? 'bg-neutral-700'
                      : 'bg-neutral-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      harperSuggestionsVertical ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className={`p-4 rounded-xl border transition-all ${
              isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/80 border-neutral-200'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <label htmlFor="toggle-dynamic-target-bar" className="text-xs font-semibold block cursor-pointer select-none">
                    Color Writing Target Bar by Progress
                  </label>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    Fills the writing-target pill in the editor's bottom bar by completion — blank at 0%, red below 20%, orange up to 50%, yellow up to 80%, green as you approach the goal, then a glowing emerald pill once the goal is reached. When off, the pill keeps its classic monochrome look at every progress level. This preference syncs across your devices.
                  </p>
                </div>

                <button
                  type="button"
                  id="toggle-dynamic-target-bar"
                  role="switch"
                  aria-checked={dynamicTargetBarColorEnabled}
                  onClick={() => onToggleDynamicTargetBarColor?.(!dynamicTargetBarColorEnabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                    dynamicTargetBarColorEnabled
                      ? 'bg-purple-600'
                      : isDarkMode
                      ? 'bg-neutral-700'
                      : 'bg-neutral-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      dynamicTargetBarColorEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Default Typography Settings */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider font-mono text-neutral-500 dark:text-neutral-400">
              <Type className="w-3.5 h-3.5" />
              <span>Default Typography</span>
            </div>

            <div className={`p-4 rounded-xl border space-y-4 ${
              isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/80 border-neutral-200'
            }`}>
              {[
                { label: 'Paragraphs & Body Text', value: defaultParagraphFont, onChange: onUpdateParagraphFont },
                { label: 'Chapter Titles & Headings', value: defaultHeadingFont, onChange: onUpdateHeadingFont },
                { label: 'Blockquotes & Lore Snippets', value: defaultQuoteFont, onChange: onUpdateQuoteFont },
              ].map((setting, idx) => (
                <div key={idx} className="flex items-center justify-between gap-4">
                  <span className="text-xs font-semibold">{setting.label}</span>
                  <select
                    value={setting.value}
                    onChange={(e) => setting.onChange?.(e.target.value)}
                    className={`text-xs rounded-lg px-2 py-1 border outline-none ${
                      isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-neutral-300'
                    }`}
                  >
                    <option value="serif">Serif (Lora)</option>
                    <option value="sans">Sans (Inter)</option>
                    <option value="mono">Mono (JetBrains)</option>
                    
                    {googleFonts.filter(f => f && f.name && !f.name.toLowerCase().includes('quot') && !f.name.startsWith('&')).length > 0 && (
                      <optgroup label="Google Fonts">
                        {googleFonts
                          .filter(f => f && f.name && !f.name.toLowerCase().includes('quot') && !f.name.startsWith('&'))
                          .map(f => (
                            <option key={f.id} value={`gfont_${f.id}`}>{f.name}</option>
                          ))}
                      </optgroup>
                    )}

                    {customFonts.filter(f => f && f.name && !f.name.toLowerCase().includes('quot') && !f.name.startsWith('&')).length > 0 && (
                      <optgroup label="Custom Uploaded">
                        {customFonts
                          .filter(f => f && f.name && !f.name.toLowerCase().includes('quot') && !f.name.startsWith('&'))
                          .map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              ))}
              <p className="text-[10px] text-neutral-500 pt-2 border-t dark:border-neutral-800">
                These defaults are applied automatically when typing new text. Any manual font changes you make directly in the editor will still override these defaults for that specific text.
              </p>
            </div>
          </div>

          {/* Workspace Accent Color Customization */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider font-mono text-neutral-500 dark:text-neutral-400">
              <Palette className="w-3.5 h-3.5" style={{ color: accentColor }} />
              <span>Workspace Accent Color</span>
            </div>

            <div className={`p-4 rounded-xl border space-y-4 ${
              isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/80 border-neutral-200'
            }`}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xs font-semibold">Primary Accent Hue</h3>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Controls highlight colors for navigation, folders, and active workspace badges.
                  </p>
                </div>

                {/* Color Wheel Input */}
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="color"
                    id="accent-color-picker"
                    value={accentColor}
                    onChange={(e) => onUpdateAccentColor?.(e.target.value)}
                    title="Choose custom accent color wheel"
                    className="w-8 h-8 rounded-lg border border-neutral-300 dark:border-neutral-700 cursor-pointer bg-transparent p-0.5"
                  />
                  <span className="font-mono text-xs px-2 py-1 rounded border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
                    {accentColor.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Preset Swatches */}
              <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-neutral-200 dark:border-neutral-800">
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.color}
                    type="button"
                    onClick={() => onUpdateAccentColor?.(preset.color)}
                    title={preset.label}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all cursor-pointer ${
                      accentColor.toLowerCase() === preset.color.toLowerCase()
                        ? 'border-neutral-900 dark:border-white ring-1 ring-neutral-400 font-bold'
                        : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-400'
                    }`}
                  >
                    <span 
                      className="w-3 h-3 rounded-full border border-black/10 shadow-2xs shrink-0"
                      style={{ backgroundColor: preset.color }}
                    />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Image Hosting (ImgBB) Integration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider font-mono text-neutral-500 dark:text-neutral-400">
                <ImageIcon className="w-3.5 h-3.5 text-accent" />
                <span>Image integration</span>
              </div>
              {localImgbbKey ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <Check className="w-2.5 h-2.5" />
                  <span>Configured</span>
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  Not Configured
                </span>
              )}
            </div>

            <div className={`p-4 rounded-xl border space-y-4 ${
              isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/80 border-neutral-200'
            }`}>
              <div className="space-y-1">
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                  Mundus integrates with ImgBB to integreate images throughout the app
                </p>
                <div className="pt-1">
                  <a
                    href="https://api.imgbb.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    <span>Get a free ImgBB API key at api.imgbb.com</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* API Key Input Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="input-imgbb-api-key" className="text-xs font-semibold flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
                    <Key className="w-3.5 h-3.5 text-neutral-400" />
                    <span>ImgBB API Key</span>
                  </label>
                  {isValidImgBBApiKeyFormat(localImgbbKey) && (
                    <span className="text-[10px] font-mono text-emerald-500 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Valid 32-hex key format
                    </span>
                  )}
                </div>

                <div className="relative flex items-center">
                  <input
                    id="input-imgbb-api-key"
                    type={showImgbbKey ? 'text' : 'password'}
                    value={localImgbbKey}
                    onChange={(e) => setLocalImgbbKey(e.target.value)}
                    onBlur={() => handleSaveImgbbKey(localImgbbKey)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveImgbbKey(localImgbbKey);
                      }
                    }}
                    placeholder="Enter your 32-character ImgBB API key..."
                    className={`w-full pl-3 pr-20 py-2 rounded-lg border text-xs font-mono transition-colors outline-none focus:ring-2 focus:ring-accent ${
                      isDarkMode 
                        ? 'bg-neutral-950 border-neutral-700 text-white placeholder-neutral-600' 
                        : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400'
                    }`}
                  />
                  <div className="absolute right-1.5 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowImgbbKey(!showImgbbKey)}
                      title={showImgbbKey ? 'Hide key' : 'Show key'}
                      className="p-1 rounded text-neutral-400 hover:text-neutral-200 cursor-pointer"
                    >
                      {showImgbbKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    {localImgbbKey && (
                      <button
                        type="button"
                        onClick={() => handleSaveImgbbKey('')}
                        title="Clear API key"
                        className="p-1 rounded text-neutral-400 hover:text-rose-400 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Bar & Save status */}
              <div className="flex items-center justify-between pt-1 border-t border-neutral-200/80 dark:border-neutral-800">
                <span className="text-[11px] text-neutral-400">
                  {keySaveNotice ? (
                    <span className="text-emerald-500 font-medium flex items-center gap-1 animate-fadeIn">
                      <Check className="w-3.5 h-3.5" /> Synced to user cloud settings
                    </span>
                  ) : localImgbbKey ? (
                    <span>Key saved in private Firestore account</span>
                  ) : null}
                </span>

                <button
                  type="button"
                  id="btn-save-imgbb-key"
                  onClick={() => handleSaveImgbbKey(localImgbbKey)}
                  className="px-3 py-1 rounded-lg border border-accent text-accent bg-accent/5 hover:bg-accent/15 text-xs font-semibold cursor-pointer transition-colors"
                >
                  Save Key
                </button>
              </div>
            </div>
          </div>

          {/* Desktop Application & Local Disk Storage (Electron) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider font-mono text-neutral-500 dark:text-neutral-400">
                <Monitor className="w-3.5 h-3.5 text-accent" />
                <span>Desktop App & Local Storage</span>
              </div>
              {isElectron ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <Check className="w-2.5 h-2.5" />
                  <span>Electron Native Mode</span>
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-medium bg-neutral-500/10 text-neutral-500 border border-neutral-500/20">
                  Web Preview Mode
                </span>
              )}
            </div>

            <div className={`p-4 rounded-xl border space-y-4 ${
              isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/80 border-neutral-200'
            }`}>
              {isElectron ? (
                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-semibold flex items-center gap-1.5 text-neutral-800 dark:text-neutral-200">
                      <Folder className="w-3.5 h-3.5 text-accent" />
                      <span>Active Local Storage Directory</span>
                    </h4>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
                      All your Mundus projects, manuscripts, characters, timeline milestones, and codex entries are stored directly as plain, human-readable JSON files on your hard drive.
                    </p>
                  </div>

                  <div className={`p-2.5 rounded-lg border font-mono text-xs break-all ${
                    isDarkMode ? 'bg-neutral-950 border-neutral-800 text-neutral-300' : 'bg-neutral-100 border-neutral-300 text-neutral-700'
                  }`}>
                    {electronStoragePath || 'Loading path...'}
                  </div>

                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <button
                      type="button"
                      onClick={handleOpenStorageFolder}
                      className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Open in File Explorer</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleChangeStorageFolder}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                        isDarkMode ? 'border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-750' : 'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100'
                      }`}
                    >
                      <Folder className="w-3.5 h-3.5" />
                      <span>Change Storage Folder</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    Mundus is currently running in your browser with standard web storage. When you download/export this project and run the Electron desktop app, all data automatically writes directly to real files in your local installation directory with zero browser quota limits.
                  </p>
                  <div className={`p-3 rounded-lg border text-xs font-mono space-y-1.5 ${
                    isDarkMode ? 'bg-neutral-950 border-neutral-800 text-neutral-300' : 'bg-neutral-100 border-neutral-300 text-neutral-700'
                  }`}>
                    <div className="text-[11px] text-neutral-500 font-sans font-semibold">To install run the prepare-app.bat file in the downloaded zip:</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Local Project Backup & Restore Framework */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider font-mono text-neutral-500 dark:text-neutral-400">
              <HardDrive className="w-3.5 h-3.5" />
              <span>Project Local Backup & Recovery</span>
            </div>

            <div className={`p-4 rounded-xl border space-y-4 ${
              isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/80 border-neutral-200'
            }`}>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                Create a backup of this Mundus (documents, folders, characters, timeline events, story links, and codex entries) or restore from a previous backup.
              </p>

              {/* Action Buttons: Export & Import */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => onExportBackup?.()}
                  className={`px-3.5 py-2 rounded-xl border font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    isDarkMode ? 'border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-750' : 'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100'
                  }`}
                >
                  <Download className="w-4 h-4" />
                  <span>Create backup</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`px-3.5 py-2 rounded-xl border font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    isDarkMode ? 'border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-750' : 'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  <span>Restore from Backup</span>
                </button>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && onImportBackup) {
                      onImportBackup(file);
                    }
                    if (e.target) e.target.value = '';
                  }}
                />
              </div>

              {/* Backup File Name / Path Settings */}
              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-semibold">Backup Filename Prefix</h4>
                    <p className="text-[10px] text-neutral-500">
                      Custom prefix for exported backup JSON files.
                    </p>
                  </div>
                  <input
                    type="text"
                    value={backupFilePrefix}
                    onChange={(e) => onUpdateBackupFilePrefix?.(e.target.value)}
                    placeholder="e.g., MyNovel_Backup"
                    className={`text-xs px-2.5 py-1 rounded-lg border outline-none font-mono w-40 ${
                      isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-neutral-300'
                    }`}
                  />
                </div>

                {/* v0.7.92: Backup Folder (desktop) — v0.7.94: on Android the
                    row explains where backups land instead of vanishing. */}
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold">Backup Folder</h4>
                    <p className="text-[10px] text-neutral-500">
                      {backupFolderAvailable
                        ? 'Backups are written straight into this folder, no save dialog.'
                        : isAndroidApp
                        ? 'On Android, backups are saved straight to your device\u2019s Downloads folder — a custom folder is not available inside the app.'
                        : 'Choosing a backup folder is available in the desktop app.'}
                    </p>
                    {backupFolderAvailable && backupDirPath && (
                      <p className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 mt-0.5 truncate max-w-[240px] sm:max-w-[320px]" title={backupDirPath}>
                        {backupDirPath}
                      </p>
                    )}
                  </div>
                  {backupFolderAvailable && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onChooseBackupFolder?.()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent text-accent hover:bg-accent/10 text-xs font-medium cursor-pointer transition-colors"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>{backupDirPath ? 'Change' : 'Choose folder'}</span>
                      </button>
                      {backupDirPath && (
                        <button
                          type="button"
                          onClick={() => onClearBackupFolder?.()}
                          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                            isDarkMode ? 'border-neutral-700 hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'border-neutral-300 hover:bg-neutral-100 text-neutral-600 hover:text-black'
                          }`}
                          title="Reset to default (ask where to save each backup)"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-semibold">Auto-create backup</h4>
                    <p className="text-[10px] text-neutral-500">
                      Automatically creates or prompts for a backup on schedule.
                    </p>
                  </div>
                  <select
                    value={autoDownloadBackupInterval}
                    onChange={(e) => onUpdateAutoDownloadBackupInterval?.(e.target.value)}
                    className={`text-xs rounded-lg px-2 py-1 border outline-none font-mono ${
                      isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-neutral-300'
                    }`}
                  >
                    <option value="off">Off (Manual only)</option>
                    <option value="15min">Every 15 Minutes</option>
                    <option value="30min">Every 30 Minutes</option>
                    <option value="1hour">Every 1 Hour</option>
                    <option value="daily">Every 24 Hours</option>
                  </select>
                </div>
              </div>

              {/* Firebase Config Button */}
              {onOpenFirebaseConfig && (
                <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-semibold">Firebase Cloud Storage</h4>
                    <p className="text-[10px] text-neutral-500">
                      Connect your own free 1GB Firebase database for cloud auto-sync.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href="https://console.firebase.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer text-xs flex items-center gap-1 ${
                        isDarkMode ? 'border-neutral-750 hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'border-neutral-300 hover:bg-neutral-100 text-neutral-600 hover:text-black'
                      }`}
                      title="Open Google Firebase Console in browser"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={onOpenFirebaseConfig}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent text-accent hover:bg-accent/10 text-xs font-medium cursor-pointer transition-colors"
                    >
                      <HardDrive className="w-3.5 h-3.5" />
                      <span>Configure Firebase</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Automatic Local Backups Toggle */}
              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-semibold">Automatic Snapshots</h4>
                  <p className="text-[10px] text-neutral-500">
                    Saves the latest 5 edits dynamically.
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={autoBackupEnabled}
                  onClick={() => onToggleAutoBackup?.(!autoBackupEnabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    autoBackupEnabled ? 'bg-accent' : isDarkMode ? 'bg-neutral-700' : 'bg-neutral-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      autoBackupEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Local Auto Snapshots Manager */}
              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-accent" />
                    <span>Automatic Snapshots ({backupSnapshots.length}/5)</span>
                  </span>

                  <div className="flex items-center gap-2">
                    {onCreateInstantSnapshot && (
                      <button
                        type="button"
                        onClick={onCreateInstantSnapshot}
                        className="px-2.5 py-1 rounded-lg bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent font-mono text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Save Instant Snapshot</span>
                      </button>
                    )}

                    {backupSnapshots.length > 0 && onClearSnapshots && (
                      <button
                        type="button"
                        onClick={onClearSnapshots}
                        className={`px-2 py-1 rounded border text-[10px] font-mono transition-colors cursor-pointer ${
                          isDarkMode
                            ? 'border-neutral-700 hover:bg-neutral-800 text-neutral-400'
                            : 'border-neutral-300 hover:bg-neutral-200 text-neutral-900 font-medium'
                        }`}
                      >
                        Clear History
                      </button>
                    )}
                  </div>
                </div>

                {backupSnapshots.length > 0 ? (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {backupSnapshots.map((snap) => (
                      <div
                        key={snap.id}
                        className={`p-2.5 rounded-xl border text-[11px] flex items-center justify-between gap-2 ${
                          isDarkMode ? 'bg-neutral-850 border-neutral-800' : 'bg-white border-neutral-200 shadow-2xs'
                        }`}
                      >
                        <div>
                          <p className={`font-mono text-[11px] font-bold ${
                            isDarkMode ? 'text-neutral-200' : 'text-neutral-900'
                          }`}>
                            {new Date(snap.timestamp).toLocaleString()}
                          </p>
                          <p className="text-[10px] text-neutral-400 font-mono mt-0.5">
                            {snap.docCount} docs · {snap.charCount} chars · {snap.eventCount} events · {snap.codexCount} codex
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (onRestoreSnapshot) {
                              onRestoreSnapshot(snap);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-accent text-white font-mono text-xs font-bold shadow-2xs hover:opacity-90 transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Restore Snapshot</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`p-3 rounded-xl border text-[11px] text-center ${
                    isDarkMode ? 'bg-neutral-900/50 border-neutral-800 text-neutral-400' : 'bg-neutral-50 border-neutral-200 text-neutral-500'
                  }`}>
                    No local snapshots created yet. Auto-saves trigger as you write, or click <strong className="text-accent">Save Instant Snapshot</strong> above to create one now.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Key Combinations / Shortcuts Settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider font-mono text-neutral-500 dark:text-neutral-400">
                <Keyboard className="w-3.5 h-3.5" />
                <span>Keyboard Shortcuts & Keybindings</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setKeybindings(DEFAULT_KEYBINDINGS);
                  saveKeybindings(DEFAULT_KEYBINDINGS);
                }}
                className="text-[11px] font-mono text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Defaults</span>
              </button>
            </div>

            {/* v0.7.96: duplicate-shortcut warning banner */}
            {shortcutWarning && (
              <div
                id="shortcut-duplicate-warning"
                role="alert"
                className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 flex items-start gap-2.5"
              >
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Duplicate shortcut</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-amber-600/90 dark:text-amber-400/90 break-words">
                    {shortcutWarning}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (shortcutWarningTimerRef.current !== null) window.clearTimeout(shortcutWarningTimerRef.current);
                    shortcutWarningTimerRef.current = null;
                    setShortcutWarning(null);
                  }}
                  title="Dismiss warning"
                  className="p-0.5 rounded text-amber-500/70 hover:text-amber-500 cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className={`p-4 rounded-xl border space-y-4 ${
              isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/80 border-neutral-200'
            }`}>
              {KEYBINDING_GROUPS.map((group) => (
                <div key={group.title} className="space-y-2">
                  <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest font-mono ${
                    isDarkMode ? 'text-accent/80' : 'text-accent'
                  }`}>
                    <span>{group.title}</span>
                    <span className={`h-px flex-1 ${isDarkMode ? 'bg-neutral-800' : 'bg-neutral-200'}`} />
                  </div>
                  <div className="space-y-2.5">
                    {group.items.map((item) => {
                      const key = item.id as keyof CustomKeybindings;
                      const binding = keybindings[key];
                      const isEditingThis = editingKey === key;
                      // v0.7.96: persistent duplicate badge on every action that
                      // currently shares its exact combination with another action.
                      const isDuplicated = duplicatedBindingIds.has(key);

                      return (
                        <div key={item.id} className="flex items-center justify-between gap-4 text-xs">
                          <span className="font-medium text-neutral-900 dark:text-neutral-200 flex items-center gap-1.5 min-w-0">
                            <span className="truncate">{item.label}</span>
                            {isDuplicated && !isEditingThis && (
                              <AlertTriangle
                                className="w-3 h-3 text-amber-500 shrink-0"
                                aria-label="Shortcut assigned to multiple actions"
                              />
                            )}
                          </span>

                          <button
                            type="button"
                            onClick={() => setEditingKey(isEditingThis ? null : key)}
                            className={`px-3 py-1 rounded-lg border font-mono text-[11px] transition-all cursor-pointer flex items-center gap-1.5 ${
                              isEditingThis
                                ? 'bg-amber-500/20 border-amber-500 text-amber-300 animate-pulse'
                                : isDuplicated
                                ? 'bg-amber-500/10 border-amber-500/60 text-amber-600 dark:text-amber-400 hover:border-amber-500'
                                : isDarkMode
                                ? 'bg-neutral-800 border-neutral-700 text-neutral-200 hover:border-neutral-600'
                                : 'bg-white border-neutral-300 text-neutral-800 hover:bg-neutral-100'
                            }`}
                            title={isDuplicated ? 'This combination is assigned to multiple actions — both will fire together' : undefined}
                          >
                            {isEditingThis ? 'Press keys...' : formatBinding(binding)}
                            {isDuplicated && !isEditingThis && <span className="text-[9px] font-bold uppercase tracking-wide">dup</span>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className={`p-3.5 border-t flex items-center justify-end ${
          isDarkMode ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50/50'
        }`}>
          <button
            type="button"
            id="btn-done-settings"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-accent text-accent hover:bg-accent/10 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
