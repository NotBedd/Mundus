import React, { useState, useMemo, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  FileText, 
  Users, 
  BookOpen, 
  Clock, 
  Sun, 
  Moon, 
  LogIn, 
  LogOut, 
  Sparkles, 
  FolderOpen,
  X,
  Check,
  Globe,
  Settings,
  ArchiveRestore
} from 'lucide-react';
import { APP_VERSION } from '../constants';
import mundusLogoImg from '../assets/logo-transparent.png';
import { DoubleClickDeleteButton } from './DoubleClickDeleteButton';
import { UpdateAvailableArrow } from './UpdateAvailableArrow';
import { WindRoseLogo } from './WindRoseLogo';
import type { 
  MundusProject, 
  NovelDocument, 
  Character, 
  CodexEntry, 
  TimelineEvent, 
  Folder,
  PageFormat
} from '../types';
import { PAGE_FORMATS, DEFAULT_PAGE_FORMAT, getPageFormatConfig } from '../lib/pageFormats';

interface MundusAtlasProps {
  projects: MundusProject[];
  activeProjectId: string;
  documents: NovelDocument[];
  characters: Character[];
  codexEntries: CodexEntry[];
  timelineEvents: TimelineEvent[];
  folders: Folder[];
  onSelectProject: (projectId: string) => void;
  onCreateProject: (projectData: { name: string; description: string; genre: string; color: string; pageFormat?: PageFormat }) => void;
  onUpdateProject: (projectId: string, updates: Partial<MundusProject>) => void;
  onDeleteProject: (projectId: string) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onOpenSettings?: () => void;
  // v0.7.92: import a per-Mundus backup file (from the Mundus View backup button)
  onImportMundusBackup?: (file: File) => void;
}

const PRESET_COLORS = [
  { label: 'Amber / Gold', hex: '#d97706' },
  { label: 'Royal Violet', hex: '#7c3aed' },
  { label: 'Emerald Forest', hex: '#059669' },
  { label: 'Sapphire Sea', hex: '#2563eb' },
  { label: 'Crimson Rose', hex: '#e11d48' },
  { label: 'Obsidian Slate', hex: '#475569' },
];

export const MundusAtlas: React.FC<MundusAtlasProps> = ({
  projects,
  activeProjectId,
  documents,
  characters,
  codexEntries,
  timelineEvents,
  folders,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  isDarkMode,
  onToggleTheme,
  onOpenSettings,
  onImportMundusBackup,
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<MundusProject | null>(null);
  const mundusImportInputRef = useRef<HTMLInputElement>(null);

  // Form state for creating a new Mundus
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newGenre, setNewGenre] = useState('High Fantasy');
  const [newColor, setNewColor] = useState('#d97706');
  const [newPageFormat, setNewPageFormat] = useState<PageFormat>(DEFAULT_PAGE_FORMAT);

  // Compute stats per project
  const projectStats = useMemo(() => {
    const map = new Map<string, {
      docsCount: number;
      wordsCount: number;
      charsCount: number;
      codexCount: number;
      timelineCount: number;
    }>();

    projects.forEach((proj) => {
      const pDocs = documents.filter((d) => d.mundusId === proj.id);
      const pChars = characters.filter((c) => c.mundusId === proj.id);
      const pCodex = codexEntries.filter((e) => e.mundusId === proj.id);
      const pTimeline = timelineEvents.filter((t) => t.mundusId === proj.id);
      const totalWords = pDocs.reduce((sum, d) => sum + (d.wordCount || 0), 0);

      map.set(proj.id, {
        docsCount: pDocs.length,
        wordsCount: totalWords,
        charsCount: pChars.length,
        codexCount: pCodex.length,
        timelineCount: pTimeline.length,
      });
    });

    return map;
  }, [projects, documents, characters, codexEntries, timelineEvents]);

  const handleOpenCreateModal = () => {
    setNewName('');
    setNewDescription('');
    setNewGenre('High Fantasy');
    setNewColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)].hex);
    setNewPageFormat(DEFAULT_PAGE_FORMAT);
    setIsCreateModalOpen(true);
  };

  const handleConfirmCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    onCreateProject({
      name: newName.trim(),
      description: newDescription.trim(),
      genre: newGenre.trim() || 'General Fiction',
      color: newColor,
      pageFormat: newPageFormat,
    });

    setIsCreateModalOpen(false);
  };

  const handleConfirmUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject || !editingProject.name.trim()) return;

    onUpdateProject(editingProject.id, {
      name: editingProject.name.trim(),
      description: editingProject.description?.trim(),
      genre: editingProject.genre?.trim(),
      color: editingProject.color,
      pageFormat: editingProject.pageFormat || DEFAULT_PAGE_FORMAT,
    });

    setEditingProject(null);
  };

  return (
    <div className={`mundus-atlas-shell h-screen w-full flex flex-col transition-colors overflow-hidden ${
      isDarkMode ? 'bg-[#0a0a0a] text-neutral-100' : 'bg-[#f8f8f8] text-neutral-900'
    }`}>
      {/* Top Utility Bar — v0.8.3: a fixed flex child (NOT sticky). The shell is
          now a viewport-height container and the CONTENT below scrolls, so the
          utility bar can never scroll away (on Android the document used to
          scroll the whole shell, bar included, because min-h-screen grew the
          shell and orphaned the sticky header's scrollport). */}
      <header className={`w-full px-6 py-4 flex items-center justify-between border-b shrink-0 ${
        isDarkMode ? 'border-neutral-800/80 bg-[#0f0f0f]/80' : 'border-neutral-200/90 bg-white/80'
      } backdrop-blur-md z-20`}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 flex items-center justify-center shrink-0">
            <img 
              src={mundusLogoImg} 
              alt="Mundus" 
              className={`w-7 h-7 object-contain transition-all duration-200 select-none ${
                isDarkMode ? 'invert brightness-125 contrast-125' : 'brightness-90 contrast-125'
              }`} 
            />
          </div>
          <span className="font-display font-semibold text-sm tracking-widest uppercase">
            Mundus
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold bg-accent/20 text-accent border border-accent/30 shrink-0">
            {APP_VERSION}
          </span>
          {/* v0.8.1: green arrow when a newer release exists on GitHub */}
          <UpdateAvailableArrow />
        </div>

        <div className="flex items-center gap-3">
          {/* v0.7.92: Import a Mundus from a per-Mundus backup (left of the theme toggle) */}
          {onImportMundusBackup && (
            <button
              id="btn-atlas-import-mundus"
              onClick={() => mundusImportInputRef.current?.click()}
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                isDarkMode 
                  ? 'border-neutral-800 bg-neutral-900/80 text-neutral-300 hover:text-white hover:bg-neutral-800' 
                  : 'border-neutral-200 bg-white text-neutral-600 hover:text-black hover:bg-neutral-100'
              }`}
              title="Import a Mundus from a backup file (.json)"
            >
              <ArchiveRestore className="w-4 h-4" />
            </button>
          )}
          <input
            type="file"
            ref={mundusImportInputRef}
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && onImportMundusBackup) {
                onImportMundusBackup(file);
              }
              if (e.target) e.target.value = '';
            }}
          />

          {/* Theme toggle */}
          <button
            id="btn-atlas-toggle-theme"
            onClick={onToggleTheme}
            className={`p-2 rounded-lg border transition-colors cursor-pointer ${
              isDarkMode 
                ? 'border-neutral-800 bg-neutral-900/80 text-neutral-300 hover:text-white hover:bg-neutral-800' 
                : 'border-neutral-200 bg-white text-neutral-600 hover:text-black hover:bg-neutral-100'
            }`}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {onOpenSettings && (
            <button
              id="btn-atlas-open-settings"
              onClick={onOpenSettings}
              className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                isDarkMode 
                  ? 'border-neutral-800 bg-neutral-900/80 text-neutral-300 hover:text-white hover:bg-neutral-800' 
                  : 'border-neutral-200 bg-white text-neutral-600 hover:text-black hover:bg-neutral-100'
              }`}
              title="Open Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main Centered Hub Container */}
      {/* v0.8.3: everything below the utility bar scrolls INSIDE the shell —
          the bar itself stays pinned below the status bar. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
      <main className="w-full max-w-6xl mx-auto px-6 py-10 sm:py-16 flex flex-col items-center">
        {/* Wind Rose Icon & Mundus Atlas Header */}
        <div className="flex flex-col items-center text-center mb-6 sm:mb-10">
          {/* Freestanding Wind Rose Icon styled after nautical compass */}
          <div id="atlas-wind-rose-freestanding" className="flex items-center justify-center">
            <WindRoseLogo 
              isDarkMode={isDarkMode} 
              className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32" 
            />
          </div>

          {/* Two-line Title in top center with Mundus View style lines */}
          <div className="relative flex flex-col items-center justify-center mt-3 mb-1">
            {/* Decorative top subtle line */}
            <div className="w-20 sm:w-28 h-px bg-gradient-to-r from-transparent via-neutral-300 dark:via-neutral-700 to-transparent mb-3" />

            <h1 
              id="atlas-header-title"
              className="flex flex-col items-center justify-center text-center select-none"
            >
              <span className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal tracking-[0.25em] uppercase text-neutral-900 dark:text-neutral-100">
                Mundus
              </span>
              <div className="flex items-center justify-center gap-3 sm:gap-4 my-1 w-full">
                <span className="w-10 sm:w-16 h-px bg-neutral-300 dark:bg-neutral-600"></span>
                <span className="font-serif text-2xl sm:text-3xl md:text-4xl font-light tracking-[0.35em] uppercase text-neutral-600 dark:text-neutral-400">
                  Atlas
                </span>
                <span className="w-10 sm:w-16 h-px bg-neutral-300 dark:bg-neutral-600"></span>
              </div>
            </h1>

            {/* Decorative bottom subtle line */}
            <div className="w-48 sm:w-64 h-px bg-gradient-to-r from-transparent via-neutral-300 dark:via-neutral-700 to-transparent mx-auto mt-3" />
          </div>

          <p className="text-sm sm:text-base text-neutral-500 dark:text-neutral-400 font-sans tracking-tight mt-2 max-w-md">
            Open a Mundus to shape it, or create one to tell a new story
          </p>

          {/* Subtle section divider line */}
          <div className="w-full max-w-sm h-px bg-gradient-to-r from-transparent via-neutral-200 dark:via-neutral-800 to-transparent mt-6" />
        </div>

        {/* Mundus Cards Grid */}
        <div className="w-full">

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((proj) => {
              const stats = projectStats.get(proj.id) || {
                docsCount: 0,
                wordsCount: 0,
                charsCount: 0,
                codexCount: 0,
                timelineCount: 0,
              };

              const accentColor = proj.color || '#d97706';

              return (
                <div
                  key={proj.id}
                  id={`mundus-card-${proj.id}`}
                  onClick={() => onSelectProject(proj.id)}
                  className={`group relative flex flex-col justify-between p-6 rounded-2xl border transition-all duration-200 cursor-pointer text-left hover:shadow-lg ${
                    isDarkMode 
                      ? 'bg-[#111111] hover:bg-[#161616] border-neutral-800/90 hover:border-neutral-700' 
                      : 'bg-white hover:bg-neutral-50/90 border-neutral-200/90 hover:border-neutral-300'
                  }`}
                >
                  {/* Top Color Accent Line */}
                  <div 
                    className="absolute top-0 left-6 right-6 h-1 rounded-b-full opacity-80 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: accentColor }}
                  />

                  {/* Card Action Controls (Edit, Delete) in top right */}
                  <div 
                    className="absolute top-3 right-3 flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setEditingProject(proj)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60 transition-colors"
                      title="Edit Mundus Details"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    <DoubleClickDeleteButton
                      id={`btn-delete-mundus-${proj.id}`}
                      onDelete={() => onDeleteProject(proj.id)}
                      title={`Delete ${proj.name}`}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-500/10 dark:hover:bg-red-500/20 transition-colors"
                      iconClassName="w-3.5 h-3.5"
                    />
                  </div>

                  {/* Card Header with Centered Mundus Name */}
                  <div>
                    <div className="flex flex-col items-center justify-center text-center pt-2 px-6">
                      <h3 className="font-serif text-xl sm:text-2xl font-medium tracking-tight text-neutral-900 dark:text-neutral-100 truncate w-full text-center group-hover:text-black dark:group-hover:text-white transition-colors">
                        {proj.name}
                      </h3>

                      {proj.genre && (
                        <span className="inline-block mt-1.5 text-[11px] font-mono font-medium px-2.5 py-0.5 rounded-full border border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-900">
                          {proj.genre}
                        </span>
                      )}
                    </div>

                    {/* Synopsis / Description */}
                    <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-3 line-clamp-3 leading-relaxed text-center">
                      {proj.description || 'No description provided for this world.'}
                    </p>
                  </div>

                  {/* Stats & Launch CTA */}
                  <div className="mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800/80">
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 mb-4 font-mono">
                      <div className="flex items-center gap-1.5 truncate">
                        <FileText className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                        <span className="truncate">{stats.wordsCount.toLocaleString()} words ({stats.docsCount} docs)</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <Users className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                        <span className="truncate">{stats.charsCount} characters</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <BookOpen className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                        <span className="truncate">{stats.codexCount} codex entries</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <Clock className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                        <span className="truncate">{stats.timelineCount} events</span>
                      </div>
                    </div>

                    {/* Card Footer: Timestamp & Page Format */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">
                        Updated {new Date(proj.updatedAt || proj.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span 
                        title={`${getPageFormatConfig(proj.pageFormat).name} (${getPageFormatConfig(proj.pageFormat).metric} · ${getPageFormatConfig(proj.pageFormat).dimensions})`}
                        className="text-[10px] font-mono px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-900 shrink-0"
                      >
                        {getPageFormatConfig(proj.pageFormat).name}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Create New Mundus Card Box */}
            <div
              id="btn-atlas-create-card"
              onClick={handleOpenCreateModal}
              className={`flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer min-h-[240px] text-center ${
                isDarkMode 
                  ? 'border-neutral-800 hover:border-neutral-700 bg-neutral-900/30 hover:bg-neutral-900/70 text-neutral-400 hover:text-neutral-200' 
                  : 'border-neutral-300 hover:border-neutral-400 bg-neutral-50/50 hover:bg-neutral-100/70 text-neutral-500 hover:text-neutral-900'
              }`}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-xs mb-3 text-neutral-800 dark:text-neutral-200">
                <Plus className="w-5 h-5 stroke-[2]" />
              </div>
              <h3 className="font-serif text-lg font-medium tracking-tight">
                Create new Mundus
              </h3>
            </div>
          </div>
        </div>
      </main>
      </div>

      {/* Modal: Create New Mundus */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div 
            className={`w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border p-6 shadow-2xl transition-colors ${
              isDarkMode ? 'bg-[#141414] border-neutral-800 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2.5">
                <Plus className="w-5 h-5" />
                <h3 className="font-serif text-lg font-semibold tracking-tight">
                  Create new Mundus
                </h3>
              </div>
              <button 
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmCreate} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-mono font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase">
                  Mundus Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Secunda, The Obsidian Realm, Novaris"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className={`w-full px-3.5 py-2 text-sm rounded-lg border focus:outline-hidden focus:ring-2 focus:ring-accent ${
                    isDarkMode ? 'bg-[#1c1c1c] border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase">
                  Genre / Setting
                </label>
                <input
                  type="text"
                  placeholder="e.g. High Fantasy, Hard Sci-Fi, Gothic Horror"
                  value={newGenre}
                  onChange={(e) => setNewGenre(e.target.value)}
                  className={`w-full px-3.5 py-2 text-sm rounded-lg border focus:outline-hidden focus:ring-2 focus:ring-accent ${
                    isDarkMode ? 'bg-[#1c1c1c] border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase">
                  Description / Synopsis
                </label>
                <textarea
                  rows={3}
                  placeholder="A brief overview of the world, premise, or narrative core..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className={`w-full px-3.5 py-2 text-sm rounded-lg border focus:outline-hidden focus:ring-2 focus:ring-accent resize-none ${
                    isDarkMode ? 'bg-[#1c1c1c] border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase">
                  Theme Color Accent
                </label>
                <div className="flex items-center gap-2.5">
                  {PRESET_COLORS.map((col) => (
                    <button
                      key={col.hex}
                      type="button"
                      onClick={() => setNewColor(col.hex)}
                      className={`w-7 h-7 rounded-full transition-transform cursor-pointer flex items-center justify-center border-2 ${
                        newColor === col.hex ? 'scale-110 border-white dark:border-neutral-900 ring-2 ring-neutral-400' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: col.hex }}
                      title={col.label}
                    >
                      {newColor === col.hex && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-mono font-medium text-neutral-500 dark:text-neutral-400 uppercase">
                    Document Page Format
                  </label>
                  <span className="text-[10px] font-mono text-neutral-400">
                    {PAGE_FORMATS[newPageFormat]?.metric} ({PAGE_FORMATS[newPageFormat]?.dimensions})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {Object.values(PAGE_FORMATS).map((fmt) => {
                    const isSelected = newPageFormat === fmt.id;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setNewPageFormat(fmt.id)}
                        className={`p-3 min-h-[76px] rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-full ${
                          isSelected
                            ? isDarkMode
                              ? 'border-accent bg-accent/15 text-white ring-1 ring-accent shadow-xs'
                              : 'border-accent bg-accent/10 text-neutral-900 ring-1 ring-accent shadow-xs'
                            : isDarkMode
                              ? 'border-neutral-800 bg-[#191919] hover:border-neutral-700 text-neutral-300'
                              : 'border-neutral-200 bg-neutral-50/70 hover:border-neutral-300 text-neutral-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-xs flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-accent' : 'bg-neutral-500/40'}`} />
                            {fmt.name}
                          </span>
                          <span className="text-[10px] font-mono opacity-60 font-semibold shrink-0 ml-1">{fmt.metric}</span>
                        </div>
                        <p className="text-[10.5px] opacity-75 leading-snug pl-3.5 mt-1">{fmt.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 disabled:opacity-50 transition-all cursor-pointer"
                >
                  create new Mundus
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Mundus Details */}
      {editingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div 
            className={`w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border p-6 shadow-2xl transition-colors ${
              isDarkMode ? 'bg-[#141414] border-neutral-800 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2.5">
                <Edit3 className="w-5 h-5" />
                <h3 className="font-serif text-lg font-semibold tracking-tight">
                  Edit Mundus: {editingProject.name}
                </h3>
              </div>
              <button 
                onClick={() => setEditingProject(null)}
                className="p-1 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmUpdate} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-mono font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase">
                  Mundus Name *
                </label>
                <input
                  type="text"
                  required
                  value={editingProject.name}
                  onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
                  className={`w-full px-3.5 py-2 text-sm rounded-lg border focus:outline-hidden focus:ring-2 focus:ring-accent ${
                    isDarkMode ? 'bg-[#1c1c1c] border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase">
                  Genre / Setting
                </label>
                <input
                  type="text"
                  value={editingProject.genre || ''}
                  onChange={(e) => setEditingProject({ ...editingProject, genre: e.target.value })}
                  className={`w-full px-3.5 py-2 text-sm rounded-lg border focus:outline-hidden focus:ring-2 focus:ring-accent ${
                    isDarkMode ? 'bg-[#1c1c1c] border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase">
                  Description / Synopsis
                </label>
                <textarea
                  rows={3}
                  value={editingProject.description || ''}
                  onChange={(e) => setEditingProject({ ...editingProject, description: e.target.value })}
                  className={`w-full px-3.5 py-2 text-sm rounded-lg border focus:outline-hidden focus:ring-2 focus:ring-accent resize-none ${
                    isDarkMode ? 'bg-[#1c1c1c] border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 uppercase">
                  Theme Color Accent
                </label>
                <div className="flex items-center gap-2.5">
                  {PRESET_COLORS.map((col) => (
                    <button
                      key={col.hex}
                      type="button"
                      onClick={() => setEditingProject({ ...editingProject, color: col.hex })}
                      className={`w-7 h-7 rounded-full transition-transform cursor-pointer flex items-center justify-center border-2 ${
                        editingProject.color === col.hex ? 'scale-110 border-white dark:border-neutral-900 ring-2 ring-neutral-400' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: col.hex }}
                      title={col.label}
                    >
                      {editingProject.color === col.hex && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-mono font-medium text-neutral-500 dark:text-neutral-400 uppercase">
                    Document Page Format
                  </label>
                  <span className="text-[10px] font-mono text-neutral-400">
                    {PAGE_FORMATS[editingProject.pageFormat || DEFAULT_PAGE_FORMAT]?.metric} ({PAGE_FORMATS[editingProject.pageFormat || DEFAULT_PAGE_FORMAT]?.dimensions})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {Object.values(PAGE_FORMATS).map((fmt) => {
                    const isSelected = (editingProject.pageFormat || DEFAULT_PAGE_FORMAT) === fmt.id;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setEditingProject({ ...editingProject, pageFormat: fmt.id })}
                        className={`p-3 min-h-[76px] rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between h-full ${
                          isSelected
                            ? isDarkMode
                              ? 'border-accent bg-accent/15 text-white ring-1 ring-accent shadow-xs'
                              : 'border-accent bg-accent/10 text-neutral-900 ring-1 ring-accent shadow-xs'
                            : isDarkMode
                              ? 'border-neutral-800 bg-[#191919] hover:border-neutral-700 text-neutral-300'
                              : 'border-neutral-200 bg-neutral-50/70 hover:border-neutral-300 text-neutral-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-xs flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-accent' : 'bg-neutral-500/40'}`} />
                            {fmt.name}
                          </span>
                          <span className="text-[10px] font-mono opacity-60 font-semibold shrink-0 ml-1">{fmt.metric}</span>
                        </div>
                        <p className="text-[10.5px] opacity-75 leading-snug pl-3.5 mt-1">{fmt.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="px-4 py-2 text-xs font-medium rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!editingProject.name.trim()}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 disabled:opacity-50 transition-all cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
