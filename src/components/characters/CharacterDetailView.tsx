import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  Trash2, 
  Copy, 
  Sparkles, 
  Calendar, 
  MapPin, 
  Shield, 
  Users, 
  Tag, 
  Check, 
  Plus, 
  UserCheck, 
  Clock, 
  FileText,
  AlertCircle,
  Heart,
  Upload,
  Camera,
  Image as ImageIcon,
  Settings as SettingsIcon,
  Loader2,
  User,
  Palette,
  Pipette,
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon
} from 'lucide-react';
import type { Character, CharacterStatus, CharacterRelatives, CodexEntry, TimelineConfig, NovelDocument, Folder } from '../../types';
import { uploadImageToImgBB } from '../../lib/imgbb';
import { fileToOptimizedDataUrl } from '../../lib/imageCompressor';
import { CalendarTimePickerPopover } from './CalendarTimePickerPopover';
import { matchesMention } from '../../lib/mentionDetection';

interface CharacterDetailViewProps {
  character: Character;
  allCharacters: Character[];
  codexEntries?: CodexEntry[];
  timelineConfig?: TimelineConfig;
  documents?: NovelDocument[];
  folders?: Folder[];
  imgbbApiKey?: string;
  onOpenSettings?: () => void;
  onUpdate: (changes: Partial<Character>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (char: Character) => void;
  onClose: () => void;
  onSelectDocumentForEditor?: (docId: string) => void;
  /** Optional: create a Codex entry (used to auto-create factions/families in the Codex) */
  onCreateCodexEntry?: (entryData: Partial<CodexEntry>) => CodexEntry | void;
  isDarkMode: boolean;
}

/**
 * Returns a copy of `value` that only updates after it has been stable for
 * `delayMs`. Used so that expensive downstream work (whole-word mention
 * detection over the entire manuscript, cloud saves) does not re-run on every
 * keystroke — the #1 cause of the Android typing lag in character cards.
 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

const PRESET_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#ef4444', // red
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#6366f1', // indigo
  '#64748b', // slate
];

const COLOR_NAMES: Record<string, string> = {
  '#3b82f6': 'Blue',
  '#8b5cf6': 'Purple',
  '#ec4899': 'Pink',
  '#ef4444': 'Red',
  '#f59e0b': 'Amber',
  '#10b981': 'Emerald',
  '#06b6d4': 'Cyan',
  '#6366f1': 'Indigo',
  '#64748b': 'Slate',
};

const CUSTOM_BADGE_COLORS_KEY = 'mundus_custom_badge_colors';

const loadStoredBadgeColors = (): string[] => {
  try {
    const raw = localStorage.getItem(CUSTOM_BADGE_COLORS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveStoredBadgeColors = (colors: string[]) => {
  try {
    localStorage.setItem(CUSTOM_BADGE_COLORS_KEY, JSON.stringify(colors));
  } catch {}
};

interface BadgeColorDropdownProps {
  currentColor: string;
  onSelectColor: (color: string) => void;
  isDarkMode: boolean;
}

const BadgeColorDropdown: React.FC<BadgeColorDropdownProps> = ({
  currentColor,
  onSelectColor,
  isDarkMode,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customColors, setCustomColors] = useState<string[]>(() => loadStoredBadgeColors());
  const [deletedColors, setDeletedColors] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const activeColor = currentColor || '#3b82f6';

  const rawColors = Array.from(new Set([
    ...PRESET_COLORS,
    ...customColors,
    ...(activeColor && !PRESET_COLORS.map(c => c.toLowerCase()).includes(activeColor.toLowerCase()) ? [activeColor] : [])
  ]));

  const allColors = rawColors.filter((c) => !deletedColors.includes(c.toLowerCase()));

  const handleCommitColor = useCallback((newColor: string) => {
    if (!newColor) return;
    const normalized = newColor.toLowerCase();
    setDeletedColors((prev) => prev.filter((c) => c !== normalized));
    setCustomColors((prev) => {
      const lowerColors = prev.map((c) => c.toLowerCase());
      const isPreset = PRESET_COLORS.map((c) => c.toLowerCase()).includes(normalized);
      if (!lowerColors.includes(normalized) && !isPreset) {
        const next = [...prev, newColor];
        saveStoredBadgeColors(next);
        return next;
      }
      return prev;
    });
    onSelectColor(newColor);
    setIsOpen(false);
  }, [onSelectColor]);

  useEffect(() => {
    const inputEl = colorInputRef.current;
    if (!inputEl) return;

    const handleNativeChange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.value) {
        handleCommitColor(target.value);
      }
    };

    inputEl.addEventListener('change', handleNativeChange);
    return () => {
      inputEl.removeEventListener('change', handleNativeChange);
    };
  }, [handleCommitColor]);

  const handleDeleteColor = (colorToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const normalized = colorToDelete.toLowerCase();
    setDeletedColors((prev) => [...prev, normalized]);
    setCustomColors((prev) => {
      const next = prev.filter((c) => c.toLowerCase() !== normalized);
      saveStoredBadgeColors(next);
      return next;
    });

    // If deleting currently active color, select the next available one
    if (activeColor.toLowerCase() === normalized) {
      const remaining = allColors.filter((c) => c.toLowerCase() !== normalized);
      if (remaining.length > 0) {
        onSelectColor(remaining[0]);
      }
    }
  };

  const getColorLabel = (hex: string) => {
    return COLOR_NAMES[hex.toLowerCase()] || hex.toUpperCase();
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <input
        ref={colorInputRef}
        type="color"
        defaultValue={activeColor}
        className="sr-only pointer-events-none"
        tabIndex={-1}
      />

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors outline-none focus:ring-2 focus:ring-accent cursor-pointer flex items-center gap-2 ${
          isDarkMode
            ? 'bg-neutral-900 border-neutral-750 text-white hover:bg-neutral-800'
            : 'bg-white border-neutral-300 text-neutral-900 hover:bg-neutral-50'
        }`}
      >
        <span
          className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/20 dark:border-white/20 shadow-xs"
          style={{ backgroundColor: activeColor }}
        />
        <span>{getColorLabel(activeColor)}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 text-neutral-400 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 mt-1 w-52 rounded-xl shadow-xl z-50 border p-1.5 animate-in fade-in zoom-in-95 duration-100 ${
            isDarkMode
              ? 'bg-neutral-900 border-neutral-750 text-neutral-100'
              : 'bg-white border-neutral-200 text-neutral-900'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              if (colorInputRef.current) {
                colorInputRef.current.value = activeColor;
                colorInputRef.current.click();
              }
            }}
            className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors flex items-center gap-2 mb-1 border ${
              isDarkMode
                ? 'bg-neutral-800/80 border-neutral-700 hover:bg-neutral-750 text-amber-400'
                : 'bg-amber-50 border-amber-200 hover:bg-amber-100 text-amber-800'
            }`}
          >
            <Pipette className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Add Custom Color...</span>
          </button>

          <div className="h-px bg-neutral-200 dark:bg-neutral-800 my-1" />

          <div className="max-h-48 overflow-y-auto space-y-0.5 scrollbar-thin">
            {allColors.map((color) => {
              const isSelected = activeColor.toLowerCase() === color.toLowerCase();
              return (
                <div
                  key={color}
                  onClick={() => {
                    onSelectColor(color);
                    setIsOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors flex items-center justify-between group/coloritem ${
                    isSelected
                      ? isDarkMode
                        ? 'bg-amber-500/20 text-amber-300 font-bold'
                        : 'bg-amber-50 text-amber-900 font-bold'
                      : isDarkMode
                      ? 'hover:bg-neutral-800 text-neutral-300'
                      : 'hover:bg-neutral-100 text-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/20 dark:border-white/20 shadow-xs"
                      style={{ backgroundColor: color }}
                    />
                    <span className="truncate">{getColorLabel(color)}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isSelected && <Check className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    {allColors.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteColor(color, e)}
                        title={`Delete color ${getColorLabel(color)}`}
                        className="p-1 rounded hover:bg-red-500/20 hover:text-red-500 text-neutral-400 opacity-60 hover:opacity-100 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const COMMON_ROLES = [
  'Protagonist',
  'Antagonist',
  'Deuteragonist',
  'Supporting',
  'Mentor',
  'Foil',
  'Love Interest',
  'Confidant'
];

export const CharacterDetailView: React.FC<CharacterDetailViewProps> = ({
  character,
  allCharacters,
  codexEntries = [],
  timelineConfig,
  documents = [],
  folders = [],
  imgbbApiKey,
  onOpenSettings,
  onUpdate,
  onDelete,
  onDuplicate,
  onClose,
  onSelectDocumentForEditor,
  onCreateCodexEntry,
  isDarkMode
}) => {
  const [name, setName] = useState(character.name);
  const [aliases, setAliases] = useState(character.aliases || '');
  const [sex, setSex] = useState(character.sex || 'Male');
  const [status, setStatus] = useState<CharacterStatus>(character.status || 'alive');
  const [roles, setRoles] = useState<string[]>(character.roles || []);
  const [factions, setFactions] = useState<string[]>(character.factions || []);
  const [families, setFamilies] = useState<string[]>(character.families || []);
  const [tags, setTags] = useState<string[]>(character.tags || []);
  const [birthTime, setBirthTime] = useState(character.birthTime || '');
  const [birthPlace, setBirthPlace] = useState(character.birthPlace || '');
  const [deathTime, setDeathTime] = useState(character.deathTime || '');
  const [deathPlace, setDeathPlace] = useState(character.deathPlace || '');
  const [appearance, setAppearance] = useState(character.appearance || '');
  const [overview, setOverview] = useState(character.overview || '');
  const [notes, setNotes] = useState(character.notes || '');
  const [avatarColor, setAvatarColor] = useState(character.avatarColor || '#3b82f6');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(character.avatarUrl);
  const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [imageUploadNotice, setImageUploadNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [relatives, setRelatives] = useState<CharacterRelatives>(character.relatives || {
    father: '',
    mother: '',
    siblings: [],
    partners: [],
    children: [],
  });

  // Relative input states
  const [siblingInput, setSiblingInput] = useState('');
  const [partnerInput, setPartnerInput] = useState('');
  const [childInput, setChildInput] = useState('');

  // New tag inputs
  const [newRoleInput, setNewRoleInput] = useState('');
  const [newFactionInput, setNewFactionInput] = useState('');
  const [newFamilyInput, setNewFamilyInput] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState(false);

  // Collapsed folder groups inside the "Appears In" section
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  // ---------------------------------------------------------------------------
  // ANDROID TYPING LAG FIX
  // ---------------------------------------------------------------------------
  // Free-text fields update local state instantly (zero input latency) but only
  // propagate upward + re-run heavy work after the user pauses typing:
  // - `debouncedName` / `debouncedAliases` drive the whole-manuscript mention
  //    detection (previously it re-scanned EVERY document's full text on EVERY
  //    keystroke — the main source of the lag).
  // - `scheduleTextUpdate` debounces onUpdate so a typing session produces one
  //    state/cloud update instead of one per keystroke.
  // ---------------------------------------------------------------------------
  const debouncedName = useDebouncedValue(name, 500);
  const debouncedAliases = useDebouncedValue(aliases, 500);
  const textUpdateTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Values scheduled but not yet propagated — flushed on unmount/character switch
  // so a quick edit right before closing the card is never silently dropped.
  const pendingTextUpdatesRef = useRef<Partial<Character>>({});
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const scheduleTextUpdateInternal = (field: keyof Character, value: string) => {
    pendingTextUpdatesRef.current = { ...pendingTextUpdatesRef.current, [field]: value };
    const timers = textUpdateTimersRef.current;
    if (timers[field as string]) {
      clearTimeout(timers[field as string]);
    }
    timers[field as string] = setTimeout(() => {
      delete timers[field as string];
      delete pendingTextUpdatesRef.current[field as string];
      onUpdateRef.current({ [field]: value });
      setSaveIndicator(true);
      setTimeout(() => setSaveIndicator(false), 1200);
    }, 600);
  };

  // Flush pending debounced text updates when switching characters or unmounting.
  // The updater is CAPTURED per effect cycle so edits are always flushed to the
  // character they belong to (refs would already point at the new character).
  useEffect(() => {
    const capturedOnUpdate = onUpdateRef.current;
    return () => {
      const timers = textUpdateTimersRef.current;
      Object.keys(timers).forEach((key) => clearTimeout(timers[key]));
      textUpdateTimersRef.current = {};
      const pending = pendingTextUpdatesRef.current;
      if (Object.keys(pending).length > 0) {
        pendingTextUpdatesRef.current = {};
        capturedOnUpdate(pending);
      }
    };
  }, [character.id]);

  const toggleFolderCollapse = (folderId: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  // Detect which documents/scenes mention this character (by full name, name parts, or aliases).
  // All matching is whole-word based so an alias like "King" never matches
  // inside other words such as "asking", "looking" or "making".
  // Depends on the DEBOUNCED name/aliases: scanning every manuscript page with
  // word-boundary regexes is far too expensive to run per keystroke on mobile.
  const documentsWithMentionStatus = React.useMemo(() => {
    const charName = debouncedName.trim().toLowerCase();
    const aliasList = (debouncedAliases || '')
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter((a) => a.length >= 2);
    const nameParts = charName.split(/\s+/).filter((p) => p.length >= 3);

    return documents.map((doc) => {
      let isMentioned = false;
      let mentionReason = '';

      if (charName && charName.length >= 2) {
        const docText = (doc.plainText || '').toLowerCase();
        const docTitle = (doc.title || '').toLowerCase();

        if (matchesMention(docTitle, charName)) {
          isMentioned = true;
          mentionReason = 'In title';
        } else if (matchesMention(docText, charName)) {
          isMentioned = true;
          mentionReason = 'Mentioned in text';
        } else if (nameParts.some((part) => matchesMention(docText, part) || matchesMention(docTitle, part))) {
          isMentioned = true;
          mentionReason = 'Name match';
        } else if (aliasList.some((alias) => matchesMention(docText, alias) || matchesMention(docTitle, alias))) {
          isMentioned = true;
          mentionReason = 'Alias match';
        }
      }

      return {
        doc,
        isMentioned,
        mentionReason
      };
    });
  }, [documents, debouncedName, debouncedAliases]);

  // Group detected documents by folder (same collapsible layout as Codex entries)
  const documentsGroupedByFolder = React.useMemo(() => {
    const detectedDocs = documentsWithMentionStatus.filter((d) => d.isMentioned);
    const folderMap = new Map((folders || []).map((f) => [f.id, f]));
    const grouped = new Map<string, typeof detectedDocs>();

    (folders || []).forEach((f) => {
      grouped.set(f.id, []);
    });
    grouped.set('root', []);

    detectedDocs.forEach((item) => {
      const fId = item.doc.folderId && folderMap.has(item.doc.folderId) ? item.doc.folderId : 'root';
      grouped.get(fId)?.push(item);
    });

    const groups: {
      folderId: string;
      folderName: string;
      items: typeof detectedDocs;
      mentionedCount: number;
    }[] = [];

    (folders || []).forEach((f) => {
      const docsInFolder = grouped.get(f.id) || [];
      if (docsInFolder.length > 0) {
        groups.push({
          folderId: f.id,
          folderName: f.name,
          items: docsInFolder,
          mentionedCount: docsInFolder.length
        });
      }
    });

    const rootDocs = grouped.get('root') || [];
    if (rootDocs.length > 0) {
      groups.push({
        folderId: 'root',
        folderName: 'Loose Manuscripts / Unassigned',
        items: rootDocs,
        mentionedCount: rootDocs.length
      });
    }

    return groups.sort((a, b) => a.folderName.localeCompare(b.folderName));
  }, [folders, documentsWithMentionStatus]);

  // Sync state if character prop changes.
  // NOTE: `character.updatedAt` was removed from the deps — it changed on every
  // propagated edit, which reset ALL local field states after every debounced
  // update (17 setState calls + a full re-render per keystroke on Android).
  // The component is the single editor of this character, so resetting on
  // character SWITCH (id), avatar URL and external relatives changes is enough.
  useEffect(() => {
    setName(character.name);
    setAliases(character.aliases || '');
    setSex(character.sex || 'Male');
    setStatus(character.status || 'alive');
    setRoles(character.roles || []);
    setFactions(character.factions || []);
    setFamilies(character.families || []);
    setTags(character.tags || []);
    setRelatives(character.relatives || {
      father: '',
      mother: '',
      siblings: [],
      partners: [],
      children: [],
    });
    setBirthTime(character.birthTime || '');
    setBirthPlace(character.birthPlace || '');
    setDeathTime(character.deathTime || '');
    setDeathPlace(character.deathPlace || '');
    setAppearance(character.appearance || '');
    setOverview(character.overview || '');
    setNotes(character.notes || '');
    setAvatarColor(character.avatarColor || '#3b82f6');
    setAvatarUrl(character.avatarUrl);
    setImageUploadError(null);
    setImageUploadNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.id, character.avatarUrl, JSON.stringify(character.relatives)]);

  // Handle image portrait selection and upload (ImgBB cloud hosting or local fallback)
  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageUploadError(null);
    setImageUploadNotice(null);
    setIsUploadingImage(true);

    try {
      let finalUrl = '';
      if (imgbbApiKey && imgbbApiKey.trim()) {
        const res = await uploadImageToImgBB(file, imgbbApiKey);
        finalUrl = res.url;
      } else {
        // Fallback to optimized data URL so the user can test/use images immediately without blowing quota
        finalUrl = await fileToOptimizedDataUrl(file, 800, 0.82);
        setImageUploadNotice('Uploaded locally. Configure your ImgBB API key in Settings for cloud hosting.');
      }

      if (finalUrl) {
        setAvatarUrl(finalUrl);
        handleFieldChange('avatarUrl', finalUrl);
      }
    } catch (err: any) {
      console.error('Character portrait upload failed:', err);
      setImageUploadError(err?.message || 'Failed to upload image. Please try again.');
      // Do NOT save broken URL!
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePortrait = () => {
    setAvatarUrl(undefined);
    setImageUploadError(null);
    setImageUploadNotice(null);
    handleFieldChange('avatarUrl', undefined);
  };

  // Existing suggestions across all characters and Codex entries in the project
  const codexFactions = (codexEntries || [])
    .filter((e) => {
      const cat = (e.category || '').toLowerCase().trim();
      return (
        cat === 'factions' ||
        cat === 'orders' ||
        cat === 'factions & orders' ||
        cat.includes('faction') ||
        cat.includes('order') ||
        cat.includes('guild') ||
        cat.includes('alliance')
      );
    })
    .map((e) => e.title.trim())
    .filter(Boolean);

  const codexHouses = (codexEntries || [])
    .filter((e) => {
      const cat = (e.category || '').toLowerCase().trim();
      return (
        cat === 'houses' ||
        cat === 'dynasties' ||
        cat === 'houses & dynasties' ||
        cat.includes('house') ||
        cat.includes('dynast') ||
        cat.includes('clan') ||
        cat.includes('lineage') ||
        cat.includes('family')
      );
    })
    .map((e) => e.title.trim())
    .filter(Boolean);

  const codexTags = (codexEntries || [])
    .flatMap((e) => e.tags || [])
    .map((t) => t.trim())
    .filter(Boolean);

  const existingFactions: string[] = Array.from(
    new Set<string>([
      ...allCharacters.flatMap((c) => c.factions || []).filter(Boolean),
      ...codexFactions
    ])
  ).filter((f) => !factions.includes(f))
   .sort((a, b) => a.localeCompare(b));

  const existingFamilies: string[] = Array.from(
    new Set<string>([
      ...allCharacters.flatMap((c) => c.families || []).filter(Boolean),
      ...codexHouses
    ])
  ).filter((fam) => !families.includes(fam))
   .sort((a, b) => a.localeCompare(b));

  const existingTags: string[] = Array.from(
    new Set<string>([
      ...allCharacters.flatMap((c) => c.tags || []).filter(Boolean),
      ...codexTags
    ])
  ).filter((t) => !tags.includes(t));

  const handleFieldChange = (field: keyof Character, value: any) => {
    onUpdate({ [field]: value });
    setSaveIndicator(true);
    setTimeout(() => setSaveIndicator(false), 1200);
  };

  // Debounced propagation for free-text fields: the input stays fully
  // responsive (local state updates on every keystroke) but the parent state
  // tree, localStorage persist and cloud save only run once the user pauses
  // typing. This is what removes the keystroke jank on Android.
  const scheduleTextUpdate = scheduleTextUpdateInternal;

  /** Text fields that should propagate with a debounce instead of per keystroke */
  const isDebouncedTextField = (field: keyof Character): boolean =>
    ['name', 'aliases', 'birthTime', 'birthPlace', 'deathTime', 'deathPlace', 'appearance', 'overview', 'notes'].includes(field as string);

  const handleTextChange = (field: keyof Character, value: string, localSetter: (v: string) => void) => {
    localSetter(value);
    if (isDebouncedTextField(field)) {
      scheduleTextUpdate(field, value);
    } else {
      handleFieldChange(field, value);
    }
  };

  /**
   * FACTIONS & FAMILIES <-> CODEX INTEGRATION
   * When a faction/family that does not exist in the Codex yet is assigned from
   * the character card, a matching Codex entry is created automatically in the
   * right section ("Factions & Orders" / "Houses & Dynasties") and linked back
   * to this character, so worldbuilding data created here also shows up in Lore.
   */
  const ensureCodexEntryForTag = (kind: 'faction' | 'family', tagName: string) => {
    if (!onCreateCodexEntry || !tagName.trim()) return;
    const normalized = tagName.trim().toLowerCase();
    const category = kind === 'faction' ? 'factions' : 'houses';
    const alreadyExists = (codexEntries || []).some(
      (e) => (e.category || '') === category && (e.title || '').trim().toLowerCase() === normalized
    );
    if (alreadyExists) return;
    onCreateCodexEntry({
      title: tagName.trim(),
      category,
      subtitle: kind === 'faction' ? `Faction — linked to ${character.name}` : `Family / House — linked to ${character.name}`,
      overview: '',
      content: '',
      themeColor: kind === 'faction' ? '#f59e0b' : '#3b82f6',
      tags: [],
      relatedCharacterIds: [character.id],
    });
  };

  // Add / remove tags helpers
  const addRole = (role: string) => {
    const trimmed = role.trim();
    if (!trimmed || roles.includes(trimmed)) return;
    const updated = [...roles, trimmed];
    setRoles(updated);
    handleFieldChange('roles', updated);
    setNewRoleInput('');
  };

  const removeRole = (roleToRemove: string) => {
    const updated = roles.filter((r) => r !== roleToRemove);
    setRoles(updated);
    handleFieldChange('roles', updated);
  };

  const addFaction = (faction: string) => {
    const trimmed = faction.trim();
    if (!trimmed || factions.includes(trimmed)) return;
    const updated = [...factions, trimmed];
    setFactions(updated);
    handleFieldChange('factions', updated);
    setNewFactionInput('');
    // Auto-create the matching Codex entry for brand-new factions
    ensureCodexEntryForTag('faction', trimmed);
  };

  const removeFaction = (factionToRemove: string) => {
    const updated = factions.filter((f) => f !== factionToRemove);
    setFactions(updated);
    handleFieldChange('factions', updated);
  };

  const addFamily = (family: string) => {
    const trimmed = family.trim();
    if (!trimmed || families.includes(trimmed)) return;
    const updated = [...families, trimmed];
    setFamilies(updated);
    handleFieldChange('families', updated);
    setNewFamilyInput('');
    // Auto-create the matching Codex entry for brand-new families/houses
    ensureCodexEntryForTag('family', trimmed);
  };

  const removeFamily = (familyToRemove: string) => {
    const updated = families.filter((fam) => fam !== familyToRemove);
    setFamilies(updated);
    handleFieldChange('families', updated);
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    const updated = [...tags, trimmed];
    setTags(updated);
    handleFieldChange('tags', updated);
    setNewTagInput('');
  };

  const removeTag = (tagToRemove: string) => {
    const updated = tags.filter((t) => t !== tagToRemove);
    setTags(updated);
    handleFieldChange('tags', updated);
  };

  // Relatives helpers (Father, Mother, Siblings, Partners, Children)
  const updateFather = (val: string) => {
    const updated: CharacterRelatives = { ...relatives, father: val };
    setRelatives(updated);
    handleFieldChange('relatives', updated);
  };

  const updateMother = (val: string) => {
    const updated: CharacterRelatives = { ...relatives, mother: val };
    setRelatives(updated);
    handleFieldChange('relatives', updated);
  };

  const addSibling = (nameOrId: string) => {
    const trimmed = nameOrId.trim();
    if (!trimmed || relatives.siblings?.includes(trimmed)) return;
    const updated: CharacterRelatives = {
      ...relatives,
      siblings: [...(relatives.siblings || []), trimmed]
    };
    setRelatives(updated);
    handleFieldChange('relatives', updated);
    setSiblingInput('');
  };

  const removeSibling = (siblingToRemove: string) => {
    const updated: CharacterRelatives = {
      ...relatives,
      siblings: (relatives.siblings || []).filter((s) => s !== siblingToRemove)
    };
    setRelatives(updated);
    handleFieldChange('relatives', updated);
  };

  const addPartner = (nameOrId: string) => {
    const trimmed = nameOrId.trim();
    if (!trimmed || relatives.partners?.includes(trimmed)) return;
    const updated: CharacterRelatives = {
      ...relatives,
      partners: [...(relatives.partners || []), trimmed]
    };
    setRelatives(updated);
    handleFieldChange('relatives', updated);
    setPartnerInput('');
  };

  const removePartner = (partnerToRemove: string) => {
    const updated: CharacterRelatives = {
      ...relatives,
      partners: (relatives.partners || []).filter((p) => p !== partnerToRemove)
    };
    setRelatives(updated);
    handleFieldChange('relatives', updated);
  };

  const addChild = (nameOrId: string) => {
    const trimmed = nameOrId.trim();
    if (!trimmed || relatives.children?.includes(trimmed)) return;
    const updated: CharacterRelatives = {
      ...relatives,
      children: [...(relatives.children || []), trimmed]
    };
    setRelatives(updated);
    handleFieldChange('relatives', updated);
    setChildInput('');
  };

  const removeChild = (childToRemove: string) => {
    const updated: CharacterRelatives = {
      ...relatives,
      children: (relatives.children || []).filter((c) => c !== childToRemove)
    };
    setRelatives(updated);
    handleFieldChange('relatives', updated);
  };

  const otherCharacters = allCharacters.filter((c) => c.id !== character.id);

  const getInitials = (n: string) => {
    if (!n) return '?';
    const parts = n.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const wordCount = overview.trim() ? overview.trim().split(/\s+/).length : 0;

  return (
    <div 
      id="character-detail-view"
      className={`h-full flex flex-col overflow-hidden border-l transition-colors select-text ${
        isDarkMode 
          ? 'bg-[#111111] border-neutral-800 text-neutral-100' 
          : 'bg-white border-neutral-200 text-neutral-900'
      }`}
    >
      {/* Top Section / Card (Unified Header & Identity per characterCard3.png layout) */}
      <div className={`p-4 sm:p-5 border-b shadow-2xs relative shrink-0 ${
        isDarkMode ? 'border-neutral-800 bg-[#141414]' : 'border-neutral-200 bg-neutral-50/80'
      }`}>
        {/* Hidden File Input for Portrait Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageFileSelect}
        />

        {/* Upload Status / Error / Local Notice Banner */}
        {(imageUploadNotice || imageUploadError) && (
          <div className={`mb-4 p-3 rounded-xl border text-xs flex items-start justify-between gap-3 animate-fadeIn ${
            imageUploadNotice
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
          }`}>
            <div className="flex items-start gap-2.5 min-w-0">
              <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${imageUploadNotice ? 'text-amber-500' : 'text-rose-500'}`} />
              <div className="space-y-1">
                <p className={`font-semibold ${imageUploadNotice ? 'text-amber-800 dark:text-amber-200' : 'text-rose-800 dark:text-rose-200'}`}>
                  {imageUploadNotice ? 'Local Image Active' : 'Image Upload Notice'}
                </p>
                <p className="leading-relaxed text-[11px]">{imageUploadNotice || imageUploadError}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className={`px-2.5 py-1 rounded-lg text-white font-semibold text-[11px] transition-colors shadow-2xs cursor-pointer flex items-center gap-1 ${
                    imageUploadNotice ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  <SettingsIcon className="w-3 h-3" />
                  <span>Open Settings</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setImageUploadError(null);
                  setImageUploadNotice(null);
                }}
                title="Dismiss"
                className={`p-1 rounded-md cursor-pointer transition-colors ${
                  imageUploadNotice ? 'text-amber-500 hover:text-amber-800 dark:hover:text-white' : 'text-rose-500 hover:text-rose-800 dark:hover:text-white'
                }`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* MOBILE VIEW (<sm): Compact portrait + right-aligned badge & vertical actions, tight fields */}
        <div className="block sm:hidden space-y-2.5">
          {/* Top Row: Portrait on left, Alive/Dead badge next to it, Close/Copy/Delete stacked vertically on right */}
          <div className="flex items-start gap-2.5 w-full">
            {/* Portrait Box */}
            <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-neutral-300 dark:border-neutral-700 shadow-sm group bg-neutral-200 dark:bg-neutral-800 shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  className="w-full h-full flex flex-col items-center justify-center gap-1 p-1 text-center cursor-pointer hover:bg-neutral-300/50 dark:hover:bg-neutral-700/50 transition-colors"
                  style={{ backgroundColor: avatarColor + '20' }}
                >
                  <div 
                    className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white shadow-xs"
                    style={{ backgroundColor: avatarColor }}
                  >
                    {getInitials(name)}
                  </div>
                  <span className="text-[9px] font-medium text-neutral-600 dark:text-neutral-400 leading-tight">
                    PORTRAIT<br/>
                    <span className="text-[8px] text-neutral-400 font-normal">(upload)</span>
                  </span>
                </button>
              )}

              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  title="Click to change portrait image"
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white text-[10px] font-medium cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>Change</span>
                </button>
              )}

              {isUploadingImage && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white gap-1">
                  <Loader2 className="w-4 h-4 animate-spin text-accent" />
                  <span className="text-[9px]">Uploading...</span>
                </div>
              )}

              {avatarUrl && !isUploadingImage && (
                <button
                  type="button"
                  onClick={handleRemovePortrait}
                  title="Remove image portrait"
                  className="absolute top-1 right-1 p-1 rounded-md bg-black/70 hover:bg-rose-600 text-white transition-colors cursor-pointer z-10"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Alive / Dead Status Badge right next to portrait */}
            <div className="flex flex-col justify-start shrink-0 pt-0.5">
              <span className={`inline-block text-center text-[10px] font-mono px-2 py-1 rounded-lg font-bold uppercase tracking-wider border shadow-2xs ${
                status === 'alive'
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : status === 'deceased'
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                  : status === 'missing'
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  : 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30'
              }`}>
                {status}
              </span>
            </div>

            {/* Vertical Stack: Close (top), Copy (middle), Delete (bottom) */}
            <div className="flex flex-col items-end gap-1.5 ml-auto shrink-0">
              {/* Close Button on top */}
              <button
                id="btn-close-character-detail-mobile"
                type="button"
                onClick={onClose}
                title="Close dossier"
                className="p-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              {/* Copy Button in middle */}
              <button
                id="btn-duplicate-character-mobile"
                type="button"
                onClick={() => onDuplicate(character)}
                title="Duplicate character"
                className={`p-1.5 rounded-lg border text-xs font-medium flex items-center justify-center transition-colors cursor-pointer ${
                  isDarkMode 
                    ? 'border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-200' 
                    : 'border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800 shadow-2xs'
                }`}
              >
                <Copy className="w-3.5 h-3.5" />
              </button>

              {/* Delete Button on bottom */}
              {isConfirmingDelete ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onDelete(character.id)}
                    className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-semibold hover:bg-rose-700 transition-colors cursor-pointer"
                  >
                    Del?
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(false)}
                    className="p-1 rounded-lg text-neutral-400 hover:text-neutral-200 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  id="btn-delete-character-mobile"
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  title="Delete character"
                  className={`p-1.5 rounded-lg border text-xs font-medium flex items-center justify-center text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer ${
                    isDarkMode ? 'border-neutral-700 bg-neutral-800/50' : 'border-neutral-300 bg-white shadow-2xs'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* NAME Field (Mobile) */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-mono flex items-center gap-1 mb-0.5">
              <User className="w-3 h-3 text-accent" />
              <span>NAME</span>
            </label>
            <input
              id="input-character-name-mobile"
              type="text"
              value={name}
              onChange={(e) => {
                handleTextChange('name', e.target.value, setName);
              }}
              placeholder="e.g. Lord Corin Vance"
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors outline-none focus:ring-2 focus:ring-accent ${
                isDarkMode 
                  ? 'bg-neutral-900 border-neutral-750 text-white placeholder-neutral-600' 
                  : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400'
              }`}
            />
          </div>

          {/* TITLES Field (Mobile) */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-mono flex items-center gap-1 mb-0.5">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>TITLES</span>
            </label>
            <input
              id="input-character-aliases-mobile"
              type="text"
              value={aliases}
              onChange={(e) => {
                handleTextChange('aliases', e.target.value, setAliases);
              }}
              placeholder="e.g. The Whispering Falcon, Knight Commander"
              className={`w-full px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors outline-none focus:ring-2 focus:ring-accent ${
                isDarkMode 
                  ? 'bg-neutral-900 border-neutral-750 text-white placeholder-neutral-600' 
                  : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400'
              }`}
            />
          </div>

          {/* GENDER, VITAL STATUS & BADGE COLOR Row (Mobile) */}
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            {/* GENDER */}
            <div className="shrink-0">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-mono flex items-center gap-1 mb-0.5">
                <User className="w-3 h-3 text-purple-400" />
                <span>GENDER</span>
              </label>
              <select
                id="select-character-sex-mobile"
                value={sex}
                onChange={(e) => {
                  setSex(e.target.value);
                  handleFieldChange('sex', e.target.value);
                }}
                className={`w-auto px-2 py-1 rounded-lg border text-[11px] transition-colors outline-none focus:ring-2 focus:ring-accent cursor-pointer ${
                  isDarkMode 
                    ? 'bg-neutral-900 border-neutral-750 text-white' 
                    : 'bg-white border-neutral-300 text-neutral-900'
                }`}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Other">Other / Unknown</option>
              </select>
            </div>

            {/* VITAL STATUS */}
            <div className="shrink-0">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-mono flex items-center gap-1 mb-0.5">
                <Heart className="w-3 h-3 text-rose-500" />
                <span>VITAL STATUS</span>
              </label>
              <select
                id="select-character-status-mobile"
                value={status}
                onChange={(e) => {
                  const val = e.target.value as CharacterStatus;
                  setStatus(val);
                  handleFieldChange('status', val);
                }}
                className={`w-auto px-2 py-1 rounded-lg border text-[11px] transition-colors outline-none focus:ring-2 focus:ring-accent cursor-pointer ${
                  isDarkMode 
                    ? 'bg-neutral-900 border-neutral-750 text-white' 
                    : 'bg-white border-neutral-300 text-neutral-900'
                }`}
              >
                <option value="alive">Alive</option>
                <option value="deceased">Deceased</option>
                <option value="missing">Missing / In Hiding</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>

            {/* BADGE COLOR SELECTOR */}
            <div className="shrink-0">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-mono flex items-center gap-1 mb-0.5">
                <Palette className="w-3 h-3 text-blue-400" />
                <span>BADGE COLOR</span>
              </label>
              <BadgeColorDropdown
                currentColor={avatarColor || '#3b82f6'}
                onSelectColor={(color) => {
                  setAvatarColor(color);
                  handleFieldChange('avatarColor', color);
                }}
                isDarkMode={isDarkMode}
              />
            </div>
          </div>
        </div>

        {/* DESKTOP VIEW (>=sm): Classic two-column layout */}
        <div className="hidden sm:flex flex-row items-start gap-5">
          {/* Left Column: Portrait Image Box + Alive/Dead Badge */}
          <div className="flex flex-col items-center gap-2.5 shrink-0 w-auto pt-[35px]">
            <div className="relative w-40 h-40 rounded-2xl overflow-hidden border border-neutral-300 dark:border-neutral-700 shadow-md group bg-neutral-200 dark:bg-neutral-800">
              {/* Portrait image or initial placeholder */}
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  className="w-full h-full flex flex-col items-center justify-center gap-2 p-3 text-center cursor-pointer hover:bg-neutral-300/50 dark:hover:bg-neutral-700/50 transition-colors"
                  style={{ backgroundColor: avatarColor + '20' }}
                >
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg text-white shadow-xs"
                    style={{ backgroundColor: avatarColor }}
                  >
                    {getInitials(name)}
                  </div>
                  <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                    PORTRAIT IMAGE<br/>
                    <span className="text-[10px] text-neutral-400 font-normal">(click to upload)</span>
                  </span>
                </button>
              )}

              {/* Upload overlay on hover if image exists */}
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  title="Click to change portrait image"
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white text-xs font-medium cursor-pointer"
                >
                  <Camera className="w-5 h-5" />
                  <span>Change Image</span>
                </button>
              )}

              {/* Uploading Spinner */}
              {isUploadingImage && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-accent" />
                  <span className="text-[11px]">Uploading...</span>
                </div>
              )}

              {/* Top-Right "X TO REMOVE IMAGE" button over image */}
              {avatarUrl && !isUploadingImage && (
                <button
                  type="button"
                  onClick={handleRemovePortrait}
                  title="Remove image portrait"
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-rose-600 text-white transition-colors cursor-pointer z-10"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Alive / Dead Badge below portrait image */}
            <div className="w-full text-center -mt-1.5">
              <span className={`inline-block w-full text-center text-xs font-mono px-3 py-1 rounded-xl font-bold uppercase tracking-wider border shadow-2xs ${
                status === 'alive'
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  : status === 'deceased'
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                  : status === 'missing'
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  : 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30'
              }`}>
                {status}
              </span>
            </div>
          </div>

          {/* Right Column: Top Actions, Name, Titles, Gender & Vital Status, Badge Color Selector */}
          <div className="flex-1 min-w-0 w-full space-y-3.5">
            {/* Top Right Action Bar: Close X, Delete Button, Copy Button */}
            <div className="flex items-center justify-end gap-2">
              {/* Copy / Duplicate Button */}
              <button
                id="btn-duplicate-character"
                type="button"
                onClick={() => onDuplicate(character)}
                title="Duplicate character dossier"
                className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isDarkMode 
                    ? 'border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-200' 
                    : 'border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800 shadow-2xs'
                }`}
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </button>

              {/* Delete Button */}
              {isConfirmingDelete ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onDelete(character.id)}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors cursor-pointer"
                  >
                    Delete?
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(false)}
                    className="p-1 rounded-lg text-neutral-400 hover:text-neutral-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  id="btn-delete-character"
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  title="Delete character"
                  className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer ${
                    isDarkMode ? 'border-neutral-700 bg-neutral-800/50' : 'border-neutral-300 bg-white shadow-2xs'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )}

              {/* X TO CLOSE Button */}
              <button
                id="btn-close-character-detail"
                type="button"
                onClick={onClose}
                title="Close dossier (X TO CLOSE)"
                className="p-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer ml-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* NAME Field */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-mono flex items-center gap-1.5 mb-1">
                <User className="w-3.5 h-3.5 text-accent" />
                <span>NAME</span>
              </label>
              <input
                id="input-character-name"
                type="text"
                value={name}
                onChange={(e) => {
                  handleTextChange('name', e.target.value, setName);
                }}
                placeholder="e.g. Lord Corin Vance"
                className={`w-full px-3 py-1.5 rounded-lg border text-sm font-semibold transition-colors outline-none focus:ring-2 focus:ring-accent ${
                  isDarkMode 
                    ? 'bg-neutral-900 border-neutral-750 text-white placeholder-neutral-600' 
                    : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400'
                }`}
              />
            </div>

            {/* TITLES Field */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-mono flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>TITLES</span>
              </label>
              <input
                id="input-character-aliases"
                type="text"
                value={aliases}
                onChange={(e) => {
                  handleTextChange('aliases', e.target.value, setAliases);
                }}
                placeholder="e.g. The Whispering Falcon, Knight Commander"
                className={`w-full px-3 py-1.5 rounded-lg border text-xs transition-colors outline-none focus:ring-2 focus:ring-accent ${
                  isDarkMode 
                    ? 'bg-neutral-900 border-neutral-750 text-white placeholder-neutral-600' 
                    : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400'
                }`}
              />
            </div>

            {/* GENDER, VITAL STATUS & BADGE COLOR Row */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* GENDER */}
              <div className="shrink-0">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-mono flex items-center gap-1.5 mb-1">
                  <User className="w-3.5 h-3.5 text-purple-400" />
                  <span>GENDER</span>
                </label>
                <select
                  id="select-character-sex"
                  value={sex}
                  onChange={(e) => {
                    setSex(e.target.value);
                    handleFieldChange('sex', e.target.value);
                  }}
                  className={`w-auto px-2.5 py-1.5 rounded-lg border text-xs transition-colors outline-none focus:ring-2 focus:ring-accent cursor-pointer ${
                    isDarkMode 
                      ? 'bg-neutral-900 border-neutral-750 text-white' 
                      : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Other">Other / Unknown</option>
                </select>
              </div>

              {/* VITAL STATUS */}
              <div className="shrink-0">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-mono flex items-center gap-1.5 mb-1">
                  <Heart className="w-3.5 h-3.5 text-rose-500" />
                  <span>VITAL STATUS</span>
                </label>
                <select
                  id="select-character-status"
                  value={status}
                  onChange={(e) => {
                    const val = e.target.value as CharacterStatus;
                    setStatus(val);
                    handleFieldChange('status', val);
                  }}
                  className={`w-auto px-2.5 py-1.5 rounded-lg border text-xs transition-colors outline-none focus:ring-2 focus:ring-accent cursor-pointer ${
                    isDarkMode 
                      ? 'bg-neutral-900 border-neutral-750 text-white' 
                      : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                >
                  <option value="alive">Alive</option>
                  <option value="deceased">Deceased</option>
                  <option value="missing">Missing / In Hiding</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>

              {/* BADGE COLOR SELECTOR */}
              <div className="shrink-0">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-mono flex items-center gap-1.5 mb-1">
                  <Palette className="w-3.5 h-3.5 text-blue-400" />
                  <span>BADGE COLOR</span>
                </label>
                <BadgeColorDropdown
                  currentColor={avatarColor || '#3b82f6'}
                  onSelectColor={(color) => {
                    setAvatarColor(color);
                    handleFieldChange('avatarColor', color);
                  }}
                  isDarkMode={isDarkMode}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">
        
        {/* Narrative Roles Section */}
        <div className={`p-4 sm:p-5 rounded-xl border space-y-3 ${
          isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/70 border-neutral-200'
        }`}>
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-mono flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Story Roles</span>
          </span>

          {/* Active Roles Pills */}
          <div className="flex flex-wrap gap-1.5 items-center">
            {roles.map((r) => (
              <span 
                key={r}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 flex items-center gap-1"
              >
                <span>{r}</span>
                <button
                  type="button"
                  onClick={() => removeRole(r)}
                  className="hover:text-blue-800 dark:hover:text-white p-0.5 rounded-full"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            {/* Inline add role input */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                addRole(newRoleInput);
              }}
              className="inline-flex items-center"
            >
              <input
                type="text"
                value={newRoleInput}
                onChange={(e) => setNewRoleInput(e.target.value)}
                placeholder="+ Add role..."
                className={`text-xs px-2.5 py-1 rounded-full border outline-none focus:ring-1 focus:ring-blue-500 ${
                  isDarkMode 
                    ? 'bg-neutral-950 border-neutral-700 text-neutral-200 placeholder-neutral-500' 
                    : 'bg-white border-neutral-300 text-neutral-800 placeholder-neutral-400'
                }`}
              />
            </form>
          </div>

          {/* Quick Preset Roles */}
          <div className="flex flex-wrap gap-1 items-center pt-1">
            <span className="text-[11px] text-neutral-400 mr-1">Suggestions:</span>
            {COMMON_ROLES.filter((cr) => !roles.includes(cr)).slice(0, 6).map((cr) => (
              <button
                key={cr}
                type="button"
                onClick={() => addRole(cr)}
                className={`text-[10px] px-2 py-0.5 rounded-md border font-mono transition-colors cursor-pointer ${
                  isDarkMode 
                    ? 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700' 
                    : 'border-neutral-200 bg-white text-neutral-600 hover:text-neutral-900 hover:border-neutral-300'
                }`}
              >
                + {cr}
              </button>
            ))}
          </div>
        </div>

        {/* Factions & Families (The core organization requested) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Factions Tag Box */}
          <div className={`p-4 rounded-xl border space-y-2.5 ${
            isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/70 border-neutral-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-mono flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-amber-500" />
                <span>Factions</span>
              </span>
              <span className="text-[10px] text-neutral-400 font-mono">
                {factions.length} assigned
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center">
              {factions.map((fac) => (
                <span 
                  key={fac}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1"
                >
                  <span>{fac}</span>
                  <button
                    type="button"
                    onClick={() => removeFaction(fac)}
                    className="hover:text-amber-900 dark:hover:text-white p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  addFaction(newFactionInput);
                }}
                className="inline-flex items-center"
              >
                <input
                  type="text"
                  value={newFactionInput}
                  onChange={(e) => setNewFactionInput(e.target.value)}
                  placeholder="+ New faction..."
                  className={`text-xs px-2.5 py-1 rounded-md border outline-none focus:ring-1 focus:ring-amber-500 ${
                    isDarkMode 
                      ? 'bg-neutral-950 border-neutral-700 text-neutral-200 placeholder-neutral-500' 
                      : 'bg-white border-neutral-300 text-neutral-800 placeholder-neutral-400'
                  }`}
                />
              </form>
            </div>

            {existingFactions.length > 0 && (
              <div className="space-y-1 pt-1.5 border-t border-neutral-200 dark:border-neutral-800/60">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-amber-600 dark:text-amber-400 block">
                  Add from Codex & World ({existingFactions.length}):
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto scrollbar-thin">
                  {existingFactions.map((ef) => (
                    <button
                      key={ef}
                      type="button"
                      onClick={() => addFaction(ef)}
                      className="text-[11px] px-2 py-0.5 rounded-lg font-medium border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 transition-colors cursor-pointer flex items-center gap-1"
                      title={`Add faction "${ef}"`}
                    >
                      <Plus className="w-3 h-3" />
                      <span>{ef}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Families / Houses Tag Box */}
          <div className={`p-4 rounded-xl border space-y-2.5 ${
            isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/70 border-neutral-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-mono flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-purple-500" />
                <span>Families / Bloodlines</span>
              </span>
              <span className="text-[10px] text-neutral-400 font-mono">
                {families.length} assigned
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center">
              {families.map((fam) => (
                <span 
                  key={fam}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 flex items-center gap-1"
                >
                  <span>{fam}</span>
                  <button
                    type="button"
                    onClick={() => removeFamily(fam)}
                    className="hover:text-purple-900 dark:hover:text-white p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  addFamily(newFamilyInput);
                }}
                className="inline-flex items-center"
              >
                <input
                  type="text"
                  value={newFamilyInput}
                  onChange={(e) => setNewFamilyInput(e.target.value)}
                  placeholder="+ New family..."
                  className={`text-xs px-2.5 py-1 rounded-md border outline-none focus:ring-1 focus:ring-purple-500 ${
                    isDarkMode 
                      ? 'bg-neutral-950 border-neutral-700 text-neutral-200 placeholder-neutral-500' 
                      : 'bg-white border-neutral-300 text-neutral-800 placeholder-neutral-400'
                  }`}
                />
              </form>
            </div>

            {existingFamilies.length > 0 && (
              <div className="space-y-1 pt-1.5 border-t border-neutral-200 dark:border-neutral-800/60">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-purple-600 dark:text-purple-400 block">
                  Add from Codex & Houses ({existingFamilies.length}):
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto scrollbar-thin">
                  {existingFamilies.map((ef) => (
                    <button
                      key={ef}
                      type="button"
                      onClick={() => addFamily(ef)}
                      className="text-[11px] px-2 py-0.5 rounded-lg font-medium border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 transition-colors cursor-pointer flex items-center gap-1"
                      title={`Add family "${ef}"`}
                    >
                      <Plus className="w-3 h-3" />
                      <span>{ef}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Relatives Section (Father, Mother, Siblings, Partners, Children) */}
        <div className={`p-4 sm:p-5 rounded-xl border space-y-4 ${
          isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/70 border-neutral-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-mono flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-500" />
              <span>Family Lineage & Relatives</span>
            </span>
          </div>

          {/* Parents (Father & Mother) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Father */}
            <div>
              <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                Father
              </label>
              {(() => {
                const fatherChar = allCharacters.find(
                  (c) => c.id === relatives.father || (relatives.father && c.name.toLowerCase() === relatives.father.toLowerCase())
                );
                return (
                  <div className="flex items-center gap-2">
                    <select
                      value={fatherChar ? fatherChar.id : ''}
                      onChange={(e) => updateFather(e.target.value)}
                      className={`flex-1 px-3 py-1.5 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500 ${
                        isDarkMode 
                          ? 'bg-neutral-950 border-neutral-700 text-white' 
                          : 'bg-white border-neutral-300 text-neutral-900'
                      }`}
                    >
                      <option value="">-- None / Unknown --</option>
                      {otherCharacters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.families?.length ? `(${c.families.join(', ')})` : ''}
                        </option>
                      ))}
                    </select>
                    {relatives.father && (
                      <button
                        type="button"
                        onClick={() => updateFather('')}
                        title="Clear father"
                        className="p-1.5 text-neutral-400 hover:text-rose-500 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Mother */}
            <div>
              <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                Mother
              </label>
              {(() => {
                const motherChar = allCharacters.find(
                  (c) => c.id === relatives.mother || (relatives.mother && c.name.toLowerCase() === relatives.mother.toLowerCase())
                );
                return (
                  <div className="flex items-center gap-2">
                    <select
                      value={motherChar ? motherChar.id : ''}
                      onChange={(e) => updateMother(e.target.value)}
                      className={`flex-1 px-3 py-1.5 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-blue-500 ${
                        isDarkMode 
                          ? 'bg-neutral-950 border-neutral-700 text-white' 
                          : 'bg-white border-neutral-300 text-neutral-900'
                      }`}
                    >
                      <option value="">-- None / Unknown --</option>
                      {otherCharacters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.families?.length ? `(${c.families.join(', ')})` : ''}
                        </option>
                      ))}
                    </select>
                    {relatives.mother && (
                      <button
                        type="button"
                        onClick={() => updateMother('')}
                        title="Clear mother"
                        className="p-1.5 text-neutral-400 hover:text-rose-500 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Partners (Spouses / Consorts) */}
          <div className="space-y-1.5 pt-1 border-t border-neutral-200/60 dark:border-neutral-800/60">
            <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 flex items-center gap-1">
              <Heart className="w-3 h-3 text-rose-500" />
              <span>Partners / Spouses</span>
            </label>
            <div className="flex flex-wrap gap-1.5 items-center">
              {(relatives.partners || []).map((p) => {
                const matched = allCharacters.find((c) => c.id === p || c.name.toLowerCase() === p.toLowerCase());
                const displayName = matched ? matched.name : p;
                return (
                  <span 
                    key={p}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 flex items-center gap-1"
                  >
                    <span>{displayName}</span>
                    <button
                      type="button"
                      onClick={() => removePartner(p)}
                      className="hover:text-rose-900 dark:hover:text-white p-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}

              <div className="inline-flex items-center gap-1">
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addPartner(e.target.value);
                  }}
                  className={`text-xs px-2.5 py-1 rounded-md border outline-none focus:ring-1 focus:ring-rose-500 ${
                    isDarkMode 
                      ? 'bg-neutral-950 border-neutral-700 text-neutral-300' 
                      : 'bg-white border-neutral-300 text-neutral-800'
                  }`}
                >
                  <option value="">+ Link partner...</option>
                  {otherCharacters
                    .filter((c) => !(relatives.partners || []).some((p) => p === c.id || p.toLowerCase() === c.name.toLowerCase()))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          {/* Siblings */}
          <div className="space-y-1.5 pt-1 border-t border-neutral-200/60 dark:border-neutral-800/60">
            <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 flex items-center gap-1">
              <Users className="w-3 h-3 text-cyan-500" />
              <span>Siblings</span>
            </label>
            <div className="flex flex-wrap gap-1.5 items-center">
              {(relatives.siblings || []).map((s) => {
                const matched = allCharacters.find((c) => c.id === s || c.name.toLowerCase() === s.toLowerCase());
                const displayName = matched ? matched.name : s;
                return (
                  <span 
                    key={s}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 flex items-center gap-1"
                  >
                    <span>{displayName}</span>
                    <button
                      type="button"
                      onClick={() => removeSibling(s)}
                      className="hover:text-cyan-900 dark:hover:text-white p-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}

              <div className="inline-flex items-center gap-1">
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addSibling(e.target.value);
                  }}
                  className={`text-xs px-2.5 py-1 rounded-md border outline-none focus:ring-1 focus:ring-cyan-500 ${
                    isDarkMode 
                      ? 'bg-neutral-950 border-neutral-700 text-neutral-300' 
                      : 'bg-white border-neutral-300 text-neutral-800'
                  }`}
                >
                  <option value="">+ Link sibling...</option>
                  {otherCharacters
                    .filter((c) => !(relatives.siblings || []).some((s) => s === c.id || s.toLowerCase() === c.name.toLowerCase()))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          {/* Children */}
          <div className="space-y-1.5 pt-1 border-t border-neutral-200/60 dark:border-neutral-800/60">
            <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 flex items-center gap-1">
              <Users className="w-3 h-3 text-indigo-500" />
              <span>Children / Offspring</span>
            </label>
            <div className="flex flex-wrap gap-1.5 items-center">
              {(relatives.children || []).map((ch) => {
                const matched = allCharacters.find((c) => c.id === ch || c.name.toLowerCase() === ch.toLowerCase());
                const displayName = matched ? matched.name : ch;
                return (
                  <span 
                    key={ch}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 flex items-center gap-1"
                  >
                    <span>{displayName}</span>
                    <button
                      type="button"
                      onClick={() => removeChild(ch)}
                      className="hover:text-indigo-900 dark:hover:text-white p-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}

              <div className="inline-flex items-center gap-1">
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addChild(e.target.value);
                  }}
                  className={`text-xs px-2.5 py-1 rounded-md border outline-none focus:ring-1 focus:ring-indigo-500 ${
                    isDarkMode 
                      ? 'bg-neutral-950 border-neutral-700 text-neutral-300' 
                      : 'bg-white border-neutral-300 text-neutral-800'
                  }`}
                >
                  <option value="">+ Link child...</option>
                  {otherCharacters
                    .filter((c) => !(relatives.children || []).some((ch) => ch === c.id || ch.toLowerCase() === c.name.toLowerCase()))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* General Tags */}
        <div className={`p-4 rounded-xl border space-y-2.5 ${
          isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/70 border-neutral-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-mono flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-neutral-400" />
              <span>Attributes & Custom Tags</span>
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            {tags.map((t) => (
              <span 
                key={t}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border flex items-center gap-1 ${
                  isDarkMode 
                    ? 'bg-neutral-800/80 border-neutral-700 text-neutral-300' 
                    : 'bg-neutral-200/80 border-neutral-300 text-neutral-800'
                }`}
              >
                <span>#{t}</span>
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  className="hover:text-red-500 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                addTag(newTagInput);
              }}
              className="inline-flex items-center"
            >
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                placeholder="+ Add tag..."
                className={`text-xs px-2.5 py-1 rounded-md border outline-none focus:ring-1 focus:ring-neutral-400 ${
                  isDarkMode 
                    ? 'bg-neutral-950 border-neutral-700 text-neutral-200 placeholder-neutral-500' 
                    : 'bg-white border-neutral-300 text-neutral-800 placeholder-neutral-400'
                }`}
              />
            </form>
          </div>

          {existingTags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              <span className="text-[10px] text-neutral-400">Suggestions:</span>
              {existingTags.slice(0, 5).map((et) => (
                <button
                  key={et}
                  type="button"
                  onClick={() => addTag(et)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 text-neutral-500 dark:text-neutral-400 cursor-pointer"
                >
                  + #{et}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Story Milestones: Birth & Death (Time & Place) */}
        <div className={`p-4 sm:p-5 rounded-xl border space-y-4 ${
          isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/70 border-neutral-200'
        }`}>
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-mono flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Story Milestones (Birth & Death)</span>
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Birth Time */}
            <CalendarTimePickerPopover
              id="input-character-birth-time"
              label="Birth Time / Era"
              type="birth"
              value={birthTime}
              onChange={(val) => {
                handleTextChange('birthTime', val, setBirthTime);
              }}
              timelineConfig={timelineConfig}
              isDarkMode={isDarkMode}
              placeholder="e.g. Year 418, 14th of Frostfall"
            />

            {/* Birth Place */}
            <div>
              <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-emerald-500" />
                <span>Birth Place / Homeland</span>
              </label>
              <input
                id="input-character-birth-place"
                type="text"
                value={birthPlace}
                onChange={(e) => {
                  handleTextChange('birthPlace', e.target.value, setBirthPlace);
                }}
                placeholder="e.g. Oakhaven Lower Ward"
                className={`w-full px-3 py-1.5 rounded-lg border text-xs transition-colors outline-none focus:ring-2 focus:ring-emerald-500 ${
                  isDarkMode 
                    ? 'bg-neutral-950 border-neutral-700 text-white placeholder-neutral-600' 
                    : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400'
                }`}
              />
            </div>

            {/* Death Time */}
            <CalendarTimePickerPopover
              id="input-character-death-time"
              label="Death Time / Era"
              type="death"
              value={deathTime}
              onChange={(val) => {
                handleTextChange('deathTime', val, setDeathTime);
              }}
              timelineConfig={timelineConfig}
              isDarkMode={isDarkMode}
              placeholder="e.g. Year 440, Siege of Ashen Gate"
            />

            {/* Death Place */}
            <div>
              <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-rose-500" />
                <span>Death Place / Final Resting</span>
              </label>
              <input
                id="input-character-death-place"
                type="text"
                value={deathPlace}
                onChange={(e) => {
                  handleTextChange('deathPlace', e.target.value, setDeathPlace);
                }}
                placeholder="e.g. The Ashen Gate"
                className={`w-full px-3 py-1.5 rounded-lg border text-xs transition-colors outline-none focus:ring-2 focus:ring-rose-500 ${
                  isDarkMode 
                    ? 'bg-neutral-950 border-neutral-700 text-white placeholder-neutral-600' 
                    : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Physical Appearance */}
        <div className={`p-4 sm:p-5 rounded-xl border space-y-2 ${
          isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/70 border-neutral-200'
        }`}>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 font-mono">
            Physical Traits & Distinguishing Marks
          </label>
          <textarea
            id="input-character-appearance"
            rows={2}
            value={appearance}
            onChange={(e) => {
              handleTextChange('appearance', e.target.value, setAppearance);
            }}
            placeholder="Height, build, eyes, scars, iconic clothing, mannerisms..."
            className={`w-full px-3.5 py-2.5 rounded-lg border text-xs leading-relaxed transition-colors outline-none focus:ring-2 focus:ring-blue-500 resize-y ${
              isDarkMode 
                ? 'bg-neutral-950 border-neutral-700 text-white placeholder-neutral-600' 
                : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400'
            }`}
          />
        </div>

        {/* Text Overview & Dossier (Rich character backstory, arc, psychology) */}
        <div className={`p-4 sm:p-5 rounded-xl border space-y-2.5 ${
          isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50/70 border-neutral-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-mono flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              <span>Character Dossier & Narrative Overview</span>
            </span>
            <span className="text-[11px] font-mono text-neutral-400">
              {wordCount} words
            </span>
          </div>

          <textarea
            id="input-character-overview"
            rows={8}
            value={overview}
            onChange={(e) => {
              handleTextChange('overview', e.target.value, setOverview);
            }}
            placeholder="Write character backstory, core internal motivation, conflicts, psychology, secrets, and planned narrative arc..."
            className={`w-full px-4 py-3 rounded-lg border text-sm leading-relaxed transition-colors outline-none focus:ring-2 focus:ring-blue-500 font-serif resize-y ${
              isDarkMode 
                ? 'bg-neutral-950 border-neutral-700 text-neutral-200 placeholder-neutral-600' 
                : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400'
            }`}
          />
        </div>

        {/* Author Notes / Secret Hooks */}
        <div className={`p-4 rounded-xl border space-y-2 ${
          isDarkMode ? 'bg-neutral-900/40 border-neutral-800/80' : 'bg-neutral-50/50 border-neutral-200/80'
        }`}>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 font-mono flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
            <span>Author Notes & Plot Twists</span>
          </label>
          <textarea
            id="input-character-notes"
            rows={2}
            value={notes}
            onChange={(e) => {
              handleTextChange('notes', e.target.value, setNotes);
            }}
            placeholder="Private notes for the writer (unrevealed ancestry, betrayal triggers, foreshadowing cues)..."
            className={`w-full px-3 py-2 rounded-lg border text-xs leading-relaxed transition-colors outline-none focus:ring-2 focus:ring-amber-500 font-mono resize-y ${
              isDarkMode 
                ? 'bg-neutral-950 border-neutral-700 text-neutral-300 placeholder-neutral-600' 
                : 'bg-white border-neutral-300 text-neutral-800 placeholder-neutral-400'
            }`}
          />
        </div>

        {/* APPEARS IN: Scenes where this character is detected (same layout as Codex entries) */}
        <div className={`p-4 rounded-xl border space-y-2.5 ${
          isDarkMode ? 'bg-neutral-900/40 border-neutral-800/80' : 'bg-neutral-50/50 border-neutral-200/80'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <FileText className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-mono truncate">
                Appears In
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold shrink-0">
              {documentsWithMentionStatus.filter((d) => d.isMentioned).length}{' '}
              {documentsWithMentionStatus.filter((d) => d.isMentioned).length === 1 ? 'scene' : 'scenes'}
            </span>
          </div>
          <p className="text-[11px] text-neutral-500 leading-snug">
            Scenes where this character is detected by name
          </p>

          {documents.length === 0 ? (
            <div className="p-3 rounded-xl border border-dashed text-center text-xs text-neutral-500 border-neutral-700">
              No documents created in this Mundus project yet.
            </div>
          ) : documentsGroupedByFolder.length === 0 ? (
            <div className="p-3 rounded-xl border border-dashed text-center text-xs text-neutral-500 border-neutral-700">
              No scenes currently mention this character.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {documentsGroupedByFolder.map((group) => {
                const isCollapsed = !!collapsedFolders[group.folderId];
                return (
                  <div
                    key={group.folderId}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden"
                  >
                    {/* Collapsible Folder Header */}
                    <button
                      type="button"
                      onClick={() => toggleFolderCollapse(group.folderId)}
                      className={`w-full px-3 py-2 text-xs font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isDarkMode ? 'bg-neutral-900/90 hover:bg-neutral-850' : 'bg-neutral-100 hover:bg-neutral-200/70'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        )}
                        <FolderIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="truncate">{group.folderName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono">
                        {group.mentionedCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            {group.mentionedCount} {group.mentionedCount === 1 ? 'scene' : 'scenes'}
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Folder Items (Detected scenes) */}
                    {!isCollapsed && (
                      <div className={`p-1.5 space-y-1 ${isDarkMode ? 'bg-black/20' : 'bg-white'}`}>
                        {group.items.map(({ doc, mentionReason }) => {
                          return (
                            <div
                              key={doc.id}
                              onClick={() => {
                                if (onSelectDocumentForEditor) {
                                  onSelectDocumentForEditor(doc.id);
                                }
                              }}
                              title="Click to open this scene in writing mode"
                              className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center justify-between gap-2 transition-all cursor-pointer hover:border-emerald-500/50 ${
                                isDarkMode
                                  ? 'border-neutral-800/80 bg-neutral-900/40 text-neutral-300 hover:bg-neutral-800/60'
                                  : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                <span className="font-medium truncate max-w-[220px]">
                                  {doc.title || 'Untitled Document'}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  <span>{mentionReason || 'Detected'}</span>
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
