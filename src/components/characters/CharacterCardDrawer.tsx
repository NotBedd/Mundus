import React, { useState, useMemo, useEffect } from 'react';
import { 
  User, 
  X, 
  Sparkles, 
  Shield, 
  Heart, 
  Users, 
  MapPin, 
  Calendar, 
  FileText, 
  Tag, 
  ChevronRight, 
  Search, 
  Layers, 
  Filter,
  Edit2,
  ExternalLink,
  Plus,
  Check,
  Palette,
  Eye,
  AlertCircle
} from 'lucide-react';
import type { Character, CharacterStatus, CharacterRelatives, CodexEntry } from '../../types';
import { matchesMention } from '../../lib/mentionDetection';
import { looksLikeCharacterId } from '../../utils/characterRelativesSync';

interface CharacterCardDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  characters: Character[];
  selectedCharacterId?: string | null;
  onSelectCharacterId?: (id: string) => void;
  isDarkMode: boolean;
  documentPlainText?: string;
  initialMode?: 'view' | 'create' | 'edit';
  initialName?: string;
  onCreateCharacter?: (charData: Partial<Character>) => Character | void;
  onUpdateCharacter?: (id: string, changes: Partial<Character>) => void;
  /** Optional codex data + creator: newly added factions/families auto-create linked Codex entries */
  codexEntries?: CodexEntry[];
  onCreateCodexEntry?: (entryData: Partial<CodexEntry>) => CodexEntry | void;
  onGoToCharactersMode?: (characterId?: string) => void;
}

const PRESET_BADGE_COLORS = [
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

const SUGGESTED_ROLES = [
  'Protagonist',
  'Antagonist',
  'Deuteragonist',
  'Supporting',
  'Mentor',
  'Rival',
  'Love Interest',
  'Comic Relief'
];

export const CharacterCardDrawer: React.FC<CharacterCardDrawerProps> = ({
  isOpen,
  onClose,
  characters = [],
  selectedCharacterId,
  onSelectCharacterId,
  isDarkMode,
  documentPlainText = '',
  initialMode = 'view',
  initialName = '',
  onCreateCharacter,
  onUpdateCharacter,
  codexEntries = [],
  onCreateCodexEntry,
  onGoToCharactersMode
}) => {
  const [mode, setMode] = useState<'view' | 'create' | 'edit'>(initialMode);
  const [searchQuery, setSearchQuery] = useState('');
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(selectedCharacterId || null);

  // Edit / Create form state
  const [formName, setFormName] = useState('');
  const [formAliases, setFormAliases] = useState('');
  const [formSex, setFormSex] = useState('Male');
  const [formStatus, setFormStatus] = useState<CharacterStatus>('alive');
  const [formAvatarColor, setFormAvatarColor] = useState('#8b5cf6');
  const [formRoles, setFormRoles] = useState<string[]>([]);
  const [roleInput, setRoleInput] = useState('');
  const [formFactions, setFormFactions] = useState<string[]>([]);
  const [factionInput, setFactionInput] = useState('');
  const [formFamilies, setFormFamilies] = useState<string[]>([]);
  const [familyInput, setFamilyInput] = useState('');
  const [formBirthTime, setFormBirthTime] = useState('');
  const [formBirthPlace, setFormBirthPlace] = useState('');
  const [formDeathTime, setFormDeathTime] = useState('');
  const [formDeathPlace, setFormDeathPlace] = useState('');
  const [formAppearance, setFormAppearance] = useState('');
  const [formOverview, setFormOverview] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formTags, setFormTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync internal selected ID when prop changes or drawer opens
  useEffect(() => {
    if (selectedCharacterId) {
      setInternalSelectedId(selectedCharacterId);
    }
  }, [selectedCharacterId]);

  // Sync initial mode & initial name
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      if (initialMode === 'create') {
        resetForm(initialName);
      }
    }
  }, [isOpen, initialMode, initialName]);

  const resetForm = (name: string = '') => {
    setFormName(name);
    setFormAliases('');
    setFormSex('Male');
    setFormStatus('alive');
    setFormAvatarColor('#8b5cf6');
    setFormRoles(['Supporting']);
    setRoleInput('');
    setFormFactions([]);
    setFactionInput('');
    setFormFamilies([]);
    setFamilyInput('');
    setFormBirthTime('');
    setFormBirthPlace('');
    setFormDeathTime('');
    setFormDeathPlace('');
    setFormAppearance('');
    setFormOverview('');
    setFormNotes('');
    setFormTags([]);
    setTagInput('');
    setSaveSuccess(false);
  };

  const populateFormWithChar = (char: Character) => {
    setFormName(char.name || '');
    setFormAliases(char.aliases || '');
    setFormSex(char.sex || 'Male');
    setFormStatus(char.status || 'alive');
    setFormAvatarColor(char.avatarColor || '#8b5cf6');
    setFormRoles(char.roles || []);
    setRoleInput('');
    setFormFactions(char.factions || []);
    setFactionInput('');
    setFormFamilies(char.families || []);
    setFamilyInput('');
    setFormBirthTime(char.birthTime || '');
    setFormBirthPlace(char.birthPlace || '');
    setFormDeathTime(char.deathTime || '');
    setFormDeathPlace(char.deathPlace || '');
    setFormAppearance(char.appearance || '');
    setFormOverview(char.overview || '');
    setFormNotes(char.notes || '');
    setFormTags(char.tags || []);
    setTagInput('');
    setSaveSuccess(false);
  };

  // Find characters mentioned in the document plain text.
  // All matching is whole-word based so aliases like "King" never match
  // inside other words such as "asking", "looking" or "making".
  const mentionedCharacterIds = useMemo(() => {
    const ids = new Set<string>();
    if (!documentPlainText || !documentPlainText.trim()) return ids;
    const lowerText = documentPlainText.toLowerCase();

    characters.forEach((char) => {
      if (!char.name) return;
      const fullName = char.name.toLowerCase().trim();

      // 1. Full name match (whole words only)
      if (matchesMention(lowerText, fullName)) {
        ids.add(char.id);
        return;
      }

      // 2. Individual name parts (e.g. "Kaelen" from "Kaelen Vance")
      const nameParts = fullName.split(/\s+/).filter((p) => p.length >= 3);
      if (nameParts.some((part) => matchesMention(lowerText, part))) {
        ids.add(char.id);
        return;
      }

      // 3. Aliases match (whole words only)
      if (char.aliases) {
        const aliasList = char.aliases.split(',').map((a) => a.trim().toLowerCase()).filter((a) => a.length >= 2);
        if (aliasList.some((alias) => matchesMention(lowerText, alias))) {
          ids.add(char.id);
        }
      }
    });

    return ids;
  }, [characters, documentPlainText]);

  // Determine active character
  const activeCharId = useMemo(() => {
    if (internalSelectedId && characters.some((c) => c.id === internalSelectedId)) {
      return internalSelectedId;
    }
    const detectedFirst = Array.from(mentionedCharacterIds)[0];
    if (detectedFirst) return detectedFirst;
    return characters[0]?.id || null;
  }, [internalSelectedId, mentionedCharacterIds, characters]);

  const activeChar = characters.find((c) => c.id === activeCharId);

  // v0.7.95: the drawer used to print raw relative references verbatim, so a
  // partner stored as an id showed up as "char-1729…" (a deleted character
  // kept "showing as a number"). Resolve references to character names, and
  // hide id-shaped references that resolve to nobody — those are dangling
  // pointers to a deleted character and can never be hand-typed names.
  const isDanglingCharRef = (ref?: string): boolean =>
    !!ref && looksLikeCharacterId(ref) && !characters.some((c) => c.id === ref);
  const resolveRelativeName = (idOrName?: string): string => {
    if (!idOrName) return '';
    const match = characters.find(
      (c) => c.id === idOrName || c.name.toLowerCase() === idOrName.toLowerCase()
    );
    return match ? match.name : idOrName;
  };

  // Filtered list of all characters according to search
  const filteredCharacters = useMemo(() => {
    if (!searchQuery.trim()) return characters;
    const q = searchQuery.toLowerCase().trim();
    return characters.filter((c) => 
      c.name.toLowerCase().includes(q) ||
      (c.aliases && c.aliases.toLowerCase().includes(q)) ||
      (c.roles && c.roles.some((r) => r.toLowerCase().includes(q))) ||
      (c.factions && c.factions.some((f) => f.toLowerCase().includes(q))) ||
      (c.families && c.families.some((fam) => fam.toLowerCase().includes(q)))
    );
  }, [characters, searchQuery]);

  /**
   * FACTIONS & FAMILIES <-> CODEX INTEGRATION
   * Any faction/family assigned here that does not yet exist in the Codex gets a
   * matching Codex entry created automatically ("Factions & Orders" /
   * "Houses & Dynasties" sections) and linked back to the character, so
   * worldbuilding data added from the card also appears in Lore mode.
   */
  const ensureCodexEntriesForTags = (
    kind: 'faction' | 'family',
    tagNames: string[],
    characterId: string,
    characterName: string
  ) => {
    if (!onCreateCodexEntry) return;
    const category = kind === 'faction' ? 'factions' : 'houses';
    tagNames.forEach((rawTag) => {
      const tagName = (rawTag || '').trim();
      if (!tagName) return;
      const normalized = tagName.toLowerCase();
      const alreadyExists = codexEntries.some(
        (e) => (e.category || '') === category && (e.title || '').trim().toLowerCase() === normalized
      );
      if (alreadyExists) return;
      onCreateCodexEntry({
        title: tagName,
        category,
        subtitle: kind === 'faction' ? `Faction — linked to ${characterName}` : `Family / House — linked to ${characterName}`,
        overview: '',
        content: '',
        themeColor: kind === 'faction' ? '#f59e0b' : '#3b82f6',
        tags: [],
        relatedCharacterIds: [characterId],
      });
    });
  };

  // Handle Save
  const handleSave = () => {
    if (!formName.trim()) return;

    if (mode === 'create') {
      const newCharData: Partial<Character> = {
        name: formName.trim(),
        aliases: formAliases.trim() || undefined,
        sex: formSex.trim() || 'Male',
        status: formStatus,
        avatarColor: formAvatarColor,
        roles: formRoles,
        factions: formFactions,
        families: formFamilies,
        birthTime: formBirthTime.trim() || undefined,
        birthPlace: formBirthPlace.trim() || undefined,
        deathTime: formDeathTime.trim() || undefined,
        deathPlace: formDeathPlace.trim() || undefined,
        appearance: formAppearance.trim() || undefined,
        overview: formOverview.trim(),
        notes: formNotes.trim() || undefined,
        tags: formTags,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const created = onCreateCharacter?.(newCharData);
      // Auto-create Codex entries for brand-new factions/families
      if (created && created.id) {
        ensureCodexEntriesForTags('faction', formFactions, created.id, created.name);
        ensureCodexEntriesForTags('family', formFamilies, created.id, created.name);
      }
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        if (created && created.id) {
          setInternalSelectedId(created.id);
          onSelectCharacterId?.(created.id);
        }
        setMode('view');
      }, 500);
    } else if (mode === 'edit' && activeChar) {
      onUpdateCharacter?.(activeChar.id, {
        name: formName.trim(),
        aliases: formAliases.trim() || undefined,
        sex: formSex.trim() || 'Male',
        status: formStatus,
        avatarColor: formAvatarColor,
        roles: formRoles,
        factions: formFactions,
        families: formFamilies,
        birthTime: formBirthTime.trim() || undefined,
        birthPlace: formBirthPlace.trim() || undefined,
        deathTime: formDeathTime.trim() || undefined,
        deathPlace: formDeathPlace.trim() || undefined,
        appearance: formAppearance.trim() || undefined,
        overview: formOverview.trim(),
        notes: formNotes.trim() || undefined,
        tags: formTags,
        updatedAt: new Date().toISOString()
      });

      // Auto-create Codex entries only for NEWLY-ADDED factions/families
      const previousFactions = new Set((activeChar.factions || []).map((f) => f.trim().toLowerCase()));
      const previousFamilies = new Set((activeChar.families || []).map((f) => f.trim().toLowerCase()));
      const addedFactions = formFactions.filter((f) => f.trim() && !previousFactions.has(f.trim().toLowerCase()));
      const addedFamilies = formFamilies.filter((f) => f.trim() && !previousFamilies.has(f.trim().toLowerCase()));
      ensureCodexEntriesForTags('faction', addedFactions, activeChar.id, formName.trim());
      ensureCodexEntriesForTags('family', addedFamilies, activeChar.id, formName.trim());

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setMode('view');
      }, 400);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Semi-transparent backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-2xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Right Sidebar Drawer */}
      <div 
        className={`relative w-full max-w-lg h-full shadow-2xl border-l flex flex-col z-10 animate-in slide-in-from-right duration-250 ${
          isDarkMode ? 'bg-[#121212] border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
        }`}
      >
        {/* Top Header */}
        <div className={`p-4 border-b flex items-center justify-between shrink-0 ${
          isDarkMode ? 'border-neutral-800 bg-[#161616]' : 'border-neutral-100 bg-neutral-50'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-display tracking-tight flex items-center gap-2">
                <span>{mode === 'create' ? 'Create Character' : mode === 'edit' ? 'Edit Character Card' : 'Character Dossier'}</span>
              </h3>
              <p className="text-[10px] text-neutral-400 font-mono">
                {mentionedCharacterIds.size} {mentionedCharacterIds.size === 1 ? 'character' : 'characters'} detected in text
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {mode === 'view' && (
              <button
                type="button"
                onClick={() => {
                  resetForm('');
                  setMode('create');
                }}
                className="px-2.5 py-1 rounded-lg border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                title="Create a new character"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New</span>
              </button>
            )}
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                isDarkMode 
                  ? 'border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800' 
                  : 'border-neutral-200 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
              }`}
              title="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Character Navigation Pills Header */}
        {mode === 'view' && (
          <div className={`px-4 py-2.5 border-b shrink-0 space-y-2 ${
            isDarkMode ? 'border-neutral-800 bg-[#141414]' : 'border-neutral-100 bg-neutral-100/60'
          }`}>
            {/* Horizontal Pill Selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-1">
              {characters.map((char) => {
                const isSelected = char.id === activeCharId;
                const isMentioned = mentionedCharacterIds.has(char.id);

                return (
                  <button
                    key={char.id}
                    onClick={() => {
                      setInternalSelectedId(char.id);
                      onSelectCharacterId?.(char.id);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 flex items-center gap-1.5 transition-all cursor-pointer border ${
                      isSelected
                        ? 'border-purple-500 text-purple-400 bg-purple-500/15 font-bold shadow-2xs'
                        : isMentioned
                        ? isDarkMode 
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20' 
                          : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                        : isDarkMode 
                          ? 'bg-neutral-850 border-neutral-800 text-neutral-400 hover:text-neutral-200' 
                          : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {isMentioned && <Sparkles className="w-3 h-3 text-amber-400" />}
                    <span>{char.name}</span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  resetForm('');
                  setMode('create');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 flex items-center gap-1 transition-all cursor-pointer border border-dashed ${
                  isDarkMode 
                    ? 'border-neutral-700 text-neutral-400 hover:border-purple-500/50 hover:text-purple-300 bg-neutral-900/50' 
                    : 'border-neutral-300 text-neutral-500 hover:border-purple-400 hover:text-purple-600 bg-white'
                }`}
              >
                <Plus className="w-3 h-3" />
                <span>New Character</span>
              </button>
            </div>
          </div>
        )}

        {/* Body Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {mode === 'view' && activeChar ? (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Header Box: Avatar, Name, Status, Action Buttons */}
              <div className={`p-4 rounded-2xl border space-y-3.5 ${
                isDarkMode ? 'bg-neutral-900/80 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {activeChar.avatarUrl ? (
                      <img
                        src={activeChar.avatarUrl}
                        alt={activeChar.name}
                        className="w-13 h-13 rounded-2xl object-cover border border-purple-500/40 shadow-xs shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div 
                        className="w-13 h-13 rounded-2xl border flex items-center justify-center text-lg font-bold font-display shadow-xs shrink-0"
                        style={{
                          backgroundColor: activeChar.avatarColor ? `${activeChar.avatarColor}25` : 'rgba(139,92,246,0.2)',
                          borderColor: activeChar.avatarColor || '#8b5cf6',
                          color: activeChar.avatarColor || '#a78bfa'
                        }}
                      >
                        {activeChar.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-bold font-display leading-tight text-neutral-100 dark:text-white break-words">
                        {activeChar.name}
                      </h2>
                      {activeChar.aliases && (
                        <p className="text-xs text-neutral-400 italic font-serif break-words">
                          "{activeChar.aliases}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold capitalize border shrink-0 ${
                    activeChar.status === 'alive'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : activeChar.status === 'deceased'
                      ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : activeChar.status === 'missing'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      : 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20'
                  }`}>
                    {activeChar.status}
                  </span>
                </div>

                {/* Action Buttons Bar: Characters Mode & Edit */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800/40">
                  {onGoToCharactersMode && (
                    <button
                      type="button"
                      onClick={() => {
                        onGoToCharactersMode(activeChar.id);
                        onClose();
                      }}
                      className="px-2.5 py-1 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-750 text-neutral-200 hover:text-white text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="Open full dossier in Characters Mode"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Characters Mode</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      populateFormWithChar(activeChar);
                      setMode('edit');
                    }}
                    className="px-2.5 py-1 rounded-lg border border-purple-500/40 bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    title="Edit character details"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-purple-400" />
                    <span>Edit</span>
                  </button>
                </div>
              </div>

              {/* Attributes Section: Sex, Roles, Factions, Families, Tags */}
              <div className={`p-4 rounded-2xl border space-y-2.5 text-xs ${
                isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-white border-neutral-200'
              }`}>
                {activeChar.sex && (
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-400 text-[10px] font-mono uppercase tracking-wider font-bold w-18 shrink-0">
                      SEX
                    </span>
                    <span className="font-semibold text-neutral-200">{activeChar.sex}</span>
                  </div>
                )}

                {activeChar.roles && activeChar.roles.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-400 text-[10px] font-mono uppercase tracking-wider font-bold w-18 shrink-0 mt-1">
                      ROLES
                    </span>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {activeChar.roles.map((r, idx) => (
                        <span 
                          key={idx} 
                          className={`px-2 py-0.5 rounded-lg border text-xs font-medium ${
                            isDarkMode ? 'bg-neutral-800/80 border-neutral-700 text-neutral-200' : 'bg-neutral-200/80 border-neutral-300 text-neutral-800'
                          }`}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {activeChar.factions && activeChar.factions.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-400 text-[10px] font-mono uppercase tracking-wider font-bold w-18 shrink-0 mt-1">
                      FACTIONS
                    </span>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {activeChar.factions.map((f, idx) => (
                        <span 
                          key={idx} 
                          className="px-2 py-0.5 rounded-lg bg-purple-500/10 border border-purple-500/25 text-xs text-purple-300 font-medium"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {activeChar.families && activeChar.families.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-400 text-[10px] font-mono uppercase tracking-wider font-bold w-18 shrink-0 mt-1">
                      FAMILY
                    </span>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {activeChar.families.map((fam, idx) => (
                        <span 
                          key={idx} 
                          className="px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/25 text-xs text-blue-300 font-medium"
                        >
                          {fam}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {activeChar.tags && activeChar.tags.length > 0 && (
                  <div className="flex items-start gap-2 pt-1 border-t border-neutral-800/30">
                    <span className="text-neutral-400 text-[10px] font-mono uppercase tracking-wider font-bold w-18 shrink-0 mt-1">
                      TAGS
                    </span>
                    <div className="flex flex-wrap gap-1 flex-1">
                      {activeChar.tags.map((t) => (
                        <span 
                          key={t}
                          className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-neutral-800 text-neutral-400 border border-neutral-700/60"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Timeline & Origins Section */}
              {(activeChar.birthTime || activeChar.birthPlace || activeChar.deathTime || activeChar.deathPlace) && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-500" />
                    <span>Timeline & Origins</span>
                  </h4>
                  <div className={`p-3.5 rounded-2xl border text-xs space-y-2.5 font-mono ${
                    isDarkMode ? 'bg-neutral-900/60 border-neutral-800 text-neutral-300' : 'bg-white border-neutral-200 text-neutral-800'
                  }`}>
                    {(activeChar.birthTime || activeChar.birthPlace) && (
                      <div className="flex items-start gap-2.5">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] text-neutral-400 block uppercase font-bold">Birth</span>
                          <span className="text-neutral-200 font-semibold">{[activeChar.birthTime, activeChar.birthPlace].filter(Boolean).join(' · ')}</span>
                        </div>
                      </div>
                    )}
                    {(activeChar.deathTime || activeChar.deathPlace) && (
                      <div className="flex items-start gap-2.5 pt-2 border-t border-neutral-800/40">
                        <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] text-neutral-400 block uppercase font-bold">Death</span>
                          <span className="text-neutral-200 font-semibold">{[activeChar.deathTime, activeChar.deathPlace].filter(Boolean).join(' · ')}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Kin & Relatives (if any exist). v0.7.95: references resolve to
                  character names, dangling id-shaped refs are hidden, and the
                  missing Siblings row is rendered again. */}
              {(() => {
                const rel = activeChar.relatives || {};
                const kinFather = rel.father && !isDanglingCharRef(rel.father) ? rel.father : '';
                const kinMother = rel.mother && !isDanglingCharRef(rel.mother) ? rel.mother : '';
                const kinPartners = (rel.partners || []).filter((p) => !isDanglingCharRef(p));
                const kinSiblings = (rel.siblings || []).filter((s) => !isDanglingCharRef(s));
                const kinChildren = (rel.children || []).filter((c) => !isDanglingCharRef(c));
                if (!kinFather && !kinMother && kinPartners.length === 0 && kinSiblings.length === 0 && kinChildren.length === 0) return null;
                return (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400 flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-pink-400" />
                    <span>Family & Lineage</span>
                  </h4>
                  <div className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
                    isDarkMode ? 'bg-neutral-900/60 border-neutral-800 text-neutral-300' : 'bg-white border-neutral-200 text-neutral-800'
                  }`}>
                    {kinFather && (
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-400 text-[10px] font-mono uppercase w-16 shrink-0">Father:</span>
                        <span className="font-semibold text-neutral-200">{resolveRelativeName(kinFather)}</span>
                      </div>
                    )}
                    {kinMother && (
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-400 text-[10px] font-mono uppercase w-16 shrink-0">Mother:</span>
                        <span className="font-semibold text-neutral-200">{resolveRelativeName(kinMother)}</span>
                      </div>
                    )}
                    {kinPartners.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-400 text-[10px] font-mono uppercase w-16 shrink-0">Partner(s):</span>
                        <span className="font-semibold text-neutral-200">{kinPartners.map(resolveRelativeName).join(', ')}</span>
                      </div>
                    )}
                    {kinSiblings.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-400 text-[10px] font-mono uppercase w-16 shrink-0">Siblings:</span>
                        <span className="font-semibold text-neutral-200">{kinSiblings.map(resolveRelativeName).join(', ')}</span>
                      </div>
                    )}
                    {kinChildren.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-400 text-[10px] font-mono uppercase w-16 shrink-0">Children:</span>
                        <span className="font-semibold text-neutral-200">{kinChildren.map(resolveRelativeName).join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>
                );
              })()}

              {/* Appearance & Distinguishing Traits */}
              {activeChar.appearance && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-purple-400 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-purple-400" />
                    <span>Appearance & Distinguishing Traits</span>
                  </h4>
                  <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed ${
                    isDarkMode ? 'bg-neutral-900/60 border-neutral-800 text-neutral-300' : 'bg-white border-neutral-200 text-neutral-800'
                  }`}>
                    {activeChar.appearance}
                  </div>
                </div>
              )}

              {/* Biography / Narrative Arc */}
              {activeChar.overview && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-accent" />
                    <span>Character Biography & Narrative Arc</span>
                  </h4>
                  <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed font-serif ${
                    isDarkMode ? 'bg-neutral-900/60 border-neutral-800 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
                  }`}>
                    {activeChar.overview}
                  </div>
                </div>
              )}

              {/* Author Notes & Plot Twists */}
              {activeChar.notes && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-amber-400 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Author Notes & Plot Twists</span>
                  </h4>
                  <div className={`p-3.5 rounded-2xl border text-xs leading-relaxed font-serif italic ${
                    isDarkMode ? 'bg-amber-500/5 border-amber-500/20 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}>
                    {activeChar.notes}
                  </div>
                </div>
              )}

              {/* Metadata Footer */}
              <div className="pt-2 border-t border-neutral-800/60 flex items-center justify-between text-[10px] font-mono text-neutral-500">
                <span>Updated: {activeChar.updatedAt ? new Date(activeChar.updatedAt).toLocaleDateString() : 'Recent'}</span>
                <span className="truncate max-w-[140px]">ID: {activeChar.id}</span>
              </div>
            </div>
          ) : mode === 'create' || mode === 'edit' ? (
            /* Character Create / Edit Form */
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Form Card */}
              <div className={`p-4 rounded-2xl border space-y-4 ${
                isDarkMode ? 'bg-neutral-900/80 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
              }`}>
                {/* Character Name */}
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1 font-bold">
                    Character Name *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Julius Thorne"
                    className={`w-full text-sm p-2.5 rounded-xl border focus:outline-none focus:border-purple-500 font-semibold ${
                      isDarkMode ? 'bg-neutral-950 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                    }`}
                  />
                </div>

                {/* Aliases & Titles */}
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1 font-bold">
                    Aliases & Titles (comma separated)
                  </label>
                  <input
                    type="text"
                    value={formAliases}
                    onChange={(e) => setFormAliases(e.target.value)}
                    placeholder="e.g. The Silver Fox, Commander of the North"
                    className={`w-full text-xs p-2 rounded-xl border focus:outline-none focus:border-purple-500 ${
                      isDarkMode ? 'bg-neutral-950 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                    }`}
                  />
                </div>

                {/* Sex & Status Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1 font-bold">
                      Sex / Gender
                    </label>
                    <select
                      value={formSex}
                      onChange={(e) => setFormSex(e.target.value)}
                      className={`w-full text-xs p-2 rounded-xl border focus:outline-none focus:border-purple-500 ${
                        isDarkMode ? 'bg-neutral-950 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                      }`}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Other">Other</option>
                      <option value="Unknown">Unknown</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1 font-bold">
                      Status
                    </label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as CharacterStatus)}
                      className={`w-full text-xs p-2 rounded-xl border focus:outline-none focus:border-purple-500 ${
                        isDarkMode ? 'bg-neutral-950 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                      }`}
                    >
                      <option value="alive">Alive</option>
                      <option value="deceased">Deceased</option>
                      <option value="missing">Missing</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  </div>
                </div>

                {/* Color Swatches */}
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1.5 font-bold">
                    Card Badge Accent Color
                  </label>
                  <div className="flex items-center gap-2">
                    {PRESET_BADGE_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setFormAvatarColor(c)}
                        className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                          formAvatarColor === c ? 'scale-115 border-white shadow-md' : 'border-transparent opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                {/* Roles Multi-tags */}
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1 font-bold">
                    Roles & Archetypes
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {formRoles.map((r, idx) => (
                      <span 
                        key={idx} 
                        className="px-2 py-0.5 rounded-lg bg-neutral-800 text-neutral-200 border border-neutral-700 text-xs flex items-center gap-1"
                      >
                        <span>{r}</span>
                        <button
                          type="button"
                          onClick={() => setFormRoles(formRoles.filter((_, i) => i !== idx))}
                          className="hover:text-red-400 cursor-pointer"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={roleInput}
                      onChange={(e) => setRoleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && roleInput.trim()) {
                          e.preventDefault();
                          if (!formRoles.includes(roleInput.trim())) {
                            setFormRoles([...formRoles, roleInput.trim()]);
                          }
                          setRoleInput('');
                        }
                      }}
                      placeholder="Add role and press Enter..."
                      className={`flex-1 text-xs p-2 rounded-xl border focus:outline-none focus:border-purple-500 ${
                        isDarkMode ? 'bg-neutral-950 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (roleInput.trim() && !formRoles.includes(roleInput.trim())) {
                          setFormRoles([...formRoles, roleInput.trim()]);
                          setRoleInput('');
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-semibold hover:bg-purple-500/25 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                  {/* Quick role suggestions */}
                  <div className="flex flex-wrap gap-1 pt-1.5">
                    {SUGGESTED_ROLES.filter((sr) => !formRoles.includes(sr)).slice(0, 4).map((sr) => (
                      <button
                        key={sr}
                        type="button"
                        onClick={() => setFormRoles([...formRoles, sr])}
                        className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-neutral-800/60 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-700/40 cursor-pointer"
                      >
                        + {sr}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Factions & Families */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1 font-bold">
                      Factions / Affiliations
                    </label>
                    <input
                      type="text"
                      value={factionInput}
                      onChange={(e) => setFactionInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && factionInput.trim()) {
                          e.preventDefault();
                          if (!formFactions.includes(factionInput.trim())) {
                            setFormFactions([...formFactions, factionInput.trim()]);
                          }
                          setFactionInput('');
                        }
                      }}
                      placeholder="Add faction & press Enter"
                      className={`w-full text-xs p-2 rounded-xl border focus:outline-none focus:border-purple-500 ${
                        isDarkMode ? 'bg-neutral-950 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                      }`}
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {formFactions.map((f, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-300 flex items-center gap-1">
                          <span>{f}</span>
                          <button type="button" onClick={() => setFormFactions(formFactions.filter((_, idx) => idx !== i))} className="hover:text-red-400 cursor-pointer">×</button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1 font-bold">
                      Family / Lineage
                    </label>
                    <input
                      type="text"
                      value={familyInput}
                      onChange={(e) => setFamilyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && familyInput.trim()) {
                          e.preventDefault();
                          if (!formFamilies.includes(familyInput.trim())) {
                            setFormFamilies([...formFamilies, familyInput.trim()]);
                          }
                          setFamilyInput('');
                        }
                      }}
                      placeholder="Add house/family & press Enter"
                      className={`w-full text-xs p-2 rounded-xl border focus:outline-none focus:border-purple-500 ${
                        isDarkMode ? 'bg-neutral-950 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                      }`}
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {formFamilies.map((fam, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-300 flex items-center gap-1">
                          <span>{fam}</span>
                          <button type="button" onClick={() => setFormFamilies(formFamilies.filter((_, idx) => idx !== i))} className="hover:text-red-400 cursor-pointer">×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Timeline: Birth & Death */}
                <div className="space-y-2 pt-2 border-t border-neutral-800/40">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block font-bold">
                    Timeline & Origins
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={formBirthTime}
                      onChange={(e) => setFormBirthTime(e.target.value)}
                      placeholder="Birth Year/Time (e.g. -3)"
                      className={`text-xs p-2 rounded-xl border focus:outline-none focus:border-purple-500 ${
                        isDarkMode ? 'bg-neutral-950 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                      }`}
                    />
                    <input
                      type="text"
                      value={formBirthPlace}
                      onChange={(e) => setFormBirthPlace(e.target.value)}
                      placeholder="Birth Place (e.g. Oakhaven)"
                      className={`text-xs p-2 rounded-xl border focus:outline-none focus:border-purple-500 ${
                        isDarkMode ? 'bg-neutral-950 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                      }`}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={formDeathTime}
                      onChange={(e) => setFormDeathTime(e.target.value)}
                      placeholder="Death Year/Time (e.g. 24)"
                      className={`text-xs p-2 rounded-xl border focus:outline-none focus:border-purple-500 ${
                        isDarkMode ? 'bg-neutral-950 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                      }`}
                    />
                    <input
                      type="text"
                      value={formDeathPlace}
                      onChange={(e) => setFormDeathPlace(e.target.value)}
                      placeholder="Death Place"
                      className={`text-xs p-2 rounded-xl border focus:outline-none focus:border-purple-500 ${
                        isDarkMode ? 'bg-neutral-950 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                      }`}
                    />
                  </div>
                </div>

                {/* Appearance */}
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1 font-bold">
                    Physical Appearance & Distinguishing Traits
                  </label>
                  <textarea
                    rows={2}
                    value={formAppearance}
                    onChange={(e) => setFormAppearance(e.target.value)}
                    placeholder="Tall, scarred left cheek, obsidian hair, piercing hazel eyes..."
                    className={`w-full text-xs p-2 rounded-xl border focus:outline-none focus:border-purple-500 resize-none ${
                      isDarkMode ? 'bg-neutral-950 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                    }`}
                  />
                </div>

                {/* Biography / Narrative Arc */}
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1 font-bold">
                    Character Biography & Narrative Arc
                  </label>
                  <textarea
                    rows={4}
                    value={formOverview}
                    onChange={(e) => setFormOverview(e.target.value)}
                    placeholder="Key character backstory, motivations, goals, and role in the story..."
                    className={`w-full text-xs p-2 rounded-xl border focus:outline-none focus:border-purple-500 resize-y font-serif ${
                      isDarkMode ? 'bg-neutral-950 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                    }`}
                  />
                </div>

                {/* Author Notes & Plot Twists */}
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-amber-400 block mb-1 font-bold flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    <span>Author Notes & Plot Twists</span>
                  </label>
                  <textarea
                    rows={2}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Secret lineage, future betrayal arc, hidden magical heirloom..."
                    className={`w-full text-xs p-2 rounded-xl border focus:outline-none focus:border-amber-500/60 font-serif italic ${
                      isDarkMode ? 'bg-amber-500/5 border-amber-500/30 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-900'
                    }`}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800/60">
                  <button
                    type="button"
                    onClick={() => {
                      if (activeChar) {
                        setMode('view');
                      } else {
                        onClose();
                      }
                    }}
                    className="px-4 py-2 rounded-xl border border-neutral-700 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!formName.trim()}
                    className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md hover:shadow-purple-500/20 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {saveSuccess ? <Check className="w-3.5 h-3.5" /> : null}
                    <span>{saveSuccess ? 'Saved!' : mode === 'create' ? 'Save Character' : 'Save Changes'}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-neutral-400 space-y-3">
              <User className="w-10 h-10 mx-auto text-neutral-600" />
              <p className="text-xs">No character selected or found.</p>
              <button
                type="button"
                onClick={() => {
                  resetForm('');
                  setMode('create');
                }}
                className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Character</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
