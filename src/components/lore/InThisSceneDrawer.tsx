import React, { useState, useMemo } from 'react';
import { 
  BookMarked, 
  X, 
  Sparkles, 
  Search, 
  Tag, 
  Compass, 
  Shield, 
  Flame, 
  Crown, 
  BookOpen, 
  MapPin, 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Layers, 
  ExternalLink,
  Edit2,
  Check,
  FileText,
  Clock,
  User
} from 'lucide-react';
import type { CodexEntry, Character, CodexSection } from '../../types';
import { getMarkerForCodexEntry } from '../../utils/mapUtils';
import { detectInSceneEntryIds, detectInSceneCharacterIds } from '../../lib/sceneDetection';

interface InThisSceneDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  codexEntries: CodexEntry[];
  characters?: Character[];
  documentPlainText?: string;
  isDarkMode: boolean;
  activeMundusId?: string;
  /** v0.8.0: the active project's Codex sections, so renamed categories show
   *  their current labels instead of the raw default ids (e.g. "Factions"). */
  codexSections?: CodexSection[];
  onNavigateToMap?: (codexId: string, markerId?: string) => void;
  onOpenNewCodexEntry?: (initialTitle?: string) => void;
  onSelectCodexEntry?: (entry: CodexEntry) => void;
  onUpdateCodexEntry?: (id: string, entryData: Partial<CodexEntry>) => void;
  onSelectCharacter?: (characterId: string) => void;
}

export const InThisSceneDrawer: React.FC<InThisSceneDrawerProps> = ({
  isOpen,
  onClose,
  codexEntries = [],
  characters = [],
  documentPlainText = '',
  isDarkMode,
  activeMundusId = 'default',
  codexSections,
  onNavigateToMap,
  onOpenNewCodexEntry,
  onSelectCodexEntry,
  onUpdateCodexEntry,
  onSelectCharacter
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'detected' | 'all' | 'characters'>('detected');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedEntry, setSelectedEntry] = useState<CodexEntry | null>(null);
  const [isCharactersCollapsed, setIsCharactersCollapsed] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editOverview, setEditOverview] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState('');
  const [saveIndicator, setSaveIndicator] = useState(false);

  const startEditingEntry = (entry: CodexEntry) => {
    setEditingEntryId(entry.id);
    setEditTitle(entry.title || '');
    setEditSubtitle(entry.subtitle || '');
    setEditOverview(entry.overview || '');
    setEditContent(entry.content || '');
    setEditTags(entry.tags || []);
    setEditTagInput('');
  };

  const handleSaveEdit = (entryId: string) => {
    if (!onUpdateCodexEntry) return;
    onUpdateCodexEntry(entryId, {
      title: editTitle.trim(),
      subtitle: editSubtitle.trim() || undefined,
      overview: editOverview.trim(),
      content: editContent.trim(),
      tags: editTags,
      updatedAt: new Date().toISOString()
    });
    setSaveIndicator(true);
    setTimeout(() => {
      setSaveIndicator(false);
      setEditingEntryId(null);
    }, 400);
  };

  // Detect Codex entries present in the active document plain text.
  // v0.7.88: NAME-ONLY matching — the full entry title as a standalone
  // phrase. Subtitles, title fragments and description fields never match.
  const detectedEntryIds = useMemo(
    () => detectInSceneEntryIds(codexEntries, documentPlainText),
    [codexEntries, documentPlainText]
  );

  // Detect Characters present in the active document plain text.
  // v0.7.88: NAME-ONLY matching — the full character name as a standalone
  // phrase. Aliases/titles and individual name parts never match.
  const detectedCharIds = useMemo(
    () => detectInSceneCharacterIds(characters, documentPlainText),
    [characters, documentPlainText]
  );

  // v0.8.0: entries store the section ID — display the section's current
  // (possibly renamed) label, falling back to the raw id for unknown ones.
  const categoryLabel = useMemo(() => {
    const map = new Map<string, string>();
    (codexSections || []).forEach((s) => map.set(s.id, s.label));
    return (cat: string): string => map.get(cat) || cat;
  }, [codexSections]);

  const displayedCharacters = useMemo(() => {
    if (filterMode === 'all') return [];
    return characters.filter((char) => {
      if (filterMode === 'detected' && !detectedCharIds.has(char.id)) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        char.name.toLowerCase().includes(q) ||
        (char.aliases && char.aliases.toLowerCase().includes(q)) ||
        (char.roles && char.roles.some((r) => r.toLowerCase().includes(q))) ||
        (char.factions && char.factions.some((f) => f.toLowerCase().includes(q))) ||
        (char.families && char.families.some((fam) => fam.toLowerCase().includes(q)))
      );
    }).sort((a, b) => {
      // Sort characters detected in scene first
      const aDet = detectedCharIds.has(a.id) ? 1 : 0;
      const bDet = detectedCharIds.has(b.id) ? 1 : 0;
      return bDet - aDet;
    });
  }, [characters, detectedCharIds, filterMode, searchQuery]);

  // Detected and filtered codex entries
  const displayedEntries = useMemo(() => {
    if (filterMode === 'characters') return [];
    return codexEntries.filter((entry) => {
      // Scene filter
      if (filterMode === 'detected' && !detectedEntryIds.has(entry.id)) {
        return false;
      }

      // Category filter
      if (selectedCategoryFilter !== 'all' && entry.category !== selectedCategoryFilter) {
        return false;
      }

      // Search query filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        entry.title.toLowerCase().includes(q) ||
        (entry.subtitle && entry.subtitle.toLowerCase().includes(q)) ||
        (entry.overview && entry.overview.toLowerCase().includes(q)) ||
        (entry.tags && entry.tags.some((t) => t.toLowerCase().includes(q))) ||
        (entry.category && entry.category.toLowerCase().includes(q)) ||
        categoryLabel(entry.category).toLowerCase().includes(q)
      );
    });
  }, [codexEntries, detectedEntryIds, filterMode, selectedCategoryFilter, searchQuery, categoryLabel]);

  // Extract distinct categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    codexEntries.forEach((e) => {
      if (e.category) set.add(e.category);
    });
    return Array.from(set);
  }, [codexEntries]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Semi-transparent backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-2xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Right Sidebar Drawer */}
      <div 
        className={`relative w-full max-w-md h-full shadow-2xl border-l flex flex-col z-10 animate-in slide-in-from-right duration-250 ${
          isDarkMode ? 'bg-[#141414] border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
        }`}
      >
        {/* Drawer Header */}
        <div className={`p-4 border-b flex items-center justify-between shrink-0 ${
          isDarkMode ? 'border-neutral-800 bg-[#181818]' : 'border-neutral-100 bg-neutral-50'
        }`}>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent">
              <BookMarked className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-display tracking-tight">Scene Codex</h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenNewCodexEntry && (
              <button
                type="button"
                onClick={() => onOpenNewCodexEntry()}
                className="px-2.5 py-1 rounded-xl text-xs font-semibold border border-accent text-accent bg-accent/10 hover:bg-accent/20 transition-all cursor-pointer flex items-center gap-1"
                title="Create new Codex entry"
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
              title="Close Scene Codex"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className={`p-3 border-b shrink-0 space-y-2.5 ${
          isDarkMode ? 'border-neutral-800 bg-[#161616]' : 'border-neutral-100 bg-neutral-100/60'
        }`}>
          {/* Segmented Toggle: In This Scene vs All Codex Lore vs Characters */}
          <div className={`p-0.5 rounded-xl border flex items-center text-[10px] ${
            isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-200/70 border-neutral-300'
          }`}>
            <button
              type="button"
              onClick={() => {
                setFilterMode('detected');
                setSelectedCategoryFilter('all');
              }}
              className={`flex-1 py-1 px-1 rounded-lg font-medium transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0 ${
                filterMode === 'detected'
                  ? isDarkMode 
                    ? 'bg-neutral-800 text-white shadow-xs font-bold' 
                    : 'bg-white text-neutral-900 shadow-xs font-bold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Sparkles className={`w-3 h-3 ${detectedEntryIds.size > 0 || detectedCharIds.size > 0 ? 'text-amber-400' : 'text-neutral-400'}`} />
              <span className="truncate">In Scene</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterMode('all');
                setSelectedCategoryFilter('all');
              }}
              className={`flex-1 py-1 px-1 rounded-lg font-medium transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0 ${
                filterMode === 'all'
                  ? isDarkMode 
                    ? 'bg-neutral-800 text-white shadow-xs font-bold' 
                    : 'bg-white text-neutral-900 shadow-xs font-bold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <BookOpen className="w-3 h-3 text-neutral-400" />
              <span className="truncate" title="Codex entries detected in this scene">
                Codex ({detectedEntryIds.size})
              </span>
            </button>
            
            <button
              type="button"
              onClick={() => {
                setFilterMode('characters');
                setSelectedCategoryFilter('all');
              }}
              className={`flex-1 py-1 px-1 rounded-lg font-medium transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0 ${
                filterMode === 'characters'
                  ? isDarkMode 
                    ? 'bg-neutral-800 text-white shadow-xs font-bold' 
                    : 'bg-white text-neutral-900 shadow-xs font-bold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <User className="w-3 h-3 text-neutral-400" />
              <span className="truncate">Characters ({characters.length})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={filterMode === 'characters' ? 'Search characters by name, role...' : 'Search lore by title, keywords, tag...'}
              className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border focus:outline-none ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white placeholder-neutral-500' : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400'
              }`}
            />
          </div>

          {/* Category Chips Horizontal Scroll for Codex mode */}
          {filterMode === 'all' && categories.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter('all')}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-mono capitalize shrink-0 border transition-all cursor-pointer ${
                  selectedCategoryFilter === 'all'
                    ? 'bg-accent/15 border-accent text-accent font-bold'
                    : isDarkMode
                    ? 'bg-neutral-850 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                    : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(cat)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-mono capitalize shrink-0 border transition-all cursor-pointer ${
                    selectedCategoryFilter === cat
                      ? 'bg-accent/15 border-accent text-accent font-bold'
                      : isDarkMode
                      ? 'bg-neutral-850 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                      : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {categoryLabel(cat)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Entries & Characters List Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {displayedCharacters.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setIsCharactersCollapsed((prev) => !prev)}
                className="w-full flex items-center justify-between px-1 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer group"
              >
                <span className="flex items-center gap-1.5">
                  <User className="w-3 h-3 text-accent" />
                  <span>Characters ({displayedCharacters.length})</span>
                </span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isCharactersCollapsed ? '-rotate-90' : ''}`} />
              </button>

              {!isCharactersCollapsed && displayedCharacters.map((char) => {
                return (
                  <div
                    key={char.id}
                    onClick={() => {
                      if (onSelectCharacter) {
                        onSelectCharacter(char.id);
                        onClose();
                      }
                    }}
                    className={`rounded-2xl border p-3.5 flex items-start justify-between gap-3 transition-all cursor-pointer group ${
                      isDarkMode
                        ? 'bg-neutral-900/80 border-neutral-800 hover:border-accent/40 hover:bg-neutral-850/90'
                        : 'bg-white border-neutral-200 hover:border-accent/40 hover:bg-accent/5 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center shrink-0 text-accent font-bold text-xs group-hover:scale-105 transition-transform">
                        {char.avatarUrl ? (
                          <img src={char.avatarUrl} alt={char.name} className="w-full h-full object-cover rounded-xl" />
                        ) : (
                          <User className="w-4 h-4" />
                        )}
                      </div>
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            Character
                          </span>
                        </div>
                        <h4 className="text-sm font-bold font-display leading-tight text-neutral-900 dark:text-white group-hover:text-accent transition-colors">
                          {char.name}
                        </h4>
                        {char.aliases && (
                          <p className="text-xs text-neutral-400 font-serif italic">
                            {char.aliases}
                          </p>
                        )}
                        {char.roles && char.roles.length > 0 && (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">
                            {char.roles.join(' • ')}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 self-center text-neutral-500 group-hover:text-accent group-hover:translate-x-0.5 transition-all">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {displayedEntries.length > 0 && (
            <div className="space-y-2">
              {displayedCharacters.length > 0 && (
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400 block px-1 pt-2">
                  Codex Entries ({displayedEntries.length})
                </span>
              )}
              {displayedEntries.map((entry) => {
              const isExpanded = selectedEntry?.id === entry.id;

              return (
                <div
                  key={entry.id}
                  className={`rounded-2xl border transition-all ${
                    isDarkMode 
                      ? 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700' 
                      : 'bg-white border-neutral-200 hover:border-neutral-300 shadow-2xs'
                  }`}
                >
                  {/* Card View: Collapsed Preview or Full Details (No Duplicate Headers) */}
                  {!isExpanded ? (
                    /* Collapsed Card Preview */
                    <div 
                      onClick={() => setSelectedEntry(entry)}
                      className="p-3.5 cursor-pointer flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span 
                            className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-md font-bold"
                            style={{
                              backgroundColor: entry.themeColor ? `${entry.themeColor}20` : 'rgba(59,130,246,0.15)',
                              color: entry.themeColor || '#3b82f6'
                            }}
                          >
                            {categoryLabel(entry.category)}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold font-display leading-tight text-neutral-900 dark:text-white">
                          {entry.title}
                        </h4>

                        {entry.subtitle && (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 font-serif italic">
                            {entry.subtitle}
                          </p>
                        )}

                        {entry.overview && (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                            {entry.overview}
                          </p>
                        )}

                        {/* Tags */}
                        {entry.tags && entry.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {entry.tags.map((t) => (
                              <span 
                                key={t}
                                className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                                  isDarkMode ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-100 text-neutral-600'
                                }`}
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0 pt-0.5">
                        <button
                          type="button"
                          className="p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
                          title="Expand full dossier"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Expanded Full Details (Single Unified View) */
                    <div className={`p-4 space-y-4 animate-in fade-in duration-150 ${
                      isDarkMode ? 'bg-neutral-950/70' : 'bg-neutral-50/90'
                    }`}>
                      {/* Top Action Bar for Expanded Entry (Matching Image: Lore Mode & Edit) */}
                      {(() => {
                        const marker = getMarkerForCodexEntry(entry, activeMundusId);
                        return (
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-neutral-200 dark:border-neutral-800/60 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span 
                                className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md font-bold"
                                style={{
                                  backgroundColor: entry.themeColor ? `${entry.themeColor}20` : 'rgba(59,130,246,0.15)',
                                  color: entry.themeColor || '#3b82f6'
                                }}
                              >
                                {categoryLabel(entry.category)}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {marker && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onNavigateToMap?.(entry.id, marker.id);
                                    onClose();
                                  }}
                                  className="px-2.5 py-1 rounded-lg border border-accent/40 bg-accent/15 hover:bg-accent/25 text-accent text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                  title="Show this location on the World Map"
                                >
                                  <MapPin className="w-3.5 h-3.5 text-accent" />
                                  <span>Show on Map</span>
                                </button>
                              )}

                              {onSelectCodexEntry && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectCodexEntry(entry);
                                    onClose();
                                  }}
                                  className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                                    isDarkMode
                                      ? 'border-neutral-700 bg-neutral-800 hover:bg-neutral-750 text-neutral-200 hover:text-white'
                                      : 'border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700 hover:text-neutral-900'
                                  }`}
                                  title="Open this entry in Lore Mode"
                                >
                                  <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
                                  <span>Lore Mode</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (editingEntryId === entry.id) {
                                    setEditingEntryId(null);
                                  } else {
                                    startEditingEntry(entry);
                                  }
                                }}
                                className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                                  editingEntryId === entry.id 
                                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-500 dark:text-amber-400' 
                                    : isDarkMode
                                    ? 'border-neutral-700 bg-neutral-800 hover:bg-neutral-750 text-neutral-200 hover:text-white'
                                    : 'border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700 hover:text-neutral-900'
                                }`}
                                title={editingEntryId === entry.id ? 'Cancel editing' : 'Edit entry details'}
                              >
                                <Edit2 className="w-3.5 h-3.5 text-neutral-400" />
                                <span>{editingEntryId === entry.id ? 'Cancel' : 'Edit'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEntry(null);
                                }}
                                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                  isDarkMode
                                    ? 'border-neutral-700 bg-neutral-800 hover:bg-neutral-750 text-neutral-400 hover:text-white'
                                    : 'border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900'
                                }`}
                                title="Collapse details"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })()}

                      {editingEntryId === entry.id ? (
                        /* Inline Edit Form */
                        <div className="space-y-3">
                          <div>
                            <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1">
                              Title
                            </label>
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className={`w-full text-xs p-2 rounded-lg border focus:outline-none focus:border-accent ${
                                isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-100' : 'bg-white border-neutral-300 text-neutral-900'
                              }`}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1">
                              Subtitle / Epithet
                            </label>
                            <input
                              type="text"
                              value={editSubtitle}
                              onChange={(e) => setEditSubtitle(e.target.value)}
                              className={`w-full text-xs p-2 rounded-lg border focus:outline-none focus:border-accent ${
                                isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-100' : 'bg-white border-neutral-300 text-neutral-900'
                              }`}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1">
                              Overview & Key Lore
                            </label>
                            <textarea
                              rows={3}
                              value={editOverview}
                              onChange={(e) => setEditOverview(e.target.value)}
                              className={`w-full text-xs p-2 rounded-lg border focus:outline-none focus:border-accent resize-none font-serif ${
                                isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-100' : 'bg-white border-neutral-300 text-neutral-900'
                              }`}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1">
                              Chronicle & Detailed Lore
                            </label>
                            <textarea
                              rows={5}
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className={`w-full text-xs p-2 rounded-lg border focus:outline-none focus:border-accent resize-y font-serif ${
                                isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-100' : 'bg-white border-neutral-300 text-neutral-900'
                              }`}
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingEntryId(null)}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                                isDarkMode ? 'border-neutral-700 text-neutral-300 hover:bg-neutral-800' : 'border-neutral-300 text-neutral-600 hover:bg-neutral-100'
                              }`}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(entry.id)}
                              className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-bold flex items-center gap-1"
                            >
                              {saveIndicator ? <Check className="w-3.5 h-3.5" /> : null}
                              <span>{saveIndicator ? 'Saved!' : 'Save Changes'}</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Standard View Mode (Matching Image Header & Sections) */
                        <>
                          <div className="space-y-1">
                            <h3 className="text-base font-bold font-display tracking-wide uppercase text-neutral-900 dark:text-white">
                              {entry.title}
                            </h3>
                            {entry.subtitle && (
                              <p className="text-xs text-neutral-400 font-serif italic">
                                {entry.subtitle}
                              </p>
                            )}
                          </div>

                          {/* Tags Pills */}
                          {entry.tags && entry.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {entry.tags.map((t) => (
                                <span 
                                  key={t}
                                  className={`text-[10px] px-2 py-0.5 rounded-md font-mono border ${
                                    isDarkMode ? 'bg-neutral-800/90 text-neutral-400 border-neutral-700/60' : 'bg-neutral-100 text-neutral-500 border-neutral-200'
                                  }`}
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Overview & Key Lore Card */}
                          {entry.overview && (
                            <div className="rounded-xl border border-neutral-800 bg-neutral-900/90 p-3.5 space-y-1.5">
                              <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-wider uppercase text-blue-400">
                                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                                <span>Overview & Key Lore</span>
                              </div>
                              <p className="text-xs leading-relaxed font-serif text-neutral-200">
                                {entry.overview}
                              </p>
                            </div>
                          )}

                          {/* Chronicle & Lore Details */}
                          {entry.content && (
                            <div className="space-y-2 pt-1">
                              <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-wider uppercase text-neutral-400">
                                <FileText className="w-3.5 h-3.5 text-neutral-400" />
                                <span>Chronicle & Lore Details</span>
                              </div>
                              <p className="text-xs leading-relaxed font-serif text-neutral-300 border-t border-neutral-800/80 pt-2">
                                {entry.content}
                              </p>
                            </div>
                          )}

                          {/* Footer Metadata */}
                          <div className="flex items-center justify-between pt-3 border-t border-neutral-800/60 text-[10px] font-mono text-neutral-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>Updated: {entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString() : 'Recent'}</span>
                            </span>
                            <span className="truncate max-w-[120px]">
                              ID: {entry.id}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          )}

          {displayedEntries.length === 0 && displayedCharacters.length === 0 && (
            <div className="p-8 text-center text-neutral-400 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-neutral-800/50 border border-neutral-700/50 mx-auto flex items-center justify-center text-neutral-500">
                <BookMarked className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-neutral-300">
                  {filterMode === 'detected' 
                    ? 'No characters or codex lore detected in this scene.' 
                    : 'No characters or codex entries match your search.'}
                </p>
                <p className="text-[11px] text-neutral-500">
                  {filterMode === 'detected'
                    ? 'Mention names, places, artifacts, or factions from your Codex in your manuscript.'
                    : 'Try clearing your search or category filters.'}
                </p>
              </div>

              {filterMode === 'detected' && (
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode('all');
                      setSelectedCategoryFilter('all');
                    }}
                    className="px-3 py-1.5 rounded-xl border border-neutral-700 bg-neutral-800 text-xs font-medium text-neutral-200 hover:text-white transition-colors cursor-pointer"
                  >
                    Browse Codex ({codexEntries.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode('characters');
                      setSelectedCategoryFilter('all');
                    }}
                    className="px-3 py-1.5 rounded-xl border border-neutral-700 bg-neutral-800 text-xs font-medium text-neutral-200 hover:text-white transition-colors cursor-pointer"
                  >
                    View Characters ({characters.length})
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
