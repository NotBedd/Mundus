import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  Filter, 
  Shield, 
  Home, 
  Tag, 
  X, 
  Sparkles, 
  Calendar, 
  MapPin, 
  FileText,
  SlidersHorizontal,
  ArrowUpDown,
  BookOpen,
  ChevronDown,
  ChevronRight,
  UserPlus,
  GitFork,
  Heart
} from 'lucide-react';
import type { Character, CharacterStatus, CodexEntry, TimelineConfig, NovelDocument, Folder } from '../../types';
import { APP_VERSION } from '../../constants';
import { CharacterDetailView } from './CharacterDetailView';
import { FamilyTreeGraph } from './FamilyTreeGraph';

/**
 * MultiGenreCharactersEmblem:
 * High-craft monochromatic emblem depicting three characters in depth:
 * - Left: Fantasy knight with a crested helm & visor slit
 * - Center: Contemporary character with modern haircut and collar
 * - Right: Sci-Fi character with sleek curved visor helmet & comms antenna
 * Symbolizes Mundus's versatility across fantasy, sci-fi, and contemporary fiction.
 */
const MultiGenreCharactersEmblem: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => (
  <svg 
    viewBox="0 0 36 36" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className="w-6 h-6 shrink-0"
    aria-hidden="true"
  >
    {/* Left: Fantasy Knight Character with Crested Helm & Visor */}
    <g className={isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}>
      {/* Fantasy Helm Crown / Crest */}
      <path 
        d="M6 14.5L9 8.5L12 11.5L15 7.5L14 14.5H6Z" 
        fill="currentColor" 
        fillOpacity="0.25" 
        stroke="currentColor" 
        strokeWidth="1.2" 
        strokeLinejoin="round" 
      />
      {/* Helm Visor Slit */}
      <path d="M7 16.5H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      {/* Fantasy Shoulder Armor / Pauldron */}
      <path d="M4 29C4 23.5 7.5 20.5 12.5 20.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </g>

    {/* Right: Sci-Fi Astronaut/Cyber Character with Visor & Comms */}
    <g className={isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}>
      {/* Sci-Fi Spherical Helm */}
      <circle 
        cx="26" 
        cy="13" 
        r="6" 
        fill="currentColor" 
        fillOpacity="0.15" 
        stroke="currentColor" 
        strokeWidth="1.2" 
      />
      {/* Cyber Visor Curve */}
      <path 
        d="M22.5 13.5C23.5 12 28 12 29.5 13.5" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
      />
      {/* Comms Antenna */}
      <path d="M30 8.5L32 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      {/* Sci-Fi Suit Shoulders */}
      <path d="M23.5 20.5C28.5 20.5 32 23.5 32 29" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </g>

    {/* Center Foreground: Contemporary Protagonist */}
    <g className={isDarkMode ? 'text-neutral-100' : 'text-neutral-900'}>
      {/* Contemporary Head Silhouette */}
      <circle 
        cx="18" 
        cy="12" 
        r="4.6" 
        fill={isDarkMode ? '#171717' : '#ffffff'} 
        stroke="currentColor" 
        strokeWidth="1.5" 
      />
      {/* Modern Hair Part & Texture */}
      <path 
        d="M14 11.5C14.5 8 19.5 7 21.8 9.2C20 9.8 18.5 9.8 16 11.5" 
        fill="currentColor" 
        stroke="currentColor" 
        strokeWidth="0.8" 
      />
      {/* Modern Shoulders & V-Neck / Jacket Lapel */}
      <path 
        d="M10.5 29C10.5 23.5 13.5 20 18 20C22.5 20 25.5 23.5 25.5 29" 
        fill={isDarkMode ? '#171717' : '#ffffff'} 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
      />
      <path 
        d="M16 20L18 23.5L20 20" 
        stroke="currentColor" 
        strokeWidth="1.3" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
    </g>
  </svg>
);

interface CharactersModeProps {
  characters: Character[];
  initialCharacterId?: string | null;
  codexEntries?: CodexEntry[];
  timelineConfig?: TimelineConfig;
  documents?: NovelDocument[];
  folders?: Folder[];
  imgbbApiKey?: string;
  onOpenSettings?: () => void;
  onCreateCharacter: () => void;
  onUpdateCharacter: (id: string, changes: Partial<Character>) => void;
  onDeleteCharacter: (id: string) => void;
  onDuplicateCharacter: (char: Character) => void;
  /** Optional: create a Codex entry (factions/families added on character cards auto-create Codex entries) */
  onCreateCodexEntry?: (entryData: Partial<CodexEntry>) => CodexEntry | void;
  onReturnToEditor: () => void;
  onSelectDocumentForEditor?: (docId: string) => void;
  isDarkMode: boolean;
}

type GroupViewMode = 'all' | 'factions' | 'families' | 'graph';
type SortOption = 'recent' | 'name-asc' | 'name-desc' | 'created' | 'created-asc';

export const CharactersMode: React.FC<CharactersModeProps> = ({
  characters,
  initialCharacterId = null,
  codexEntries = [],
  timelineConfig,
  documents = [],
  folders = [],
  imgbbApiKey,
  onOpenSettings,
  onCreateCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
  onDuplicateCharacter,
  onCreateCodexEntry,
  onReturnToEditor,
  onSelectDocumentForEditor,
  isDarkMode
}) => {
  // Selected character for detailed inspection / editing
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(initialCharacterId);

  // Search query
  const [searchQuery, setSearchQuery] = useState('');

  // Grouping mode: All vs Divided by Factions vs Divided by Families
  const [groupViewMode, setGroupViewMode] = useState<GroupViewMode>('all');

  // Exclusive Tag Filter: Character must match ALL selected tags
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);

  // Status Filter
  const [statusFilter, setStatusFilter] = useState<'all' | CharacterStatus>('all');

  // Sort Option
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  // Collapsed sections in grouped view
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Collect all unique factions, families, and general tags across all characters AND Codex entries
  const { allFactions, allFamilies, allGeneralTags } = useMemo(() => {
    const factionSet = new Set<string>();
    const familySet = new Set<string>();
    const tagSet = new Set<string>();

    characters.forEach((c) => {
      (c.factions || []).forEach((f) => f && factionSet.add(f));
      (c.families || []).forEach((fam) => fam && familySet.add(fam));
      (c.tags || []).forEach((t) => t && tagSet.add(t));
      (c.roles || []).forEach((r) => r && tagSet.add(r));
    });

    (codexEntries || []).forEach((entry) => {
      const cat = (entry.category || '').toLowerCase().trim();
      if ((cat === 'factions' || cat === 'orders' || cat === 'factions & orders' || cat.includes('faction') || cat.includes('order') || cat.includes('guild') || cat.includes('alliance')) && entry.title) {
        factionSet.add(entry.title.trim());
      }
      if ((cat === 'houses' || cat === 'dynasties' || cat === 'houses & dynasties' || cat.includes('house') || cat.includes('dynast') || cat.includes('clan') || cat.includes('lineage') || cat.includes('family')) && entry.title) {
        familySet.add(entry.title.trim());
      }
      (entry.tags || []).forEach((t) => t && tagSet.add(t.trim()));
    });

    return {
      allFactions: Array.from(factionSet).filter(Boolean).sort(),
      allFamilies: Array.from(familySet).filter(Boolean).sort(),
      allGeneralTags: Array.from(tagSet).filter(Boolean).sort()
    };
  }, [characters, codexEntries]);

  // Toggle tag in exclusive filter list
  const toggleFilterTag = (tag: string) => {
    setSelectedFilterTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag);
      }
      return [...prev, tag];
    });
  };

  const clearAllFilters = () => {
    setSelectedFilterTags([]);
    setStatusFilter('all');
    setSearchQuery('');
  };

  // Filter and sort characters
  const filteredCharacters = useMemo(() => {
    return characters.filter((char) => {
      // 1. Text Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = char.name.toLowerCase().includes(q);
        const matchesAliases = (char.aliases || '').toLowerCase().includes(q);
        const matchesOverview = (char.overview || '').toLowerCase().includes(q);
        const matchesRoles = (char.roles || []).some((r) => r.toLowerCase().includes(q));
        const matchesFactions = (char.factions || []).some((f) => f.toLowerCase().includes(q));
        const matchesFamilies = (char.families || []).some((fam) => fam.toLowerCase().includes(q));
        const matchesTags = (char.tags || []).some((t) => t.toLowerCase().includes(q));

        if (!matchesName && !matchesAliases && !matchesOverview && !matchesRoles && !matchesFactions && !matchesFamilies && !matchesTags) {
          return false;
        }
      }

      // 2. Status filter
      if (statusFilter !== 'all' && char.status !== statusFilter) {
        return false;
      }

      // 3. EXCLUSIVE TAG FILTERING (AND LOGIC)
      // "the tags should be exclusive though, so for example if a character has tag x but not y,
      // if i select for x and y that character shuoldnt show."
      if (selectedFilterTags.length > 0) {
        const charAllTags = [
          ...(char.factions || []),
          ...(char.families || []),
          ...(char.tags || []),
          ...(char.roles || [])
        ];

        const matchesAllSelectedTags = selectedFilterTags.every((filterTag) =>
          charAllTags.includes(filterTag)
        );

        if (!matchesAllSelectedTags) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'name-asc') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'name-desc') {
        return b.name.localeCompare(a.name);
      }
      if (sortBy === 'created') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'created-asc') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      // default: recent (updatedAt)
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [characters, searchQuery, statusFilter, selectedFilterTags, sortBy]);

  // Group characters by Factions
  const factionGroups = useMemo(() => {
    const groups: { name: string; characters: Character[] }[] = [];
    const assignedIds = new Set<string>();

    allFactions.forEach((factionName) => {
      const charsInFaction = filteredCharacters.filter((c) =>
        (c.factions || []).includes(factionName)
      );
      if (charsInFaction.length > 0) {
        groups.push({ name: factionName, characters: charsInFaction });
        charsInFaction.forEach((c) => assignedIds.add(c.id));
      }
    });

    const unassigned = filteredCharacters.filter((c) => (c.factions || []).length === 0);
    if (unassigned.length > 0) {
      groups.push({ name: 'Independent / Unaligned', characters: unassigned });
    }

    return groups;
  }, [allFactions, filteredCharacters]);

  // Group characters by Families
  const familyGroups = useMemo(() => {
    const groups: { name: string; characters: Character[] }[] = [];

    allFamilies.forEach((familyName) => {
      const charsInFamily = filteredCharacters.filter((c) =>
        (c.families || []).includes(familyName)
      );
      if (charsInFamily.length > 0) {
        groups.push({ name: familyName, characters: charsInFamily });
      }
    });

    const unassigned = filteredCharacters.filter((c) => (c.families || []).length === 0);
    if (unassigned.length > 0) {
      groups.push({ name: 'Unrecorded Lineage / Solitary', characters: unassigned });
    }

    return groups;
  }, [allFamilies, filteredCharacters]);

  // Selected character object
  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId);

  const toggleGroupCollapse = (groupName: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  const getInitials = (n: string) => {
    if (!n) return '?';
    const parts = n.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const resolveRelativeName = (idOrName?: string) => {
    if (!idOrName) return '';
    const match = characters.find((c) => c.id === idOrName || c.name.toLowerCase() === idOrName.toLowerCase());
    return match ? match.name : idOrName;
  };

  const hasRelatives = (char: Character) => {
    return !!(
      char.relatives?.father ||
      char.relatives?.mother ||
      (char.relatives?.partners && char.relatives.partners.length > 0) ||
      (char.relatives?.siblings && char.relatives.siblings.length > 0) ||
      (char.relatives?.children && char.relatives.children.length > 0)
    );
  };

  // Render a single character card
  const renderCharacterCard = (char: Character) => {
    const isSelected = char.id === selectedCharacterId;

    return (
      <div
        key={char.id}
        id={`character-card-${char.id}`}
        onClick={() => setSelectedCharacterId(char.id)}
        className={`p-4 rounded-xl border transition-all cursor-pointer text-left flex flex-col justify-between group relative overflow-hidden ${
          isSelected
            ? isDarkMode
              ? 'bg-neutral-850 border-accent shadow-md shadow-accent/20'
              : 'bg-accent/10 border-accent/40 shadow-md shadow-accent/10'
            : isDarkMode
            ? 'bg-[#141414] border-neutral-800/90 hover:border-neutral-700 hover:bg-[#181818]'
            : 'bg-white border-neutral-200/90 hover:border-neutral-300 hover:shadow-xs'
        }`}
      >
        {/* Accent strip on top */}
        <div 
          className="absolute top-0 left-0 right-0 h-1 opacity-75 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: char.avatarColor || '#3b82f6' }}
        />

        <div>
          {/* Card Header: Avatar, Name, Status */}
          <div className="flex items-start justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              {char.avatarUrl ? (
                <img
                  src={char.avatarUrl}
                  alt={char.name}
                  className="w-9 h-9 rounded-lg object-cover shadow-xs shrink-0 border border-neutral-200 dark:border-neutral-700"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div 
                  className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-xs shadow-xs shrink-0 tracking-wider"
                  style={{ backgroundColor: char.avatarColor || '#3b82f6' }}
                >
                  {getInitials(char.name)}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate font-display group-hover:text-accent transition-colors">
                  {char.name}
                </h3>
                {char.aliases && (
                  <p className="text-[11px] text-neutral-400 dark:text-neutral-500 truncate">
                    {char.aliases}
                  </p>
                )}
              </div>
            </div>

            <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider shrink-0 ${
              char.status === 'alive'
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : char.status === 'deceased'
                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                : char.status === 'missing'
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                : 'bg-accent/15 text-accent dark:text-accent border border-accent/20'
            }`}>
              {char.status}
            </span>
          </div>

          {/* Factions & Families Tags */}
          <div className="flex flex-wrap gap-1 mb-2">
            {(char.factions || []).map((f) => (
              <span 
                key={f}
                className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/20 flex items-center gap-1 font-medium"
              >
                <Shield className="w-2.5 h-2.5 text-amber-500" />
                <span>{f}</span>
              </span>
            ))}
            {(char.families || []).map((fam) => (
              <span 
                key={fam}
                className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent dark:text-accent border border-accent/20 flex items-center gap-1 font-medium"
              >
                <Home className="w-2.5 h-2.5 text-accent" />
                <span>{fam}</span>
              </span>
            ))}
            {(char.roles || []).slice(0, 2).map((r) => (
              <span 
                key={r}
                className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent dark:text-accent border border-accent/20 font-medium"
              >
                {r}
              </span>
            ))}
          </div>

          {/* Relatives Summary (Father, Mother, Siblings, Partners, Children) */}
          {hasRelatives(char) && (
            <div className={`p-2 rounded-lg border text-[11px] mb-2.5 space-y-1 ${
              isDarkMode ? 'bg-neutral-900/70 border-neutral-800 text-neutral-300' : 'bg-neutral-50/90 border-neutral-200/80 text-neutral-700'
            }`}>
              <div className="flex items-center gap-1 font-semibold text-[10px] uppercase font-mono tracking-wider text-neutral-400">
                <Users className="w-2.5 h-2.5" />
                <span>Relatives</span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
                {char.relatives?.father && (
                  <div className="truncate"><span className="text-neutral-400">Father:</span> {resolveRelativeName(char.relatives.father)}</div>
                )}
                {char.relatives?.mother && (
                  <div className="truncate"><span className="text-neutral-400">Mother:</span> {resolveRelativeName(char.relatives.mother)}</div>
                )}
                {char.relatives?.partners && char.relatives.partners.length > 0 && (
                  <div className="truncate col-span-2"><span className="text-neutral-400">Partner:</span> {char.relatives.partners.map(resolveRelativeName).join(', ')}</div>
                )}
                {char.relatives?.siblings && char.relatives.siblings.length > 0 && (
                  <div className="truncate col-span-2"><span className="text-neutral-400">Siblings:</span> {char.relatives.siblings.map(resolveRelativeName).join(', ')}</div>
                )}
                {char.relatives?.children && char.relatives.children.length > 0 && (
                  <div className="truncate col-span-2"><span className="text-neutral-400">Children:</span> {char.relatives.children.map(resolveRelativeName).join(', ')}</div>
                )}
              </div>
            </div>
          )}

          {/* Narrative Overview Excerpt */}
          <p className={`text-xs line-clamp-2 leading-relaxed mb-3 ${
            isDarkMode ? 'text-neutral-400' : 'text-neutral-600'
          }`}>
            {char.overview || <span className="italic text-neutral-400">No dossier overview written yet...</span>}
          </p>
        </div>

        {/* Card Footer: Birth/Death snippets & sex */}
        <div className={`pt-2 border-t flex items-center justify-between text-[11px] font-mono ${
          isDarkMode ? 'border-neutral-800/80 text-neutral-500' : 'border-neutral-100 text-neutral-400'
        }`}>
          <div className="flex items-center gap-1.5 truncate">
            {char.birthTime && (
              <span className="truncate" title={`Born: ${char.birthTime} (${char.birthPlace || 'Unknown'})`}>
                b. {char.birthTime.split(',')[0]}
              </span>
            )}
            {char.status === 'deceased' && char.deathTime && (
              <span className="text-rose-400 truncate" title={`Died: ${char.deathTime}`}>
                • d. {char.deathTime.split(',')[0]}
              </span>
            )}
          </div>
          <span className="text-neutral-400 uppercase text-[10px]">
            {char.sex}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div 
      id="characters-mode-root"
      className={`h-full flex overflow-hidden transition-colors select-none ${
        isDarkMode ? 'bg-[#0c0c0c] text-neutral-100' : 'bg-[#f8f8f8] text-neutral-900'
      }`}
    >
      {/* Left / Primary Area: Roster Overview & Filter Studio */}
      <div className={`flex-1 flex flex-col h-full overflow-hidden transition-all ${
        selectedCharacter ? 'hidden md:flex md:w-3/5 lg:w-3/5' : 'w-full'
      }`}>
        
        {/* Top App Header */}
        <div className={`p-4 sm:px-6 sm:py-4 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${
          isDarkMode ? 'border-neutral-800 bg-[#111111]' : 'border-neutral-200 bg-white'
        }`}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onReturnToEditor}
              title="Click to return to Writing"
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-xs border transition-all cursor-pointer group hover:scale-105 active:scale-95 ${
                isDarkMode 
                  ? 'bg-neutral-900 border-neutral-700/80 text-white hover:border-accent' 
                  : 'bg-white border-neutral-200 text-neutral-900 shadow-2xs hover:border-accent'
              }`}
            >
              <MultiGenreCharactersEmblem isDarkMode={isDarkMode} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight font-display">
                  Characters
                </h1>
              </div>
              <p className="text-xs text-neutral-400">
                {characters.length} total character{characters.length === 1 ? '' : 's'} in project
              </p>
            </div>
          </div>

          {/* Primary Top Action Bar */}
          <div className="flex items-center gap-2">
            <button
              id="btn-create-new-character"
              onClick={onCreateCharacter}
              className="px-3.5 py-1.5 rounded-lg border border-accent text-accent bg-accent/5 hover:bg-accent/10 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>New Character</span>
            </button>
          </div>
        </div>

        {/* Filter and View Controls Bar */}
        <div className={`p-2.5 sm:p-4 border-b space-y-2 sm:space-y-3 shrink-0 ${
          isDarkMode ? 'border-neutral-800/80 bg-[#141414]/90' : 'border-neutral-200/90 bg-white/90'
        }`}>
          {/* Row 1: Search Bar & Sort Dropdown aligned together in a single row */}
          <div className="flex flex-row items-center justify-between gap-2 w-full">
            {/* Search Box */}
            <div className="relative flex-1 min-w-0 sm:w-64 sm:max-w-xs shrink-0">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-neutral-400" />
              <input
                id="input-search-characters"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search character cards..."
                className={`w-full pl-8 pr-7 py-1.5 sm:py-2 rounded-lg border text-xs outline-none focus:ring-2 focus:ring-accent transition-colors ${
                  isDarkMode 
                    ? 'bg-neutral-900 border-neutral-700 text-white placeholder-neutral-500' 
                    : 'bg-neutral-50 border-neutral-300 text-neutral-900 placeholder-neutral-400'
                }`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-neutral-400 hover:text-neutral-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Order Dropdown */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-mono text-neutral-400 hidden sm:inline">Sort by:</span>
              <select
                id="select-sort-characters"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                aria-label="Sort character roster"
                className={`text-xs px-2 py-1.5 sm:py-2 rounded-lg border font-medium focus:outline-none transition-colors cursor-pointer ${
                  isDarkMode 
                    ? 'bg-neutral-900 border-neutral-700 text-neutral-200 focus:border-neutral-500' 
                    : 'bg-white border-neutral-300 text-neutral-800 focus:border-neutral-600'
                }`}
              >
                <option value="recent">Last Edited (Recent)</option>
                <option value="name-asc">Name (A → Z)</option>
                <option value="name-desc">Name (Z → A)</option>
                <option value="created">Date Created (Newest)</option>
                <option value="created-asc">Date Created (Oldest)</option>
              </select>
            </div>
          </div>

          {/* Row 2: View Mode Switcher: All / By Factions / By Families / Tree Graph */}
          <div className={`inline-flex items-center w-fit self-start p-0.5 rounded-lg border text-[11px] sm:text-xs font-medium shrink-0 max-w-full overflow-x-auto ${
            isDarkMode ? 'border-neutral-800 bg-neutral-900' : 'border-neutral-200 bg-neutral-100'
          }`}>
            <button
              id="btn-view-mode-all"
              onClick={() => setGroupViewMode('all')}
              className={`px-1.5 sm:px-2.5 py-1 rounded-md transition-all cursor-pointer shrink-0 ${
                groupViewMode === 'all'
                  ? isDarkMode ? 'bg-neutral-800 text-white shadow-xs font-semibold' : 'bg-white text-neutral-950 shadow-xs font-semibold'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              All
            </button>

            <div className="w-px h-3.5 bg-neutral-300 dark:bg-neutral-700 mx-0.5 my-auto shrink-0" />

            <button
              id="btn-view-mode-factions"
              onClick={() => setGroupViewMode('factions')}
              className={`px-1.5 sm:px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                groupViewMode === 'factions'
                  ? isDarkMode ? 'bg-neutral-800 text-white shadow-xs font-semibold' : 'bg-white text-neutral-950 shadow-xs font-semibold'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Shield className="w-3 h-3 text-amber-500" />
              <span><span className="hidden xs:inline sm:inline">By </span>Factions</span>
            </button>

            <div className="w-px h-3.5 bg-neutral-300 dark:bg-neutral-700 mx-0.5 my-auto shrink-0" />

            <button
              id="btn-view-mode-families"
              onClick={() => setGroupViewMode('families')}
              className={`px-1.5 sm:px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                groupViewMode === 'families'
                  ? isDarkMode ? 'bg-neutral-800 text-white shadow-xs font-semibold' : 'bg-white text-neutral-950 shadow-xs font-semibold'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Home className="w-3 h-3 text-accent" />
              <span><span className="hidden xs:inline sm:inline">By </span>Families</span>
            </button>

            <div className="w-px h-3.5 bg-neutral-300 dark:bg-neutral-700 mx-0.5 my-auto shrink-0" />

            <button
              id="btn-view-mode-graph"
              onClick={() => setGroupViewMode('graph')}
              className={`px-1.5 sm:px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                groupViewMode === 'graph'
                  ? isDarkMode ? 'bg-neutral-800 text-white shadow-xs font-semibold' : 'bg-white text-neutral-950 shadow-xs font-semibold'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <GitFork className="w-3 h-3 text-accent" />
              <span>Tree Graph</span>
            </button>
          </div>

          {/* Row 3: Tag Filter Cloud & Exclusive Filter Rule */}
          <div className="pt-0.5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 font-mono flex items-center gap-1">
                  <Filter className="w-3 h-3" />
                  <span>Filter by tag</span>
                </span>
              </div>

              {(selectedFilterTags.length > 0 || statusFilter !== 'all' || searchQuery) && (
                <button
                  onClick={clearAllFilters}
                  className="text-[11px] text-accent hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  <span>Clear filters ({selectedFilterTags.length + (statusFilter !== 'all' ? 1 : 0)})</span>
                </button>
              )}
            </div>

            {/* Tag Pills List */}
            <div className="flex flex-wrap gap-1.5 items-center max-h-24 overflow-y-auto pr-1">
              {/* Factions */}
              {allFactions.map((fac) => {
                const isSelected = selectedFilterTags.includes(fac);
                return (
                  <button
                    key={`filter-faction-${fac}`}
                    onClick={() => toggleFilterTag(fac)}
                    className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
                      isSelected
                        ? 'bg-amber-500 text-black font-semibold border-amber-500 shadow-xs'
                        : isDarkMode
                        ? 'bg-neutral-900/80 border-neutral-700 text-amber-300 hover:border-amber-400'
                        : 'bg-amber-50/70 border-amber-200 text-amber-800 hover:border-amber-300'
                    }`}
                  >
                    <Shield className="w-2.5 h-2.5" />
                    <span>{fac}</span>
                    {isSelected && <X className="w-2.5 h-2.5 ml-0.5" />}
                  </button>
                );
              })}

              {/* Families */}
              {allFamilies.map((fam) => {
                const isSelected = selectedFilterTags.includes(fam);
                return (
                  <button
                    key={`filter-family-${fam}`}
                    onClick={() => toggleFilterTag(fam)}
                    className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
                      isSelected
                        ? 'bg-accent text-white font-semibold border-accent shadow-xs'
                        : isDarkMode
                        ? 'bg-neutral-900/80 border-neutral-700 text-accent hover:border-accent'
                        : 'bg-accent/10 border-accent/30 text-accent hover:border-accent'
                    }`}
                  >
                    <Home className="w-2.5 h-2.5" />
                    <span>{fam}</span>
                    {isSelected && <X className="w-2.5 h-2.5 ml-0.5" />}
                  </button>
                );
              })}

              {/* General Tags */}
              {allGeneralTags.slice(0, 8).map((t) => {
                const isSelected = selectedFilterTags.includes(t);
                return (
                  <button
                    key={`filter-tag-${t}`}
                    onClick={() => toggleFilterTag(t)}
                    className={`text-[11px] px-2 py-0.5 rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
                      isSelected
                        ? 'bg-accent text-white font-semibold border-accent shadow-xs'
                        : isDarkMode
                        ? 'bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:border-neutral-500'
                        : 'bg-neutral-100 border-neutral-200 text-neutral-700 hover:border-neutral-300'
                    }`}
                  >
                    <span>#{t}</span>
                    {isSelected && <X className="w-2.5 h-2.5 ml-0.5" />}
                  </button>
                );
              })}

              {allFactions.length === 0 && allFamilies.length === 0 && allGeneralTags.length === 0 && (
                <span className="text-[11px] text-neutral-400 italic">
                  No factions or families tagged yet. Click a character to assign factions & families.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Character Gallery / Grid Content or Full-Viewport Interactive Family Tree Graph */}
        {groupViewMode === 'graph' ? (
          <div className="flex-1 w-full h-full min-h-0 relative overflow-hidden">
            <FamilyTreeGraph
              characters={filteredCharacters}
              selectedCharacterId={selectedCharacterId || undefined}
              onSelectCharacter={(charOrId) => {
                const charId = typeof charOrId === 'string' ? charOrId : charOrId.id;
                setSelectedCharacterId(charId);
              }}
              isDarkMode={isDarkMode}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-6 space-y-4 sm:space-y-6">
            
            {/* Active Filter Summary Strip */}
            {selectedFilterTags.length > 0 && (
              <div className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                isDarkMode ? 'bg-neutral-900 border-neutral-800 text-neutral-300' : 'bg-accent/10 border-accent/30 text-accent'
              }`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold font-mono">Exclusive Filter Active:</span>
                  {selectedFilterTags.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded bg-accent/15 border border-accent/30 font-medium">
                      {t}
                    </span>
                  ))}
                  <span className="opacity-80">({filteredCharacters.length} match{filteredCharacters.length === 1 ? '' : 'es'})</span>
                </div>
                <button
                  onClick={() => setSelectedFilterTags([])}
                  className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white shrink-0"
                >
                  Reset
                </button>
              </div>
            )}

            {/* Empty State */}
            {filteredCharacters.length === 0 && (
              <div className={`py-16 text-center border rounded-2xl p-8 max-w-md mx-auto ${
                isDarkMode ? 'border-neutral-800 bg-[#121212]' : 'border-neutral-200 bg-white'
              }`}>
                <Users className="w-10 h-10 mx-auto text-neutral-400 mb-3 opacity-60" />
                <h3 className="text-base font-semibold font-display">No characters match</h3>
                <div className="flex items-center justify-center gap-2 mt-4">
                  {selectedFilterTags.length > 0 && (
                    <button
                      onClick={clearAllFilters}
                      className="px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      Clear Filter
                    </button>
                  )}
                  <button
                    onClick={onCreateCharacter}
                    className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent"
                  >
                    Create Character
                  </button>
                </div>
              </div>
            )}

            {/* View Mode: ALL CHARACTERS (Grid) */}
            {groupViewMode === 'all' && filteredCharacters.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredCharacters.map(renderCharacterCard)}
              </div>
            )}

            {/* View Mode: BY FACTIONS (Categorized sections) */}
            {groupViewMode === 'factions' && filteredCharacters.length > 0 && (
              <div className="space-y-6">
                {factionGroups.map((group) => {
                  const isCollapsed = collapsedGroups[group.name];
                  return (
                    <div key={group.name} className="space-y-3">
                      <button
                        type="button"
                        onClick={() => toggleGroupCollapse(group.name)}
                        className={`w-full flex items-center justify-between pb-2 border-b text-left cursor-pointer group ${
                          isDarkMode ? 'border-neutral-800' : 'border-neutral-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-neutral-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-neutral-400" />
                          )}
                          <Shield className="w-4 h-4 text-amber-500" />
                          <h2 className="text-sm font-bold tracking-tight font-display group-hover:text-amber-500 transition-colors">
                            {group.name}
                          </h2>
                          <span className="text-xs font-mono text-neutral-400">
                            ({group.characters.length})
                          </span>
                        </div>
                        <span className="text-[11px] text-neutral-400 font-mono">
                          {isCollapsed ? 'Expand' : 'Collapse'}
                        </span>
                      </button>

                      {!isCollapsed && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 pl-2">
                          {group.characters.map(renderCharacterCard)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* View Mode: BY FAMILIES (Categorized sections) */}
            {groupViewMode === 'families' && filteredCharacters.length > 0 && (
              <div className="space-y-6">
                {familyGroups.map((group) => {
                  const isCollapsed = collapsedGroups[group.name];
                  return (
                    <div key={group.name} className="space-y-3">
                      <button
                        type="button"
                        onClick={() => toggleGroupCollapse(group.name)}
                        className={`w-full flex items-center justify-between pb-2 border-b text-left cursor-pointer group ${
                          isDarkMode ? 'border-neutral-800' : 'border-neutral-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-neutral-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-neutral-400" />
                          )}
                          <Home className="w-4 h-4 text-accent" />
                          <h2 className="text-sm font-bold tracking-tight font-display group-hover:text-accent transition-colors">
                            {group.name}
                          </h2>
                          <span className="text-xs font-mono text-neutral-400">
                            ({group.characters.length})
                          </span>
                        </div>
                        <span className="text-[11px] text-neutral-400 font-mono">
                          {isCollapsed ? 'Expand' : 'Collapse'}
                        </span>
                      </button>

                      {!isCollapsed && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 pl-2">
                          {group.characters.map(renderCharacterCard)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}
      </div>

      {/* Right / Side Panel: Character Detail & Dossier Inspector */}
      {selectedCharacter && (
        <>
          {/* Click outside backdrop overlay to close sidebar */}
          <div 
            className="fixed inset-0 bg-black/20 dark:bg-black/40 z-20 transition-opacity animate-in fade-in duration-150 cursor-pointer" 
            onClick={() => setSelectedCharacterId(null)} 
          />

          <div className="relative w-full md:w-2/5 lg:w-2/5 h-full shrink-0 z-30 shadow-2xl md:shadow-none">
            <CharacterDetailView
              character={selectedCharacter}
              allCharacters={characters}
              codexEntries={codexEntries}
              timelineConfig={timelineConfig}
              documents={documents}
              folders={folders}
              imgbbApiKey={imgbbApiKey}
              onOpenSettings={onOpenSettings}
              onUpdate={(changes) => onUpdateCharacter(selectedCharacter.id, changes)}
              onDelete={(id) => {
                onDeleteCharacter(id);
                setSelectedCharacterId(null);
              }}
              onDuplicate={(char) => {
                onDuplicateCharacter(char);
              }}
              onCreateCodexEntry={onCreateCodexEntry}
              onClose={() => setSelectedCharacterId(null)}
              onSelectDocumentForEditor={onSelectDocumentForEditor}
              isDarkMode={isDarkMode}
            />
          </div>
        </>
      )}
    </div>
  );
};
