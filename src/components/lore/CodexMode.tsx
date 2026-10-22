import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Plus, 
  Search, 
  Globe, 
  Castle, 
  Shield, 
  Users, 
  Sparkles, 
  Wand2, 
  Scroll, 
  X, 
  Edit3, 
  Trash2, 
  Tag, 
  Compass, 
  Check, 
  MapPin, 
  FileText,
  Crown,
  Flame,
  Feather,
  Star,
  Settings,
  Upload,
  Camera,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  Folder as FolderIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square
} from 'lucide-react';
import type { CodexEntry, CodexSection, Character, NovelDocument, Folder } from '../../types';
import { uploadImageToImgBB } from '../../lib/imgbb';
import { fileToOptimizedDataUrl } from '../../lib/imageCompressor';
import { getEntryDocumentMention } from '../../lib/sceneDetection';
import { getMarkerForCodexEntry } from '../../utils/mapUtils';
import { DEFAULT_CODEX_SECTIONS } from '../../lib/codexSectionsStore';

interface CodexModeProps {
  initialCategory?: string;
  initialEntryId?: string | null;
  codexEntries: CodexEntry[];
  codexSections?: CodexSection[];
  onSaveCodexSections?: (sections: CodexSection[]) => void;
  characters: Character[];
  documents: NovelDocument[];
  folders?: Folder[];
  activeMundusId?: string;
  onNavigateToMap?: (codexId?: string, markerId?: string) => void;
  onCreateCodexEntry: (entry: Partial<CodexEntry>) => void;
  onUpdateCodexEntry: (id: string, entry: Partial<CodexEntry>) => void;
  onDeleteCodexEntry: (id: string) => void;
  onReturnToHub: () => void;
  onSelectDocumentForEditor?: (docId: string) => void;
  isDarkMode: boolean;
  imgbbApiKey?: string;
  onOpenSettings?: () => void;
}

const AVAILABLE_ICONS: { name: string; icon: any }[] = [
  { name: 'Globe', icon: Globe },
  { name: 'Castle', icon: Castle },
  { name: 'Shield', icon: Shield },
  { name: 'Users', icon: Users },
  { name: 'Sparkles', icon: Sparkles },
  { name: 'Wand2', icon: Wand2 },
  { name: 'Scroll', icon: Scroll },
  { name: 'BookOpen', icon: BookOpen },
  { name: 'Crown', icon: Crown },
  { name: 'Compass', icon: Compass },
  { name: 'MapPin', icon: MapPin },
  { name: 'Flame', icon: Flame },
  { name: 'Feather', icon: Feather },
  { name: 'Tag', icon: Tag },
  { name: 'Star', icon: Star },
];

const COLOR_PRESETS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', 
  '#f59e0b', '#10b981', '#06b6d4', '#6366f1'
];

export const CodexMode: React.FC<CodexModeProps> = ({
  initialCategory = 'all',
  initialEntryId,
  codexEntries,
  codexSections,
  onSaveCodexSections,
  characters,
  documents,
  folders = [],
  activeMundusId = 'default',
  onNavigateToMap,
  onCreateCodexEntry,
  onUpdateCodexEntry,
  onDeleteCodexEntry,
  onReturnToHub,
  onSelectDocumentForEditor,
  isDarkMode,
  imgbbApiKey,
  onOpenSettings
}) => {
  // v0.7.76: categories come from the ACTIVE PROJECT (per-project lists owned
  // by App via codexSectionsStore) instead of a global localStorage list.
  const sections = codexSections && codexSections.length > 0 ? codexSections : DEFAULT_CODEX_SECTIONS;

  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);

  useEffect(() => {
    if (initialCategory) {
      setSelectedCategory(initialCategory);
    }
  }, [initialCategory]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  
  // Selected entry for detailed modal viewing/editing
  const [activeEntry, setActiveEntry] = useState<CodexEntry | null>(null);
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<CodexEntry | null>(null);

  useEffect(() => {
    if (initialEntryId) {
      const match = codexEntries.find((e) => e.id === initialEntryId);
      if (match) {
        if (match.category) {
          setSelectedCategory(match.category);
        }
        openEditEntryForm(match);
      }
    }
  }, [initialEntryId, codexEntries]);

  // Manage Sections Modal state
  const [isManageSectionsOpen, setIsManageSectionsOpen] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionLabel, setSectionLabel] = useState('');
  const [sectionDesc, setSectionDesc] = useState('');
  const [sectionIcon, setSectionIcon] = useState('BookOpen');
  const [sectionColor, setSectionColor] = useState('#3b82f6');

  // Entry Form states
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<string>(sections[0]?.id || 'regions');
  const [formSubtitle, setFormSubtitle] = useState('');
  const [formOverview, setFormOverview] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formThemeColor, setFormThemeColor] = useState('#3b82f6');
  const [formTags, setFormTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  // v0.7.88: image GALLERY (was single formImageUrl) — the entry popup cycles
  // through formImages with arrows; imageUrl keeps mirroring images[0] so older
  // surfaces (cards, map markers, exports) stay untouched.
  const [formImages, setFormImages] = useState<string[]>([]);
  const [formImageIndex, setFormImageIndex] = useState(0);
  const formImagesRef = React.useRef<string[]>([]); // sync shadow for async upload handler
  const setFormImagesSafe = (next: string[]) => {
    formImagesRef.current = next;
    setFormImages(next);
  };
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [imageUploadNotice, setImageUploadNotice] = useState<string | null>(null);
  const imageFileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Associated Characters and Documents Form States
  const [formLinkedCharacterIds, setFormLinkedCharacterIds] = useState<string[]>([]);
  const [formLinkedDocumentIds, setFormLinkedDocumentIds] = useState<string[]>([]);
  const [characterSearch, setCharacterSearch] = useState<string>('');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  // Handle Codex Entry Image Upload (ImgBB cloud or local data URL fallback)
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUploadError(null);
    setImageUploadNotice(null);
    setIsUploadingImage(true);

    try {
      let finalUrl = '';
      if (imgbbApiKey && imgbbApiKey.trim()) {
        const result = await uploadImageToImgBB(file, imgbbApiKey);
        finalUrl = result.url;
      } else {
        // Fallback to optimized data URL so the user can test/use images immediately without blowing quota
        finalUrl = await fileToOptimizedDataUrl(file, 800, 0.82);
        setImageUploadNotice('Uploaded locally. Configure your ImgBB API key in Settings for cloud hosting.');
      }

      if (finalUrl) {
        // v0.7.88: ADD to the gallery (was: replace single image) and jump to it
        const next = [...formImagesRef.current, finalUrl];
        setFormImagesSafe(next);
        setFormImageIndex(next.length - 1);
      }
    } catch (err: any) {
      console.error('Failed to upload codex entry image:', err);
      setImageUploadError(err.message || 'Image upload failed.');
    } finally {
      setIsUploadingImage(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  // Collect all unique tags
  const allTags = Array.from(
    new Set(codexEntries.flatMap((e) => e.tags || []))
  ).sort();

  // Get icon component helper
  const getSectionIconComponent = (iconName: string) => {
    const found = AVAILABLE_ICONS.find((i) => i.name === iconName);
    return found ? found.icon : BookOpen;
  };

  // Filtered entries
  const filteredEntries = codexEntries.filter((entry) => {
    if (selectedCategory !== 'all' && entry.category !== selectedCategory) return false;
    if (selectedTag && (!entry.tags || !entry.tags.includes(selectedTag))) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = entry.title.toLowerCase().includes(q);
      const matchSub = (entry.subtitle || '').toLowerCase().includes(q);
      const matchOverview = (entry.overview || '').toLowerCase().includes(q);
      const matchContent = (entry.content || '').toLowerCase().includes(q);
      const matchTags = (entry.tags || []).some((t) => t.toLowerCase().includes(q));
      return matchTitle || matchSub || matchOverview || matchContent || matchTags;
    }
    return true;
  });

  const openNewEntryForm = (category?: string) => {
    const initialCategory = category || (selectedCategory === 'all' ? (sections[0]?.id || 'regions') : selectedCategory);
    const matchedSec = sections.find((s) => s.id === initialCategory);

    setFormTitle('');
    setFormCategory(initialCategory);
    setFormSubtitle('');
    setFormOverview('');
    setFormContent('');
    setFormThemeColor(matchedSec?.color || '#3b82f6');
    setFormTags([]);
    setTagInput('');
    setFormImagesSafe([]);
    setFormImageIndex(0);
    setFormLinkedCharacterIds([]);
    setFormLinkedDocumentIds([]);
    setCharacterSearch('');
    setCollapsedFolders({});
    setImageUploadError(null);
    setImageUploadNotice(null);
    setIsNewModalOpen(true);
  };

  const openEditEntryForm = (entry: CodexEntry) => {
    setActiveEntry(entry);
    setFormTitle(entry.title);
    setFormCategory(entry.category);
    setFormSubtitle(entry.subtitle || '');
    setFormOverview(entry.overview || '');
    setFormContent(entry.content || '');
    setFormThemeColor(entry.themeColor || '#3b82f6');
    setFormTags(entry.tags || []);
    setTagInput('');
    // v0.7.88: seed the gallery (images[] with imageUrl fallback for pre-0.7.88 entries)
    const seededGallery = entry.images && entry.images.length > 0
      ? [...entry.images]
      : (entry.imageUrl ? [entry.imageUrl] : []);
    setFormImagesSafe(seededGallery);
    setFormImageIndex(0);
    setFormLinkedCharacterIds(entry.relatedCharacterIds || []);
    setFormLinkedDocumentIds(entry.relatedDocumentIds || []);
    setCharacterSearch('');
    setCollapsedFolders({});
    setImageUploadError(null);
    setImageUploadNotice(null);
    setIsEditingModalOpen(true);
  };

  // v0.7.88: cycle / remove helpers for the image gallery in the entry popup
  const handleCycleFormImage = (dir: -1 | 1) => {
    if (formImages.length < 2) return;
    setFormImageIndex((prev) => (prev + dir + formImages.length) % formImages.length);
  };

  const handleRemoveCurrentFormImage = () => {
    if (formImages.length === 0) return;
    const next = formImages.filter((_, i) => i !== formImageIndex);
    setFormImagesSafe(next);
    setFormImageIndex((prev) => Math.max(0, Math.min(prev, next.length - 1)));
    setImageUploadNotice(null);
    setImageUploadError(null);
  };

  const handleSaveNewEntry = () => {
    if (!formTitle.trim()) return;
    onCreateCodexEntry({
      title: formTitle.trim(),
      category: formCategory,
      subtitle: formSubtitle.trim() || undefined,
      overview: formOverview.trim(),
      content: formContent.trim(),
      themeColor: formThemeColor,
      tags: formTags,
      images: formImages.length > 0 ? [...formImages] : undefined,
      imageUrl: formImages[0] || undefined,
      relatedCharacterIds: formLinkedCharacterIds,
      relatedDocumentIds: formLinkedDocumentIds
    });
    setIsNewModalOpen(false);
  };

  const handleSaveEditedEntry = () => {
    if (!activeEntry || !formTitle.trim()) return;
    onUpdateCodexEntry(activeEntry.id, {
      title: formTitle.trim(),
      category: formCategory,
      subtitle: formSubtitle.trim() || undefined,
      overview: formOverview.trim(),
      content: formContent.trim(),
      themeColor: formThemeColor,
      tags: formTags,
      images: formImages.length > 0 ? [...formImages] : undefined,
      imageUrl: formImages[0] || undefined,
      relatedCharacterIds: formLinkedCharacterIds,
      relatedDocumentIds: formLinkedDocumentIds
    });
    setIsEditingModalOpen(false);
    setActiveEntry(null);
  };

  const toggleCharacterLink = (charId: string) => {
    setFormLinkedCharacterIds((prev) =>
      prev.includes(charId) ? prev.filter((id) => id !== charId) : [...prev, charId]
    );
  };

  const toggleDocumentLink = (docId: string) => {
    setFormLinkedDocumentIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const toggleFolderCollapse = (folderId: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  // Filter characters by search query
  const filteredCharacters = React.useMemo(() => {
    const q = characterSearch.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.role && c.role.toLowerCase().includes(q)) ||
        (c.aliases && c.aliases.some((a) => a.toLowerCase().includes(q)))
    );
  }, [characters, characterSearch]);

  // Detect which documents mention this entry (by title, subtitle, or tags)
  // v0.8.0: whole-word matching via getEntryDocumentMention — the old raw
  // substring `docText.includes(title)` flagged documents containing the title
  // INSIDE other words ("xkylex" counted as a mention of "Kyle").
  const documentsWithMentionStatus = React.useMemo(() => {
    const entryTitle = formTitle.trim();
    const entrySub = formSubtitle.trim();

    return documents.map((doc) => {
      const isExplicitlyLinked = formLinkedDocumentIds.includes(doc.id);
      const mentionReason = entryTitle.length >= 2
        ? getEntryDocumentMention(doc.title, doc.plainText, entryTitle, entrySub, formTags)
        : '';

      return {
        doc,
        isMentioned: mentionReason !== '',
        isExplicitlyLinked,
        mentionReason
      };
    });
  }, [documents, formTitle, formSubtitle, formTags, formLinkedDocumentIds]);

  // Group documents by folder, showing ONLY detected/mentioned documents, collapsible
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

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !formTags.includes(trimmed)) {
      setFormTags([...formTags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormTags(formTags.filter((t) => t !== tagToRemove));
  };

  // Section editing handlers
  const handleOpenSectionModal = (sec?: CodexSection) => {
    if (sec) {
      setEditingSectionId(sec.id);
      setSectionLabel(sec.label);
      setSectionDesc(sec.desc);
      setSectionIcon(sec.iconName);
      setSectionColor(sec.color);
    } else {
      setEditingSectionId(null);
      setSectionLabel('');
      setSectionDesc('');
      setSectionIcon('BookOpen');
      setSectionColor('#3b82f6');
    }
    setIsManageSectionsOpen(true);
  };

  // v0.7.76: section edits are persisted through App (per-project store +
  // cloud sync + backups) instead of a global localStorage key.
  const handleSaveSection = () => {
    if (!sectionLabel.trim()) return;

    if (editingSectionId) {
      // Update existing section
      onSaveCodexSections?.(sections.map((s) => s.id === editingSectionId ? {
        ...s,
        label: sectionLabel.trim(),
        desc: sectionDesc.trim() || 'Custom codex category',
        iconName: sectionIcon,
        color: sectionColor,
      } : s));
    } else {
      // Add new section
      const newId = `sec_${Date.now()}`;
      const newSec: CodexSection = {
        id: newId,
        label: sectionLabel.trim(),
        desc: sectionDesc.trim() || 'Custom codex category',
        iconName: sectionIcon,
        color: sectionColor,
      };
      onSaveCodexSections?.([...sections, newSec]);
    }
    setIsManageSectionsOpen(false);
  };

  const handleDeleteSection = (id: string) => {
    if (sections.length <= 1) return;
    onSaveCodexSections?.(sections.filter((s) => s.id !== id));
    if (selectedCategory === id) setSelectedCategory('all');
  };

  return (
    <div className={`flex-1 flex flex-col h-full overflow-y-auto transition-colors ${
      isDarkMode ? 'bg-[#0a0a0a] text-neutral-100' : 'bg-[#f7f8fa] text-neutral-900'
    }`}>
      {/* Header Bar */}
      <div className={`p-5 sm:p-6 border-b flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20 backdrop-blur-md ${
        isDarkMode ? 'border-neutral-800 bg-[#111111]/90' : 'border-neutral-200 bg-white/90'
      }`}>
        <div className="flex items-center gap-3">
          <button
            onClick={onReturnToHub}
            className={`flex items-center gap-2.5 p-1 -m-1 rounded-lg transition-colors cursor-pointer group text-left ${
              isDarkMode ? 'hover:bg-neutral-800/60' : 'hover:bg-neutral-100'
            }`}
            title="Return to Lore starting page"
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-transform group-hover:scale-105 ${
              isDarkMode ? 'bg-amber-950/40 border-amber-800 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-600'
            }`}>
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold font-display flex items-center gap-2 group-hover:text-amber-400 transition-colors">
                <span>Lore</span>
                <span className="text-neutral-400 text-xs font-normal">/</span>
                <span>Codex</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                  isDarkMode 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {codexEntries.length} Entries
                </span>
              </h1>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => openNewEntryForm()}
            className="px-4 py-2 rounded-xl border border-accent text-accent bg-accent/5 hover:bg-accent/10 font-semibold text-xs flex items-center gap-2 shadow-xs transition-all hover:scale-[1.02] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Codex Entry</span>
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        
        {/* Category Grid Section Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-400">
              Browse Codex Categories
            </h2>
            <button
              onClick={() => handleOpenSectionModal()}
              className="text-[11px] font-mono text-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Edit3 className="w-3 h-3" />
              <span>Customize Categories</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {/* All option */}
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSelectedTag(null);
              }}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'border-2 border-accent bg-accent/10 text-accent font-semibold shadow-xs' 
                  : isDarkMode
                    ? 'bg-[#141414] border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                    : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:text-neutral-900'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white bg-accent">
                  <BookOpen className="w-4 h-4" />
                </div>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  selectedCategory === 'all'
                    ? 'bg-accent text-white'
                    : isDarkMode ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-100 text-neutral-600'
                }`}>
                  {codexEntries.length}
                </span>
              </div>
              <span className="text-xs font-bold truncate">All Entries</span>
            </button>

            {/* Configured sections */}
            {sections.map((sec) => {
              const Icon = getSectionIconComponent(sec.iconName);
              const isSelected = selectedCategory === sec.id;
              const count = codexEntries.filter((e) => e.category === sec.id).length;

              return (
                <button
                  key={sec.id}
                  onClick={() => {
                    setSelectedCategory(sec.id);
                    setSelectedTag(null);
                  }}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer relative group ${
                    isSelected
                      ? 'border-2 border-accent bg-accent/10 text-accent font-semibold shadow-xs'
                      : isDarkMode
                        ? 'bg-[#141414] border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                        : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:text-neutral-900'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div 
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
                      style={{ backgroundColor: sec.color }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      isSelected
                        ? 'bg-accent text-white'
                        : isDarkMode ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-100 text-neutral-600'
                    }`}>
                      {count}
                    </span>
                  </div>
                  <span className="text-xs font-bold truncate">{sec.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search & Tag Filter Bar */}
        <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-center gap-3 ${
          isDarkMode ? 'bg-[#141414] border-neutral-800' : 'bg-white border-neutral-200'
        }`}>
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search codex by title, tags, history, locations..."
              className={`w-full pl-9 pr-4 py-2 text-xs rounded-lg border focus:outline-none ${
                isDarkMode 
                  ? 'bg-neutral-900 border-neutral-700 text-white placeholder-neutral-500 focus:border-accent' 
                  : 'bg-neutral-50 border-neutral-200 text-neutral-900 placeholder-neutral-400 focus:border-accent'
              }`}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Tags Pills */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full py-1">
              <span className="text-[10px] font-mono text-neutral-400 shrink-0">Tags:</span>
              <button
                onClick={() => setSelectedTag(null)}
                className={`text-[10px] font-mono px-2 py-1 rounded-md shrink-0 border cursor-pointer ${
                  selectedTag === null
                    ? 'bg-accent text-white border-accent font-bold'
                    : isDarkMode ? 'bg-neutral-800 border-neutral-700 text-neutral-400' : 'bg-neutral-100 border-neutral-200 text-neutral-600'
                }`}
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={`text-[10px] font-mono px-2 py-1 rounded-md shrink-0 border cursor-pointer ${
                    selectedTag === tag
                      ? 'bg-accent text-white border-accent font-bold'
                      : isDarkMode ? 'bg-neutral-800 border-neutral-700 text-neutral-400' : 'bg-neutral-100 border-neutral-200 text-neutral-600'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Entry Grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono text-neutral-400">
              Showing {filteredEntries.length} of {codexEntries.length} entries
              {selectedCategory !== 'all' && ` in ${sections.find((s) => s.id === selectedCategory)?.label || selectedCategory}`}
            </span>
          </div>

          {filteredEntries.length === 0 ? (
            <div className={`p-12 rounded-2xl border border-dashed text-center space-y-3 ${
              isDarkMode ? 'border-neutral-800 bg-[#121212]' : 'border-neutral-200 bg-neutral-50'
            }`}>
              <BookOpen className="w-8 h-8 text-neutral-400 mx-auto" />
              <h3 className="text-sm font-bold">No Codex Entries Found</h3>
              <p className="text-xs text-neutral-400 max-w-md mx-auto">
                No entries match your search query or selected category filter. Click below to add a new world element!
              </p>
              <button
                onClick={() => openNewEntryForm()}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Codex Entry</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEntries.map((entry) => {
                const sec = sections.find((s) => s.id === entry.category);
                const Icon = getSectionIconComponent(sec?.iconName || 'BookOpen');
                const themeColor = entry.themeColor || sec?.color || '#3b82f6';
                const marker = getMarkerForCodexEntry(entry, activeMundusId);

                return (
                  <div
                    key={entry.id}
                    onClick={() => openEditEntryForm(entry)}
                    className={`p-5 rounded-2xl border transition-all hover:scale-[1.01] cursor-pointer flex flex-col justify-between space-y-3 group ${
                      isDarkMode 
                        ? 'bg-[#121212] border-neutral-800 hover:border-neutral-700 hover:bg-[#161616]' 
                        : 'bg-white border-neutral-200 hover:border-neutral-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {entry.imageUrl ? (
                            <img
                              src={entry.imageUrl}
                              alt={entry.title}
                              className="w-8 h-8 rounded-xl object-cover shrink-0 shadow-xs border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div 
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
                              style={{ backgroundColor: themeColor }}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold truncate group-hover:text-accent transition-colors">
                              {entry.title}
                            </h3>
                            {entry.subtitle && (
                              <p className="text-[11px] text-neutral-400 truncate font-serif italic">
                                {entry.subtitle}
                              </p>
                            )}
                          </div>
                        </div>

                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded shrink-0 ${
                          isDarkMode ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-100 text-neutral-600'
                        }`}>
                          {sec?.label || entry.category}
                        </span>
                      </div>

                      {entry.overview && (
                        <p className="text-xs text-neutral-400 line-clamp-3 leading-relaxed">
                          {entry.overview}
                        </p>
                      )}
                    </div>

                    <div className="pt-2 border-t border-neutral-800/20 dark:border-neutral-800 flex items-center justify-between text-[10px] font-mono text-neutral-400 gap-2">
                      <div className="flex items-center gap-1 overflow-hidden max-w-[50%]">
                        {entry.tags && entry.tags.length > 0 ? (
                          entry.tags.map((t) => (
                            <span key={t} className="px-1.5 py-0.2 rounded bg-neutral-800/40 truncate">
                              #{t}
                            </span>
                          ))
                        ) : (
                          <span>World Dossier</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {marker ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToMap?.(entry.id, marker.id);
                            }}
                            className="px-2 py-0.5 rounded-lg bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            title="Show location marker on World Map"
                          >
                            <MapPin className="w-3 h-3 text-accent" />
                            <span>Map</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToMap?.(entry.id, undefined);
                            }}
                            className="px-2 py-0.5 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700/60 hover:border-accent/40 text-neutral-300 hover:text-accent text-[10px] font-mono font-medium flex items-center gap-1 cursor-pointer transition-colors"
                            title="Add a map marker for this Codex entry on World Map"
                          >
                            <MapPin className="w-3 h-3 text-neutral-400 group-hover:text-accent" />
                            <span>+ Map</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEntryToDelete(entry);
                          }}
                          className="p-1 rounded text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Delete codex entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Edit Sections Modal */}
      {isManageSectionsOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setIsManageSectionsOpen(false)}
        >
          <div 
            className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col cursor-default ${
              isDarkMode ? 'bg-[#141414] border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`p-4 border-b flex items-center justify-between ${
              isDarkMode ? 'border-neutral-800 bg-[#181818]' : 'border-neutral-100 bg-neutral-50'
            }`}>
              <h2 className="text-sm font-bold font-display flex items-center gap-2">
                <Settings className="w-4 h-4 text-amber-500" />
                <span>Customize Codex Categories</span>
              </h2>
              <button 
                onClick={() => setIsManageSectionsOpen(false)}
                className="text-neutral-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Existing Categories List */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">
                  Current Categories
                </label>
                <div className="space-y-2">
                  {sections.map((sec) => {
                    const Icon = getSectionIconComponent(sec.iconName);
                    return (
                      <div 
                        key={sec.id}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                          isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div 
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
                            style={{ backgroundColor: sec.color }}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">{sec.label}</p>
                            <p className="text-[10px] text-neutral-400 truncate">{sec.desc}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenSectionModal(sec)}
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                            title="Edit section details"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {sections.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteSection(sec.id)}
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-neutral-800 transition-colors cursor-pointer"
                              title="Delete section"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add / Edit Category Form */}
              <div className={`p-4 rounded-xl border space-y-3 ${
                isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-white border-neutral-200'
              }`}>
                <h3 className="text-xs font-bold text-amber-500 font-mono">
                  {editingSectionId ? 'Edit Category Details' : 'Add New Codex Category'}
                </h3>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-neutral-400">Category Label *</label>
                  <input
                    type="text"
                    value={sectionLabel}
                    onChange={(e) => setSectionLabel(e.target.value)}
                    placeholder="e.g. Religions, Factions, Languages..."
                    className={`w-full px-3 py-1.5 text-xs rounded-xl border focus:outline-none ${
                      isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-neutral-400">Description</label>
                  <input
                    type="text"
                    value={sectionDesc}
                    onChange={(e) => setSectionDesc(e.target.value)}
                    placeholder="Brief description of this section"
                    className={`w-full px-3 py-1.5 text-xs rounded-xl border focus:outline-none ${
                      isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                    }`}
                  />
                </div>

                {/* Icon Selection */}
                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-neutral-400">Section Icon</label>
                  <div className="grid grid-cols-5 gap-1.5 pt-1">
                    {AVAILABLE_ICONS.map((i) => {
                      const IconComp = i.icon;
                      const isSelected = sectionIcon === i.name;
                      return (
                        <button
                          key={i.name}
                          type="button"
                          onClick={() => setSectionIcon(i.name)}
                          className={`p-2 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                              : isDarkMode ? 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white' : 'bg-neutral-100 border-neutral-200 text-neutral-600'
                          }`}
                        >
                          <IconComp className="w-4 h-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Color Preset */}
                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-neutral-400">Accent Color</label>
                  <div className="flex items-center gap-2 pt-1">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSectionColor(c)}
                        className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer ${
                          sectionColor === c ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveSection}
                    disabled={!sectionLabel.trim()}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                  >
                    {editingSectionId ? 'Update Section' : 'Add Section'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Entry Editing/New Modal */}
      {(isNewModalOpen || isEditingModalOpen) && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
          onClick={() => {
            setIsNewModalOpen(false);
            setIsEditingModalOpen(false);
            setActiveEntry(null);
          }}
        >
          <div 
            className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col cursor-default ${
              isDarkMode ? 'bg-[#141414] border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`p-5 border-b flex items-center justify-between ${
              isDarkMode ? 'border-neutral-800 bg-[#181818]' : 'border-neutral-100 bg-neutral-50'
            }`}>
              <h2 className="text-base font-bold font-display flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-500" />
                <span>{isNewModalOpen ? 'New Codex Entry' : `Edit '${activeEntry?.title}'`}</span>
              </h2>

              <div className="flex items-center gap-2">
                {activeEntry && (() => {
                  const marker = getMarkerForCodexEntry(activeEntry, activeMundusId);
                  if (marker) {
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingModalOpen(false);
                          setActiveEntry(null);
                          onNavigateToMap?.(activeEntry.id, marker.id);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
                        title="Show location marker on World Map"
                      >
                        <MapPin className="w-3.5 h-3.5 text-accent" />
                        <span>Show on Map</span>
                      </button>
                    );
                  }
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingModalOpen(false);
                        setActiveEntry(null);
                        onNavigateToMap?.(activeEntry.id, undefined);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white border border-neutral-700 hover:border-accent/50 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
                      title="Add a map marker for this entry on the World Map"
                    >
                      <MapPin className="w-3.5 h-3.5 text-accent" />
                      <span>+ Place on Map</span>
                    </button>
                  );
                })()}

                <button 
                  onClick={() => {
                    setIsNewModalOpen(false);
                    setIsEditingModalOpen(false);
                    setActiveEntry(null);
                  }}
                  className="text-neutral-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Form */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Image Upload Badge Section */}
              <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
              }`}>
                <div className="flex items-center gap-3.5">
                  <input
                    ref={imageFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />

                  {/* Badge Icon (Clickable to upload / add more images) */}
                  <div className="relative group shrink-0">
                    <button
                      type="button"
                      onClick={() => imageFileInputRef.current?.click()}
                      disabled={isUploadingImage}
                      title="Click badge icon to upload an image (each upload is added to the gallery)"
                      className="relative w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center text-white cursor-pointer shadow-md border border-neutral-300 dark:border-neutral-700 transition-all hover:scale-105 group-hover:ring-2 group-hover:ring-accent"
                      style={{ backgroundColor: formImages.length > 0 ? undefined : formThemeColor }}
                    >
                      {formImages[formImageIndex] ? (
                        <img
                          src={formImages[formImageIndex]}
                          alt="Codex Entry Portrait"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        (() => {
                          const sec = sections.find((s) => s.id === formCategory);
                          const IconComponent = getSectionIconComponent(sec?.iconName || 'BookOpen');
                          return <IconComponent className="w-8 h-8" />;
                        })()
                      )}

                      {/* Camera upload hover overlay */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white text-[10px] font-bold">
                        {isUploadingImage ? (
                          <Loader2 className="w-5 h-5 animate-spin text-accent" />
                        ) : (
                          <>
                            <Camera className="w-4 h-4 text-accent" />
                            <span>{formImages.length > 0 ? 'Add' : 'Upload'}</span>
                          </>
                        )}
                      </div>
                    </button>

                    {/* Top-right X button to remove the current image */}
                    {formImages.length > 0 && !isUploadingImage && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveCurrentFormImage();
                        }}
                        title="Remove this image"
                        className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-md transition-transform hover:scale-110 cursor-pointer z-10"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs font-bold font-display block">
                      Codex Entry Badge Icon
                    </span>
                    <p className="text-[11px] text-neutral-400 leading-snug">
                      {formImages.length > 1
                        ? `${formImages.length} images in gallery. Click badge to add more, cycle below with the arrows.`
                        : formImages.length === 1
                        ? 'Custom illustration active. Click badge to add another image to the gallery.'
                        : 'Click the badge icon to upload a custom image (replaces default category icon)'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Upload Status / Error / Local Notice Banner */}
              {(imageUploadNotice || imageUploadError) && (
                <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 animate-fadeIn ${
                  imageUploadNotice
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle className={`w-4 h-4 shrink-0 ${imageUploadNotice ? 'text-amber-500' : 'text-rose-500'}`} />
                    <span className="truncate">{imageUploadNotice || imageUploadError}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {onOpenSettings && (
                      <button
                        type="button"
                        onClick={onOpenSettings}
                        className={`underline font-semibold cursor-pointer ${
                          imageUploadNotice ? 'text-amber-600 dark:text-amber-400 hover:underline' : 'text-rose-600 dark:text-rose-400 hover:underline'
                        }`}
                      >
                        Open Settings
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setImageUploadNotice(null);
                        setImageUploadError(null);
                      }}
                      className="p-1 rounded text-neutral-400 hover:text-white cursor-pointer"
                      title="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Full Picture Display — v0.7.88 image gallery with cycling arrows */}
              {formImages.length > 0 && formImages[formImageIndex] && (
                <div className={`relative rounded-2xl overflow-hidden border p-2 flex flex-col items-center justify-center shadow-xs ${
                  isDarkMode ? 'bg-black/60 border-neutral-800' : 'bg-neutral-100/90 border-neutral-200'
                }`}>
                  <img
                    key={formImages[formImageIndex]}
                    src={formImages[formImageIndex]}
                    alt={formTitle || 'Codex Entry Illustration'}
                    className="w-full max-h-84 object-contain rounded-xl shadow-xs block animate-fadeIn"
                    referrerPolicy="no-referrer"
                  />

                  {/* Cycle arrows (only with 2+ images) */}
                  {formImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleCycleFormImage(-1)}
                        title="Previous image"
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/55 hover:bg-black/80 text-white border border-white/25 shadow-lg backdrop-blur-xs transition-all hover:scale-110 cursor-pointer z-10"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCycleFormImage(1)}
                        title="Next image"
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/55 hover:bg-black/80 text-white border border-white/25 shadow-lg backdrop-blur-xs transition-all hover:scale-110 cursor-pointer z-10"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                      {/* Gallery position counter */}
                      <span className="absolute bottom-4 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-mono font-bold border border-white/25 shadow-lg">
                        {formImageIndex + 1} / {formImages.length}
                      </span>
                    </>
                  )}

                  {/* Remove current image */}
                  <button
                    type="button"
                    onClick={handleRemoveCurrentFormImage}
                    title="Remove this image from the gallery"
                    className="absolute top-4 right-4 p-1.5 rounded-full bg-rose-600/90 hover:bg-rose-600 text-white shadow-lg transition-transform hover:scale-110 cursor-pointer z-10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Title & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Castle Ironcrest, House Vance, The Five Resonances"
                    className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none ${
                      isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => {
                      const newCat = e.target.value;
                      setFormCategory(newCat);
                      const matchedSec = sections.find((s) => s.id === newCat);
                      if (matchedSec) setFormThemeColor(matchedSec.color);
                    }}
                    className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none cursor-pointer ${
                      isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                    }`}
                  >
                    {sections.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subtitle */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">
                  Subtitle / Epithet
                </label>
                <input
                  type="text"
                  value={formSubtitle}
                  onChange={(e) => setFormSubtitle(e.target.value)}
                  placeholder="e.g. Seat of House Vance or Ancient Elven Relic"
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              {/* Overview / Brief */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">
                  Short Summary / Overview
                </label>
                <textarea
                  rows={2}
                  value={formOverview}
                  onChange={(e) => setFormOverview(e.target.value)}
                  placeholder="A short summary displayed on cards..."
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              {/* Detailed Encyclopedia Content */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">
                  Full Encyclopedia Entry / History
                </label>
                <textarea
                  rows={5}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Detailed background history, specifications, climate, rules, or lore details..."
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none font-serif ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              {/* Theme Color & Tags */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">
                    Card Accent Color
                  </label>
                  <div className="flex items-center gap-2">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setFormThemeColor(c)}
                        className={`w-6 h-6 rounded-full border-2 transition-all cursor-pointer ${
                          formThemeColor === c ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">
                    Tags
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="Add tag and press enter"
                      className={`flex-1 px-3 py-1.5 text-xs rounded-xl border focus:outline-none ${
                        isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="px-3 py-1.5 rounded-xl bg-neutral-800 text-white text-xs font-medium cursor-pointer"
                    >
                      Add
                    </button>
                  </div>

                  {formTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {formTags.map((tag) => (
                        <span 
                          key={tag}
                          className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1"
                        >
                          #{tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="hover:text-red-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ASSOCIATED CHARACTERS SECTION */}
              <div className="space-y-2.5 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-accent" />
                    <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">
                      Associated Characters
                    </label>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-accent/15 text-accent font-semibold">
                    {formLinkedCharacterIds.length} connected
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 leading-snug">
                  Link characters connected to this entry
                </p>

                {/* Selected Character Pills */}
                {formLinkedCharacterIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 py-1">
                    {formLinkedCharacterIds.map((cId) => {
                      const char = characters.find((c) => c.id === cId);
                      if (!char) return null;
                      return (
                        <span
                          key={cId}
                          className="text-[11px] font-medium px-2 py-0.5 rounded-lg bg-accent/15 text-accent border border-accent/30 flex items-center gap-1.5 shadow-xs"
                        >
                          <span className="w-4 h-4 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[9px] bg-accent/30 font-bold">
                            {char.avatarUrl ? (
                              <img src={char.avatarUrl} alt={char.name} className="w-full h-full object-cover" />
                            ) : (
                              char.name.charAt(0).toUpperCase()
                            )}
                          </span>
                          <span className="truncate max-w-[130px]">{char.name}</span>
                          <button
                            type="button"
                            onClick={() => toggleCharacterLink(cId)}
                            className="hover:text-red-400 cursor-pointer ml-0.5"
                            title={`Unlink ${char.name}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Character Filter input if more than 3 characters */}
                {characters.length > 3 && (
                  <div className="relative">
                    <Search className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="text"
                      value={characterSearch}
                      onChange={(e) => setCharacterSearch(e.target.value)}
                      placeholder="Search characters by name, role, alias..."
                      className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border focus:outline-none ${
                        isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                      }`}
                    />
                  </div>
                )}

                {/* Characters Selector List */}
                {characters.length === 0 ? (
                  <div className="p-3 rounded-xl border border-dashed text-center text-xs text-neutral-500 border-neutral-700">
                    No characters created yet in this Mundus project. Create characters in Characters Mode to link them here.
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1 rounded-xl p-1.5 border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40">
                    {filteredCharacters.map((char) => {
                      const isSelected = formLinkedCharacterIds.includes(char.id);
                      return (
                        <button
                          key={char.id}
                          type="button"
                          onClick={() => toggleCharacterLink(char.id)}
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                            isSelected
                              ? 'border-accent bg-accent/10 text-white'
                              : isDarkMode
                              ? 'border-neutral-800/80 bg-neutral-900/70 hover:bg-neutral-800 text-neutral-300'
                              : 'border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-bold bg-neutral-800 border border-neutral-700 text-white">
                              {char.avatarUrl ? (
                                <img src={char.avatarUrl} alt={char.name} className="w-full h-full object-cover" />
                              ) : (
                                char.name.charAt(0).toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-semibold truncate block">
                                {char.name}
                              </span>
                              {char.role && (
                                <span className="text-[10px] text-neutral-400 truncate block">
                                  {char.role}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-accent" />
                            ) : (
                              <Square className="w-4 h-4 text-neutral-500" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* MENTIONED DOCUMENTS & SCENES (SORTED BY FOLDERS & COLLAPSIBLE) */}
              <div className="space-y-2.5 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-accent" />
                    <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">
                      Appears / Mentioned In Documents
                    </label>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
                    Appears in {documentsWithMentionStatus.filter((d) => d.isMentioned).length} {documentsWithMentionStatus.filter((d) => d.isMentioned).length === 1 ? 'scene' : 'scenes'}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 leading-snug">
                  Documents where this entry appears
                </p>

                {documents.length === 0 ? (
                  <div className="p-3 rounded-xl border border-dashed text-center text-xs text-neutral-500 border-neutral-700">
                    No documents created in this Mundus project yet.
                  </div>
                ) : documentsGroupedByFolder.length === 0 ? (
                  <div className="p-3 rounded-xl border border-dashed text-center text-xs text-neutral-500 border-neutral-700">
                    No scenes currently mention or contain this entry.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
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
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                  {group.mentionedCount} {group.mentionedCount === 1 ? 'mention' : 'mentions'}
                                </span>
                              )}
                              <span className="text-neutral-500">
                                {group.items.length} {group.items.length === 1 ? 'doc' : 'docs'}
                              </span>
                            </div>
                          </button>

                          {/* Folder Items (Fixed Collapsible Body based on detections) */}
                          {!isCollapsed && (
                            <div className={`p-1.5 space-y-1 ${isDarkMode ? 'bg-black/20' : 'bg-white'}`}>
                              {group.items.map(({ doc, mentionReason }) => {
                                return (
                                  <div
                                    key={doc.id}
                                    onClick={() => {
                                      if (onSelectDocumentForEditor) {
                                        setIsEditingModalOpen(false);
                                        setIsNewModalOpen(false);
                                        setActiveEntry(null);
                                        onSelectDocumentForEditor(doc.id);
                                      }
                                    }}
                                    title="Click to open this scene in writing mode"
                                    className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center justify-between gap-2 transition-all cursor-pointer hover:border-accent/60 ${
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

            {/* Modal Footer */}
            <div className={`p-5 border-t flex items-center justify-between ${
              isDarkMode ? 'border-neutral-800 bg-[#181818]' : 'border-neutral-100 bg-neutral-50'
            }`}>
              <div className="flex items-center gap-2">
                {isNewModalOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewModalOpen(false);
                      setIsEditingModalOpen(false);
                      setActiveEntry(null);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                )}

                {isEditingModalOpen && activeEntry && (
                  <button
                    type="button"
                    onClick={() => {
                      const toDel = activeEntry;
                      setIsEditingModalOpen(false);
                      setActiveEntry(null);
                      setEntryToDelete(toDel);
                    }}
                    className="px-3 py-2 rounded-xl text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-colors cursor-pointer flex items-center gap-1.5"
                    title="Delete this codex entry"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Entry</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={isNewModalOpen ? handleSaveNewEntry : handleSaveEditedEntry}
                disabled={!formTitle.trim()}
                className="px-5 py-2 rounded-xl border border-accent text-accent bg-accent/5 hover:bg-accent/10 disabled:opacity-50 text-xs font-bold shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                {isNewModalOpen ? 'Save Codex Entry' : 'Update Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {entryToDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150 cursor-pointer"
          onClick={() => setEntryToDelete(null)}
        >
          <div 
            className={`w-full max-w-md rounded-2xl border shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150 cursor-default ${
              isDarkMode ? 'bg-[#181818] border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold font-display">Delete Codex Entry</h3>
                <p className="text-xs text-neutral-400">Permanent lore removal</p>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-neutral-300">
              Are you sure you want to permanently delete <strong className="text-white font-semibold">"{entryToDelete.title}"</strong> from your project's Codex? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setEntryToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  if (entryToDelete) {
                    onDeleteCodexEntry(entryToDelete.id);
                    setEntryToDelete(null);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Entry</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
