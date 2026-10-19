import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Bold, 
  Italic, 
  Underline, 
  Strikethrough, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  AlignJustify, 
  List, 
  ListOrdered, 
  Quote, 
  Undo2, 
  Redo2, 
  RemoveFormatting, 
  Maximize2, 
  Minimize2, 
  Check, 
  Palette, 
  Highlighter, 
  Save,
  FolderOpen,
  Folder as FolderIcon,
  Menu,
  Clock,
  Upload,
  Plus,
  ChevronDown,
  FileText,
  FileCode,
  AlertCircle,
  Sparkles,
  Target,
  SpellCheck,
  History,
  CloudOff,
  BookOpen,
  Edit2,
  RotateCcw,
  Type,
  User,
  X,
  BookMarked,
  Scissors,
  Image as ImageIcon,
  Loader2,
  Download,
  ArrowUpDown,
  Search,
  Mic
} from 'lucide-react';
import type { NovelDocument, FontFamily, DocumentStatus, Folder, AutoSaveInterval, CustomFont, DocumentSnapshot, TimelineConfig, SceneTimelineInfo, CodexEntry, CodexSection, Character, DocumentVisualImage, PageFormat } from '../types';
import { getPageFormatConfig } from '../lib/pageFormats';
import { uploadImageToImgBB } from '../lib/imgbb';
import { VisualImageOverlay } from './VisualImageOverlay';
import { FindReplaceBar } from './FindReplaceBar';
import { exportToMarkdown, exportToPdf, exportToDocx, exportToMundus, exportToHtml } from '../lib/exportUtils';
import { importDocumentFromFile, type SupportedImportFormat } from '../lib/importUtils';
import { CharacterCardDrawer } from './characters/CharacterCardDrawer';
import { InThisSceneDrawer } from './lore/InThisSceneDrawer';
import { WritingTargetModal } from './WritingTargetModal';
import { SpellCheckModal } from './SpellCheckModal';
import { SnapshotsModal } from './SnapshotsModal';
import { SpellCheckReviewPanel } from './SpellCheckReviewPanel';
import { GoogleFontModal } from './GoogleFontModal';
import { SceneTimelineModal } from './lore/SceneTimelineModal';
import { CURATED_GOOGLE_FONTS, loadGoogleFont, detectAndLoadFontsFromHtml, isValidGoogleFontItem, type GoogleFontItem } from '../data/googleFonts';
import { scanForMisspellings, isWordValid, getSuggestions, extractWordAtCaret, shouldSuggestCaretWord, type MisspelledWordInfo } from '../lib/spellCheckEngine';
import { ensureHarper, lintText, pickCaretLint, lintToSuggestion, adjustedRemoveSpan } from '../lib/grammarEngine';
import { SttSession, assembleSttText, appendSttCommitted, finalizeDictationText, describeSttError } from '../lib/sttEngine';
import { isAndroidApp } from '../lib/platform';
import { extractPlainTextFromEditor, countWordsFromText } from '../lib/editorTextUtils';
import { getTargetBarFillClass, TARGET_BAR_GOAL_PILL_GLOW } from '../lib/targetProgress';
import { EnsoIcon } from './icons/EnsoIcon';
import { 
  getSpellCheckEnabled, 
  setSpellCheckEnabled, 
  getCustomDictionary, 
  addWordToDictionary, 
  removeWordFromDictionary 
} from '../lib/dictionaryManager';
import { getKeybindings, matchesBinding, matchesZoomBinding } from '../lib/shortcutManager';

// v0.7.94: Android keyboards ship voice dictation + autocorrect, so the
// Whistle mic and the Harper WASM engine are desktop-only (see below).
const ANDROID_APP = isAndroidApp();

interface TextEditorProps {
  document: NovelDocument;
  documents: NovelDocument[];
  folders: Folder[];
  customFonts: CustomFont[];
  snapshots: DocumentSnapshot[];
  onCreateSnapshot: (name: string, description?: string) => Promise<void>;
  onRestoreSnapshot: (snapshot: DocumentSnapshot) => Promise<void>;
  onDeleteSnapshot: (snapshotId: string) => Promise<void>;
  isPendingSync?: boolean;
  isOnline?: boolean;
  onUploadCustomFont: (file: File) => Promise<CustomFont>;
  onRemoveCustomFont: (fontId: string) => void;
  onSelectDocument: (docId: string) => void;
  onCreateDocumentInFolder: (folderId?: string) => void;
  onImportDocument?: (importedDoc: Partial<NovelDocument>) => void;
  onUpdateDocument: (updated: Partial<NovelDocument>) => void;
  onSaveNow: () => void;
  isSaving: boolean;
  autoSaveInterval: AutoSaveInterval;
  onChangeAutoSaveInterval: (interval: AutoSaveInterval) => void;
  lastSavedAt: Date | null;
  isDarkMode: boolean;
  isZenMode: boolean;
  onToggleZenMode: () => void;
  onOpenStartMenu: () => void;
  onOpenMobileSidebar?: () => void;
  timelineConfig?: TimelineConfig;
  codexSections?: CodexSection[];
  onSaveTimelineInfo?: (docId: string, info: SceneTimelineInfo) => void;
  onCreateCodexEntry?: (entry: Partial<CodexEntry>) => void;
  onUpdateCodexEntry?: (id: string, entry: Partial<CodexEntry>) => void;
  onCreateCharacter?: (charDataOrName?: unknown) => Character | void;
  onUpdateCharacter?: (id: string, changes: Partial<Character>) => void;
  onGoToCharactersMode?: (characterId?: string) => void;
  characters?: Character[];
  codexEntries?: CodexEntry[];
  onSelectCodexEntry?: (entry: CodexEntry) => void;
  onSaveCustomWords?: (words: string[]) => void;
  imgbbApiKey?: string;
  onOpenSettings?: () => void;
  accentColor?: string;
  addedGoogleFonts?: GoogleFontItem[];
  onSaveGoogleFonts?: (fonts: GoogleFontItem[]) => void;
  activeMundusId?: string;
  onNavigateToMap?: (codexId?: string, markerId?: string) => void;
  pageFormat?: PageFormat;
  characterNameHighlightEnabled?: boolean;
  dynamicTargetBarColorEnabled?: boolean;
}

const STORAGE_KEY_ADDED_GOOGLE_FONTS = 'mundus_added_google_fonts';

// Character name badge-color highlighting: shared <style> tag id and
// prefix used for each per-character CSS Custom Highlight name.
const CHAR_HIGHLIGHT_STYLE_ID = 'mundus-character-name-highlights';
const CHAR_HIGHLIGHT_PREFIX = 'mundus-char-';

const getInitialGoogleFonts = (): GoogleFontItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ADDED_GOOGLE_FONTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const cleaned = parsed.filter(isValidGoogleFontItem);
      if (cleaned.length !== parsed.length) {
        try {
          localStorage.setItem(STORAGE_KEY_ADDED_GOOGLE_FONTS, JSON.stringify(cleaned));
        } catch {}
      }
      return cleaned;
    }
  } catch (e) {
    console.warn('Failed to parse saved Google fonts from localStorage', e);
  }
  return [];
};

// Helper to determine whether a typed double quote should be opening “ or closing ”
// Guaranteed binary alternation per paragraph/block: opening first, then closing, then opening, etc.
const getSmartDoubleQuote = (editorEl: HTMLElement | null): '“' | '”' => {
  if (!editorEl) return '“';
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return '“';
  const range = sel.getRangeAt(0);

  // 1. Find the containing block element (paragraph, div, li, blockquote, etc.)
  let block: Node | null = range.startContainer;
  while (block && block !== editorEl && !/^(P|DIV|LI|H[1-6]|BLOCKQUOTE)$/i.test(block.nodeName)) {
    block = block.parentNode;
  }
  if (!block) block = editorEl;

  // 2. Extract the text of this block strictly BEFORE the caret position
  let textBefore = '';
  try {
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(block);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    textBefore = preCaretRange.toString();
  } catch {
    textBefore = '';
  }

  // If at the start of the block, or preceded by whitespace, newline, or opening bracket -> opening quote
  if (!textBefore || /[\s\u00a0\n\r\t\(\[\{<‘\u2018]$/.test(textBefore)) {
    return '“';
  }

  // 3. Binary alternating check: count how many opening vs closing quotes in this block before caret
  let openCount = 0;
  for (const ch of textBefore) {
    if (ch === '“') openCount++;
    else if (ch === '”' && openCount > 0) openCount--;
  }

  // If there is an open quote waiting to be closed, the next MUST be closing
  if (openCount > 0) {
    return '”';
  }

  // If there are no unclosed opening quotes before it, it MUST be an opening quote
  return '“';
};

// Helper for smart single quote / apostrophe
const getSmartSingleQuote = (editorEl: HTMLElement | null): '‘' | '’' => {
  if (!editorEl) return '‘';
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return '‘';
  const range = sel.getRangeAt(0);

  let block: Node | null = range.startContainer;
  while (block && block !== editorEl && !/^(P|DIV|LI|H[1-6]|BLOCKQUOTE)$/i.test(block.nodeName)) {
    block = block.parentNode;
  }
  if (!block) block = editorEl;

  let textBefore = '';
  try {
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(block);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    textBefore = preCaretRange.toString();
  } catch {
    textBefore = '';
  }

  // If at start of block or after whitespace/opening bracket -> opening ‘
  if (!textBefore || /[\s\u00a0\n\r\t\(\[\{<“\u201C]$/.test(textBefore)) {
    return '‘';
  }

  // Apostrophe following letter/number or closing single quote -> ’
  return '’';
};

const cleanHtmlForSaving = (rawHtml: string): string => {
  if (!rawHtml) return '';
  const tempDiv = window.document.createElement('div');
  tempDiv.innerHTML = rawHtml;
  
  // Find all portal figures and empty them
  const figures = tempDiv.querySelectorAll('[data-visual-image-id]');
  figures.forEach((fig) => {
    fig.innerHTML = ''; // Strip out the portal-rendered children completely!
  });

  // Strip/unwrap any lingering temporary selection highlights
  const tempHighlights = tempDiv.querySelectorAll('.mundus-temp-selection-highlight');
  tempHighlights.forEach((span) => {
    const parent = span.parentNode;
    if (parent) {
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    }
  });

  // CRITICAL: Strip any legacy or artificial page break spacer divs so they are NEVER saved to the database
  tempDiv.querySelectorAll('.mundus-page-break:not([data-manual-page-break])').forEach((el) => {
    el.remove();
  });

  // Strip virtual page-start classes and margin-top styles so raw HTML stored in database is pristine!
  tempDiv.querySelectorAll('.is-page-start, .mundus-page-start').forEach((el) => {
    const htmlEl = el as HTMLElement;
    htmlEl.classList.remove('is-page-start', 'mundus-page-start');
    htmlEl.style.removeProperty('margin-top');
    if (htmlEl.getAttribute('class') === '') htmlEl.removeAttribute('class');
    if (htmlEl.getAttribute('style') === '') htmlEl.removeAttribute('style');
  });
  
  return tempDiv.innerHTML;
};

const sanitizeContentForLoading = (rawHtml: string): string => {
  if (!rawHtml) return '<p><br></p>';
  const tempDiv = window.document.createElement('div');
  tempDiv.innerHTML = rawHtml;
  
  // CRITICAL: Strip any legacy artificial page break spacer divs that created mysterious blank spaces
  tempDiv.querySelectorAll('.mundus-page-break:not([data-manual-page-break])').forEach((el) => {
    el.remove();
  });

  // Strip virtual page-start styling so fresh pagination calculates it cleanly
  tempDiv.querySelectorAll('.is-page-start, .mundus-page-start').forEach((el) => {
    const htmlEl = el as HTMLElement;
    htmlEl.classList.remove('is-page-start', 'mundus-page-start');
    htmlEl.style.removeProperty('margin-top');
    if (htmlEl.getAttribute('class') === '') htmlEl.removeAttribute('class');
    if (htmlEl.getAttribute('style') === '') htmlEl.removeAttribute('style');
  });

  return tempDiv.innerHTML || '<p><br></p>';
};

export const TextEditor: React.FC<TextEditorProps> = ({
  document,
  documents,
  folders,
  customFonts,
  snapshots,
  onCreateSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
  isPendingSync,
  isOnline = true,
  onUploadCustomFont,
  onSelectDocument,
  onCreateDocumentInFolder,
  onImportDocument,
  onUpdateDocument,
  onSaveNow,
  isSaving,
  autoSaveInterval,
  onChangeAutoSaveInterval,
  lastSavedAt,
  isDarkMode,
  isZenMode,
  onToggleZenMode,
  onOpenStartMenu,
  onOpenMobileSidebar,
  timelineConfig,
  codexSections,
  onSaveTimelineInfo,
  onCreateCodexEntry,
  onUpdateCodexEntry,
  onCreateCharacter,
  onUpdateCharacter,
  onGoToCharactersMode,
  characters = [],
  codexEntries = [],
  onSelectCodexEntry,
  onSaveCustomWords,
  imgbbApiKey,
  onOpenSettings,
  accentColor,
  addedGoogleFonts,
  onSaveGoogleFonts,
  activeMundusId,
  onNavigateToMap,
  pageFormat,
  characterNameHighlightEnabled = false,
  dynamicTargetBarColorEnabled = true,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const fontFileInputRef = useRef<HTMLInputElement>(null);
  const manuscriptCanvasRef = useRef<HTMLDivElement>(null);
  const editorScrollContainerRef = useRef<HTMLDivElement>(null);
  const visualImageInputRef = useRef<HTMLInputElement>(null);

  const savedSelectionRangeRef = useRef<Range | null>(null);

  const triggerVisualImageUpload = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
        savedSelectionRangeRef.current = range.cloneRange();
      }
    }
    visualImageInputRef.current?.click();
  };

  // Visual manuscript images state
  const [isUploadingVisualImage, setIsUploadingVisualImage] = useState(false);
  const [visualImageError, setVisualImageError] = useState<string | null>(null);
  const [isDraggingFileOver, setIsDraggingFileOver] = useState(false);

  const visualImages: DocumentVisualImage[] = document.visualImages || [];

  const handleUpdateVisualImage = useCallback((updatedImg: DocumentVisualImage) => {
    const currentList = document.visualImages || [];
    const nextList = currentList.map((img) => img.id === updatedImg.id ? updatedImg : img);
    lastVisualImagesRef.current = JSON.stringify(nextList);
    onUpdateDocument({ visualImages: nextList });
  }, [document.visualImages, onUpdateDocument]);

  const handleDeleteVisualImage = useCallback((imgId: string) => {
    const currentList = document.visualImages || [];
    const nextList = currentList.filter((img) => img.id !== imgId);
    lastVisualImagesRef.current = JSON.stringify(nextList);
    onUpdateDocument({ visualImages: nextList });
  }, [document.visualImages, onUpdateDocument]);

  const handleInsertVisualImage = async (file: File, dropCoords?: { x: number; y: number }) => {
    if (!file.type.startsWith('image/')) {
      setVisualImageError('Only image files (PNG, JPG, WEBP, GIF, SVG) are supported.');
      return;
    }

    setVisualImageError(null);
    setIsUploadingVisualImage(true);

    const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Create and insert the figure element immediately at the current cursor position before uploading
    if (editorRef.current && !dropCoords) {
      const container = editorRef.current;
      let portalEl = container.querySelector(`[data-visual-image-id="${imageId}"]`) as HTMLElement;

      if (!portalEl) {
        portalEl = window.document.createElement('figure');
        portalEl.setAttribute('data-visual-image-id', imageId);
        portalEl.setAttribute('contenteditable', 'false');
        portalEl.className = 'visual-image-portal-node my-6 block select-none cursor-default relative';
        portalEl.style.minHeight = '240px';
        portalEl.style.height = '240px';
        
        // Append to container or insert near current selection / saved range
        const selection = window.getSelection();
        let range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        if (savedSelectionRangeRef.current) {
          range = savedSelectionRangeRef.current;
        }

        if (range && container.contains(range.commonAncestorContainer)) {
          const anchor = range.startContainer.nodeType === Node.ELEMENT_NODE 
            ? (range.startContainer as HTMLElement) 
            : range.startContainer.parentElement;
          
          const paragraph = anchor?.closest('p, div, blockquote, h1, h2, h3');
          if (paragraph && paragraph.parentElement === container) {
            container.insertBefore(portalEl, paragraph.nextSibling);
          } else {
            try {
              range.insertNode(portalEl);
            } catch (e) {
              container.appendChild(portalEl);
            }
          }
        } else {
          container.appendChild(portalEl);
        }

        // Guarantee an editable paragraph immediately following the image figure
        let nextElem = portalEl.nextElementSibling;
        if (!nextElem || nextElem.getAttribute('contenteditable') === 'false') {
          const newP = window.document.createElement('p');
          newP.innerHTML = '<br>';
          if (nextElem) {
            container.insertBefore(newP, nextElem);
          } else {
            container.appendChild(newP);
          }
        }
        
        // Flush input so that the HTML state has the figure node
        const html = editorRef.current.innerHTML;
        const plain = extractPlainTextFromEditor(editorRef.current);
        const words = countWordsFromText(plain);
        const chars = plain.length;
        const readingTime = Math.max(1, Math.ceil(words / 200));

        const cleaned = cleanHtmlForSaving(html);
        lastSavedContentRef.current = cleaned;
        lastLoadedDocIdRef.current = document.id;

        onUpdateDocument({
          content: cleaned,
          plainText: plain,
          wordCount: words,
          characterCount: chars,
          readingTimeMinutes: readingTime,
          updatedAt: new Date().toISOString()
        });
        queuePagination();
      }
    }

    try {
      let finalUrl = '';
      if (imgbbApiKey && imgbbApiKey.trim()) {
        const uploadResult = await uploadImageToImgBB(file, imgbbApiKey);
        finalUrl = uploadResult.url;
      } else {
        // Fallback to data URL so the user can test immediately even without an ImgBB key
        finalUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        setVisualImageError('Uploaded locally. Configure your ImgBB API key in Settings for cloud hosting.');
      }

      const canvasWidth = manuscriptCanvasRef.current?.offsetWidth || 768;
      const PAGE_BOUNDARY_PADDING = 16;
      const initialWidth = 280;
      
      const initialX = dropCoords 
        ? Math.max(PAGE_BOUNDARY_PADDING, Math.min(canvasWidth - initialWidth - PAGE_BOUNDARY_PADDING, dropCoords.x))
        : Math.max(PAGE_BOUNDARY_PADDING, Math.round((canvasWidth - initialWidth) / 2));

      const scrollY = editorScrollContainerRef.current?.scrollTop || 0;
      const initialY = dropCoords 
        ? Math.max(PAGE_BOUNDARY_PADDING, dropCoords.y)
        : Math.max(PAGE_BOUNDARY_PADDING + 40, scrollY + 120);

      const newImage: DocumentVisualImage = {
        id: imageId,
        url: finalUrl,
        x: initialX,
        y: initialY,
        width: 280,
        alignment: 'center',
        createdAt: new Date().toISOString()
      };

      const currentList = document.visualImages || [];
      const nextList = [...currentList, newImage];
      lastVisualImagesRef.current = JSON.stringify(nextList);
      onUpdateDocument({ visualImages: nextList });
      queuePagination();
    } catch (err: any) {
      console.error('Failed to insert visual image:', err);
      setVisualImageError(err.message || 'Image upload failed.');
      // Remove placeholder figure if upload failed
      if (editorRef.current) {
        const portalEl = editorRef.current.querySelector(`[data-visual-image-id="${imageId}"]`);
        if (portalEl) {
          portalEl.remove();
          // Flush again to clear it
          const html = editorRef.current.innerHTML;
          const plain = extractPlainTextFromEditor(editorRef.current);
          const words = countWordsFromText(plain);
          const chars = plain.length;
          const readingTime = Math.max(1, Math.ceil(words / 200));

          const cleaned = cleanHtmlForSaving(html);
          lastSavedContentRef.current = cleaned;
          lastLoadedDocIdRef.current = document.id;

          onUpdateDocument({
            content: cleaned,
            plainText: plain,
            wordCount: words,
            characterCount: chars,
            readingTimeMinutes: readingTime,
            updatedAt: new Date().toISOString()
          });
        }
      }
    } finally {
      setIsUploadingVisualImage(false);
      savedSelectionRangeRef.current = null;
    }
  };

  const handleVisualImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleInsertVisualImage(file);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const [isFocusMode, setIsFocusMode] = useState(false);
  const [showCharacterDrawer, setShowCharacterDrawer] = useState(false);
  const [selectedCharIdForDrawer, setSelectedCharIdForDrawer] = useState<string | null>(null);
  const [characterDrawerMode, setCharacterDrawerMode] = useState<'view' | 'create' | 'edit'>('view');
  const [characterInitialName, setCharacterInitialName] = useState<string>('');
  const [showInThisSceneDrawer, setShowInThisSceneDrawer] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showAutoSaveMenu, setShowAutoSaveMenu] = useState(false);
  const [showFolderDocsMenu, setShowFolderDocsMenu] = useState(false);
  const [saveSuccessTick, setSaveSuccessTick] = useState(false);
  const [reformatSuccessTick, setReformatSuccessTick] = useState(false);
  const [selectionStats, setSelectionStats] = useState<{ words: number; chars: number } | null>(null);
  const [selectedText, setSelectedText] = useState<string>('');
  const [fontUploadMessage, setFontUploadMessage] = useState<string | null>(null);

  // Quick Codex Drawer state
  const [showCodexDrawer, setShowCodexDrawer] = useState(false);
  const [codexTitleInput, setCodexTitleInput] = useState('');
  const [codexCategoryInput, setCodexCategoryInput] = useState('regions');
  const [codexSubtitleInput, setCodexSubtitleInput] = useState('');
  const [codexOverviewInput, setCodexOverviewInput] = useState('');
  const [codexContentInput, setCodexContentInput] = useState('');
  const [codexThemeColor, setCodexThemeColor] = useState('#8b5cf6');
  const [codexTags, setCodexTags] = useState<string[]>([]);
  const [codexTagInput, setCodexTagInput] = useState('');
  const [codexSaveNotice, setCodexSaveNotice] = useState(false);

  // v0.7.76: the quick Codex drawer offers the ACTIVE PROJECT's categories
  // (per-project lists owned by App) instead of a hardcoded global list, so
  // entries created from the editor always land in a category that exists in
  // the project's Codex sidebar.
  const quickCodexCategories: CodexSection[] = codexSections && codexSections.length > 0
    ? codexSections
    : [
        { id: 'regions', label: 'Regions & Locations', iconName: 'Globe', color: '#10b981', desc: '' },
        { id: 'factions', label: 'Factions & Guilds', iconName: 'Shield', color: '#f59e0b', desc: '' },
        { id: 'houses', label: 'Noble Houses & Dynasties', iconName: 'Users', color: '#3b82f6', desc: '' },
        { id: 'powers', label: 'Magic & Systems', iconName: 'Wand2', color: '#ec4899', desc: '' },
        { id: 'objects', label: 'Technology & Artifacts', iconName: 'Sparkles', color: '#06b6d4', desc: '' },
        { id: 'lore', label: 'History & Myth', iconName: 'Scroll', color: '#a855f7', desc: '' }
      ];

  // Timeline & Duration Modal state
  const [showTimelineModal, setShowTimelineModal] = useState(false);

  // Writing target modal state
  const [showTargetModal, setShowTargetModal] = useState(false);

  // Google Fonts modal state and loaded google fonts list (persisted in localStorage & synced with Firebase)
  const [showGoogleFontModal, setShowGoogleFontModal] = useState(false);
  const [loadedGoogleFontsList, setLoadedGoogleFontsList] = useState<GoogleFontItem[]>(() => {
    const local = getInitialGoogleFonts();
    if (addedGoogleFonts && addedGoogleFonts.length > 0) {
      const map = new Map<string, GoogleFontItem>();
      local.filter(isValidGoogleFontItem).forEach((f) => map.set(f.id, f));
      addedGoogleFonts.filter(isValidGoogleFontItem).forEach((f) => map.set(f.id, f));
      return Array.from(map.values()).filter(isValidGoogleFontItem);
    }
    return local.filter(isValidGoogleFontItem);
  });

  // Remove unwanted or junk Google Font from saved list
  const handleRemoveGoogleFont = (fontId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setLoadedGoogleFontsList((prev) => {
      const updated = prev.filter((f) => f.id !== fontId && f.name.toLowerCase() !== fontId.toLowerCase());
      try {
        localStorage.setItem(STORAGE_KEY_ADDED_GOOGLE_FONTS, JSON.stringify(updated));
      } catch (err) {
        console.warn('Failed to update Google fonts storage', err);
      }
      onSaveGoogleFonts?.(updated);
      return updated;
    });
  };

  // Sync with addedGoogleFonts prop when cloud fonts load
  useEffect(() => {
    if (addedGoogleFonts && addedGoogleFonts.length > 0) {
      setLoadedGoogleFontsList((prev) => {
        const map = new Map<string, GoogleFontItem>();
        prev.filter(isValidGoogleFontItem).forEach((f) => map.set(f.id, f));
        addedGoogleFonts.filter(isValidGoogleFontItem).forEach((f) => map.set(f.id, f));
        const combined = Array.from(map.values());
        try {
          localStorage.setItem(STORAGE_KEY_ADDED_GOOGLE_FONTS, JSON.stringify(combined));
        } catch {}
        return combined;
      });
    }
  }, [addedGoogleFonts]);

  // Pre-load all saved Google Fonts on mount and when list updates
  useEffect(() => {
    const validFonts = loadedGoogleFontsList.filter(isValidGoogleFontItem);
    if (validFonts.length > 0) {
      validFonts.forEach((font) => {
        loadGoogleFont(font);
      });
    }
  }, [loadedGoogleFontsList]);

  // Automatically detect any Google Fonts used in the active document's HTML
  // and load them dynamically across all devices (mobile, desktop, offline, without Firebase)
  const lastScannedDocIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!document?.id || !document?.content) return;
    if (lastScannedDocIdRef.current === document.id) return;
    lastScannedDocIdRef.current = document.id;

    detectAndLoadFontsFromHtml(document.content, (discoveredFont) => {
      if (!isValidGoogleFontItem(discoveredFont)) return;
      setLoadedGoogleFontsList((prev) => {
        const validPrev = prev.filter(isValidGoogleFontItem);
        if (validPrev.some((f) => f.id === discoveredFont.id || f.name.toLowerCase() === discoveredFont.name.toLowerCase())) {
          return validPrev;
        }
        const updated = [...validPrev, discoveredFont];
        try {
          localStorage.setItem(STORAGE_KEY_ADDED_GOOGLE_FONTS, JSON.stringify(updated));
        } catch (e) {
          console.warn('Failed to cache discovered Google font', e);
        }
        return updated;
      });
    });
  }, [document?.id]);

  // Export dropdown state
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Import dropdown state
  const [showImportMenu, setShowImportMenu] = useState(false);
  const importMenuRef = useRef<HTMLDivElement>(null);

  // Helper to trigger file picker and import directly into Loose files
  const handleTriggerFileInput = (accept: string, format: SupportedImportFormat) => {
    const input = window.document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    window.document.body.appendChild(input);

    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      try {
        const parsed = await importDocumentFromFile(file, format);
        if (onImportDocument) {
          onImportDocument(parsed);
        }
      } catch (err) {
        console.error('File import failed:', err);
      } finally {
        input.remove();
      }
    };

    input.click();
  };

  // Document Status dropdown state
  const [showDocStatusMenu, setShowDocStatusMenu] = useState(false);
  const docStatusMenuRef = useRef<HTMLDivElement>(null);

  // Snapshots & Checkpoints modal state
  const [showSnapshotsModal, setShowSnapshotsModal] = useState(false);

  // In-Document Search & Replace (Ctrl+F) state
  const [isFindBarOpen, setIsFindBarOpen] = useState(false);
  const [findInitialQuery, setFindInitialQuery] = useState('');

  const handleOpenFindBar = useCallback(() => {
    let selected = '';
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      selected = sel.toString().trim();
    }
    setFindInitialQuery(selected);
    setIsFindBarOpen(true);
  }, []);

  // Global Ctrl+F / Cmd+F shortcut listener for document search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        handleOpenFindBar();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleOpenFindBar]);

  // English spell check, review drawer, and custom dictionary state
  const [showSpellCheckModal, setShowSpellCheckModal] = useState(false);
  const [showSpellCheckReview, setShowSpellCheckReview] = useState(false);
  const [highlightInDoc, setHighlightInDoc] = useState(true);
  const [spellCheckEnabled, setSpellCheckState] = useState<boolean>(() => getSpellCheckEnabled());
  const [customWords, setCustomWords] = useState<string[]>(() => getCustomDictionary(activeMundusId));
  const [ignoredWords, setIgnoredWords] = useState<string[]>([]);

  useEffect(() => {
    setCustomWords(getCustomDictionary(activeMundusId));
  }, [activeMundusId]);

  // Comprehensive project dictionary: user custom words + all character names and individual name parts + codex titles
  const effectiveCustomWords = React.useMemo(() => {
    const set = new Set<string>();
    customWords.forEach((w) => {
      if (w) set.add(w.toLowerCase().trim());
    });

    // Automatically incorporate all character names, aliases, and constituent name tokens (e.g. "Kaelen Vance" -> "kaelen", "vance")
    characters.forEach((char) => {
      if (char.name) {
        const full = char.name.trim().toLowerCase();
        set.add(full);
        full.split(/[\s\-_,.'"]+/).filter((w) => w.length > 1).forEach((w) => set.add(w));
      }
      if (char.aliases) {
        const fullAlias = char.aliases.trim().toLowerCase();
        set.add(fullAlias);
        fullAlias.split(/[\s\-_,.'"]+/).filter((w) => w.length > 1).forEach((w) => set.add(w));
      }
      if (char.families) {
        char.families.forEach((fam) => {
          if (fam) {
            set.add(fam.toLowerCase().trim());
            fam.toLowerCase().split(/[\s\-_,.'"]+/).filter((w) => w.length > 1).forEach((w) => set.add(w));
          }
        });
      }
      if (char.factions) {
        char.factions.forEach((fac) => {
          if (fac) {
            set.add(fac.toLowerCase().trim());
            fac.toLowerCase().split(/[\s\-_,.'"]+/).filter((w) => w.length > 1).forEach((w) => set.add(w));
          }
        });
      }
    });

    // Automatically incorporate all Codex entry titles and subheadings
    codexEntries.forEach((entry) => {
      if (entry.title) {
        const full = entry.title.trim().toLowerCase();
        set.add(full);
        full.split(/[\s\-_,.'"]+/).filter((w) => w.length > 1).forEach((w) => set.add(w));
      }
      if (entry.subtitle) {
        const fullSub = entry.subtitle.trim().toLowerCase();
        set.add(fullSub);
        fullSub.split(/[\s\-_,.'"]+/).filter((w) => w.length > 1).forEach((w) => set.add(w));
      }
    });

    return Array.from(set);
  }, [customWords, characters, codexEntries]);

  // Debounced scan of text for misspelled words to eliminate typing latency
  const [misspellings, setMisspellings] = useState<MisspelledWordInfo[]>([]);

  // v0.7.83: DOM-structure epoch. execCommand('font'|'fontSize'|'bold'|...) wraps
  // text nodes in new elements — a CHILD-LIST mutation that leaves plainText
  // untouched — and detaches the original text nodes the CSS Custom Highlight
  // ranges point at, so every highlight silently collapsed after a formatting
  // change and the text-based effects below never re-ran. This epoch is bumped
  // (debounced) by a childList-only subtree observer and is a dependency of BOTH
  // the spellcheck and character-name highlight effects, forcing them to re-anchor
  // their ranges from a fresh DOM walk. characterData and attributes are
  // deliberately NOT observed: per-keystroke text edits and pagination style/class
  // churn must not trigger re-scans (typing performance is untouched). The editor
  // div is uncontrolled JSX, so React never rewrites its children — no
  // observer/React feedback loop.
  const [domStructureEpoch, setDomStructureEpoch] = useState(0);

  useEffect(() => {
    if (!spellCheckEnabled) {
      setMisspellings([]);
      return;
    }

    const currentText = (editorRef.current ? extractPlainTextFromEditor(editorRef.current) : document.plainText) || '';
    if (!currentText.trim()) {
      setMisspellings([]);
      return;
    }

    const timer = setTimeout(() => {
      const detected = scanForMisspellings(
        currentText, 
        effectiveCustomWords, 
        ignoredWords, 
        showSpellCheckReview
      );
      setMisspellings(detected);
    }, 250);

    return () => clearTimeout(timer);
  }, [spellCheckEnabled, document.plainText, effectiveCustomWords, ignoredWords, showSpellCheckReview]);

  // -----------------------------------------------------------------------
  // Inline autocorrect suggestion (v0.7.8)
  // After a short typing pause, the word that just finished at the caret is
  // checked against the dictionary (+ project-learned words). If it is
  // misspelled, a small popup near the caret offers the top correction:
  // Tab accepts, Esc dismisses, any further typing/caret move dismisses.
  // The red wavy underline (spell-errors highlight) stays untouched — the
  // popup is purely additive.
  // -----------------------------------------------------------------------
  interface InlineSuggestionState {
    originalWord: string;
    replacement: string;
    alternatives: string[];
    rectTop: number;
    rectBottom: number;
    rectLeft: number;
    textNode: Node;
    startOffset: number;
    endOffset: number;
    // Present when the suggestion comes from the Harper grammar engine
    // (v0.7.91-NIGHTLY); absent on the dictionary fallback path.
    lintKind?: string;
    grammarMessage?: string;
  }
  const [inlineSuggestion, setInlineSuggestion] = useState<InlineSuggestionState | null>(null);
  const inlineSuggestionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const suggestionOpen = inlineSuggestion !== null;
  // Mirror of the state for event handlers (avoids stale closures)
  const inlineSuggestionRef = useRef<InlineSuggestionState | null>(null);
  useEffect(() => {
    inlineSuggestionRef.current = inlineSuggestion;
  }, [inlineSuggestion]);

  // Dismiss the popup on scroll (position would drift) or when the caret
  // actually MOVES away from the anchored word. A plain "hide on any
  // selectionchange" is not enough: Chrome fires a trailing selectionchange
  // after typing/pagination even though the caret never moved, which used to
  // kill the popup the instant it appeared.
  useEffect(() => {
    if (!suggestionOpen) return;
    const hide = () => setInlineSuggestion(null);
    const onScroll = () => hide();
    const onSelectionChange = () => {
      const s = inlineSuggestionRef.current;
      if (!s) return;
      const sel = window.getSelection();
      if (!sel || sel.focusNode !== s.textNode || sel.focusOffset !== s.endOffset) {
        setInlineSuggestion(null);
      }
    };
    window.addEventListener('scroll', onScroll, true);
    // NOTE: `document` inside this component is the NovelDocument PROP, not
    // the global document — always use window.document for DOM APIs.
    window.document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [suggestionOpen]);

  // Drop any pending inline-suggestion check on unmount / doc switch
  useEffect(() => {
    return () => {
      if (inlineSuggestionTimerRef.current) clearTimeout(inlineSuggestionTimerRef.current);
    };
  }, [document.id]);

  // Clean punctuation and whitespace from selection text
  const cleanSelectionText = (text: string): string => {
    return text.trim().toLowerCase().replace(/^["'“‘(\[\s]+|["'”’)\].,;:!?\s]+$/g, '').replace(/\s+/g, ' ');
  };

  // Helper for computing Levenshtein distance
  const computeLevenshteinDistance = (a: string, b: string): number => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const temp = row[j];
        if (a[i - 1] === b[j - 1]) {
          row[j] = prev;
        } else {
          row[j] = Math.min(prev, row[j], row[j - 1]) + 1;
        }
        prev = temp;
      }
    }
    return row[b.length];
  };

  // Accurate Codex matching helper for selection and mentions
  const findMatchingCodex = useCallback((text: string, entries: CodexEntry[]): CodexEntry | undefined => {
    if (!text || !text.trim()) return undefined;
    const clean = cleanSelectionText(text);
    if (clean.length < 2) return undefined;

    // 1. Exact title match (e.g. "house vance of oakhaven" === "house vance of oakhaven")
    let found = entries.find((e) => cleanSelectionText(e.title) === clean);
    if (found) return found;

    // 2. Exact subtitle match
    found = entries.find((e) => e.subtitle && cleanSelectionText(e.subtitle) === clean);
    if (found) return found;

    // 3. Exact tag match (e.g. "nobility" or "#nobility")
    found = entries.find((e) => e.tags && e.tags.some((t) => {
      const tagClean = cleanSelectionText(t).replace(/^#/, '');
      return tagClean === clean;
    }));
    if (found) return found;

    // 4. Exact significant title phrase match (e.g. "House Vance" in "House Vance of Oakhaven", whole word boundaries, clean >= 4 chars)
    if (clean.length >= 4) {
      found = entries.find((e) => {
        const cleanTitle = cleanSelectionText(e.title);
        const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'i');
        return regex.test(cleanTitle);
      });
      if (found) return found;
    }

    // 5. Tight fuzzy match on title (only if clean >= 5 chars and edit distance <= 1)
    if (clean.length >= 5) {
      found = entries.find((e) => {
        const cleanTitle = cleanSelectionText(e.title);
        return Math.abs(cleanTitle.length - clean.length) <= 1 && computeLevenshteinDistance(cleanTitle, clean) <= 1;
      });
      if (found) return found;
    }

    return undefined;
  }, []);

  // Accurate character matching helper for selection and mentions
  const findMatchingCharacter = useCallback((text: string, chars: Character[], codexes?: CodexEntry[]): Character | undefined => {
    if (!text || !text.trim()) return undefined;
    const clean = cleanSelectionText(text);
    if (clean.length < 2) return undefined;

    // 1. Exact full name match (e.g. "kaelen vance" === "kaelen vance")
    let found = chars.find((c) => cleanSelectionText(c.name) === clean);
    if (found) return found;

    // 2. Exact alias match
    found = chars.find((c) => {
      if (!c.aliases) return false;
      const aliases = c.aliases.toLowerCase().split(',').map((a) => cleanSelectionText(a));
      return aliases.includes(clean);
    });
    if (found) return found;

    // 3. Exact first name match (e.g. "kaelen" matches "Kaelen Vance")
    if (clean.length >= 2) {
      found = chars.find((c) => {
        const parts = c.name.toLowerCase().split(/\s+/).map((p) => cleanSelectionText(p)).filter(Boolean);
        return parts.length > 0 && parts[0] === clean;
      });
      if (found) return found;
    }

    // 4. Word in character name (e.g. secondary name/surname like "vance" in "Kaelen Vance")
    // If a Codex entry matches this term (e.g. "House Vance"), prioritize the Codex entry over character surname!
    if (clean.length >= 3) {
      const hasMatchingCodex = codexes ? Boolean(findMatchingCodex(text, codexes)) : false;
      if (!hasMatchingCodex) {
        found = chars.find((c) => {
          const parts = c.name.toLowerCase().split(/\s+/).map((p) => cleanSelectionText(p)).filter((p) => p.length >= 3);
          return parts.includes(clean);
        });
        if (found) return found;
      }
    }

    // 5. Tight fuzzy match on full name (only if length >= 4 and edit distance <= 1)
    if (clean.length >= 4) {
      found = chars.find((c) => {
        const cName = cleanSelectionText(c.name);
        return Math.abs(cName.length - clean.length) <= 1 && computeLevenshteinDistance(cName, clean) <= 1;
      });
      if (found) return found;
    }

    return undefined;
  }, [findMatchingCodex]);

  // Count of Codex entities & characters detected in current active document (debounced to avoid typing lag)
  const [detectedSceneCount, setDetectedSceneCount] = useState<number>(0);

  useEffect(() => {
    if (!document.plainText || !document.plainText.trim()) {
      setDetectedSceneCount(0);
      return;
    }
    const timer = setTimeout(() => {
      const lower = document.plainText.toLowerCase();
      let count = 0;
      for (const entry of codexEntries) {
        if (!entry.title) continue;
        const titleLower = entry.title.toLowerCase().trim();
        if (lower.includes(titleLower) || titleLower.split(/\s+/).some((w) => w.length >= 4 && lower.includes(w))) {
          count++;
        }
      }
      for (const char of characters) {
        if (!char.name) continue;
        const charLower = char.name.toLowerCase().trim();
        if (lower.includes(charLower) || charLower.split(/\s+/).some((w) => w.length >= 3 && lower.includes(w))) {
          count++;
        }
      }
      setDetectedSceneCount(count);
    }, 600);

    return () => clearTimeout(timer);
  }, [codexEntries, characters, document.plainText]);

  // v0.7.83: childList-only subtree MutationObserver -> debounced domStructureEpoch
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    let timerId: NodeJS.Timeout | null = null;
    const observer = new MutationObserver(() => {
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(() => setDomStructureEpoch((n) => n + 1), 180);
    });
    observer.observe(el, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (timerId) clearTimeout(timerId);
    };
  }, [document.id]);

  // CSS Custom Highlight API for spellcheck
  useEffect(() => {
    if (!spellCheckEnabled || misspellings.length === 0 || !highlightInDoc) {
      if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
        try { (CSS as any).highlights.delete('spell-errors'); } catch (e) {}
      }
      return;
    }

    let timerId: NodeJS.Timeout | null = null;

    const applyHighlights = () => {
      if (!editorRef.current) return;
      if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
        try {
          const rangeList: Range[] = [];
          const treeWalker = window.document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT);
          let node;
          
          // Build a fast lookup regex for misspellings, sorted longest-first
          const words = misspellings
            .map((m) => m.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .sort((a, b) => b.length - a.length);

          if (words.length > 0) {
            const regex = new RegExp(`\\b(${words.join('|')})\\b`, 'gi');
            
            while ((node = treeWalker.nextNode())) {
              const text = node.nodeValue || '';
              if (!text.trim()) continue;
              regex.lastIndex = 0; // Guard against regex state drift across text nodes
              let match;
              while ((match = regex.exec(text)) !== null) {
                const range = window.document.createRange();
                range.setStart(node, match.index);
                range.setEnd(node, match.index + match[0].length);
                rangeList.push(range);
              }
            }
            
            if (rangeList.length > 0) {
              const highlight = new (window as any).Highlight(...rangeList);
              (CSS as any).highlights.set('spell-errors', highlight);
            } else {
              (CSS as any).highlights.delete('spell-errors');
            }
          }
        } catch (e) {
          console.error('Highlight API error', e);
        }
      }
    };

    // Debounce spellcheck highlight application so typing never hitches or stutters
    timerId = setTimeout(() => {
      applyHighlights();
    }, 150);

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [misspellings, spellCheckEnabled, highlightInDoc, document.id, domStructureEpoch]);

  // ============================================================
  // Character Name Badge-Color Highlighting
  // ------------------------------------------------------------
  // When enabled in Settings, this finds character names (full name,
  // individual name parts ≥3 chars, and aliases ≥2 chars) inside the
  // editor's text and paints each occurrence with that character's
  // `avatarColor` (the "badge color" from their character card).
  //
  // Implementation notes:
  //  * Uses the CSS Custom Highlight API — same mechanism as spellcheck
  //    and find/replace — so the DOM is never modified and the cursor /
  //    contentEditable behavior is not disturbed.
  //  * One named Highlight is registered per character
  //    (`mundus-char-<sanitized-id>`), and a single injected <style> tag
  //    defines `::highlight(...)` rules using each character's color.
  //  * Overlap resolution: longer matches win over shorter ones, both
  //    within a single character and across multiple characters.
  // ============================================================
  useEffect(() => {
    const supportsHighlightApi = typeof CSS !== 'undefined' && 'highlights' in CSS;

    // Always-on cleanup helper used both for the "toggle off" branch
    // and for React's unmount / dep-change cleanup.
    const clearAllCharacterHighlights = () => {
      if (supportsHighlightApi) {
        try {
          const highlights = (CSS as any).highlights;
          const namesToRemove: string[] = [];
          highlights.forEach((_: unknown, name: string) => {
            if (name.startsWith(CHAR_HIGHLIGHT_PREFIX)) namesToRemove.push(name);
          });
          namesToRemove.forEach((name) => {
            try { highlights.delete(name); } catch (e) {}
          });
        } catch (e) {}
      }
      const existingStyle = window.document.getElementById(CHAR_HIGHLIGHT_STYLE_ID);
      if (existingStyle) existingStyle.remove();
    };

    if (!characterNameHighlightEnabled) {
      clearAllCharacterHighlights();
      return;
    }

    if (!supportsHighlightApi || !editorRef.current) {
      clearAllCharacterHighlights();
      return;
    }

    // Debounce so rapid typing doesn't re-walk the DOM on every keystroke.
    const timerId = setTimeout(() => {
      if (!editorRef.current) {
        clearAllCharacterHighlights();
        return;
      }

      // ---- 1. Build per-character search-term lists ------------------
      type CharEntry = {
        char: Character;
        terms: string[];     // sorted longest-first
        highlightName: string;
        color: string;
      };

      const charEntries: CharEntry[] = [];
      for (const char of characters) {
        if (!char || !char.name) continue;
        const termSet = new Set<string>();
        const fullName = char.name.trim();
        if (fullName.length >= 2) termSet.add(fullName);
        fullName.split(/\s+/).filter((p) => p.length >= 3).forEach((p) => termSet.add(p));
        if (char.aliases) {
          char.aliases
            .split(',')
            .map((a) => a.trim())
            .filter((a) => a.length >= 2)
            .forEach((a) => termSet.add(a));
        }
        if (termSet.size === 0) continue;

        const terms = Array.from(termSet).sort((a, b) => b.length - a.length);
        const safeId = char.id.replace(/[^a-zA-Z0-9_-]/g, '-');
        charEntries.push({
          char,
          terms,
          highlightName: `${CHAR_HIGHLIGHT_PREFIX}${safeId}`,
          color: (char.avatarColor && char.avatarColor.trim()) || '#8b5cf6',
        });
      }

      if (charEntries.length === 0) {
        clearAllCharacterHighlights();
        return;
      }

      // ---- 2. Walk text nodes once; collect global-offset segments --
      const textSegments: { node: Text; start: number; end: number; text: string }[] = [];
      const walker = window.document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT);
      let globalOffset = 0;
      let textNode: Node | null;
      while ((textNode = walker.nextNode())) {
        const text = (textNode as Text).nodeValue || '';
        if (!text) continue;
        textSegments.push({
          node: textNode as Text,
          start: globalOffset,
          end: globalOffset + text.length,
          text,
        });
        globalOffset += text.length;
      }

      if (textSegments.length === 0) {
        clearAllCharacterHighlights();
        return;
      }

      // ---- 3. Find all matches for every character's terms -----------
      type Match = { start: number; end: number; charIdx: number; len: number };
      const allMatches: Match[] = [];

      charEntries.forEach((entry, charIdx) => {
        for (const term of entry.terms) {
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // \b works for ASCII identifiers; for unicode we add lookarounds.
          let regex: RegExp;
          try {
            regex = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu');
          } catch {
            // Fallback for browsers without lookbehind / unicode property escapes
            regex = new RegExp(`\\b${escaped}\\b`, 'gi');
          }
          for (const seg of textSegments) {
            regex.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = regex.exec(seg.text)) !== null) {
              const start = seg.start + m.index;
              const end = start + m[0].length;
              if (end > start) {
                allMatches.push({ start, end, charIdx, len: m[0].length });
              }
              // Guard against zero-length matches creating infinite loops
              if (m.index === regex.lastIndex) regex.lastIndex++;
            }
          }
        }
      });

      // ---- 4. Resolve overlaps: longest match wins ------------------
      allMatches.sort((a, b) => b.len - a.len || a.start - b.start);
      const kept: Match[] = [];
      for (const m of allMatches) {
        let overlap = false;
        for (const k of kept) {
          if (m.start < k.end && k.start < m.end) { overlap = true; break; }
        }
        if (!overlap) kept.push(m);
      }

      // ---- 5. Group by character and convert global offsets → Ranges
      const matchesByChar = new Map<number, Match[]>();
      for (const m of kept) {
        if (!matchesByChar.has(m.charIdx)) matchesByChar.set(m.charIdx, []);
        matchesByChar.get(m.charIdx)!.push(m);
      }

      // Build a Range from (globalStart, globalEnd) by locating the
      // corresponding text segments. Since matches never cross segment
      // boundaries (we matched within single text nodes), this is straightforward.
      const buildRange = (globalStart: number, globalEnd: number): Range | null => {
        const seg = textSegments.find((s) => globalStart >= s.start && globalEnd <= s.end);
        if (!seg) return null;
        try {
          const range = window.document.createRange();
          range.setStart(seg.node, globalStart - seg.start);
          range.setEnd(seg.node, globalEnd - seg.start);
          return range;
        } catch (e) {
          return null;
        }
      };

      // ---- 6. Register Highlights & inject dynamic CSS rules --------
      const highlights = (CSS as any).highlights;
      // Clear any previously-registered character highlights.
      const existingNames: string[] = [];
      highlights.forEach((_: unknown, name: string) => {
        if (name.startsWith(CHAR_HIGHLIGHT_PREFIX)) existingNames.push(name);
      });
      existingNames.forEach((name) => {
        try { highlights.delete(name); } catch (e) {}
      });

      let cssText = '';
      charEntries.forEach((entry, charIdx) => {
        const matches = matchesByChar.get(charIdx) || [];
        if (matches.length === 0) return;

        const ranges: Range[] = [];
        for (const m of matches) {
          const r = buildRange(m.start, m.end);
          if (r) ranges.push(r);
        }
        if (ranges.length === 0) return;

        try {
          const highlight = new (window as any).Highlight(...ranges);
          highlights.set(entry.highlightName, highlight);
        } catch (e) {
          console.warn('Failed to register character name highlight for', entry.char.name, e);
          return;
        }

        // Soft tinted background + underline in the character's badge color.
        // `${color}26` ≈ 15% alpha background tint; underline uses solid color.
        // (border-radius is intentionally omitted — ::highlight() only
        //  supports a limited property set: color, background-color,
        //  text-decoration longhands, text-shadow, fill/stroke.)
        cssText += `@supports (selector(::highlight(${entry.highlightName}))) {\n  ::highlight(${entry.highlightName}) {\n    background-color: ${entry.color}26;\n    color: ${entry.color};\n    text-decoration: underline ${entry.color};\n    text-decoration-thickness: 1.5px;\n    text-underline-offset: 2.5px;\n  }\n}\n`;
      });

      // Inject or update the single shared <style> tag for all character highlights.
      let styleEl = window.document.getElementById(CHAR_HIGHLIGHT_STYLE_ID) as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = window.document.createElement('style');
        styleEl.id = CHAR_HIGHLIGHT_STYLE_ID;
        window.document.head.appendChild(styleEl);
      }
      styleEl.textContent = cssText;
    }, 220);

    return () => {
      if (timerId) clearTimeout(timerId);
      // Clean up DOM highlights when toggled off, when characters change,
      // or when the component unmounts.
      if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
        try {
          const highlights = (CSS as any).highlights;
          const namesToRemove: string[] = [];
          highlights.forEach((_: unknown, name: string) => {
            if (name.startsWith(CHAR_HIGHLIGHT_PREFIX)) namesToRemove.push(name);
          });
          namesToRemove.forEach((name) => {
            try { highlights.delete(name); } catch (e) {}
          });
        } catch (e) {}
      }
      const styleEl = window.document.getElementById(CHAR_HIGHLIGHT_STYLE_ID);
      if (styleEl) styleEl.remove();
    };
  }, [characterNameHighlightEnabled, characters, document.plainText, document.id, domStructureEpoch]);

  // Handle replacing misspelled word directly in the manuscript
  const handleReplaceMisspelledWord = (originalWord: string, replacement: string) => {
    if (!editorRef.current) return;
    const regex = new RegExp(`\\b${originalWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const treeWalker = window.document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT);
    let node;
    let replaced = false;
    while ((node = treeWalker.nextNode())) {
      const text = node.nodeValue || '';
      if (regex.test(text)) {
        node.nodeValue = text.replace(regex, replacement);
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      editorRef.current.innerHTML = editorRef.current.innerHTML.replace(regex, replacement);
    }
    // Instantly remove original word from misspellings
    setMisspellings((prev) => prev.filter((m) => m.word.toLowerCase() !== originalWord.toLowerCase()));
    flushInput();
  };

  const handleAddWordFromReview = (word: string) => {
    const target = word.toLowerCase().trim();
    // Instantly remove from flagged list in UI
    setMisspellings((prev) => prev.filter((m) => m.word.toLowerCase() !== target));
    const updated = addWordToDictionary(word, activeMundusId);
    setCustomWords(updated);
    onSaveCustomWords?.(updated);
  };

  const handleIgnoreWord = (word: string) => {
    const target = word.toLowerCase().trim();
    // Instantly remove from flagged list in UI
    setMisspellings((prev) => prev.filter((m) => m.word.toLowerCase() !== target));
    setIgnoredWords((prev) => [...prev, target]);
  };

  // Dynamic tracking of formatting at the current selection / cursor
  const [currentSelectionFontFamily, setCurrentSelectionFontFamily] = useState<string>('serif');
  const [currentSelectionFontSize, setCurrentSelectionFontSize] = useState<number>(16);
  const [fontSizeInputValue, setFontSizeInputValue] = useState<string>('16');

  // Page Zoom State (50% to 200%, default 100%)
  const [pageZoom, setPageZoom] = useState<number>(100);
  const [showPageZoomMenu, setShowPageZoomMenu] = useState<boolean>(false);
  const [isFontSizeDropdownOpen, setIsFontSizeDropdownOpen] = useState<boolean>(false);
  const [isFontFamilyDropdownOpen, setIsFontFamilyDropdownOpen] = useState<boolean>(false);
  const [isBlockFormatDropdownOpen, setIsBlockFormatDropdownOpen] = useState<boolean>(false);
  const [isMobileTypographyOpen, setIsMobileTypographyOpen] = useState<boolean>(false);
  const [isMobileFontEffectsOpen, setIsMobileFontEffectsOpen] = useState<boolean>(false);
  const [isMobileAlignmentsOpen, setIsMobileAlignmentsOpen] = useState<boolean>(false);
  const [isMobileListsOpen, setIsMobileListsOpen] = useState<boolean>(false);

  // Mobile Pinch-to-Zoom touch handling
  const touchDistanceRef = useRef<number | null>(null);
  const initialPinchZoomRef = useRef<number>(100);

  const handleEditorTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchDistanceRef.current = dist;
      initialPinchZoomRef.current = pageZoom;
    }
  };

  const handleEditorTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchDistanceRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (dist > 10) {
        const factor = dist / touchDistanceRef.current;
        const newZoom = Math.min(200, Math.max(50, Math.round((initialPinchZoomRef.current * factor) / 5) * 5));
        setPageZoom(newZoom);
      }
    }
  };

  const handleEditorTouchEnd = () => {
    touchDistanceRef.current = null;
  };

  // Saved DOM Selection Range Ref (to avoid losing text highlight when clicking font size box)
  // Already declared above as Ref

  const saveEditorSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current) {
      const range = sel.getRangeAt(0);
      if (editorRef.current.contains(range.commonAncestorContainer)) {
        savedSelectionRangeRef.current = range.cloneRange();
      }
    }
  };

  const removeVisualSelectionHighlight = () => {
    if (!editorRef.current) return;
    const tempSpans = editorRef.current.querySelectorAll('.mundus-temp-selection-highlight');
    let newRange: Range | null = null;
    
    tempSpans.forEach((span) => {
      const parent = span.parentNode;
      if (parent) {
        const firstChild = span.firstChild;
        const lastChild = span.lastChild;
        
        while (span.firstChild) {
          parent.insertBefore(span.firstChild, span);
        }
        
        // If this span was the highlighted one, we can reconstruct a range
        if (firstChild && lastChild) {
          const r = window.document.createRange();
          r.setStartBefore(firstChild);
          r.setEndAfter(lastChild);
          newRange = r;
        }
        
        parent.removeChild(span);
      }
    });
    
    if (newRange) {
      savedSelectionRangeRef.current = newRange;
    }
  };

  // Pure non-destructive selection saving (never injects temporary blue highlighter spans into document DOM)
  const applyVisualSelectionHighlight = () => {
    removeVisualSelectionHighlight();
    saveEditorSelection();
  };

  const restoreEditorSelection = () => {
    removeVisualSelectionHighlight();
    if (savedSelectionRangeRef.current && editorRef.current) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedSelectionRangeRef.current);
      }
    }
  };

  // Active formatting state for top bar buttons (Word-style)
  interface ActiveFormats {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
    alignLeft: boolean;
    alignCenter: boolean;
    alignRight: boolean;
    alignJustify: boolean;
    bulletList: boolean;
    orderedList: boolean;
    quote: boolean;
    formatBlock: string;
  }

  const [activeFormats, setActiveFormats] = useState<ActiveFormats>({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    alignLeft: true,
    alignCenter: false,
    alignRight: false,
    alignJustify: false,
    bulletList: false,
    orderedList: false,
    quote: false,
    formatBlock: 'p'
  });

  // Active page format configuration (US Letter, A4, A5, Trade Paperback, Pocket Book)
  const pageConfig = React.useMemo(() => getPageFormatConfig(pageFormat), [pageFormat]);

  // Real-time pagination calculation (pages count & active page matching physical sheets)
  const PAGE_SHEET_HEIGHT = pageConfig.height;
  const PAGE_GAP = pageConfig.gap;
  const PAGE_CYCLE = pageConfig.height + pageConfig.gap;
  const TOP_MARGIN = pageConfig.topMargin;
  const BOTTOM_MARGIN = pageConfig.bottomMargin;
  const PRINTABLE_MAX = PAGE_SHEET_HEIGHT - TOP_MARGIN - BOTTOM_MARGIN;

  const [pageStats, setPageStats] = useState({ current: 1, total: 1 });
  const isNormalizingPagesRef = useRef(false);
  const paginationFrameRef = useRef<number | null>(null);

  const getTopLevelEditorBlock = useCallback((node: Node | null): HTMLElement | null => {
    if (!node || !editorRef.current) return null;
    let current: Node | null = node;
    while (current && current.parentNode !== editorRef.current && current !== editorRef.current) {
      current = current.parentNode;
    }
    return current && current !== editorRef.current && current instanceof HTMLElement ? current : null;
  }, []);

  const queuePagination = useCallback(() => {
    if (paginationFrameRef.current !== null) {
      cancelAnimationFrame(paginationFrameRef.current);
    }
    paginationFrameRef.current = window.requestAnimationFrame(() => {
      paginationFrameRef.current = null;
      normalizeDocumentPages();
    });
  }, []);

  // Virtual Page-Gap Pagination Engine (Option 1 Architecture):
  // Eliminates physical spacer divs entirely! Uses virtual CSS page gaps (is-page-start + margin-top)
  // so backspacing, cursor flow, and typing across pages are completely native and failproof.
  const normalizeDocumentPages = useCallback(() => {
    if (!editorRef.current || isNormalizingPagesRef.current) return;
    isNormalizingPagesRef.current = true;
    const editor = editorRef.current;

    try {
      // 1. Strip any legacy automatic page-break divs (only explicit manual page breaks remain)
      const autoBreaks = Array.from(editor.querySelectorAll('.mundus-page-break:not([data-manual-page-break])')) as HTMLElement[];
      autoBreaks.forEach((pb) => pb.remove());

      const rawText = (editor.textContent || '').replace(/[\n\r\t\s\u00a0]+/g, '');
      if (!rawText) {
        const allChildren = Array.from(editor.children) as HTMLElement[];
        allChildren.forEach((child) => {
          child.style.removeProperty('margin-top');
          child.classList.remove('is-page-start', 'mundus-page-start');
        });
        setPageStats({ current: 1, total: 1 });
        return;
      }

      // 2. Iterate through top-level block children and apply virtual page-gap margins
      const children = Array.from(editor.children) as HTMLElement[];

      // PRE-PASS: strip stale pagination markers + inline virtual-gap margins so
      // getComputedStyle returns the block's real CSS margin-top (not the previous
      // page-gap inline value) and so no stale margins consume layout space.
      children.forEach((child) => {
        if (child.classList.contains('is-page-start') || child.classList.contains('mundus-page-start')) {
          child.style.removeProperty('margin-top');
          child.classList.remove('is-page-start', 'mundus-page-start');
        }
      });

      let currentPage = 0;
      let currentPageHeight = 0;
      // Trailing (collapsed) margin of the last block placed on the current page.
      // CRITICAL FIX: CSS margin collapsing absorbs this trailing margin into the next
      // block's page-gap margin-top (max() rule). Without compensating for it, every new
      // page started one paragraph-margin higher than intended - and the error accumulated
      // page after page until the text drifted above the physical sheet.
      let trailingMargin = 0;

      // Fractional height measurement: offsetHeight rounds to integers, which accumulates
      // ~0.5px of drift per block (line heights like 28.8px x3 = 86.4px report as 86) and
      // visibly shifts pages over long documents. getBoundingClientRect returns fractional
      // values, so divide out the page-zoom transform scale to get true layout pixels.
      const editorRect = editor.getBoundingClientRect();
      const editorScale = editor.offsetWidth > 0 && editorRect.width > 0 ? editorRect.width / editor.offsetWidth : 1;
      const measureHeight = (el: HTMLElement): number => {
        const rectH = el.getBoundingClientRect().height;
        return rectH > 0 ? rectH / editorScale : el.offsetHeight;
      };

      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (!child.isConnected) continue;

        // Legacy Manual Page Break (pre-spacer documents; Ctrl+Enter now inserts .mundus-spacer blocks instead)
        if (child.classList.contains('mundus-manual-page-break') || child.hasAttribute('data-manual-page-break')) {
          const leftoverOnPrevPage = Math.max(0, PRINTABLE_MAX - currentPageHeight);
          const gap = leftoverOnPrevPage + BOTTOM_MARGIN + PAGE_GAP + TOP_MARGIN + trailingMargin;
          child.style.marginTop = `${gap}px`;
          child.classList.add('is-page-start', 'mundus-page-start');
          currentPage++;
          // The break divider itself renders at the top of the new sheet (pill + margins),
          // so count it as the first occupied block on the new page to keep every
          // following page-start aligned with its sheet.
          const breakH = measureHeight(child);
          const breakMB = parseFloat(window.getComputedStyle(child).marginBottom) || 0;
          currentPageHeight = breakH + breakMB;
          trailingMargin = breakMB;
          continue;
        }

        // Measure substantive block height
        const childHeight = measureHeight(child);
        const style = window.getComputedStyle(child);
        const marginBottom = parseFloat(style.marginBottom) || 0;
        // CSS margin-top (stale inline page-gaps were stripped in the pre-pass above)
        const cssMarginTop = parseFloat(style.marginTop) || 0;
        let blockOccupiedHeight = childHeight + marginBottom;

        // If this child is a visual image portal node, ensure realistic occupied height so it never lands in page gap
        if (child.hasAttribute('data-visual-image-id') || child.classList.contains('visual-image-portal-node')) {
          const vImgId = child.getAttribute('data-visual-image-id');
          const matchedImg = (document.visualImages || []).find((v) => v.id === vImgId);
          const imgTag = child.querySelector('img');
          const renderedH = imgTag && imgTag.offsetHeight > 50 
            ? imgTag.offsetHeight 
            : imgTag && imgTag.naturalHeight && imgTag.naturalWidth 
            ? Math.round((imgTag.naturalHeight / imgTag.naturalWidth) * (child.offsetWidth || matchedImg?.width || 280)) 
            : 240;
          blockOccupiedHeight = Math.max(childHeight + marginBottom, renderedH + marginBottom, 240);
        }

        // Skip unattached zero-height empty nodes
        if (blockOccupiedHeight <= 0 && !child.querySelector('img, [data-visual-image-id]')) {
          continue;
        }

        // Space consumed between the previous block and this one due to CSS margin
        // collapsing (adjacent sibling margins collapse to max(), they do NOT add up).
        // The previous block's margin-bottom is already counted inside currentPageHeight,
        // so only the EXTRA margin-top beyond it consumes additional space.
        const extraMarginTop = Math.max(0, cssMarginTop - trailingMargin);
        const consumedHeight = extraMarginTop + blockOccupiedHeight;

        // Check if block fits on the current page
        if (currentPageHeight + consumedHeight <= PRINTABLE_MAX) {
          // Fits cleanly on current page
          if (child.style.marginTop) {
            child.style.removeProperty('margin-top');
          }
          if (child.classList.contains('is-page-start')) {
            child.classList.remove('is-page-start', 'mundus-page-start');
          }
          currentPageHeight += consumedHeight;
          trailingMargin = marginBottom;
        } else {
          // Block overflows current page!
          if (currentPageHeight > 0) {
            // Push to next page: jump remaining space of current page + bottom margin +
            // sheet gap + top margin. trailingMargin is added because the big page-gap
            // margin-top collapses with (absorbs) the previous block's margin-bottom.
            const leftoverOnPrevPage = Math.max(0, PRINTABLE_MAX - currentPageHeight);
            const gap = leftoverOnPrevPage + BOTTOM_MARGIN + PAGE_GAP + TOP_MARGIN + trailingMargin;
            const gapStr = `${gap}px`;

            if (child.style.marginTop !== gapStr) {
              child.style.marginTop = gapStr;
            }
            if (!child.classList.contains('is-page-start')) {
              child.classList.add('is-page-start', 'mundus-page-start');
            }
            currentPage++;
            // The inline page-gap margin-top replaces the block's own CSS margin-top
            currentPageHeight = blockOccupiedHeight;
            trailingMargin = marginBottom;
          } else {
            // Already at the top of a page, but block itself exceeds PRINTABLE_MAX (e.g. huge image or table)
            if (child.style.marginTop) {
              child.style.removeProperty('margin-top');
            }
            if (child.classList.contains('is-page-start')) {
              child.classList.remove('is-page-start', 'mundus-page-start');
            }
            // Track exactly how many full sheet cycles the block spans so the flow
            // position stays true (prevents cumulative drift after oversized blocks)
            const pagesSpanned = Math.floor(consumedHeight / PAGE_CYCLE);
            currentPage += pagesSpanned;
            currentPageHeight = consumedHeight - pagesSpanned * PAGE_CYCLE;
            trailingMargin = marginBottom;
          }
        }
      }

      // 3. Compute final total pages and update active page from scroll position
      const finalTotal = Math.max(1, currentPage + 1);

      const scrollArea = window.document.getElementById('editor-scroll-area');
      let current = 1;
      if (scrollArea) {
        const scrollPos = scrollArea.scrollTop;
        current = Math.min(finalTotal, Math.max(1, Math.floor((scrollPos + 350) / PAGE_CYCLE) + 1));
      }

      setPageStats({ current, total: finalTotal });
    } finally {
      isNormalizingPagesRef.current = false;
    }
  }, [BOTTOM_MARGIN, PAGE_CYCLE, PAGE_GAP, PRINTABLE_MAX, TOP_MARGIN]);

  const updatePageStats = useCallback(() => {
    normalizeDocumentPages();
  }, [normalizeDocumentPages]);

    // Recalibrate pagination when page format changes
  useEffect(() => {
    updatePageStats();
  }, [pageConfig, updatePageStats]);

  const lastLoadedDocIdRef = useRef<string | null>(null);
  const lastSavedContentRef = useRef<string>(document.content || '');
  const lastVisualImagesRef = useRef<string>(JSON.stringify(document.visualImages || []));

  // Sync content into editor when document ID, document content, or visualImages changes externally (e.g. checkpoint restore)
  useEffect(() => {
    if (!editorRef.current) return;
    const isDocSwitch = lastLoadedDocIdRef.current !== document.id;
    const isExternalContentChange = document.content !== lastSavedContentRef.current;
    const currentVisualImagesStr = JSON.stringify(document.visualImages || []);
    const isVisualImagesChange = currentVisualImagesStr !== lastVisualImagesRef.current;

    // Do NOT destroy active typing DOM if the user is actively focused in the editor
    const isEditorActive =
      window.document.activeElement === editorRef.current ||
      (editorRef.current && editorRef.current.contains(window.document.activeElement));

    // While a Whistle dictation session is streaming, the editor DOM is
    // live-owned by the STT node — an innerHTML reload here would detach it
    // mid-session, so defer the reload until the session ends (the streamed
    // text is already persisted through flushInput).
    if ((isDocSwitch || (isExternalContentChange && !isEditorActive) || isVisualImagesChange) && !sttSessionRef.current) {
      lastLoadedDocIdRef.current = document.id;
      lastSavedContentRef.current = document.content || '';
      lastVisualImagesRef.current = currentVisualImagesStr;
      editorRef.current.innerHTML = sanitizeContentForLoading(document.content || '<p><br></p>');
      requestAnimationFrame(() => {
        queuePagination();
      });
      setTimeout(() => {
        queuePagination();
      }, 60);

      // Recalculate clean plain text with preserved linebreaks and update if previously corrupted without spaces
      const cleanPlain = extractPlainTextFromEditor(editorRef.current);
      if (cleanPlain && cleanPlain !== document.plainText) {
        const words = countWordsFromText(cleanPlain);
        const chars = cleanPlain.length;
        const readingTime = Math.max(1, Math.ceil(words / 200));
        setTimeout(() => {
          onUpdateDocument({
            plainText: cleanPlain,
            wordCount: words,
            characterCount: chars,
            readingTimeMinutes: readingTime,
            updatedAt: new Date().toISOString()
          });
        }, 0);
      }
    } else if (isExternalContentChange) {
      // Keep tracking prop content without disrupting active DOM typing
      lastSavedContentRef.current = document.content || '';
    }
  }, [document.id, document.content, document.plainText, document.visualImages, updatePageStats, onUpdateDocument]);

  // Dynamically observe editor content height changes and spawn physical page sheets with debounce
  useEffect(() => {
    if (!editorRef.current) return;
    let resizeTimer: NodeJS.Timeout | null = null;
    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        queuePagination();
      }, 100);
    });
    observer.observe(editorRef.current);
    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [updatePageStats]);

  const inputTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const flushInput = useCallback(() => {
    if (inputTimeoutRef.current) {
      clearTimeout(inputTimeoutRef.current);
      inputTimeoutRef.current = null;
    }
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const plain = extractPlainTextFromEditor(editorRef.current);
    
    const words = countWordsFromText(plain);
    const chars = plain.length;
    const readingTime = Math.max(1, Math.ceil(words / 200));

    const cleanedContent = cleanHtmlForSaving(html);
    lastSavedContentRef.current = cleanedContent;
    lastLoadedDocIdRef.current = document.id;

    onUpdateDocument({
      content: cleanedContent,
      plainText: plain,
      wordCount: words,
      characterCount: chars,
      readingTimeMinutes: readingTime,
      updatedAt: new Date().toISOString()
    });
    queuePagination();
  }, [onUpdateDocument, queuePagination]);

  // ---------------------------------------------------------------------
  // Inline autocorrect implementation (v0.7.8)
  // ---------------------------------------------------------------------

  const hideInlineSuggestion = useCallback(() => setInlineSuggestion(null), []);

  // Viewport-space caret rectangle. Collapsed ranges at the end of a text node
  // may return an empty rect list, so fall back to getBoundingClientRect and
  // finally to the caret node's parent element.
  const measureCaretRect = (): { top: number; bottom: number; left: number } | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0).cloneRange();
    const rects = range.getClientRects();
    if (rects.length > 0) {
      const r = rects[rects.length - 1];
      if (r.bottom > 0 || r.left > 0) return { top: r.top, bottom: r.bottom, left: r.left };
    }
    const br = range.getBoundingClientRect();
    if (br && (br.bottom > 0 || br.left > 0)) return { top: br.top, bottom: br.bottom, left: br.left };
    if (sel.focusNode && sel.focusNode.nodeType === Node.TEXT_NODE && (sel.focusNode as Node).parentElement) {
      const pr = (sel.focusNode as Node).parentElement!.getBoundingClientRect();
      if (pr.bottom > 0 || pr.left > 0) return { top: pr.top, bottom: pr.bottom, left: pr.left };
    }
    return null;
  };

  // Check the finished word at the caret; if misspelled, position + show the
  // suggestion popup. Runs on a 350ms typing pause so it never competes with
  // keystrokes for the main thread.
  // Stale-guard for the async Harper check below: only the newest run may
  // open the popup.
  const harperSuggestionRunRef = useRef(0);

  const checkCaretWordForSuggestion = useCallback(() => {
    if (!spellCheckEnabled) return;
    const editor = editorRef.current;
    if (!editor) return;
    // NOTE: deliberately NOT checking document.activeElement — pagination
    // normalization transiently rebuilds the editor DOM and focus bounces to
    // body for a moment even while the user is actively typing. The real
    // safety is the selection itself: it must be a collapsed caret inside a
    // TEXT_NODE that belongs to this editor.
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return;
    const node = sel.focusNode;
    if (!node || node.nodeType !== Node.TEXT_NODE || !editor.contains(node)) return;
    const text = node.nodeValue || '';
    const cw = extractWordAtCaret(text, sel.focusOffset);
    if (!cw) return;
    // Gating: length, digits, ALL-CAPS, mid-sentence capitals (proper nouns)
    if (!shouldSuggestCaretWord(cw.cleaned, text, cw.start)) return;
    const rect = measureCaretRect();
    if (!rect) return;

    // v0.7.91-NIGHTLY: Harper-first. The WASM engine lints the whole text
    // node, so besides spelling it flags grammar/capitalization/punctuation
    // problems on (or spanning) the caret word. When Harper is unavailable
    // or has nothing at the caret we fall through to the original v0.7.8
    // dictionary flow — Tab/Esc/+Add behave exactly the same in both paths.
    const runId = ++harperSuggestionRunRef.current;
    const nodeAtCall = node;
    const textAtCall = text;
    const rectAtCall = rect;
    void (async () => {
      // v0.7.94: on Android the keyboard's autocorrect covers this job — the
      // Harper WASM engine is never loaded and its grammar popups are off.
      if (!ANDROID_APP) {
        const harperOk = await ensureHarper();
        if (!harperOk || runId !== harperSuggestionRunRef.current) return;
        if (!nodeAtCall.isConnected || nodeAtCall.nodeValue !== textAtCall) return;
        const hit = pickCaretLint(lintText(textAtCall), cw.start, cw.end);
        const harperSuggestion = hit ? lintToSuggestion(hit) : null;
        if (hit && harperSuggestion) {
          setInlineSuggestion({
            originalWord: harperSuggestion.originalWord,
            replacement: harperSuggestion.replacement,
            alternatives: harperSuggestion.alternatives,
            lintKind: harperSuggestion.lintKind,
            grammarMessage: harperSuggestion.grammarMessage,
            rectTop: rectAtCall.top,
            rectBottom: rectAtCall.bottom,
            rectLeft: rectAtCall.left,
            textNode: nodeAtCall,
            startOffset: hit.start,
            endOffset: hit.end,
          });
          return;
        }
      }
      // ---- v0.7.8 dictionary fallback (unchanged) ----
      if (!nodeAtCall.isConnected || nodeAtCall.nodeValue !== textAtCall) return;
      // Known word (dictionary + suffix rules + project-learned + user + session-ignored)
      if (isWordValid(cw.cleaned, effectiveCustomWords, ignoredWords)) return;
      const candidates = getSuggestions(cw.cleaned, effectiveCustomWords)
        .filter((s) => s.toLowerCase() !== cw.cleaned.toLowerCase());
      if (candidates.length === 0) return;
      setInlineSuggestion({
        originalWord: cw.cleaned,
        replacement: candidates[0],
        alternatives: candidates.slice(1, 3),
        rectTop: rectAtCall.top,
        rectBottom: rectAtCall.bottom,
        rectLeft: rectAtCall.left,
        textNode: nodeAtCall,
        startOffset: cw.start,
        endOffset: cw.end,
      });
    })();
  }, [spellCheckEnabled, effectiveCustomWords, ignoredWords]);

  const scheduleInlineSuggestionCheck = useCallback(() => {
    if (inlineSuggestionTimerRef.current) clearTimeout(inlineSuggestionTimerRef.current);
    if (!spellCheckEnabled) return;
    inlineSuggestionTimerRef.current = setTimeout(() => {
      checkCaretWordForSuggestion();
    }, 350);
  }, [spellCheckEnabled, checkCaretWordForSuggestion]);

  // Tab acceptance: splice the replacement into the exact text node the popup
  // was anchored to, put the caret after the corrected word, refresh stats.
  const acceptInlineSuggestion = useCallback((s: InlineSuggestionState) => {
    setInlineSuggestion(null);
    const node = s.textNode;
    if (!node || !node.isConnected) return;
    const text = node.nodeValue || '';
    if (text.slice(s.startOffset, s.endOffset).toLowerCase() !== s.originalWord.toLowerCase()) return;
    const replacement = s.replacement;
    // Harper Remove-suggestions also collapse ONE adjacent space so deleting
    // a duplicated word never leaves a double space behind.
    const [spliceStart, spliceEnd] = replacement === ''
      ? adjustedRemoveSpan(text, s.startOffset, s.endOffset)
      : [s.startOffset, s.endOffset];
    node.nodeValue = text.slice(0, spliceStart) + replacement + text.slice(spliceEnd);
    const sel = window.getSelection();
    if (sel) {
      const range = window.document.createRange();
      range.setStart(node, spliceStart + replacement.length);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    // Optimistically drop the flagged word; the debounced rescan confirms it
    setMisspellings((prev) => prev.filter((m) => m.word.toLowerCase() !== s.originalWord.toLowerCase()));
    updatePageStats();
    flushInput();
  }, [flushInput, updatePageStats]);

  // "It's supposed to be that way" escape hatch: add the word to the active
  // project's custom dictionary so it never triggers a suggestion again.
  const addInlineWordToDictionary = useCallback((s: InlineSuggestionState) => {
    const updated = addWordToDictionary(s.originalWord, activeMundusId);
    setCustomWords(updated);
    onSaveCustomWords?.(updated);
    setInlineSuggestion(null);
  }, [activeMundusId, onSaveCustomWords]);

  // -----------------------------------------------------------------------
  // Whistle STT dictation (v0.7.91-NIGHTLY)
  // A mic button next to Find starts/stops an on-device streaming session.
  // Words stream into their own text node anchored at the caret: committed
  // text appends, the pending tail is replaced on every chunk (Whistle
  // commits words once two decoder passes agree). Same button, or the
  // floating pill's Stop, ends the session.
  // -----------------------------------------------------------------------
  type SttStatus = 'idle' | 'loading' | 'listening' | 'error';
  const [sttStatus, setSttStatus] = useState<SttStatus>('idle');
  const [sttNote, setSttNote] = useState('');
  const [sttElapsed, setSttElapsed] = useState(0);
  const [sttHeard, setSttHeard] = useState(0);
  const sttSessionRef = useRef<SttSession | null>(null);
  const sttNodeRef = useRef<Text | null>(null);
  const sttCommittedRef = useRef('');
  const sttUserMovedRef = useRef(false);
  const sttTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sttStatusRef = useRef<SttStatus>('idle');
  useEffect(() => { sttStatusRef.current = sttStatus; }, [sttStatus]);

  const stopSttTimer = () => {
    if (sttTimerRef.current) {
      clearInterval(sttTimerRef.current);
      sttTimerRef.current = null;
    }
  };

  // While dictating, remember when the user deliberately clicks elsewhere:
  // the stream then keeps writing into its anchored node without hijacking
  // the caret back.
  useEffect(() => {
    if (sttStatus !== 'listening' && sttStatus !== 'loading') return;
    const onSelChange = () => {
      const t = sttNodeRef.current;
      if (!t) return;
      const sel = window.getSelection();
      if (!sel || sel.focusNode !== t) sttUserMovedRef.current = true;
    };
    window.document.addEventListener('selectionchange', onSelChange);
    return () => window.document.removeEventListener('selectionchange', onSelChange);
  }, [sttStatus]);

  const stopDictation = useCallback(async () => {
    const session = sttSessionRef.current;
    sttSessionRef.current = null;
    stopSttTimer();
    setSttStatus('idle');
    setSttNote('');
    const t = sttNodeRef.current;
    sttNodeRef.current = null;
    if (session) {
      try { await session.stop(); } catch { /* already released */ }
    }
    if (t && t.isConnected) {
      const nextChar = t.nextSibling && t.nextSibling.nodeType === Node.TEXT_NODE
        ? (t.nextSibling.nodeValue || '')[0]
        : undefined;
      const finalText = finalizeDictationText(t.nodeValue || '', nextChar);
      if (finalText !== t.nodeValue) t.nodeValue = finalText;
    }
    sttCommittedRef.current = '';
    flushInput();
    updatePageStats();
  }, [flushInput, updatePageStats]);

  const startDictation = useCallback(async () => {
    if (sttSessionRef.current) return;
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !sel.focusNode || !editor.contains(sel.focusNode)) {
      setSttStatus('error');
      setSttNote('Click in the text where dictation should start, then press the mic again.');
      setTimeout(() => {
        if (sttStatusRef.current === 'error') { setSttStatus('idle'); setSttNote(''); }
      }, 5000);
      return;
    }
    const range = sel.getRangeAt(0).cloneRange();
    // The dictation gets its own empty text node anchored at the caret; all
    // streamed words are written into it, leaving surrounding text intact.
    const tNode = window.document.createTextNode('');
    range.insertNode(tNode);
    const r2 = window.document.createRange();
    r2.setStart(tNode, 0);
    r2.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r2);
    sttNodeRef.current = tNode;
    sttCommittedRef.current = '';
    sttUserMovedRef.current = false;
    setSttStatus('loading');
    setSttNote('Loading Whistle…');
    setSttElapsed(0);
    setSttHeard(0);
    const session = new SttSession();
    sttSessionRef.current = session;
    const startedAt = Date.now();
    sttTimerRef.current = setInterval(() => setSttElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    try {
      await session.start({
        onStatus: (phase, pct) => {
          // v0.7.92 FIX: model-load progress events are emitted from the WASM
          // worker and can keep arriving AFTER start() resolved — the pill is
          // already "Listening" then, and the last "Downloading model 100%"
          // note used to stick under the recording timer forever. Only paint
          // status notes while the pill is still in its loading phase; once
          // dictation is live the note stays empty.
          if (sttStatusRef.current !== 'loading') return;
          if (phase === 'model') setSttNote(typeof pct === 'number' ? `Downloading model ${pct}%` : 'Downloading model…');
          else if (phase === 'mic') setSttNote('Waiting for microphone…');
          else setSttNote('');
        },
        onChunk: (chunk) => {
          sttCommittedRef.current = appendSttCommitted(sttCommittedRef.current, chunk.committedDelta);
          setSttHeard(Math.floor(chunk.receivedSeconds));
          if (sttStatusRef.current === 'listening') setSttNote('');
          const t = sttNodeRef.current;
          if (!t) return;
          t.nodeValue = assembleSttText(sttCommittedRef.current, chunk.pending);
          if (!sttUserMovedRef.current) {
            const s2 = window.getSelection();
            if (s2) {
              const r3 = window.document.createRange();
              r3.setStart(t, (t.nodeValue || '').length);
              r3.collapse(true);
              s2.removeAllRanges();
              s2.addRange(r3);
            }
          }
          flushInput();
          updatePageStats();
        },
        onError: (err) => {
          stopSttTimer();
          setSttStatus('error');
          setSttNote(describeSttError(err));
          sttSessionRef.current = null;
          void session.stop().catch(() => undefined);
          setTimeout(() => {
            if (sttStatusRef.current === 'error') { setSttStatus('idle'); setSttNote(''); }
          }, 6000);
        },
      });
      // The start() promise resolves after the stream begins — but an error
      // during the first awaits may already have cleaned the session up.
      if (!sttSessionRef.current) return;
      setSttStatus('listening');
      setSttNote('');
    } catch (err) {
      stopSttTimer();
      setSttStatus('error');
      setSttNote(describeSttError(err));
      sttSessionRef.current = null;
      void session.stop().catch(() => undefined);
      setTimeout(() => {
        if (sttStatusRef.current === 'error') { setSttStatus('idle'); setSttNote(''); }
      }, 6000);
    }
  }, [flushInput, updatePageStats]);

  const toggleDictation = useCallback(() => {
    // v0.7.94: Android keyboards have built-in voice input — Whistle stays a
    // desktop-only feature, so the mic is a no-op there.
    if (ANDROID_APP) return;
    if (sttSessionRef.current) void stopDictation();
    else void startDictation();
  }, [startDictation, stopDictation]);

  const sttButtonTitle = sttStatus === 'listening'
    ? `Dictating… ${sttElapsed}s — click to stop`
    : sttStatus === 'loading'
      ? 'Loading Whistle STT — click to cancel'
      : 'Start voice dictation (Whistle, fully on-device)';

  // Release the microphone when the editor unmounts or the document changes.
  useEffect(() => {
    return () => {
      if (sttSessionRef.current) {
        void sttSessionRef.current.stop().catch(() => undefined);
        sttSessionRef.current = null;
      }
      stopSttTimer();
    };
  }, [document.id]);

  // Warm up the Harper WASM engine shortly after mount so the first
  // suggestion popup appears instantly instead of after the WASM load.
  useEffect(() => {
    // v0.7.94: Android keyboards have autocorrect built in — never download
    // the Harper WASM module there.
    if (ANDROID_APP) return;
    const warm = setTimeout(() => { void ensureHarper(); }, 1200);
    return () => clearTimeout(warm);
  }, []);

  // Calculate counts and propagate updates (Debounced for zero typing latency)
  const handleEditorInput = useCallback(() => {
    // Inline autocorrect lifecycle: any input dismisses the current popup and
    // schedules a fresh check for the word that will have finished typing.
    setInlineSuggestion(null);
    scheduleInlineSuggestionCheck();

    updatePageStats();

    if (inputTimeoutRef.current) {
      clearTimeout(inputTimeoutRef.current);
    }
    inputTimeoutRef.current = setTimeout(() => {
      flushInput();
    }, 400);
  }, [flushInput, updatePageStats, scheduleInlineSuggestionCheck]);

  const formattingUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Inspect the current selection's computed font-family, font-size, and active formatting states
  const updateSelectionFormattingState = useCallback(() => {
    if (formattingUpdateTimeoutRef.current) {
      clearTimeout(formattingUpdateTimeoutRef.current);
    }
    
    formattingUpdateTimeoutRef.current = setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || !editorRef.current) {
        setSelectionStats(null);
        return;
      }

      // Word and character count of selected text
      if (!sel.isCollapsed && editorRef.current.contains(sel.anchorNode)) {
        const selectedStr = sel.toString();
        const trimmed = selectedStr.trim();
        const words = trimmed.length > 0 ? trimmed.split(/\s+/).length : 0;
        const chars = selectedStr.length;
        setSelectionStats({ words, chars });
        setSelectedText(trimmed);
      } else {
        setSelectionStats(null);
        setSelectedText('');
      }

      // Detect font and size under cursor
      const anchorNode = sel.anchorNode;
      if (!anchorNode || !editorRef.current.contains(anchorNode)) return;

      const element = anchorNode.nodeType === Node.ELEMENT_NODE 
        ? (anchorNode as HTMLElement) 
        : anchorNode.parentElement;
      if (!element) return;

      const computed = window.getComputedStyle(element);

      // 1. Detect font size
      const sizePx = parseInt(computed.fontSize, 10);
      if (!isNaN(sizePx)) {
        setCurrentSelectionFontSize(sizePx);
        setFontSizeInputValue(String(sizePx));
      }

      // 2. Detect font family
      const family = computed.fontFamily.toLowerCase();
      let detectedKey = 'serif';

      // Check custom uploaded fonts first
      const matchedCustom = customFonts.find(cf => family.includes(cf.name.toLowerCase()));
      if (matchedCustom) {
        detectedKey = matchedCustom.id;
      } else {
        // Check loaded Google fonts
        const matchedGFont = loadedGoogleFontsList.find(gf => family.includes(gf.name.toLowerCase()) || family.includes(gf.id.toLowerCase()));
        if (matchedGFont) {
          detectedKey = `gfont_${matchedGFont.id}`;
        } else if (family.includes('jetbrains') || family.includes('monospace') || family.includes('courier')) {
          detectedKey = 'mono';
        } else if (family.includes('inter') || family.includes('system-ui') || family.includes('sans-serif') || family.includes('arial')) {
          detectedKey = 'sans';
        } else if (family.includes('lora') || family.includes('georgia') || family.includes('serif')) {
          detectedKey = 'serif';
        }
      }

      setCurrentSelectionFontFamily(detectedKey);

      // 3. Detect active formatting attributes (Word-style toggled buttons)
      try {
        const isBold = window.document.queryCommandState('bold');
        const isItalic = window.document.queryCommandState('italic');
        const isUnderline = window.document.queryCommandState('underline');
        const isStrike = window.document.queryCommandState('strikeThrough');
        const isAlignLeft = window.document.queryCommandState('justifyLeft');
        const isAlignCenter = window.document.queryCommandState('justifyCenter');
        const isAlignRight = window.document.queryCommandState('justifyRight');
        const isAlignJustify = window.document.queryCommandState('justifyFull');
        const isBullet = window.document.queryCommandState('insertUnorderedList');
        const isOrdered = window.document.queryCommandState('insertOrderedList');

        const bq = element.closest('blockquote');
        const isQuote = !!bq && editorRef.current.contains(bq);

        let blockTag = 'p';
        if (isQuote) {
          blockTag = 'blockquote';
        } else if (element.closest('h1')) {
          blockTag = 'h1';
        } else if (element.closest('h2')) {
          blockTag = 'h2';
        } else if (element.closest('h3')) {
          blockTag = 'h3';
        }

        // Detect background / highlight color
        const bg = computed.backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          setActiveHighlightColor(bg);
        } else {
          setActiveHighlightColor('transparent');
        }

        setActiveFormats({
          bold: isBold,
          italic: isItalic,
          underline: isUnderline,
          strikethrough: isStrike,
          alignLeft: isAlignLeft,
          alignCenter: isAlignCenter,
          alignRight: isAlignRight,
          alignJustify: isAlignJustify,
          bulletList: isBullet,
          orderedList: isOrdered,
          quote: isQuote,
          formatBlock: blockTag
        });
      } catch {
        // Command state query error fallback
      }
    }, 100);
  }, [customFonts, loadedGoogleFontsList]);

  useEffect(() => {
    window.document.addEventListener('selectionchange', updateSelectionFormattingState);
    return () => {
      window.document.removeEventListener('selectionchange', updateSelectionFormattingState);
    };
  }, [updateSelectionFormattingState]);

  // Execute standard formatting commands on selected text
  const executeCommand = (command: string, value: string = '') => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    if (command === 'hiliteColor') {
      const success = window.document.execCommand('hiliteColor', false, value);
      if (!success) {
        window.document.execCommand('backColor', false, value);
      }
    } else {
      window.document.execCommand(command, false, value);
    }
    handleEditorInput();
    updateSelectionFormattingState();
  };

  // Transform selected text case to UPPERCASE or lowercase
  const handleTransformCase = (caseType: 'upper' | 'lower') => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const selectedText = range.toString();
    if (!selectedText) return;

    const transformed = caseType === 'upper' 
      ? selectedText.toUpperCase() 
      : selectedText.toLowerCase();

    // Check if selection is within a single text container
    if (range.startContainer === range.endContainer) {
      window.document.execCommand('insertText', false, transformed);
    } else {
      try {
        const fragment = range.extractContents();
        const walker = window.document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
        let textNode: Node | null;
        while ((textNode = walker.nextNode())) {
          if (textNode.nodeValue) {
            textNode.nodeValue = caseType === 'upper' 
              ? textNode.nodeValue.toUpperCase() 
              : textNode.nodeValue.toLowerCase();
          }
        }
        range.insertNode(fragment);
      } catch {
        window.document.execCommand('insertText', false, transformed);
      }
    }

    handleEditorInput();
    updateSelectionFormattingState();
  };

  // Toggle quote block on or off reliably
  const handleToggleQuote = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const anchorNode = sel.anchorNode;
    const element = anchorNode?.nodeType === Node.ELEMENT_NODE 
      ? (anchorNode as HTMLElement) 
      : anchorNode?.parentElement;

    const existingBq = element?.closest('blockquote');

    if (existingBq && editorRef.current.contains(existingBq)) {
      // Currently a blockquote: toggle off by converting back to paragraph
      window.document.execCommand('formatBlock', false, '<p>');

      // If blockquote node still exists, unwrap child nodes directly
      const stillBq = element?.closest('blockquote');
      if (stillBq && editorRef.current.contains(stillBq)) {
        const parent = stillBq.parentNode;
        if (parent) {
          const fragment = window.document.createDocumentFragment();
          while (stillBq.firstChild) {
            fragment.appendChild(stillBq.firstChild);
          }
          parent.replaceChild(fragment, stillBq);
        }
      }
    } else {
      // Not a blockquote: toggle on
      window.document.execCommand('formatBlock', false, '<blockquote>');
    }

    handleEditorInput();
    updateSelectionFormattingState();
  };

  // ---------------------------------------------------------------------------
  // v0.7.93: configurable writing shortcuts (Settings → Keyboard Shortcuts &
  // Keybindings). Defaults:
  //   Ctrl+Tab       → open/close the Spelling Review drawer
  //   Alt+Space      → jump the caret to the end of the active document
  //   Ctrl+Q         → toggle quote on the selection / current block
  //   Ctrl+N         → numbered list
  //   Ctrl+L         → bullet list
  //   Ctrl+H         → open the highlighter menu (cursor lands inside it)
  //   Ctrl+= / Ctrl+- → page zoom in / out
  // The actions live in a ref that is re-assigned every render so the
  // always-on window listener below always calls the freshest closures
  // (selection restore, save pipeline, zoom state…).
  // ---------------------------------------------------------------------------
  const runListCommand = (command: 'insertUnorderedList' | 'insertOrderedList') => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    restoreEditorSelection();
    window.document.execCommand(command, false);
    handleEditorInput();
    updateSelectionFormattingState();
  };

  const moveCaretToEndOfDocument = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const range = window.document.createRange();
    range.selectNodeContents(editorRef.current);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    savedSelectionRangeRef.current = range.cloneRange();
    updateSelectionFormattingState();
  };

  const editorShortcutsRef = useRef<{
    toggleSpellingReview: () => void;
    toggleHighlighter: () => void;
    caretToEnd: () => void;
    applyQuote: () => void;
    applyBulletList: () => void;
    applyNumberList: () => void;
    zoomIn: () => void;
    zoomOut: () => void;
  }>({
    toggleSpellingReview: () => {},
    toggleHighlighter: () => {},
    caretToEnd: () => {},
    applyQuote: () => {},
    applyBulletList: () => {},
    applyNumberList: () => {},
    zoomIn: () => {},
    zoomOut: () => {},
  });
  editorShortcutsRef.current = {
    toggleSpellingReview: () => setShowSpellCheckReview((prev) => !prev),
    toggleHighlighter: () => {
      setShowColorPicker(false);
      setShowHighlightPicker((prev) => !prev);
    },
    caretToEnd: moveCaretToEndOfDocument,
    applyQuote: () => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      restoreEditorSelection();
      handleToggleQuote();
    },
    applyBulletList: () => runListCommand('insertUnorderedList'),
    applyNumberList: () => runListCommand('insertOrderedList'),
    zoomIn: () => setPageZoom((z) => Math.min(200, z + 10)),
    zoomOut: () => setPageZoom((z) => Math.max(50, z - 10)),
  };

  useEffect(() => {
    const handleWritingShortcuts = (e: KeyboardEvent) => {
      const bindings = getKeybindings();
      const target = e.target as HTMLElement | null;
      const editorEl = editorRef.current;
      const inOtherEditable = !!target
        && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        && !(editorEl && editorEl.contains(target));

      // Page zoom works anywhere in writing mode — even inside other inputs.
      if (matchesZoomBinding(e, bindings.zoomIn, 'in')) {
        e.preventDefault();
        editorShortcutsRef.current.zoomIn();
        return;
      }
      if (matchesZoomBinding(e, bindings.zoomOut, 'out')) {
        e.preventDefault();
        editorShortcutsRef.current.zoomOut();
        return;
      }

      // The rest never hijack keys typed into other inputs (search boxes,
      // settings fields, quick-Codex drawers…).
      if (inOtherEditable) return;

      if (matchesBinding(e, bindings.spellingReview)) {
        e.preventDefault();
        e.stopPropagation();
        editorShortcutsRef.current.toggleSpellingReview();
        return;
      }
      if (matchesBinding(e, bindings.highlighter)) {
        e.preventDefault();
        e.stopPropagation();
        editorShortcutsRef.current.toggleHighlighter();
        return;
      }
      if (matchesBinding(e, bindings.caretToEnd)) {
        e.preventDefault();
        e.stopPropagation();
        editorShortcutsRef.current.caretToEnd();
        return;
      }
      if (matchesBinding(e, bindings.quote)) {
        e.preventDefault();
        e.stopPropagation();
        editorShortcutsRef.current.applyQuote();
        return;
      }
      if (matchesBinding(e, bindings.numberList)) {
        e.preventDefault();
        e.stopPropagation();
        editorShortcutsRef.current.applyNumberList();
        return;
      }
      if (matchesBinding(e, bindings.bulletList)) {
        e.preventDefault();
        e.stopPropagation();
        editorShortcutsRef.current.applyBulletList();
        return;
      }
    };
    window.addEventListener('keydown', handleWritingShortcuts, true);
    return () => window.removeEventListener('keydown', handleWritingShortcuts, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // v0.7.93: when the highlighter menu opens (toolbar button or Ctrl+H), drop
  // the cursor inside it so the palette is fully keyboard-operable.
  useEffect(() => {
    if (!showHighlightPicker) return;
    const raf = window.requestAnimationFrame(() => {
      const firstSwatch = highlightPickerRef.current?.querySelector<HTMLElement>('button');
      firstSwatch?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [showHighlightPicker]);

  // Arrow keys rove between highlight swatches while the menu is focused;
  // Escape closes the menu and returns the cursor to the document.
  const handleHighlightMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowHighlightPicker(false);
      editorRef.current?.focus();
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const swatches: HTMLButtonElement[] = highlightPickerRef.current
      ? Array.from(highlightPickerRef.current.querySelectorAll<HTMLButtonElement>('button'))
      : [];
    if (swatches.length === 0) return;
    const currentIndex = swatches.indexOf(window.document.activeElement as HTMLButtonElement);
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const nextIndex = currentIndex === -1
      ? 0
      : (currentIndex + (forward ? 1 : -1) + swatches.length) % swatches.length;
    const nextSwatch: HTMLButtonElement | undefined = swatches[nextIndex];
    nextSwatch?.focus();
  };

  // Modify Font Size ONLY for selected text
  const applyFontSizeToSelection = (sizeInPx: number) => {
    if (!editorRef.current) return;
    restoreEditorSelection();
    let selection = window.getSelection();
    if ((!selection || selection.rangeCount === 0) && editorRef.current) {
      editorRef.current.focus();
      selection = window.getSelection();
    }
    if (!selection || selection.rangeCount === 0) return;

    editorRef.current.focus();

    if (selection.isCollapsed) {
      // If cursor is not expanded, create a styled span with zero-width space
      const span = window.document.createElement('span');
      span.style.fontSize = `${sizeInPx}px`;
      span.innerHTML = '&#8203;';
      const range = selection.getRangeAt(0);
      range.insertNode(span);
      range.selectNodeContents(span);
      range.collapse(false); // Move cursor after the zero-width space
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      // Non-collapsed selection: strictly format selected characters
      const tempFontName = `TEMP_FONT_${Math.random().toString(36).substring(2)}`;
      window.document.execCommand('fontName', false, tempFontName);
      const elements = editorRef.current.querySelectorAll(`font[face="${tempFontName}"], span[style*="${tempFontName}"]`);
      elements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        if (htmlEl.tagName.toLowerCase() === 'font') {
          const span = window.document.createElement('span');
          span.style.fontSize = `${sizeInPx}px`;
          span.innerHTML = htmlEl.innerHTML;
          htmlEl.parentNode?.replaceChild(span, htmlEl);
        } else {
          htmlEl.style.fontFamily = '';
          if (htmlEl.getAttribute('style') === '') htmlEl.removeAttribute('style');
          htmlEl.style.fontSize = `${sizeInPx}px`;
        }
      });
    }

    setCurrentSelectionFontSize(sizeInPx);
    setFontSizeInputValue(String(sizeInPx));
    handleEditorInput();
    updateSelectionFormattingState();
  };

  // Modify Font Family ONLY for selected text
  const applyFontFamilyToSelection = (fontKey: string) => {
    if (!editorRef.current) return;
    restoreEditorSelection();
    let selection = window.getSelection();
    if ((!selection || selection.rangeCount === 0) && editorRef.current) {
      editorRef.current.focus();
      selection = window.getSelection();
    }
    if (!selection || selection.rangeCount === 0) return;

    editorRef.current.focus();

    let fontCss = "'Lora', Georgia, serif";
    if (fontKey === 'sans') fontCss = "'Inter', system-ui, sans-serif";
    else if (fontKey === 'mono') fontCss = "'JetBrains Mono', Courier, monospace";
    else if (fontKey.startsWith('gfont_')) {
      const gFontId = fontKey.replace('gfont_', '');
      const matched = loadedGoogleFontsList.find(gf => gf.id === gFontId || gf.name.toLowerCase() === gFontId.toLowerCase()) 
        || CURATED_GOOGLE_FONTS.find(gf => gf.id === gFontId || gf.name.toLowerCase() === gFontId.toLowerCase());
      if (matched) {
        loadGoogleFont(matched);
        fontCss = matched.fontFamily;
      } else {
        fontCss = `"${gFontId}", serif, sans-serif`;
      }
    } else {
      // Check if it's a custom uploaded font
      const custom = customFonts.find(cf => cf.id === fontKey);
      if (custom) {
        fontCss = `"${custom.name}", system-ui, sans-serif`;
      }
    }

    const tempFontName = `TEMP_FONT_${Math.random().toString(36).substring(2)}`;
    window.document.execCommand('fontName', false, tempFontName);

    // Normalize any <font face="..."> elements to clean inline styled spans
    const fontTags = editorRef.current.querySelectorAll(`font[face="${tempFontName}"]`);
    fontTags.forEach((f) => {
      const span = window.document.createElement('span');
      span.style.fontFamily = fontCss;
      span.innerHTML = f.innerHTML;
      f.parentNode?.replaceChild(span, f);
    });

    setCurrentSelectionFontFamily(fontKey);
    handleEditorInput();
    updateSelectionFormattingState();
  };

  // Handle Google Font selection from GoogleFontModal
  const handleSelectGoogleFont = (font: GoogleFontItem) => {
    loadGoogleFont(font);
    let nextList: GoogleFontItem[] | null = null;
    setLoadedGoogleFontsList(prev => {
      if (prev.some(f => f.id === font.id)) return prev;
      const next = [...prev, font];
      nextList = next;
      try {
        localStorage.setItem(STORAGE_KEY_ADDED_GOOGLE_FONTS, JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to save Google fonts to localStorage', e);
      }
      return next;
    });
    if (nextList) {
      setTimeout(() => {
        onSaveGoogleFonts?.(nextList!);
      }, 0);
    }
    applyFontFamilyToSelection(`gfont_${font.id}`);
  };

  // Handle Custom Font File Upload (.ttf, .otf, .woff, .woff2)
  const handleFontFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setFontUploadMessage('Loading font file...');
      const newFont = await onUploadCustomFont(file);
      setFontUploadMessage(`Font "${newFont.name}" loaded successfully!`);
      // Automatically apply new custom font to current selection
      applyFontFamilyToSelection(newFont.id);
      setTimeout(() => setFontUploadMessage(null), 3500);
    } catch (err: any) {
      setFontUploadMessage(`Error: ${err.message || 'Could not load font'}`);
      setTimeout(() => setFontUploadMessage(null), 4000);
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const handleManualSave = () => {
    flushInput();
    onSaveNow();
    setSaveSuccessTick(true);
    setTimeout(() => setSaveSuccessTick(false), 2000);
  };

  // Handle Escape key to exit Zen Mode
  useEffect(() => {
    if (!isZenMode) return;
    const handleZenEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onToggleZenMode();
      }
    };
    window.addEventListener('keydown', handleZenEsc);
    return () => window.removeEventListener('keydown', handleZenEsc);
  }, [isZenMode, onToggleZenMode]);

  // English spell check and custom word exclusions handlers
  const handleToggleSpellCheck = (enabled: boolean) => {
    setSpellCheckState(enabled);
    setSpellCheckEnabled(enabled);
  };

  const handleAddCustomWord = (word: string) => {
    const updated = addWordToDictionary(word, activeMundusId);
    setCustomWords(updated);
    onSaveCustomWords?.(updated);
  };

  const handleRemoveCustomWord = (word: string) => {
    const updated = removeWordFromDictionary(word, activeMundusId);
    setCustomWords(updated);
    onSaveCustomWords?.(updated);
  };

  // Writing target save handler
  const handleSaveWritingTarget = (targetType: 'words' | 'characters', targetCount?: number) => {
    onUpdateDocument({
      targetType,
      targetCount,
      updatedAt: new Date().toISOString()
    });
  };

  // Automatically formats and normalizes the manuscript text to fill pages correctly
  const handleFormatAndRepaginateManuscript = useCallback(() => {
    if (!editorRef.current) return;
    const editor = editorRef.current;

    // 1. Remove ALL breaks (both automatic and manual page breaks)
    const allBreaks = editor.querySelectorAll('.mundus-page-break, .mundus-manual-page-break, [data-page-break], [data-manual-page-break]');
    allBreaks.forEach((b) => b.remove());

    // 2. Remove inline styles (height, min-height, margins) stuck on blocks
    const allChildren = Array.from(editor.children) as HTMLElement[];
    allChildren.forEach((child) => {
      child.style.removeProperty('height');
      child.style.removeProperty('min-height');
      child.style.removeProperty('margin-top');
      child.style.removeProperty('margin-bottom');
      child.style.removeProperty('padding-top');
      child.style.removeProperty('padding-bottom');
      child.classList.remove('is-page-start', 'mundus-page-start');
    });

    // 3. Prune consecutive empty paragraphs / spacers (max one gap block between text).
    // Ctrl+Enter spacers count as intentional gap blocks: a run of mixed empty
    // paragraphs + spacers collapses to a single surviving spacer when possible.
    const isGapBlock = (el: HTMLElement) =>
      el.classList.contains('mundus-spacer') ||
      ((!el.textContent || !el.textContent.trim()) && !el.querySelector('img, [data-visual-image-id]'));
    for (let i = allChildren.length - 1; i >= 1; i--) {
      const curr = allChildren[i];
      const prev = allChildren[i - 1];
      if (isGapBlock(curr) && isGapBlock(prev)) {
        // Prefer keeping the intentional Ctrl+Enter spacer over a plain empty paragraph
        if (curr.classList.contains('mundus-spacer')) {
          prev.remove();
        } else {
          curr.remove();
        }
      }
    }

    // 4. Prune trailing empty paragraphs at the bottom of the manuscript
    let lastChild = editor.lastElementChild as HTMLElement | null;
    while (lastChild && (!lastChild.textContent || !lastChild.textContent.trim()) && !lastChild.querySelector('img, [data-visual-image-id]')) {
      const prev = lastChild.previousElementSibling as HTMLElement | null;
      lastChild.remove();
      lastChild = prev;
    }
    if (!editor.children.length) {
      editor.innerHTML = '<p><br></p>';
    }

    updatePageStats();
    flushInput();
    setReformatSuccessTick(true);
    setTimeout(() => setReformatSuccessTick(false), 2500);
  }, [updatePageStats, flushInput]);

  // Spacer insertion handler (Ctrl+Enter): inserts a lightweight spacer block
  // that adds extra vertical breathing room (~1.5x a normal line gap) between
  // the line above and the new line below. It does NOT force a page break.
  const handleInsertSpacer = useCallback(() => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);

    const spacerDiv = window.document.createElement('div');
    spacerDiv.className = 'mundus-spacer';
    spacerDiv.setAttribute('data-mundus-spacer', 'true');
    spacerDiv.setAttribute('contenteditable', 'false');

    const nextP = window.document.createElement('p');
    nextP.innerHTML = '<br/>';

    // Find the enclosing top-level block inside the editor
    let currentBlock: Node | null = range.startContainer;
    while (currentBlock && currentBlock.parentNode !== editorRef.current && currentBlock !== editorRef.current) {
      currentBlock = currentBlock.parentNode;
    }

    if (currentBlock && currentBlock !== editorRef.current && currentBlock.parentNode === editorRef.current) {
      if (currentBlock.nextSibling) {
        editorRef.current.insertBefore(spacerDiv, currentBlock.nextSibling);
        editorRef.current.insertBefore(nextP, spacerDiv.nextSibling);
      } else {
        editorRef.current.appendChild(spacerDiv);
        editorRef.current.appendChild(nextP);
      }
    } else {
      range.deleteContents();
      range.insertNode(nextP);
      range.insertNode(spacerDiv);
    }

    // Place cursor in the new paragraph below the spacer
    const newRange = window.document.createRange();
    newRange.setStart(nextP, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    // Auto-scroll so the new line is visible
    nextP.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    handleEditorInput();
  }, [handleEditorInput]);

  // Keyboard shortcut listener for manual save, spacer insertion, rich text formatting, and Word-style smart quotes
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isCmdOrCtrl = e.ctrlKey || e.metaKey;
    if (isCmdOrCtrl) {
      const k = e.key.toLowerCase();
      if (k === 'f') {
        e.preventDefault();
        handleOpenFindBar();
        return;
      } else if (k === 'enter') {
        e.preventDefault();
        handleInsertSpacer();
        return;
      } else if (k === 's') {
        e.preventDefault();
        handleManualSave();
      } else if (k === 'b') {
        e.preventDefault();
        executeCommand('bold');
      } else if (k === 'i') {
        e.preventDefault();
        executeCommand('italic');
      } else if (k === 'u') {
        e.preventDefault();
        executeCommand('underline');
      } else if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          executeCommand('redo');
        } else {
          executeCommand('undo');
        }
      } else if (k === 'y') {
        e.preventDefault();
        executeCommand('redo');
      }
    } else if (e.key === '"' && !isCmdOrCtrl && !e.altKey) {
      // Word-style smart quotes: strictly binary alternation per paragraph/block (opening “ then closing ”)
      e.preventDefault();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed) {
        const selectedText = sel.getRangeAt(0).toString();
        window.document.execCommand('insertText', false, `“${selectedText}”`);
        handleEditorInput();
        return;
      }
      const quoteChar = getSmartDoubleQuote(editorRef.current);
      window.document.execCommand('insertText', false, quoteChar);
      handleEditorInput();
      return;
    } else if (e.key === "'" && !isCmdOrCtrl && !e.altKey) {
      // Word-style smart single quote / apostrophe
      e.preventDefault();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed) {
        const selectedText = sel.getRangeAt(0).toString();
        window.document.execCommand('insertText', false, `‘${selectedText}’`);
        handleEditorInput();
        return;
      }
      const quoteChar = getSmartSingleQuote(editorRef.current);
      window.document.execCommand('insertText', false, quoteChar);
      handleEditorInput();
      return;
    } else if (e.key === 'Backspace') {
      // Check if cursor is at the start of a block immediately preceded by a
      // spacer or a legacy page break — delete that element in one stroke
      const sel = window.getSelection();
      if (sel && sel.isCollapsed && sel.rangeCount > 0 && editorRef.current) {
        const range = sel.getRangeAt(0);
        let currentBlock: Node | null = range.startContainer;
        while (currentBlock && currentBlock.parentNode !== editorRef.current && currentBlock !== editorRef.current) {
          currentBlock = currentBlock.parentNode;
        }
        if (currentBlock && currentBlock !== editorRef.current) {
          const prev = (currentBlock as HTMLElement).previousElementSibling;
          if (prev && (prev.classList.contains('mundus-manual-page-break') || prev.classList.contains('mundus-page-break') || prev.classList.contains('mundus-spacer') || prev.hasAttribute('data-manual-page-break'))) {
            const isAtStart = range.startOffset === 0 && (
              range.startContainer === currentBlock || 
              (currentBlock.firstChild && range.startContainer === currentBlock.firstChild) ||
              !currentBlock.textContent?.trim()
            );
            if (isAtStart) {
              e.preventDefault();
              prev.remove();
              updatePageStats();
              handleEditorInput();
              return;
            }
          }
        }
      }
    } else if (e.key === 'Escape' && inlineSuggestion) {
      // Inline autocorrect: dismiss without changing anything
      e.preventDefault();
      setInlineSuggestion(null);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // Inline autocorrect: Tab accepts the pending correction while the
      // suggestion popup is open; otherwise Tab keeps inserting the indent.
      if (inlineSuggestion) {
        acceptInlineSuggestion(inlineSuggestion);
        return;
      }
      executeCommand('insertHTML', '&emsp;&emsp;');
    }
  };

  // 5 Standard customizable palette colors (slot 1 is fixed auto theme default, slots 2-5 customizable)
  const DEFAULT_5_COLORS = ['auto', '#ffffff', '#b91c1c', '#15803d', '#4338ca'];

  const [standardColors, setStandardColors] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('mundus_standard_colors_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 5) {
          parsed[0] = 'auto';
          return parsed;
        }
      }
    } catch {}
    return DEFAULT_5_COLORS;
  });

  // Recent 3 colors chosen from the color wheel/picker (persisted in localStorage)
  const [recentWheelColors, setRecentWheelColors] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('mundus_recent_wheel_colors');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.slice(0, 3);
      }
    } catch {}
    return [];
  });

  const [activeTextColor, setActiveTextColor] = useState<string>(() => isDarkMode ? '#f4f4f5' : '#09090b');
  const [activeHighlightColor, setActiveHighlightColor] = useState<string>('transparent');

  const colorPickerRef = useRef<HTMLDivElement>(null);
  const highlightPickerRef = useRef<HTMLDivElement>(null);
  const fontSizeComboboxRef = useRef<HTMLDivElement>(null);
  const fontSizeMobileComboboxRef = useRef<HTMLDivElement>(null);
  const fontFamilyDropdownRef = useRef<HTMLDivElement>(null);
  const fontFamilyMobileDropdownRef = useRef<HTMLDivElement>(null);
  const blockFormatDropdownRef = useRef<HTMLDivElement>(null);
  const blockFormatMobileDropdownRef = useRef<HTMLDivElement>(null);
  const mobileFontEffectsRef = useRef<HTMLDivElement>(null);
  const mobileAlignmentsRef = useRef<HTMLDivElement>(null);
  const mobileListsRef = useRef<HTMLDivElement>(null);
  const folderDocsMenuRef = useRef<HTMLDivElement>(null);
  const autoSaveMenuRef = useRef<HTMLDivElement>(null);

  // Close color, font size, and dropdown popups when clicking outside
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (colorPickerRef.current && !colorPickerRef.current.contains(target)) {
        setShowColorPicker(false);
      }
      if (highlightPickerRef.current && !highlightPickerRef.current.contains(target)) {
        setShowHighlightPicker(false);
      }
      if (
        fontSizeComboboxRef.current && !fontSizeComboboxRef.current.contains(target) &&
        (!fontSizeMobileComboboxRef.current || !fontSizeMobileComboboxRef.current.contains(target))
      ) {
        setIsFontSizeDropdownOpen(false);
      }
      if (
        fontFamilyDropdownRef.current && !fontFamilyDropdownRef.current.contains(target) &&
        (!fontFamilyMobileDropdownRef.current || !fontFamilyMobileDropdownRef.current.contains(target))
      ) {
        setIsFontFamilyDropdownOpen(false);
      }
      if (
        blockFormatDropdownRef.current && !blockFormatDropdownRef.current.contains(target) &&
        (!blockFormatMobileDropdownRef.current || !blockFormatMobileDropdownRef.current.contains(target))
      ) {
        setIsBlockFormatDropdownOpen(false);
      }
      if (mobileFontEffectsRef.current && !mobileFontEffectsRef.current.contains(target)) {
        setIsMobileFontEffectsOpen(false);
      }
      if (mobileAlignmentsRef.current && !mobileAlignmentsRef.current.contains(target)) {
        setIsMobileAlignmentsOpen(false);
      }
      if (mobileListsRef.current && !mobileListsRef.current.contains(target)) {
        setIsMobileListsOpen(false);
      }
      if (folderDocsMenuRef.current && !folderDocsMenuRef.current.contains(target)) {
        setShowFolderDocsMenu(false);
      }
      if (autoSaveMenuRef.current && !autoSaveMenuRef.current.contains(target)) {
        setShowAutoSaveMenu(false);
      }
      if (docStatusMenuRef.current && !docStatusMenuRef.current.contains(target)) {
        setShowDocStatusMenu(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(target)) {
        setShowExportMenu(false);
      }
      if (importMenuRef.current && !importMenuRef.current.contains(target)) {
        setShowImportMenu(false);
      }
    };
    window.document.addEventListener('mousedown', handleDocumentClick);
    return () => {
      window.document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, []);

  // Handler for modifying one of the standard palette boxes (slot 0 is fixed auto theme default)
  const handleUpdateStandardColor = (index: number, newColor: string) => {
    if (index === 0) return; // Slot 0 is fixed as auto theme default
    const updated = [...standardColors];
    updated[0] = 'auto';
    updated[index] = newColor;
    setStandardColors(updated);
    try {
      localStorage.setItem('mundus_standard_colors_v2', JSON.stringify(updated));
    } catch {}
    executeCommand('foreColor', newColor);
    setActiveTextColor(newColor);
  };

  // Handler for applying the Auto / Theme Default dynamic color (reverts color overrides so it adapts to dark/light)
  // v0.7.88 FIX: this used to run execCommand('foreColor', false, 'inherit').
  // Chromium materializes that as <font color="inherit"> and the HTML legacy
  // color parser resolves unknown/keyword values to RED (#ff0000) — the
  // "automatic color made text red" bug.
  // v0.7.91 FIX: the previous extract-contents surgery silently no-opped when
  // the selection exactly covered a colored wrapper — extractContents() hands
  // back the bare TEXT node (ancestor wrappers stay in the document), so the
  // element collector found zero targets and the reinserted text landed right
  // back inside the still-colored <font>. We now sweep the DOCUMENT for
  // color-bearing elements that INTERSECT the selection and strip them in
  // place (remove attribute/property, then unwrap emptied <font> shells) —
  // no extract/reinsert, works for every selection shape.
  const handleApplyAutoThemeColor = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    if (!range.collapsed) {
      const editor = editorRef.current;
      const colored: HTMLElement[] = [];
      editor.querySelectorAll<HTMLElement>('font, [style*="color"]').forEach((el) => {
        // Note: [style*="color"] also matches background-color-only spans
        // (highlights); the strip below only touches actual text color, so
        // those elements come out untouched.
        let intersects = false;
        try { intersects = range.intersectsNode(el); } catch { intersects = false; }
        if (intersects) colored.push(el);
      });

      colored.forEach((el) => {
        if (el.tagName.toLowerCase() === 'font' && el.hasAttribute('color')) {
          el.removeAttribute('color');
        }
        if (el.style && el.style.color) {
          el.style.removeProperty('color');
          if (!el.getAttribute('style') || el.getAttribute('style') === '') {
            el.removeAttribute('style');
          }
        }
      });

      // Unwrap <font> tags left with no meaningful attributes (children move
      // up one level; the browser keeps the live selection on those nodes)
      colored.forEach((el) => {
        if (el.tagName.toLowerCase() === 'font' && el.attributes.length === 0 && el.parentNode) {
          const parent = el.parentNode;
          while (el.firstChild) {
            parent.insertBefore(el.firstChild, el);
          }
          parent.removeChild(el);
        }
      });
    }

    handleEditorInput();
    updateSelectionFormattingState();
    setActiveTextColor(isDarkMode ? '#f4f4f5' : '#09090b');
  };

  // Handler for picking from the interactive color wheel / custom picker
  const handlePickWheelColor = (color: string) => {
    executeCommand('foreColor', color);
    setActiveTextColor(color);
    // Add to recent 3 colors
    const filtered = recentWheelColors.filter((c) => c.toLowerCase() !== color.toLowerCase());
    const updatedRecents = [color, ...filtered].slice(0, 3);
    setRecentWheelColors(updatedRecents);
    try {
      localStorage.setItem('mundus_recent_wheel_colors', JSON.stringify(updatedRecents));
    } catch {}
  };

  // Subtle monochromatic highlight washes
  // v0.7.88: each wash carries a stable `key` — applied highlights are tagged
  // with data-mundus-hl="<key>" so index.css can force the correct wash per
  // theme (see handleToggleHighlight below).
  const highlightColors = [
    { name: 'None', key: '', value: 'transparent' },
    { name: 'Neutral Grey', key: 'neutral', value: isDarkMode ? '#3f3f46' : '#e4e4e7' },
    { name: 'Pale Gold', key: 'gold', value: isDarkMode ? '#543b0c' : '#fef08a' },
    { name: 'Pale Mint', key: 'mint', value: isDarkMode ? '#14462a' : '#bbf7d0' },
    { name: 'Pale Ice', key: 'ice', value: isDarkMode ? '#173a5e' : '#bae6fd' },
    { name: 'Pale Rose', key: 'rose', value: isDarkMode ? '#5a192e' : '#fecdd3' },
  ];

  // Helper to convert hex or named color to rgb format for comparison
  const normalizeColorToRgb = (color: string): string => {
    if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return 'transparent';
    if (color.startsWith('rgb')) return color.replace(/\s+/g, '');
    if (color.startsWith('#')) {
      let hex = color.slice(1);
      if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
      }
      const num = parseInt(hex, 16);
      if (!isNaN(num)) {
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return `rgb(${r},${g},${b})`;
      }
    }
    return color.toLowerCase();
  };

  // v0.7.88: tag (or untag) the elements touched by the current selection with
  // data-mundus-hl="<key>" so index.css can force the correct wash for the
  // active theme. execCommand stamps the apply-time theme color inline; without
  // this tag, switching dark<->light left the old literal wash in place and made
  // highlighted text unreadable (dark block on white page or vice versa).
  const tagHighlightInSelection = (hlKey: string, appliedColor: string) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current || !hlKey) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const appliedRgb = normalizeColorToRgb(appliedColor);
    editorRef.current.querySelectorAll<HTMLElement>('[data-mundus-hl], [style*="background"]').forEach((el) => {
      let intersects = false;
      try { intersects = range.intersectsNode(el); } catch { intersects = false; }
      if (!intersects) return;
      // Only tag the pieces the command actually just colored
      if (normalizeColorToRgb(el.style.backgroundColor || '') === appliedRgb) {
        el.setAttribute('data-mundus-hl', hlKey);
      }
    });
  };

  const untagHighlightInSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    editorRef.current.querySelectorAll<HTMLElement>('[data-mundus-hl]').forEach((el) => {
      let intersects = false;
      try { intersects = range.intersectsNode(el); } catch { intersects = false; }
      if (!intersects) return;
      // Only pieces whose background the clear command actually emptied
      if (normalizeColorToRgb(el.style.backgroundColor || '') === 'transparent') {
        el.removeAttribute('data-mundus-hl');
      }
    });
  };

  // Toggle highlight: if the clicked color is already active, remove highlight
  const handleToggleHighlight = (colorValue: string, hlKey: string = '') => {
    if (!editorRef.current) return;
    editorRef.current.focus();

    if (colorValue === 'transparent') {
      executeCommand('hiliteColor', 'transparent');
      untagHighlightInSelection();
      setActiveHighlightColor('transparent');
      setShowHighlightPicker(false);
      handleEditorInput();
      updateSelectionFormattingState();
      return;
    }

    const normActive = normalizeColorToRgb(activeHighlightColor);
    const normTarget = normalizeColorToRgb(colorValue);

    // If already highlighted with this exact color, toggle it OFF
    if (normActive !== 'transparent' && normActive === normTarget) {
      executeCommand('hiliteColor', 'transparent');
      untagHighlightInSelection();
      setActiveHighlightColor('transparent');
    } else {
      executeCommand('hiliteColor', colorValue);
      tagHighlightInSelection(hlKey, colorValue);
      setActiveHighlightColor(colorValue);
    }
    setShowHighlightPicker(false);
    handleEditorInput();
    updateSelectionFormattingState();
  };

  // v0.7.91 FIX: the clear-formatting button used to run plain
  // execCommand('removeFormat') — which strips bold/italic/etc. but provably
  // leaves our highlight stamps in place: Chromium keeps the
  // <font style="background-color:..."> wrapper AND the data-mundus-hl tag,
  // so the index.css themed-wash rules kept painting the highlight after the
  // "clear". This handler runs removeFormat and then sweeps the selection for
  // every surviving inline stamp (background, color, tag) and removes them.
  const handleClearFormatting = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    executeCommand('removeFormat');

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed) {
      const range = sel.getRangeAt(0);
      const editor = editorRef.current;
      const stamped: HTMLElement[] = [];
      editor.querySelectorAll<HTMLElement>('font, [style*="background"], [style*="color"], [data-mundus-hl]').forEach((el) => {
        let intersects = false;
        try { intersects = range.intersectsNode(el); } catch { intersects = false; }
        if (intersects) stamped.push(el);
      });

      stamped.forEach((el) => {
        el.removeAttribute('data-mundus-hl');
        if (el.tagName.toLowerCase() === 'font' && el.hasAttribute('color')) {
          el.removeAttribute('color');
        }
        if (el.style && (el.style.backgroundColor || el.style.color)) {
          if (el.style.backgroundColor) el.style.removeProperty('background-color');
          if (el.style.color) el.style.removeProperty('color');
          if (!el.getAttribute('style') || el.getAttribute('style') === '') {
            el.removeAttribute('style');
          }
        }
      });

      // Unwrap <font> shells left with no meaningful attributes
      stamped.forEach((el) => {
        if (el.tagName.toLowerCase() === 'font' && el.attributes.length === 0 && el.parentNode) {
          const parent = el.parentNode;
          while (el.firstChild) {
            parent.insertBefore(el.firstChild, el);
          }
          parent.removeChild(el);
        }
      });

      setActiveHighlightColor('transparent');
    }

    handleEditorInput();
    updateSelectionFormattingState();
  };

  // Helper for Word-style toggled active formatting buttons and accessible light theme hover
  const getFormatButtonClass = (isActive: boolean, extraClasses: string = '') => {
    if (isActive) {
      return `p-1.5 rounded font-bold shadow-xs transition-colors cursor-pointer ${
        isDarkMode
          ? 'bg-white text-neutral-950'
          : 'bg-neutral-900 text-white'
      } ${extraClasses}`;
    }
    return `p-1.5 rounded transition-colors cursor-pointer ${
      isDarkMode
        ? 'text-neutral-300 hover:text-white hover:bg-neutral-800'
        : 'text-neutral-800 hover:text-neutral-950 hover:bg-neutral-200/80'
    } ${extraClasses}`;
  };

  // Documents that belong to the SAME folder as the active document
  const currentFolder = folders.find((f) => f.id === document.folderId);
  const folderDocuments = documents.filter((d) => 
    document.folderId ? d.folderId === document.folderId : (!d.folderId || !folders.some(f => f.id === d.folderId))
  );

  const autoSaveLabels: Record<AutoSaveInterval, string> = {
    every_edit: 'Every Edit',
    '1m': 'Every 1m',
    '3m': 'Every 3m',
    '5m': 'Every 5m',
    '10m': 'Every 10m',
    off: 'Off (Manual)'
  };

  return (
    <div 
      id="text-editor-container"
      className={`flex-1 flex flex-col h-screen overflow-hidden transition-colors duration-200 ${
        isDarkMode 
          ? 'bg-[#0a0a0a] text-neutral-100' 
          : 'bg-[#f8f8f8] text-neutral-900'
      }`}
    >
      {/* Hidden File Input for Custom Fonts */}
      <input
        ref={fontFileInputRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        className="hidden"
        onChange={handleFontFileChange}
      />

      {/* Font Upload Notification Banner */}
      {fontUploadMessage && (
        <div className={`px-4 py-1.5 text-xs font-mono flex items-center justify-between border-b ${
          fontUploadMessage.startsWith('Error')
            ? 'bg-red-950/80 border-red-800 text-red-200'
            : 'bg-neutral-900 border-neutral-700 text-neutral-200'
        }`}>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{fontUploadMessage}</span>
          </div>
          <button onClick={() => setFontUploadMessage(null)} className="text-neutral-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Top Header Bar with Minimalist Frosted Glass */}
      {!isZenMode && (
        <header 
          id="editor-header"
          className={`relative z-40 px-3 sm:px-6 py-2 border-b flex flex-col md:flex-row md:items-center md:justify-between gap-2 sm:gap-3 shrink-0 select-none backdrop-blur-md transition-colors ${
            isDarkMode 
              ? 'bg-[#121212]/85 border-neutral-800/80 shadow-xs' 
              : 'bg-white/85 border-neutral-200/80 shadow-xs'
          }`}
        >
          {/* MOBILE 3-LEVEL TOP BAR */}
          <div className="flex md:hidden flex-col gap-2 w-full">
            {/* Level 1: Files in Folder Dropdown, Document Name, Save Button */}
            <div className="flex items-center gap-2 w-full">
              {/* Files in Folder Dropdown */}
              <div className="relative shrink-0">
                <button
                  id="btn-folder-documents-dropdown-mobile"
                  onClick={() => {
                    setShowFolderDocsMenu(!showFolderDocsMenu);
                    setShowAutoSaveMenu(false);
                    setShowDocStatusMenu(false);
                    setShowExportMenu(false);
                  }}
                  title={`Switch scenes in ${currentFolder ? currentFolder.name : 'Unfiled'}`}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium max-w-[125px] truncate cursor-pointer ${
                    isDarkMode 
                      ? 'border-neutral-800 bg-neutral-900/80 text-neutral-200' 
                      : 'border-neutral-200 bg-white text-neutral-800 shadow-2xs'
                  }`}
                >
                  <FolderIcon className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  <span className="truncate">{currentFolder ? currentFolder.name : 'Unfiled'}</span>
                  <span className="text-[10px] font-mono px-1 rounded bg-neutral-200/60 dark:bg-neutral-800 shrink-0">
                    {folderDocuments.length}
                  </span>
                  <ChevronDown className="w-3 h-3 text-neutral-400 shrink-0" />
                </button>

                {showFolderDocsMenu && (
                  <div 
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute top-full left-0 mt-1.5 w-64 max-w-[calc(100vw-1.5rem)] rounded-xl border shadow-2xl z-50 py-1.5 backdrop-blur-md overflow-hidden ${
                      isDarkMode ? 'bg-[#141414]/95 border-neutral-700 text-neutral-200' : 'bg-white/95 border-neutral-200 text-neutral-900 shadow-lg'
                    }`}
                  >
                    <div className="px-3 py-1.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 truncate">
                        Scenes in {currentFolder ? currentFolder.name : 'Unfiled'}
                      </span>
                      <span className="text-[10px] font-mono text-neutral-500 shrink-0">
                        {folderDocuments.length} total
                      </span>
                    </div>

                    <div className="max-h-56 overflow-y-auto py-1 px-1 space-y-0.5">
                      {folderDocuments.map((doc) => {
                        const isCurrent = doc.id === document.id;
                        return (
                          <button
                            key={doc.id}
                            onClick={() => {
                              onSelectDocument(doc.id);
                              setShowFolderDocsMenu(false);
                            }}
                            className={`w-full px-2.5 py-1.5 rounded-md text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                              isCurrent
                                ? isDarkMode
                                  ? 'bg-neutral-800 text-accent font-semibold'
                                  : 'bg-neutral-100 text-accent font-semibold'
                                : isDarkMode
                                  ? 'hover:bg-neutral-800 text-neutral-200'
                                  : 'hover:bg-neutral-100 text-neutral-800'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <FileText className={`w-3.5 h-3.5 shrink-0 ${isCurrent ? 'text-accent' : 'text-neutral-400'}`} />
                              <span className="truncate">{doc.title}</span>
                            </div>
                            <span className="text-[10px] font-mono text-neutral-400 shrink-0">
                              {doc.wordCount || 0}w
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="p-1.5 border-t border-neutral-200 dark:border-neutral-800">
                      <button
                        onClick={() => {
                          onCreateDocumentInFolder(document.folderId);
                          setShowFolderDocsMenu(false);
                        }}
                        className={`w-full py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${
                          isDarkMode 
                            ? 'border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200' 
                            : 'border-neutral-300 bg-neutral-100 hover:bg-neutral-200 text-neutral-800'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add scene in this chapter</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Document Name Input */}
              <div className="flex-1 min-w-0">
                <input
                  id="input-document-title-mobile"
                  type="text"
                  value={document.title}
                  onChange={(e) => onUpdateDocument({ title: e.target.value, updatedAt: new Date().toISOString() })}
                  placeholder="Untitled Scene..."
                  className={`w-full text-xs font-semibold bg-transparent border-b border-dashed border-neutral-300 dark:border-neutral-700 focus:border-solid focus:border-accent focus:outline-none transition-colors truncate px-1 py-1 ${
                    isDarkMode ? 'text-neutral-100' : 'text-neutral-900'
                  }`}
                />
              </div>

              {/* Save Button (Icon-Only on Mobile) */}
              <button
                id="btn-save-manual-mobile"
                onClick={handleManualSave}
                title="Save changes (Ctrl+S)"
                aria-label="Save changes"
                className={`flex items-center justify-center w-8 h-8 rounded-lg border text-xs font-medium shrink-0 transition-all shadow-2xs cursor-pointer ${
                  saveSuccessTick
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white'
                    : isDarkMode
                    ? 'border-neutral-700/80 bg-neutral-900 hover:bg-neutral-800 text-neutral-300'
                    : 'border-neutral-300/80 bg-white hover:bg-neutral-100 text-neutral-800'
                }`}
              >
                {saveSuccessTick ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                ) : isSaving ? (
                  <span className="w-2 h-2 rounded-full bg-neutral-400 animate-ping" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Level 2: Unified Row with Status, Checkpoints, Auto Save, Export, Zen, Focus (Compact Icon-Only on Mobile) */}
            <div className="flex items-center justify-between gap-1 w-full">
              {/* 1. Document Status Dropdown (Colored Dot Only, No Arrow) */}
              <div className="relative shrink-0">
                <button
                  id="btn-doc-status-mobile"
                  type="button"
                  onClick={() => {
                    setShowDocStatusMenu(!showDocStatusMenu);
                    setShowFolderDocsMenu(false);
                    setShowAutoSaveMenu(false);
                    setShowExportMenu(false);
                  }}
                  aria-label="Document status"
                  title={`Status: ${document.status === 'revision' ? 'In Revision' : document.status === 'complete' ? 'Completed' : 'Draft'}`}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg border text-xs font-mono transition-colors cursor-pointer shrink-0 ${
                    document.status === 'complete'
                      ? isDarkMode
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-emerald-600/40 bg-emerald-50 text-emerald-800'
                      : document.status === 'revision'
                      ? isDarkMode
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                        : 'border-amber-600/40 bg-amber-50 text-amber-800'
                      : isDarkMode
                        ? 'border-neutral-800 bg-neutral-900/80 text-neutral-300'
                        : 'border-neutral-300 bg-neutral-100 text-neutral-700'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    document.status === 'complete' ? 'bg-emerald-500' : document.status === 'revision' ? 'bg-amber-500' : 'bg-neutral-400'
                  }`} />
                </button>

                {showDocStatusMenu && (
                  <div className={`absolute top-full left-0 mt-1 w-36 rounded-lg border shadow-xl p-1 z-50 text-xs font-mono backdrop-blur-md ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
                  }`}>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateDocument({ status: 'draft' });
                        setShowDocStatusMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        (document.status === 'draft' || !document.status)
                          ? isDarkMode ? 'bg-neutral-800 font-bold' : 'bg-neutral-100 font-bold'
                          : isDarkMode ? 'hover:bg-neutral-800/60' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                      <span>Draft</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onUpdateDocument({ status: 'revision' });
                        setShowDocStatusMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        document.status === 'revision'
                          ? isDarkMode ? 'bg-amber-500/20 text-amber-300 font-bold' : 'bg-amber-50 text-amber-800 font-bold'
                          : isDarkMode ? 'hover:bg-neutral-800/60' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <span>In Revision</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onUpdateDocument({ status: 'complete' });
                        setShowDocStatusMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        document.status === 'complete'
                          ? isDarkMode ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'bg-emerald-50 text-emerald-800 font-bold'
                          : isDarkMode ? 'hover:bg-neutral-800/60' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Completed</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 2. Checkpoints (Icon Only with Badge) */}
              <button
                id="btn-open-snapshots-mobile"
                onClick={() => setShowSnapshotsModal(true)}
                title="Document Checkpoints & Version Snapshots"
                aria-label="Document Checkpoints"
                className={`w-8 h-8 flex items-center justify-center relative rounded-lg border text-xs font-mono transition-colors cursor-pointer shrink-0 ${
                  snapshots && snapshots.length > 0
                    ? isDarkMode
                      ? 'border-neutral-700 bg-neutral-900 text-neutral-200'
                      : 'border-neutral-300 bg-neutral-100 text-neutral-800'
                    : isDarkMode
                      ? 'border-neutral-800 bg-neutral-900/60 text-neutral-400'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-600'
                }`}
              >
                <History className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                {snapshots && snapshots.length > 0 && (
                  <span className="absolute -top-1 -right-1 text-[9px] w-3.5 h-3.5 flex items-center justify-center rounded-full bg-accent text-white font-bold shrink-0">
                    {snapshots.length}
                  </span>
                )}
              </button>

              {/* 3. Import & Export Dropdown (Mobile unified button with up/down arrows) */}
              <div className="relative shrink-0">
                <button
                  id="btn-doc-export-mobile"
                  type="button"
                  onClick={() => {
                    setShowExportMenu(!showExportMenu);
                    setShowFolderDocsMenu(false);
                    setShowDocStatusMenu(false);
                    setShowAutoSaveMenu(false);
                  }}
                  aria-label="Import or Export document"
                  title="Import or Export Document (.mundus, .html, .pdf, .docx, .md)"
                  className={`w-8 h-8 flex items-center justify-center rounded-lg border text-xs font-mono transition-colors cursor-pointer shrink-0 ${
                    isDarkMode
                      ? 'border-neutral-800 bg-neutral-900/80 text-neutral-300 hover:bg-neutral-800'
                      : 'border-neutral-300 bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-accent shrink-0" />
                </button>

                {showExportMenu && (
                  <div
                    className={`absolute top-full left-0 mt-1 w-52 max-w-[calc(100vw-2rem)] rounded-lg border shadow-xl p-1 z-50 text-xs font-mono backdrop-blur-md ${
                      isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
                    }`}
                  >
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                      <Upload className="w-3 h-3 text-accent" />
                      <span>Export Document</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        exportToMundus(document);
                        setShowExportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      <span>Export as .MUNDUS</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        exportToHtml(document, {
                          customFonts,
                          addedGoogleFonts: loadedGoogleFontsList,
                        });
                        setShowExportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Export as .HTML</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        exportToPdf(document, {
                          pageFormat,
                          customFonts,
                          addedGoogleFonts: loadedGoogleFontsList,
                        });
                        setShowExportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-red-400" />
                      <span>Export as .PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        exportToDocx(document);
                        setShowExportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                      <span>Export as .DOCX</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        exportToMarkdown(document);
                        setShowExportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-purple-400" />
                      <span>Export as .MD</span>
                    </button>

                    {/* IMPORT SECTION (Directly into Loose Files) */}
                    <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                      <Download className="w-3 h-3 text-accent" />
                      <span>Import (Loose files)</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        handleTriggerFileInput('.mundus,.json', 'mundus');
                        setShowExportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      <span>Import .MUNDUS</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleTriggerFileInput('.html,.htm', 'html');
                        setShowExportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Import .HTML</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleTriggerFileInput('.pdf', 'pdf');
                        setShowExportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-red-400" />
                      <span>Import .PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleTriggerFileInput('.docx', 'docx');
                        setShowExportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                      <span>Import .DOCX</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleTriggerFileInput('.md,.markdown,.txt', 'md');
                        setShowExportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-purple-400" />
                      <span>Import .MD / .TXT</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 4. Scene Timeline Trigger (Swapped with Export) */}
              <button
                id="btn-scene-timeline-mobile"
                type="button"
                onClick={() => setShowTimelineModal(true)}
                title={document.timelineInfo?.startYear !== undefined ? `Scene Timeline: ${document.timelineInfo.startDisplay || `${document.timelineInfo.startYear}`} (${document.timelineInfo.duration || 1} ${document.timelineInfo.durationUnit || 'days'})` : "Set Scene Timeline Placement & Duration"}
                aria-label="Scene Timeline"
                className={`w-8 h-8 flex items-center justify-center rounded-lg border text-xs font-mono transition-colors cursor-pointer shrink-0 ${
                  document.timelineInfo?.startYear !== undefined
                    ? 'border-accent text-accent bg-accent/10 font-bold'
                    : isDarkMode 
                      ? 'border-neutral-800 bg-neutral-900/80 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850' 
                      : 'border-neutral-300 bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'
                }`}
              >
                <Clock className={`w-3.5 h-3.5 shrink-0 ${document.timelineInfo?.startYear !== undefined ? 'text-accent' : 'text-neutral-400'}`} />
              </button>

              {/* 5. Spelling Review (Compact: error count if red, checkmark if green) */}
              <button
                id="btn-spellcheck-review-mobile"
                type="button"
                onClick={() => {
                  if (!spellCheckEnabled) {
                    setSpellCheckEnabled(true);
                    setSpellCheckState(true);
                  }
                  setShowSpellCheckReview(!showSpellCheckReview);
                }}
                aria-label="Spelling Review"
                title={
                  spellCheckEnabled
                    ? `${misspellings.length} spelling flags found. Click to review suggestions`
                    : 'Turn on Spellcheck & Review'
                }
                className={`w-8 h-8 flex items-center justify-center rounded-lg border text-xs font-mono transition-colors cursor-pointer shrink-0 ${
                  showSpellCheckReview
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-black border-neutral-900 dark:border-white font-bold'
                    : spellCheckEnabled
                    ? misspellings.length > 0
                      ? 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 font-bold hover:bg-red-500/20'
                      : isDarkMode
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                      : 'border-emerald-600/40 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : isDarkMode
                    ? 'border-neutral-800 bg-neutral-900/80 text-neutral-400 hover:text-neutral-200'
                    : 'border-neutral-300 bg-neutral-100 text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {spellCheckEnabled && misspellings.length > 0 ? (
                  <span className="text-[11px] font-mono font-bold leading-none">{misspellings.length}</span>
                ) : (
                  <Check className={`w-3.5 h-3.5 shrink-0 ${
                    spellCheckEnabled 
                      ? isDarkMode ? 'text-emerald-400' : 'text-emerald-600' 
                      : 'text-neutral-400'
                  }`} />
                )}
              </button>

              {/* 6. Find in Document Trigger */}
              <button
                id="btn-find-replace-mobile"
                type="button"
                onClick={handleOpenFindBar}
                title="Find in document"
                aria-label="Find in document"
                className={`w-8 h-8 flex items-center justify-center rounded-lg border text-xs transition-colors cursor-pointer shrink-0 ${
                  isFindBarOpen
                    ? 'border-accent text-accent bg-accent/10 font-bold'
                    : isDarkMode 
                      ? 'border-neutral-800 bg-neutral-900/80 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850' 
                      : 'border-neutral-300 bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'
                }`}
              >
                <Search className="w-3.5 h-3.5 shrink-0" />
              </button>

              {/* 6b. Whistle voice dictation (v0.7.91-NIGHTLY): toggles an
                  on-device streaming STT session writing at the caret.
                  v0.7.94: hidden on Android — keyboards have dictation. */}
              {!ANDROID_APP && (
              <button
                id="btn-stt-mobile"
                type="button"
                onClick={toggleDictation}
                title={sttButtonTitle}
                aria-label="Voice dictation"
                className={`w-8 h-8 flex items-center justify-center rounded-lg border text-xs transition-colors cursor-pointer shrink-0 ${
                  sttStatus === 'listening'
                    ? 'border-red-500/60 bg-red-500/15 text-red-500'
                    : sttStatus === 'loading'
                    ? 'border-accent text-accent bg-accent/10'
                    : sttStatus === 'error'
                    ? 'border-red-500/40 bg-red-500/5 text-red-500'
                    : isDarkMode
                      ? 'border-neutral-800 bg-neutral-900/80 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850'
                      : 'border-neutral-300 bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'
                }`}
              >
                {sttStatus === 'loading' ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" /> : <Mic className="w-3.5 h-3.5 shrink-0" />}
              </button>
              )}

              {/* 7. In This Scene (Compact: book icon + detected entities badge) */}
              <button
                id="btn-in-this-scene-mobile"
                type="button"
                onClick={() => setShowInThisSceneDrawer(!showInThisSceneDrawer)}
                aria-label="In This Scene"
                title="View Codex entities & lore detected in this scene"
                className={`w-8 h-8 flex items-center justify-center relative rounded-lg border text-xs font-mono transition-colors cursor-pointer shrink-0 ${
                  showInThisSceneDrawer
                    ? 'border-accent bg-accent text-white font-semibold'
                    : detectedSceneCount > 0
                    ? isDarkMode
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                    : 'border-amber-600/40 bg-amber-50 text-amber-800 hover:bg-amber-100'
                    : isDarkMode 
                    ? 'border-neutral-800 bg-neutral-900/80 text-neutral-400 hover:text-neutral-200' 
                    : 'border-neutral-300 bg-neutral-100 text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <BookMarked className="w-3.5 h-3.5 shrink-0" />
                {detectedSceneCount > 0 && (
                  <span className="absolute -top-1 -right-1 text-[9px] w-3.5 h-3.5 flex items-center justify-center rounded-full bg-amber-500 text-white font-bold shrink-0">
                    {detectedSceneCount}
                  </span>
                )}
              </button>

              {/* 7. Focus Mode Toggle (Swapped with Zen Mode) */}
              <button
                id="btn-toggle-focus-mobile"
                onClick={() => setIsFocusMode(!isFocusMode)}
                title={isFocusMode ? 'Exit Focus Mode' : 'Enter Focus Mode (hides formatting toolbar)'}
                aria-label="Focus Mode"
                className={`w-8 h-8 flex items-center justify-center rounded-lg border text-xs font-mono transition-colors cursor-pointer shrink-0 ${
                  isFocusMode 
                    ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white' 
                    : isDarkMode 
                      ? 'border-neutral-800 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900' 
                      : 'border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                }`}
              >
                {isFocusMode ? <Minimize2 className="w-3.5 h-3.5 shrink-0" /> : <Maximize2 className="w-3.5 h-3.5 shrink-0" />}
              </button>

              {/* 8. Zen Mode Toggle (Swapped with Focus Mode) */}
              <button
                id="btn-toggle-zen-mobile"
                onClick={onToggleZenMode}
                title="Zen Mode (Hide header, toolbar & sidebars for pure writing focus)"
                aria-label="Zen Mode"
                className={`w-8 h-8 flex items-center justify-center rounded-lg border text-xs font-mono transition-colors cursor-pointer shrink-0 ${
                  isDarkMode 
                    ? 'border-neutral-800 text-neutral-300 hover:text-neutral-100 hover:bg-neutral-900' 
                    : 'border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                }`}
              >
                <EnsoIcon className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              </button>
            </div>
          </div>

          {/* DESKTOP VIEW TOP BAR */}
          <div className="hidden md:flex items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-1.5 sm:gap-2.5 flex-1 min-w-0">
              {/* FOLDER DOCUMENTS DROPDOWN: Lists all documents in the active document's folder */}
              <div ref={folderDocsMenuRef} className="relative shrink-0 z-50">
                <button
                  id="btn-folder-documents-dropdown"
                  onClick={() => {
                    setShowFolderDocsMenu(!showFolderDocsMenu);
                    setShowAutoSaveMenu(false);
                  }}
                  title={`Switch documents inside ${currentFolder ? currentFolder.name : 'Unfiled Notes'}`}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all max-w-[170px] sm:max-w-[220px] truncate ${
                    isDarkMode 
                      ? 'border-neutral-800 bg-neutral-900/80 text-neutral-200 hover:border-neutral-700' 
                      : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 shadow-2xs'
                  }`}
                >
                  <FolderIcon className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  <span className="truncate">
                    {currentFolder ? currentFolder.name : 'Unfiled'}
                  </span>
                  <span className="text-[10px] font-mono px-1 rounded bg-neutral-200/60 dark:bg-neutral-800 shrink-0">
                    {folderDocuments.length}
                  </span>
                  <ChevronDown className="w-3 h-3 text-neutral-400 shrink-0" />
                </button>

                {/* Folder Documents Dropdown Popover */}
                {showFolderDocsMenu && (
                  <div 
                    id="folder-documents-menu"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute top-full left-0 mt-1.5 w-64 sm:w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border shadow-2xl z-50 py-1.5 backdrop-blur-md overflow-hidden ${
                      isDarkMode ? 'bg-[#141414]/95 border-neutral-700 text-neutral-200' : 'bg-white/95 border-neutral-200 text-neutral-900 shadow-lg'
                    }`}
                  >
                    <div className="px-3 py-1.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                        Scenes in {currentFolder ? currentFolder.name : 'Unfiled'}
                      </span>
                      <span className="text-[10px] font-mono text-neutral-500">
                        {folderDocuments.length} total
                      </span>
                    </div>

                    {/* List of documents in this folder */}
                    <div className="max-h-60 overflow-y-auto py-1 px-1 space-y-0.5">
                      {folderDocuments.map((doc) => {
                        const isCurrent = doc.id === document.id;
                        return (
                          <button
                            key={doc.id}
                            onClick={() => {
                              onSelectDocument(doc.id);
                              setShowFolderDocsMenu(false);
                            }}
                            className={`w-full px-2.5 py-1.5 rounded-md text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                              isCurrent
                                ? isDarkMode
                                  ? 'bg-neutral-800 text-accent font-semibold'
                                  : 'bg-neutral-100 text-accent font-semibold'
                                : isDarkMode
                                  ? 'hover:bg-neutral-800 text-neutral-200'
                                  : 'hover:bg-neutral-100 text-neutral-800'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <FileText className={`w-3.5 h-3.5 shrink-0 ${isCurrent ? 'text-accent' : 'text-neutral-400'}`} />
                              <span className="truncate">{doc.title}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isCurrent && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-accent/20 text-accent font-mono font-semibold">
                                  Active
                                </span>
                              )}
                              <span className="text-[10px] font-mono text-neutral-400">
                                {doc.wordCount || 0}w
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Quick Add document to this chapter */}
                    <div className="p-1.5 border-t border-neutral-200 dark:border-neutral-800">
                      <button
                        onClick={() => {
                          onCreateDocumentInFolder(document.folderId);
                          setShowFolderDocsMenu(false);
                        }}
                        className={`w-full py-1.5 px-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors ${
                          isDarkMode 
                            ? 'border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200' 
                            : 'border-neutral-300 bg-neutral-100 hover:bg-neutral-200 text-neutral-800'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add scene in this chapter</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <span className="text-neutral-300 dark:text-neutral-700 text-xs select-none hidden sm:inline">/</span>

              {/* Editable Document Title */}
              <div className="flex-1 min-w-0">
                <input
                  id="input-document-title"
                  type="text"
                  value={document.title}
                  onChange={(e) => onUpdateDocument({ title: e.target.value, updatedAt: new Date().toISOString() })}
                  placeholder="Untitled Chapter or Scene..."
                  className={`w-full text-xs sm:text-sm font-semibold bg-transparent border-b border-transparent hover:border-neutral-400 dark:hover:border-neutral-600 focus:border-neutral-900 dark:focus:border-neutral-100 focus:outline-none transition-colors truncate px-1 py-0.5 ${
                    isDarkMode ? 'text-neutral-100' : 'text-neutral-900'
                  }`}
                />
              </div>
            </div>

            {/* Right Controls: Auto-Save Interval, Status, Manual Save, Zen Mode, Focus */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs">
              {/* OFFLINE / LOCAL PENDING SYNC NOTICE (Only shown if offline/pending sync) */}
              {isPendingSync && (
                <div 
                  id="header-sync-status-badge"
                  title="This document is stored locally and waiting to sync to Firebase once connection is restored."
                  className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs font-mono font-medium border bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400 shrink-0 animate-pulse"
                >
                  <CloudOff className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="hidden sm:inline">Stored locally</span>
                  <span className="sm:hidden">Local</span>
                </div>
              )}

              {/* REFORMAT & NORMALIZE PAGES BUTTON (Icon-only, hidden on mobile) */}
              <button
                id="btn-doc-reformat-pages"
                type="button"
                onClick={handleFormatAndRepaginateManuscript}
                title="Format & Repaginate: cleans broken spacers, heals gaps, and reflows text to fill pages correctly"
                className={`hidden md:inline-flex items-center justify-center p-1.5 rounded-md border text-xs font-mono transition-colors cursor-pointer ${
                  reformatSuccessTick
                    ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-400'
                    : isDarkMode
                    ? 'border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 text-accent hover:text-accent/80'
                    : 'border-neutral-300 bg-neutral-100 hover:bg-neutral-200 text-accent hover:text-accent/80'
                }`}
              >
                {reformatSuccessTick ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
              </button>

              {/* IMPORT DROPDOWN (Directly into Loose Files) */}
              <div ref={importMenuRef} className="relative z-50">
                <button
                  id="btn-doc-import"
                  type="button"
                  onClick={() => {
                    setShowImportMenu(!showImportMenu);
                    setShowExportMenu(false);
                    setShowDocStatusMenu(false);
                    setShowAutoSaveMenu(false);
                  }}
                  title="Import Document (.mundus, .html, .pdf, .docx, .md)"
                  className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md border text-xs font-mono transition-colors cursor-pointer ${
                    isDarkMode
                      ? 'border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300'
                      : 'border-neutral-300 bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                  }`}
                >
                  <Download className="w-3.5 h-3.5 text-accent" />
                  <span>Import</span>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </button>

                {showImportMenu && (
                  <div
                    id="doc-import-menu-popover"
                    className={`absolute left-0 sm:right-0 sm:left-auto mt-1 w-52 rounded-lg border shadow-xl p-1 z-50 text-xs font-mono ${
                      isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        handleTriggerFileInput('.mundus,.json', 'mundus');
                        setShowImportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      <span>Import from .MUNDUS</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleTriggerFileInput('.html,.htm', 'html');
                        setShowImportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Import from .HTML</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleTriggerFileInput('.pdf', 'pdf');
                        setShowImportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-red-400" />
                      <span>Import from .PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleTriggerFileInput('.docx', 'docx');
                        setShowImportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                      <span>Import from .DOCX</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleTriggerFileInput('.md,.markdown,.txt', 'md');
                        setShowImportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-purple-400" />
                      <span>Import from .MD / .TXT</span>
                    </button>
                  </div>
                )}
              </div>

              {/* EXPORT DROPDOWN (Upward arrow for export) */}
              <div ref={exportMenuRef} className="relative z-50">
                <button
                  id="btn-doc-export"
                  type="button"
                  onClick={() => {
                    setShowExportMenu(!showExportMenu);
                    setShowImportMenu(false);
                    setShowDocStatusMenu(false);
                    setShowAutoSaveMenu(false);
                  }}
                  title="Export Document (.mundus, .html, .pdf, .docx, .md)"
                  className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md border text-xs font-mono transition-colors cursor-pointer ${
                    isDarkMode
                      ? 'border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300'
                      : 'border-neutral-300 bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5 text-accent" />
                  <span>Export</span>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </button>

                {showExportMenu && (
                  <div
                    id="doc-export-menu-popover"
                    className={`absolute left-0 sm:right-0 sm:left-auto mt-1 w-48 rounded-lg border shadow-xl p-1 z-50 text-xs font-mono ${
                      isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        exportToMundus(document);
                        setShowExportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      <span>Export as .MUNDUS</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        exportToHtml(document, {
                          customFonts,
                          addedGoogleFonts: loadedGoogleFontsList,
                        });
                        setShowExportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Export as .HTML</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        exportToPdf(document, {
                          pageFormat,
                          customFonts,
                          addedGoogleFonts: loadedGoogleFontsList,
                        });
                        setShowExportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-red-400" />
                      <span>Export as .PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        exportToDocx(document);
                        setShowExportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                      <span>Export as .DOCX</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        exportToMarkdown(document);
                        setShowExportMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-purple-400" />
                      <span>Export as .MD</span>
                    </button>
                  </div>
                )}
              </div>

              {/* DOCUMENT STATUS DROPDOWN */}
              <div ref={docStatusMenuRef} className="relative z-50">
                <button
                  id="btn-doc-status"
                  type="button"
                  onClick={() => setShowDocStatusMenu(!showDocStatusMenu)}
                  title="Assign Active Document Status"
                  className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md border text-xs font-mono transition-colors cursor-pointer ${
                    document.status === 'complete'
                      ? isDarkMode
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                        : 'border-emerald-600/40 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      : document.status === 'revision'
                      ? isDarkMode
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                        : 'border-amber-600/40 bg-amber-50 text-amber-800 hover:bg-amber-100'
                      : isDarkMode
                        ? 'border-neutral-800 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300'
                        : 'border-neutral-300 bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    document.status === 'complete' ? 'bg-emerald-500' : document.status === 'revision' ? 'bg-amber-500' : 'bg-neutral-400'
                  }`} />
                  <span className="capitalize">{document.status === 'revision' ? 'In Revision' : document.status === 'complete' ? 'Completed' : 'Draft'}</span>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </button>

                {showDocStatusMenu && (
                  <div className={`absolute left-0 sm:right-0 sm:left-auto mt-1 w-36 rounded-lg border shadow-xl p-1 z-50 text-xs font-mono ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
                  }`}>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateDocument({ status: 'draft' });
                        setShowDocStatusMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        (document.status === 'draft' || !document.status)
                          ? isDarkMode ? 'bg-neutral-800 font-bold' : 'bg-neutral-100 font-bold'
                          : isDarkMode ? 'hover:bg-neutral-800/60' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                      <span>Draft</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onUpdateDocument({ status: 'revision' });
                        setShowDocStatusMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        document.status === 'revision'
                          ? isDarkMode ? 'bg-amber-500/20 text-amber-300 font-bold' : 'bg-amber-50 text-amber-800 font-bold'
                          : isDarkMode ? 'hover:bg-neutral-800/60' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <span>In Revision</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onUpdateDocument({ status: 'complete' });
                        setShowDocStatusMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer ${
                        document.status === 'complete'
                          ? isDarkMode ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'bg-emerald-50 text-emerald-800 font-bold'
                          : isDarkMode ? 'hover:bg-neutral-800/60' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Completed</span>
                    </button>
                  </div>
                )}
              </div>

              {/* CHECKPOINTS / SNAPSHOTS TRIGGER */}
              <button
                id="btn-open-snapshots"
                onClick={() => setShowSnapshotsModal(true)}
                title="Document Checkpoints & Version Snapshots"
                className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md border text-xs font-mono transition-colors cursor-pointer ${
                  snapshots && snapshots.length > 0
                    ? isDarkMode
                      ? 'border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200'
                      : 'border-neutral-300 bg-neutral-100 hover:bg-neutral-200 text-neutral-800'
                    : isDarkMode
                      ? 'border-neutral-800 hover:bg-neutral-900 text-neutral-400 hover:text-neutral-200'
                      : 'border-neutral-200 hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <History className="w-3.5 h-3.5 text-neutral-400" />
                <span className="hidden sm:inline">Checkpoints</span>
                {snapshots && snapshots.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-200 dark:bg-neutral-800 font-bold">
                    {snapshots.length}
                  </span>
                )}
              </button>

              {/* AUTO-SAVE DROPDOWN (Word-style configurable time) */}
              <div ref={autoSaveMenuRef} className="relative z-50">
                <button
                  id="btn-autosave-settings"
                  onClick={() => {
                    setShowAutoSaveMenu(!showAutoSaveMenu);
                    setShowFolderDocsMenu(false);
                  }}
                  title="Configure Auto-Save Interval"
                  className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-md border text-[11px] font-mono transition-colors ${
                    autoSaveInterval === 'off'
                      ? 'border-neutral-300 dark:border-neutral-800 text-neutral-400'
                      : 'border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 font-medium'
                  }`}
                >
                  <Clock className="w-3 h-3 text-neutral-500" />
                  <span className="hidden md:inline">Auto-Save:</span>
                  <span>{autoSaveLabels[autoSaveInterval]}</span>
                  <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                </button>

                {showAutoSaveMenu && (
                  <div 
                    id="autosave-menu-popover"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute top-full right-0 mt-1.5 w-52 rounded-xl border shadow-2xl z-50 p-2 backdrop-blur-md ${
                      isDarkMode ? 'bg-[#141414]/95 border-neutral-700 text-neutral-200' : 'bg-white/95 border-neutral-200 text-neutral-900'
                    }`}
                  >
                    <div className="px-2 py-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                      Auto-save interval
                    </div>
                    <div className="space-y-0.5">
                      {(['every_edit', '1m', '3m', '5m', '10m', 'off'] as AutoSaveInterval[]).map((int) => (
                        <button
                          key={int}
                          onClick={() => {
                            onChangeAutoSaveInterval(int);
                            setShowAutoSaveMenu(false);
                          }}
                          className={`w-full px-2.5 py-1.5 text-left text-xs rounded-md flex items-center justify-between transition-colors ${
                            autoSaveInterval === int
                              ? isDarkMode ? 'bg-neutral-800 text-white font-semibold' : 'bg-neutral-100 text-black font-semibold'
                              : 'hover:bg-neutral-100 dark:hover:bg-neutral-850 text-neutral-600 dark:text-neutral-400'
                          }`}
                        >
                          <span>
                            {int === 'every_edit' && 'On Every Edit'}
                            {int === '1m' && 'Every 1 Minute'}
                            {int === '3m' && 'Every 3 Minutes'}
                            {int === '5m' && 'Every 5 Minutes'}
                            {int === '10m' && 'Every 10 Minutes'}
                            {int === 'off' && 'Off (Manual Only)'}
                          </span>
                          {autoSaveInterval === int && <Check className="w-3.5 h-3.5" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Manual Cloud Save Button */}
              <button
                id="btn-save-manual"
                onClick={handleManualSave}
                title="Save changes (Ctrl+S)"
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-md border text-xs font-medium transition-all shadow-2xs ${
                  saveSuccessTick
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white'
                    : isDarkMode
                    ? 'border-neutral-700/80 bg-neutral-900 hover:bg-neutral-800 text-neutral-300'
                    : 'border-neutral-300/80 bg-white hover:bg-neutral-100 text-neutral-800'
                }`}
              >
                {saveSuccessTick ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Saved</span>
                  </>
                ) : isSaving ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-neutral-400 animate-ping" />
                    <span className="hidden sm:inline">Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Save</span>
                  </>
                )}
              </button>

              {/* Zen Mode Toggle */}
              <button
                id="btn-toggle-zen"
                onClick={onToggleZenMode}
                title="Zen Mode (Hide header, toolbar & sidebars for pure writing focus)"
                className={`px-2 sm:px-2.5 py-1.5 rounded-md border text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isDarkMode 
                    ? 'border-neutral-800 text-neutral-300 hover:text-neutral-100 hover:bg-neutral-900' 
                    : 'border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                }`}
              >
                <EnsoIcon className="w-3.5 h-3.5 text-neutral-400" />
                <span className="hidden sm:inline font-mono">Zen</span>
              </button>

              {/* Focus Mode Toggle */}
              <button
                id="btn-toggle-focus"
                onClick={() => setIsFocusMode(!isFocusMode)}
                title={isFocusMode ? 'Exit Focus Mode' : 'Enter Focus Mode (hides formatting toolbar)'}
                className={`p-1.5 rounded-md border transition-colors ${
                  isFocusMode 
                    ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white' 
                    : isDarkMode 
                      ? 'border-neutral-800 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900' 
                      : 'border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                }`}
              >
                {isFocusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Formatting Toolbar (Notepad & Word Minimalist Ribbon) */}
      {!isFocusMode && !isZenMode && (
        <div 
          id="editor-toolbar"
          className={`relative z-20 px-3 sm:px-6 py-1.5 border-b flex flex-col gap-1.5 shrink-0 select-none backdrop-blur-md transition-colors text-xs ${
            isDarkMode 
              ? 'bg-[#141414]/90 border-neutral-800/80 text-neutral-300' 
              : 'bg-white/90 border-neutral-200/80 text-neutral-700'
          }`}
        >
          <div className="flex items-center gap-1 flex-wrap w-full">
            {/* History Undo/Redo */}
            <div className="flex items-center gap-0.5 pr-2 border-r border-neutral-200 dark:border-neutral-800">
              <button
                id="toolbar-undo"
                onMouseDown={(e) => { e.preventDefault(); executeCommand('undo'); }}
                title="Undo (Ctrl+Z)"
                className={getFormatButtonClass(false)}
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                id="toolbar-redo"
                onMouseDown={(e) => { e.preventDefault(); executeCommand('redo'); }}
                title="Redo (Ctrl+Y)"
                className={getFormatButtonClass(false)}
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Mobile Unified Typography Toggle Button (Visible only on mobile next to Undo/Redo) */}
            <div className="flex md:hidden items-center pr-1 border-r border-neutral-200 dark:border-neutral-800">
              <button
                id="toolbar-mobile-typography-toggle"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsMobileTypographyOpen((prev) => !prev);
                }}
                title="Toggle Font, Size & Heading Styles"
                aria-label="Toggle Font, Size & Heading Styles"
                className={`p-1 sm:p-1.5 rounded transition-all cursor-pointer flex items-center justify-center ${
                  isMobileTypographyOpen
                    ? 'bg-accent text-white border border-accent font-bold shadow-xs'
                    : isDarkMode
                    ? 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                    : 'hover:bg-neutral-200/80 text-neutral-700 hover:text-neutral-950'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* DESKTOP FONT FAMILY SELECTOR: Custom popover dropdown with grey hover items */}
            <div 
              ref={fontFamilyDropdownRef}
              className="hidden md:flex pr-2 border-r border-neutral-200 dark:border-neutral-800 items-center relative"
            >
              <button
                id="toolbar-font-family-btn"
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyVisualSelectionHighlight();
                  setIsFontFamilyDropdownOpen((prev) => !prev);
                  setIsBlockFormatDropdownOpen(false);
                  setIsFontSizeDropdownOpen(false);
                }}
                aria-label="Font family for selection"
                title="Font family for selection"
                className={`h-7 px-2.5 rounded border text-xs flex items-center gap-1.5 transition-colors cursor-pointer max-w-[160px] truncate ${
                  isDarkMode 
                    ? 'bg-neutral-900 border-neutral-700 text-neutral-200 hover:border-neutral-500' 
                    : 'bg-white border-neutral-300 text-neutral-800 hover:border-neutral-400'
                }`}
              >
                <span className="truncate">
                  {currentSelectionFontFamily === 'serif'
                    ? 'Novelist Serif (Lora)'
                    : currentSelectionFontFamily === 'sans'
                    ? 'Modern Sans (Inter)'
                    : currentSelectionFontFamily === 'mono'
                    ? 'Drafting Mono (Code)'
                    : currentSelectionFontFamily.startsWith('gfont_')
                    ? (loadedGoogleFontsList.find(gf => gf.id === currentSelectionFontFamily.replace('gfont_', '') || gf.name.toLowerCase() === currentSelectionFontFamily.replace('gfont_', '').toLowerCase())?.name 
                       || CURATED_GOOGLE_FONTS.find(gf => gf.id === currentSelectionFontFamily.replace('gfont_', '') || gf.name.toLowerCase() === currentSelectionFontFamily.replace('gfont_', '').toLowerCase())?.name 
                       || currentSelectionFontFamily.replace('gfont_', ''))
                    : (customFonts.find(cf => cf.id === currentSelectionFontFamily)?.name || 'Novelist Serif (Lora)')}
                </span>
                <ChevronDown className="w-3 h-3 text-neutral-400 shrink-0" />
              </button>

              {/* Custom Font Family Popover Menu */}
              {isFontFamilyDropdownOpen && (
                <div
                  className={`absolute top-full left-0 mt-1 w-56 max-h-72 overflow-y-auto rounded-lg border shadow-xl z-50 p-1 space-y-1 text-xs backdrop-blur-md ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
                  }`}
                >
                  <div>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                      Standard Typefaces
                    </div>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyFontFamilyToSelection('serif');
                        setIsFontFamilyDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded transition-colors font-serif cursor-pointer ${
                        currentSelectionFontFamily === 'serif'
                          ? isDarkMode ? 'bg-neutral-800 font-bold text-accent' : 'bg-neutral-100 font-bold text-accent'
                          : isDarkMode ? 'hover:bg-neutral-800 text-neutral-200' : 'hover:bg-neutral-100 text-neutral-800'
                      }`}
                    >
                      Novelist Serif (Lora)
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyFontFamilyToSelection('sans');
                        setIsFontFamilyDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded transition-colors font-sans cursor-pointer ${
                        currentSelectionFontFamily === 'sans'
                          ? isDarkMode ? 'bg-neutral-800 font-bold text-accent' : 'bg-neutral-100 font-bold text-accent'
                          : isDarkMode ? 'hover:bg-neutral-800 text-neutral-200' : 'hover:bg-neutral-100 text-neutral-800'
                      }`}
                    >
                      Modern Sans (Inter)
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyFontFamilyToSelection('mono');
                        setIsFontFamilyDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded transition-colors font-mono cursor-pointer ${
                        currentSelectionFontFamily === 'mono'
                          ? isDarkMode ? 'bg-neutral-800 font-bold text-accent' : 'bg-neutral-100 font-bold text-accent'
                          : isDarkMode ? 'hover:bg-neutral-800 text-neutral-200' : 'hover:bg-neutral-100 text-neutral-800'
                      }`}
                    >
                      Drafting Mono (Code)
                    </button>
                  </div>

                  {loadedGoogleFontsList.filter(isValidGoogleFontItem).length > 0 && (
                    <div className="pt-1 border-t border-neutral-200 dark:border-neutral-800">
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                        Google Fonts
                      </div>
                      {loadedGoogleFontsList.filter(isValidGoogleFontItem).map((gf) => {
                        const val = `gfont_${gf.id}`;
                        const isActive = currentSelectionFontFamily === val;
                        return (
                          <div
                            key={gf.id}
                            className={`group/gfont flex items-center justify-between rounded px-2.5 py-1.5 transition-colors cursor-pointer ${
                              isActive
                                ? isDarkMode ? 'bg-neutral-800 font-bold text-accent' : 'bg-neutral-100 font-bold text-accent'
                                : isDarkMode ? 'hover:bg-neutral-800 text-neutral-200' : 'hover:bg-neutral-100 text-neutral-800'
                            }`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              applyFontFamilyToSelection(val);
                              setIsFontFamilyDropdownOpen(false);
                            }}
                          >
                            <span style={{ fontFamily: gf.fontFamily }} className="truncate flex-1">
                              {gf.name}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleRemoveGoogleFont(gf.id, e)}
                              onMouseDown={(e) => e.stopPropagation()}
                              className="opacity-0 group-hover/gfont:opacity-100 hover:text-red-400 text-neutral-500 p-0.5 rounded transition-opacity ml-1"
                              title={`Remove ${gf.name}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {customFonts.length > 0 && (
                    <div className="pt-1 border-t border-neutral-200 dark:border-neutral-800">
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                        Uploaded Custom Fonts
                      </div>
                      {customFonts.map((cf) => {
                        const isActive = currentSelectionFontFamily === cf.id;
                        return (
                          <button
                            key={cf.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              applyFontFamilyToSelection(cf.id);
                              setIsFontFamilyDropdownOpen(false);
                            }}
                            style={{ fontFamily: cf.name }}
                            className={`w-full text-left px-2.5 py-1.5 rounded transition-colors truncate cursor-pointer ${
                              isActive
                                ? isDarkMode ? 'bg-neutral-800 font-bold text-accent' : 'bg-neutral-100 font-bold text-accent'
                                : isDarkMode ? 'hover:bg-neutral-800 text-neutral-200' : 'hover:bg-neutral-100 text-neutral-800'
                            }`}
                          >
                            {cf.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="pt-1 border-t border-neutral-200 dark:border-neutral-800 space-y-0.5">
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setIsFontFamilyDropdownOpen(false);
                        setShowGoogleFontModal(true);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded transition-colors flex items-center gap-1.5 text-accent font-medium cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      ✦ Browse Google Fonts...
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setIsFontFamilyDropdownOpen(false);
                        fontFileInputRef.current?.click();
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded transition-colors flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400 cursor-pointer ${
                        isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                      }`}
                    >
                      ＋ Upload Font File (.ttf, .otf)...
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* DESKTOP FONT SIZE CONTROL: MS Word-style typeable box with dropdown presets */}
            <div className="hidden md:flex pr-2 border-r border-neutral-200 dark:border-neutral-800 items-center relative">
              <div 
                ref={fontSizeComboboxRef}
                id="font-size-combobox-wrapper"
                className={`relative flex items-center h-7 rounded border font-mono text-xs transition-colors ${
                  isDarkMode 
                    ? 'bg-neutral-900 border-neutral-700 text-neutral-200 focus-within:border-neutral-400' 
                    : 'bg-white border-neutral-300 text-neutral-800 focus-within:border-neutral-900'
                }`}
              >
                <input
                  id="toolbar-font-size-input"
                  type="text"
                  value={fontSizeInputValue}
                  onMouseDown={() => applyVisualSelectionHighlight()}
                  onFocus={() => applyVisualSelectionHighlight()}
                  onChange={(e) => setFontSizeInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const num = parseInt(fontSizeInputValue, 10);
                      if (!isNaN(num) && num >= 6 && num <= 200) {
                        applyFontSizeToSelection(num);
                      }
                    }
                  }}
                  onBlur={() => {
                    const num = parseInt(fontSizeInputValue, 10);
                    if (!isNaN(num) && num >= 6 && num <= 200) {
                      applyFontSizeToSelection(num);
                    } else {
                      removeVisualSelectionHighlight();
                      setFontSizeInputValue(String(currentSelectionFontSize || 16));
                    }
                  }}
                  title="Click number to type font size (pt), or click arrow for presets"
                  className="w-8 text-center bg-transparent h-full focus:outline-none font-mono text-xs px-0.5"
                />

                <button
                  id="btn-font-size-dropdown-arrow"
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyVisualSelectionHighlight();
                    setIsFontSizeDropdownOpen((prev) => !prev);
                    setIsFontFamilyDropdownOpen(false);
                    setIsBlockFormatDropdownOpen(false);
                  }}
                  title="Font size preset options"
                  className={`h-full px-1 border-l flex items-center justify-center transition-colors cursor-pointer ${
                    isDarkMode ? 'border-neutral-800 hover:bg-neutral-800' : 'border-neutral-200 hover:bg-neutral-100'
                  }`}
                >
                  <ChevronDown className="w-3 h-3 text-neutral-400" />
                </button>

                {/* Preset Dropdown Popover */}
                {isFontSizeDropdownOpen && (
                  <div 
                    className={`absolute top-full left-0 mt-1 w-20 max-h-48 overflow-y-auto rounded-lg border shadow-xl z-50 p-1 space-y-0.5 ${
                      isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
                    }`}
                  >
                    {[8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 48, 72].map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          applyFontSizeToSelection(sz);
                          setIsFontSizeDropdownOpen(false);
                        }}
                        className={`w-full text-center py-1 text-xs rounded font-mono transition-colors cursor-pointer ${
                          currentSelectionFontSize === sz
                            ? isDarkMode ? 'bg-neutral-800 font-bold text-accent' : 'bg-neutral-100 font-bold text-accent'
                            : isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* DESKTOP Headings & Block Styles: Custom popover dropdown with grey hover items */}
            <div 
              ref={blockFormatDropdownRef}
              className="hidden md:flex pr-2 border-r border-neutral-200 dark:border-neutral-800 items-center relative"
            >
              <button
                id="toolbar-block-format-btn"
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyVisualSelectionHighlight();
                  setIsBlockFormatDropdownOpen((prev) => !prev);
                  setIsFontFamilyDropdownOpen(false);
                  setIsFontSizeDropdownOpen(false);
                }}
                aria-label="Block formatting"
                title="Block formatting style"
                className={`h-7 px-2.5 rounded border text-xs flex items-center justify-between gap-1.5 transition-colors cursor-pointer min-w-[115px] ${
                  isDarkMode 
                    ? 'bg-neutral-900 border-neutral-700 text-neutral-200 hover:border-neutral-500' 
                    : 'bg-white border-neutral-300 text-neutral-800 hover:border-neutral-400'
                }`}
              >
                <span className="truncate">
                  {activeFormats.formatBlock === 'h1'
                    ? 'Chapter Title (H1)'
                    : activeFormats.formatBlock === 'h2'
                    ? 'Section Title (H2)'
                    : activeFormats.formatBlock === 'h3'
                    ? 'Scene Heading (H3)'
                    : activeFormats.formatBlock === 'blockquote' || activeFormats.quote
                    ? 'Quote / Dialogue'
                    : 'Paragraph'}
                </span>
                <ChevronDown className="w-3 h-3 text-neutral-400 shrink-0" />
              </button>

              {/* Custom Block Format Popover Menu */}
              {isBlockFormatDropdownOpen && (
                <div
                  className={`absolute top-full left-0 mt-1 w-44 rounded-lg border shadow-xl z-50 p-1 space-y-0.5 text-xs backdrop-blur-md ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
                  }`}
                >
                  {[
                    { id: 'p', label: 'Paragraph' },
                    { id: 'h1', label: 'Chapter Title (H1)' },
                    { id: 'h2', label: 'Section Title (H2)' },
                    { id: 'h3', label: 'Scene Heading (H3)' },
                    { id: 'blockquote', label: 'Quote / Dialogue' }
                  ].map((item) => {
                    const isActive = (item.id === 'blockquote' && activeFormats.quote) || activeFormats.formatBlock === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          restoreEditorSelection();
                          if (item.id === 'p') {
                            if (activeFormats.quote) {
                              handleToggleQuote();
                            } else {
                              executeCommand('formatBlock', '<p>');
                            }
                          } else if (item.id === 'h1') {
                            executeCommand('formatBlock', '<h1>');
                          } else if (item.id === 'h2') {
                            executeCommand('formatBlock', '<h2>');
                          } else if (item.id === 'h3') {
                            executeCommand('formatBlock', '<h3>');
                          } else if (item.id === 'blockquote') {
                            handleToggleQuote();
                          }
                          setIsBlockFormatDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
                          isActive
                            ? isDarkMode ? 'bg-neutral-800 font-bold text-accent' : 'bg-neutral-100 font-bold text-accent'
                            : isDarkMode ? 'hover:bg-neutral-800 text-neutral-200' : 'hover:bg-neutral-100 text-neutral-800'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

          {/* Basic Text Formatting (Bold, Italic, Underline, Strike, Uppercase, Lowercase) - Desktop view (separate buttons) */}
          <div className="hidden md:flex items-center gap-0.5 pr-2 border-r border-neutral-200 dark:border-neutral-800">
            <button
              id="toolbar-bold"
              onMouseDown={(e) => { e.preventDefault(); executeCommand('bold'); }}
              title="Bold (Ctrl+B)"
              className={getFormatButtonClass(activeFormats.bold, 'font-bold')}
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              id="toolbar-italic"
              onMouseDown={(e) => { e.preventDefault(); executeCommand('italic'); }}
              title="Italic (Ctrl+I)"
              className={getFormatButtonClass(activeFormats.italic, 'italic')}
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              id="toolbar-underline"
              onMouseDown={(e) => { e.preventDefault(); executeCommand('underline'); }}
              title="Underline (Ctrl+U)"
              className={getFormatButtonClass(activeFormats.underline, 'underline')}
            >
              <Underline className="w-3.5 h-3.5" />
            </button>
            <button
              id="toolbar-strikethrough"
              onMouseDown={(e) => { e.preventDefault(); executeCommand('strikeThrough'); }}
              title="Strikethrough"
              className={getFormatButtonClass(activeFormats.strikethrough, 'line-through')}
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </button>
            <button
              id="toolbar-uppercase"
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleTransformCase('upper'); }}
              title="Uppercase (convert selection to uppercase)"
              className="p-1 sm:p-1.5 rounded transition-colors cursor-pointer text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/80 dark:hover:bg-neutral-800"
            >
              <span className="font-mono font-bold text-[11px] leading-none tracking-tight select-none">AA</span>
            </button>
            <button
              id="toolbar-lowercase"
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleTransformCase('lower'); }}
              title="Lowercase (convert selection to lowercase)"
              className="p-1 sm:p-1.5 rounded transition-colors cursor-pointer text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/80 dark:hover:bg-neutral-800"
            >
              <span className="font-mono font-bold text-[11px] leading-none tracking-tight select-none">aa</span>
            </button>
          </div>

          {/* MOBILE ONLY: Compact Font Effects Dropdown (Bold, Italic, Underline, Strikethrough, Uppercase, Lowercase) */}
          <div ref={mobileFontEffectsRef} className="flex md:hidden items-center pr-1 border-r border-neutral-200 dark:border-neutral-800 relative">
            <button
              id="toolbar-mobile-font-effects-btn"
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsMobileFontEffectsOpen((prev) => !prev);
                setIsMobileAlignmentsOpen(false);
                setIsFontFamilyDropdownOpen(false);
                setIsFontSizeDropdownOpen(false);
                setIsBlockFormatDropdownOpen(false);
              }}
              title="Text Effects (Bold, Italic, Underline, Strikethrough, Uppercase, Lowercase)"
              className={getFormatButtonClass(
                activeFormats.bold || activeFormats.italic || activeFormats.underline || activeFormats.strikethrough || isMobileFontEffectsOpen,
                'flex items-center justify-center min-w-[26px] h-7 px-1'
              )}
            >
              <span className="font-bold italic underline line-through text-xs font-serif leading-none select-none">
                A
              </span>
            </button>

            {isMobileFontEffectsOpen && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className={`absolute top-full left-0 mt-1 w-44 rounded-lg border shadow-xl z-50 p-1 space-y-0.5 text-xs backdrop-blur-md ${
                  isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
                }`}
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    executeCommand('bold');
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
                    activeFormats.bold
                      ? isDarkMode ? 'bg-neutral-800 text-accent font-bold' : 'bg-neutral-100 text-accent font-bold'
                      : isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    <Bold className="w-3.5 h-3.5" />
                    <span>Bold</span>
                  </div>
                  {activeFormats.bold && <Check className="w-3.5 h-3.5 text-accent" />}
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    executeCommand('italic');
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
                    activeFormats.italic
                      ? isDarkMode ? 'bg-neutral-800 text-accent font-bold' : 'bg-neutral-100 text-accent font-bold'
                      : isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2 italic">
                    <Italic className="w-3.5 h-3.5" />
                    <span>Italic</span>
                  </div>
                  {activeFormats.italic && <Check className="w-3.5 h-3.5 text-accent" />}
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    executeCommand('underline');
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
                    activeFormats.underline
                      ? isDarkMode ? 'bg-neutral-800 text-accent font-bold' : 'bg-neutral-100 text-accent font-bold'
                      : isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2 underline">
                    <Underline className="w-3.5 h-3.5" />
                    <span>Underline</span>
                  </div>
                  {activeFormats.underline && <Check className="w-3.5 h-3.5 text-accent" />}
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    executeCommand('strikeThrough');
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
                    activeFormats.strikethrough
                      ? isDarkMode ? 'bg-neutral-800 text-accent font-bold' : 'bg-neutral-100 text-accent font-bold'
                      : isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2 line-through">
                    <Strikethrough className="w-3.5 h-3.5" />
                    <span>Strikethrough</span>
                  </div>
                  {activeFormats.strikethrough && <Check className="w-3.5 h-3.5 text-accent" />}
                </button>

                <div className="h-px bg-neutral-200 dark:bg-neutral-800 my-1" />

                {/* Mobile Uppercase */}
                <button
                  id="mobile-btn-uppercase"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleTransformCase('upper');
                    setIsMobileFontEffectsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
                    isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2 font-mono font-bold text-xs">
                    <span className="w-4 text-center">AA</span>
                    <span>Uppercase</span>
                  </div>
                </button>

                {/* Mobile Lowercase */}
                <button
                  id="mobile-btn-lowercase"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleTransformCase('lower');
                    setIsMobileFontEffectsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
                    isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2 font-mono font-bold text-xs">
                    <span className="w-4 text-center">aa</span>
                    <span>Lowercase</span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Color, Highlighter & Clear Formatting (Isolated by vertical lines) */}
          <div className="flex items-center gap-0.5 pr-1 md:pr-2 border-r border-neutral-200 dark:border-neutral-800">
            {/* Text Color Dropdown */}
            <div className="relative">
              <button
                id="toolbar-color-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setShowColorPicker(!showColorPicker);
                  setShowHighlightPicker(false);
                }}
                title="Text Color for Selection"
                className={`p-1 sm:p-1.5 rounded transition-colors flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                  showColorPicker
                    ? isDarkMode ? 'bg-neutral-800 text-white' : 'bg-neutral-200 text-neutral-950 font-bold'
                    : isDarkMode ? 'text-neutral-200 hover:text-white hover:bg-neutral-800' : 'text-neutral-900 hover:text-black hover:bg-neutral-200/80'
                }`}
              >
                <Palette className="w-3.5 h-3.5" />
                <span 
                  className="w-3.5 h-0.5 rounded-full" 
                  style={{ backgroundColor: activeTextColor }} 
                />
              </button>
              {showColorPicker && (
                <div 
                  ref={colorPickerRef}
                  className={`absolute top-full left-0 mt-1.5 p-3 rounded-xl border shadow-xl z-50 w-72 backdrop-blur-md space-y-3 ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-900'
                  }`}
                >
                  {/* 5 Fixed / Changeable Standard Palette Swatches */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                        Standard Palette (5)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setStandardColors(DEFAULT_5_COLORS);
                          localStorage.setItem('mundus_standard_colors_v2', JSON.stringify(DEFAULT_5_COLORS));
                        }}
                        title="Reset presets to default"
                        className="text-[10px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 flex items-center gap-0.5 cursor-pointer"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        Reset
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      {standardColors.map((color, idx) => {
                        const isFixed = idx === 0;
                        const defaultThemeColor = isDarkMode ? '#f4f4f5' : '#09090b';
                        const slotColor = idx === 0 ? defaultThemeColor : color === 'auto' ? '#ffffff' : color;
                        return (
                          <div key={idx} className="relative group/swatch flex-1 flex flex-col items-center">
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                if (idx === 0) {
                                  handleApplyAutoThemeColor();
                                } else {
                                  executeCommand('foreColor', slotColor);
                                  setActiveTextColor(slotColor);
                                }
                              }}
                              title={isFixed 
                                ? 'Default Theme Color (Auto Black/White) · Fixed' 
                                : `Apply ${slotColor} · Hover ✏️ to customize slot`
                              }
                              style={
                                idx === 0
                                  ? { background: 'linear-gradient(45deg, #000000 50%, #ffffff 50%)' }
                                  : { backgroundColor: slotColor }
                              }
                              className="w-8 h-8 rounded-lg border border-neutral-300 dark:border-neutral-600 shadow-2xs hover:scale-105 transition-transform flex items-center justify-center cursor-pointer"
                            />
                            {/* Change Preset Color Input (Customizable for slots 2-5) */}
                            {!isFixed && (
                              <label
                                title={`Change preset #${idx + 1}`}
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 shadow-xs flex items-center justify-center opacity-0 group-hover/swatch:opacity-100 hover:scale-110 transition-all cursor-pointer z-10"
                              >
                                <Edit2 className="w-2 h-2 text-neutral-700 dark:text-neutral-200" />
                                <input
                                  type="color"
                                  value={slotColor}
                                  onChange={(e) => handleUpdateStandardColor(idx, e.target.value)}
                                  className="sr-only"
                                />
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-1 text-center">
                      Slot 1 fixed (Default Theme) · Hover ✏️ on slots 2-5 to customize
                    </p>
                  </div>

                  {/* Color Wheel Picker & Last 3 Picked Colors */}
                  <div className="pt-2.5 border-t border-neutral-200 dark:border-neutral-800">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                        Wheel & Recent (Last 3)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Interactive Color Wheel Picker Button */}
                      <label
                        title="Open Color Wheel / Custom Picker"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-medium cursor-pointer transition-colors shrink-0 shadow-2xs group"
                      >
                        <span className="w-4 h-4 rounded-full bg-[conic-gradient(at_center,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)] group-hover:scale-110 transition-transform shadow-2xs border border-white/50" />
                        <span className="text-[11px] font-semibold">Picker</span>
                        <input
                          type="color"
                          onChange={(e) => handlePickWheelColor(e.target.value)}
                          className="sr-only"
                        />
                      </label>

                      {/* 3 Selectable Boxes for Recent Colors */}
                      <div className="flex items-center gap-1.5 flex-1 justify-end">
                        {[0, 1, 2].map((slotIdx) => {
                          const recentColor = recentWheelColors[slotIdx];
                          if (recentColor) {
                            return (
                              <button
                                key={slotIdx}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  executeCommand('foreColor', recentColor);
                                  setActiveTextColor(recentColor);
                                }}
                                title={`Recent custom: ${recentColor} (Click to apply)`}
                                style={{ backgroundColor: recentColor }}
                                className="w-8 h-8 rounded-lg border border-neutral-300 dark:border-neutral-600 shadow-2xs hover:scale-105 transition-transform cursor-pointer"
                              />
                            );
                          }
                          return (
                            <div
                              key={slotIdx}
                              title="Empty recent slot (Pick from wheel to fill)"
                              className="w-8 h-8 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-xs text-neutral-400 select-none bg-neutral-50/50 dark:bg-neutral-850/50"
                            >
                              +
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* Auto / Default Theme Text Color Option */}
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        // v0.7.88: strip color stamps so text follows the theme,
                        // instead of stamping the current theme color as an
                        // inline override (which stopped adapting on switches).
                        handleApplyAutoThemeColor();
                      }}
                      className="w-full mt-2.5 py-1.5 px-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-[11px] font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <RotateCcw className="w-3 h-3 text-neutral-500" />
                      <span>Auto / Reset Theme Color</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Highlighter Dropdown */}
            <div className="relative">
              <button
                id="toolbar-highlight-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setShowHighlightPicker(!showHighlightPicker);
                  setShowColorPicker(false);
                }}
                title="Highlight for Selection"
                className={`p-1 sm:p-1.5 rounded transition-colors flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                  showHighlightPicker
                    ? isDarkMode ? 'bg-neutral-800 text-white' : 'bg-neutral-200 text-neutral-950 font-bold'
                    : isDarkMode ? 'text-neutral-200 hover:text-white hover:bg-neutral-800' : 'text-neutral-900 hover:text-black hover:bg-neutral-200/80'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5" />
                <span 
                  className="w-3.5 h-0.5 rounded-full" 
                  style={{ backgroundColor: activeHighlightColor === 'transparent' ? '#fef08a' : activeHighlightColor }} 
                />
              </button>
              {showHighlightPicker && (
                <div 
                  ref={highlightPickerRef}
                  onKeyDown={handleHighlightMenuKeyDown}
                  className={`absolute top-full left-0 mt-1.5 p-2 rounded-lg border shadow-xl z-50 flex gap-1.5 backdrop-blur-md ${
                    isDarkMode ? 'bg-neutral-900/95 border-neutral-700' : 'bg-white/95 border-neutral-200'
                  }`}
                >
                  {highlightColors.map((h) => {
                    const isCurrentActive = normalizeColorToRgb(activeHighlightColor) === normalizeColorToRgb(h.value);
                    return (
                      <button
                        key={h.name}
                        type="button"
                        onMouseDown={(e) => {
                          // preventDefault keeps the document selection intact
                          // (v0.7.93: apply on click so keyboard Enter/Space works too)
                          e.preventDefault();
                        }}
                        onClick={() => {
                          handleToggleHighlight(h.value, h.key);
                        }}
                        title={h.value === 'transparent' ? 'Remove highlight' : isCurrentActive ? `Remove ${h.name} (Click to toggle off)` : `Apply ${h.name}`}
                        style={{ backgroundColor: h.value === 'transparent' ? (isDarkMode ? '#171717' : '#ffffff') : h.value }}
                        className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all cursor-pointer ${
                          isCurrentActive 
                            ? 'border-neutral-900 dark:border-white ring-2 ring-blue-500 scale-105 shadow-xs' 
                            : 'border-neutral-400 hover:scale-110'
                        }`}
                      >
                        {isCurrentActive && h.value !== 'transparent' && (
                          <Check className="w-3 h-3 text-neutral-800 dark:text-neutral-200 stroke-[3]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Clear Formatting */}
            <button
              id="toolbar-clear-format"
              onMouseDown={(e) => { e.preventDefault(); handleClearFormatting(); }}
              title="Clear Formatting on Selected Text"
              className={`p-1 sm:p-1.5 rounded transition-colors cursor-pointer ${
                isDarkMode 
                  ? 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200' 
                  : 'hover:bg-neutral-200/80 text-neutral-700 hover:text-neutral-950'
              }`}
            >
              <RemoveFormatting className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Text Alignment - Desktop View (4 separate buttons) */}
          <div className="hidden md:flex items-center gap-0.5 pr-2 border-r border-neutral-200 dark:border-neutral-800">
            <button
              id="toolbar-align-left"
              onMouseDown={(e) => { e.preventDefault(); executeCommand('justifyLeft'); }}
              title="Align Left"
              className={getFormatButtonClass(activeFormats.alignLeft)}
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              id="toolbar-align-center"
              onMouseDown={(e) => { e.preventDefault(); executeCommand('justifyCenter'); }}
              title="Align Center"
              className={getFormatButtonClass(activeFormats.alignCenter)}
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              id="toolbar-align-right"
              onMouseDown={(e) => { e.preventDefault(); executeCommand('justifyRight'); }}
              title="Align Right"
              className={getFormatButtonClass(activeFormats.alignRight)}
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
            <button
              id="toolbar-align-justify"
              onMouseDown={(e) => { e.preventDefault(); executeCommand('justifyFull'); }}
              title="Justify"
              className={getFormatButtonClass(activeFormats.alignJustify)}
            >
              <AlignJustify className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* MOBILE ONLY: Compact Alignments Dropdown */}
          <div ref={mobileAlignmentsRef} className="flex md:hidden items-center pr-1 border-r border-neutral-200 dark:border-neutral-800 relative">
            <button
              id="toolbar-mobile-alignments-btn"
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsMobileAlignmentsOpen((prev) => !prev);
                setIsMobileListsOpen(false);
                setIsMobileFontEffectsOpen(false);
                setIsFontFamilyDropdownOpen(false);
                setIsFontSizeDropdownOpen(false);
                setIsBlockFormatDropdownOpen(false);
              }}
              title="Text Alignment (Left, Center, Right, Justify)"
              className={getFormatButtonClass(
                activeFormats.alignLeft || activeFormats.alignCenter || activeFormats.alignRight || activeFormats.alignJustify || isMobileAlignmentsOpen,
                'flex items-center justify-center min-w-[26px] h-7 px-1'
              )}
            >
              {activeFormats.alignCenter ? (
                <AlignCenter className="w-3.5 h-3.5" />
              ) : activeFormats.alignRight ? (
                <AlignRight className="w-3.5 h-3.5" />
              ) : activeFormats.alignJustify ? (
                <AlignJustify className="w-3.5 h-3.5" />
              ) : (
                <AlignLeft className="w-3.5 h-3.5" />
              )}
            </button>

            {isMobileAlignmentsOpen && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className={`absolute top-full right-0 mt-1 w-44 rounded-lg border shadow-xl z-50 p-1 space-y-0.5 text-xs backdrop-blur-md ${
                  isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
                }`}
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    executeCommand('justifyLeft');
                    setIsMobileAlignmentsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
                    activeFormats.alignLeft
                      ? isDarkMode ? 'bg-neutral-800 text-accent font-bold' : 'bg-neutral-100 text-accent font-bold'
                      : isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <AlignLeft className="w-3.5 h-3.5" />
                    <span>Align Left</span>
                  </div>
                  {activeFormats.alignLeft && <Check className="w-3.5 h-3.5 text-accent" />}
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    executeCommand('justifyCenter');
                    setIsMobileAlignmentsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
                    activeFormats.alignCenter
                      ? isDarkMode ? 'bg-neutral-800 text-accent font-bold' : 'bg-neutral-100 text-accent font-bold'
                      : isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <AlignCenter className="w-3.5 h-3.5" />
                    <span>Align Center</span>
                  </div>
                  {activeFormats.alignCenter && <Check className="w-3.5 h-3.5 text-accent" />}
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    executeCommand('justifyRight');
                    setIsMobileAlignmentsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
                    activeFormats.alignRight
                      ? isDarkMode ? 'bg-neutral-800 text-accent font-bold' : 'bg-neutral-100 text-accent font-bold'
                      : isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <AlignRight className="w-3.5 h-3.5" />
                    <span>Align Right</span>
                  </div>
                  {activeFormats.alignRight && <Check className="w-3.5 h-3.5 text-accent" />}
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    executeCommand('justifyFull');
                    setIsMobileAlignmentsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
                    activeFormats.alignJustify
                      ? isDarkMode ? 'bg-neutral-800 text-accent font-bold' : 'bg-neutral-100 text-accent font-bold'
                      : isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <AlignJustify className="w-3.5 h-3.5" />
                    <span>Justify</span>
                  </div>
                  {activeFormats.alignJustify && <Check className="w-3.5 h-3.5 text-accent" />}
                </button>
              </div>
            )}
          </div>

          {/* Desktop Lists & Quote (3 separate buttons) */}
          <div className="hidden md:flex items-center gap-0.5 pr-2 border-r border-neutral-200 dark:border-neutral-800">
            <button
              id="toolbar-bullet-list"
              onMouseDown={(e) => { e.preventDefault(); executeCommand('insertUnorderedList'); }}
              title="Bullet List"
              className={getFormatButtonClass(activeFormats.bulletList)}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              id="toolbar-numbered-list"
              onMouseDown={(e) => { e.preventDefault(); executeCommand('insertOrderedList'); }}
              title="Numbered List"
              className={getFormatButtonClass(activeFormats.orderedList)}
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button
              id="toolbar-quote"
              onMouseDown={(e) => { e.preventDefault(); handleToggleQuote(); }}
              title={activeFormats.quote ? "Remove Blockquote" : "Blockquote"}
              className={getFormatButtonClass(activeFormats.quote)}
            >
              <Quote className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* MOBILE ONLY: Compact Lists & Quote Dropdown */}
          <div ref={mobileListsRef} className="flex md:hidden items-center pr-1 border-r border-neutral-200 dark:border-neutral-800 relative">
            <button
              id="toolbar-mobile-lists-btn"
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsMobileListsOpen((prev) => !prev);
                setIsMobileAlignmentsOpen(false);
                setIsMobileFontEffectsOpen(false);
                setIsFontFamilyDropdownOpen(false);
                setIsFontSizeDropdownOpen(false);
                setIsBlockFormatDropdownOpen(false);
              }}
              title="Lists & Blockquote (Bulleted, Numbered, Quote)"
              className={getFormatButtonClass(
                activeFormats.bulletList || activeFormats.orderedList || activeFormats.quote || isMobileListsOpen,
                'flex items-center justify-center min-w-[26px] h-7 px-1'
              )}
            >
              {activeFormats.orderedList ? (
                <ListOrdered className="w-3.5 h-3.5" />
              ) : activeFormats.quote ? (
                <Quote className="w-3.5 h-3.5" />
              ) : (
                <List className="w-3.5 h-3.5" />
              )}
            </button>

            {isMobileListsOpen && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className={`absolute top-full right-0 mt-1 w-44 rounded-lg border shadow-xl z-50 p-1 space-y-0.5 text-xs backdrop-blur-md ${
                  isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
                }`}
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    executeCommand('insertUnorderedList');
                    setIsMobileListsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
                    activeFormats.bulletList
                      ? isDarkMode ? 'bg-neutral-800 text-accent font-bold' : 'bg-neutral-100 text-accent font-bold'
                      : isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <List className="w-3.5 h-3.5" />
                    <span>Bullet List</span>
                  </div>
                  {activeFormats.bulletList && <Check className="w-3.5 h-3.5 text-accent" />}
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    executeCommand('insertOrderedList');
                    setIsMobileListsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
                    activeFormats.orderedList
                      ? isDarkMode ? 'bg-neutral-800 text-accent font-bold' : 'bg-neutral-100 text-accent font-bold'
                      : isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ListOrdered className="w-3.5 h-3.5" />
                    <span>Numbered List</span>
                  </div>
                  {activeFormats.orderedList && <Check className="w-3.5 h-3.5 text-accent" />}
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleToggleQuote();
                    setIsMobileListsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
                    activeFormats.quote
                      ? isDarkMode ? 'bg-neutral-800 text-accent font-bold' : 'bg-neutral-100 text-accent font-bold'
                      : isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Quote className="w-3.5 h-3.5" />
                    <span>Blockquote</span>
                  </div>
                  {activeFormats.quote && <Check className="w-3.5 h-3.5 text-accent" />}
                </button>
              </div>
            )}
          </div>

          {/* Manage Custom Dictionary, Visual Manuscript Image, and Find in Document */}
          <div className="flex items-center gap-0.5 pr-1 md:pr-2 border-r border-neutral-200 dark:border-neutral-800">
            <button
              id="toolbar-custom-dict-btn"
              onClick={() => setShowSpellCheckModal(true)}
              title="Manage custom dictionary & word exclusions"
              className={`p-1 sm:p-1.5 rounded transition-colors cursor-pointer ${
                isDarkMode 
                  ? 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200' 
                  : 'hover:bg-neutral-200/80 text-neutral-700 hover:text-neutral-950'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
            </button>

            <button
              id="toolbar-insert-image"
              onClick={triggerVisualImageUpload}
              disabled={isUploadingVisualImage}
              title="Add an image to the document"
              className={`p-1 sm:p-1.5 rounded transition-colors cursor-pointer ${
                isDarkMode 
                  ? 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200' 
                  : 'hover:bg-neutral-200/80 text-neutral-700 hover:text-neutral-950'
              }`}
            >
              {isUploadingVisualImage ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ImageIcon className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              id="toolbar-find-replace-btn"
              onClick={handleOpenFindBar}
              title="Find in document (Ctrl+F)"
              className={`hidden md:inline-flex p-1 sm:p-1.5 rounded transition-colors cursor-pointer ${
                isFindBarOpen
                  ? 'bg-accent/20 text-accent font-bold'
                  : isDarkMode 
                    ? 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200' 
                    : 'hover:bg-neutral-200/80 text-neutral-700 hover:text-neutral-950'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
            </button>

            {/* v0.7.94: hidden on Android — keyboards have voice input. */}
            {!ANDROID_APP && (
            <button
              id="toolbar-stt-btn"
              onClick={toggleDictation}
              title={sttButtonTitle}
              aria-label="Voice dictation"
              className={`hidden md:inline-flex p-1 sm:p-1.5 rounded transition-colors cursor-pointer ${
                sttStatus === 'listening'
                  ? 'bg-red-500/15 text-red-500'
                  : sttStatus === 'loading'
                  ? 'bg-accent/20 text-accent'
                  : sttStatus === 'error'
                  ? 'bg-red-500/5 text-red-500'
                  : isDarkMode
                    ? 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                    : 'hover:bg-neutral-200/80 text-neutral-700 hover:text-neutral-950'
              }`}
            >
              {sttStatus === 'loading' ? <Loader2 className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
            )}
          </div>

          {/* Contextual Tools (Spellcheck, Timeline, In This Scene) - Hidden on mobile, shown on desktop */}
          <div className="hidden md:flex items-center gap-1 pl-1 ml-auto">
            {/* Word-Style Spell Check & Suggestions Review Button */}
            <button
              id="toolbar-spellcheck-btn"
              onClick={() => {
                if (!spellCheckEnabled) {
                  setSpellCheckEnabled(true);
                  setSpellCheckState(true);
                }
                setShowSpellCheckReview(!showSpellCheckReview);
              }}
              title={
                spellCheckEnabled
                  ? `${misspellings.length} spelling flags found. Click to review Word-style suggestions & corrections`
                  : 'Turn on Spellcheck & Review'
              }
              className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5 border cursor-pointer ${
                showSpellCheckReview
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-black border-neutral-900 dark:border-white font-semibold'
                  : spellCheckEnabled
                    ? misspellings.length > 0
                      ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/20'
                      : isDarkMode
                        ? 'border-neutral-700 bg-neutral-900/80 text-neutral-200 hover:bg-neutral-800'
                        : 'border-neutral-300 bg-neutral-100/90 text-neutral-800 hover:bg-neutral-200'
                    : isDarkMode
                      ? 'border-neutral-800/80 text-neutral-500 hover:text-neutral-300'
                      : 'border-neutral-200 text-neutral-400 hover:text-neutral-700'
              }`}
            >
              <SpellCheck className="w-3.5 h-3.5" />
              <span className="text-[11px] font-mono">
                {spellCheckEnabled ? 'Review Spelling' : 'Spellcheck Off'}
              </span>
              {spellCheckEnabled && misspellings.length > 0 && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-red-500 text-white animate-pulse">
                  {misspellings.length}
                </span>
              )}
            </button>

            {/* Scene Timeline & Duration Trigger */}
            <button
              id="toolbar-scene-timeline-btn"
              onClick={() => setShowTimelineModal(true)}
              title={document.timelineInfo?.startYear !== undefined ? `Scene Timeline: ${document.timelineInfo.startDisplay || `${document.timelineInfo.startYear}`} (${document.timelineInfo.duration || 1} ${document.timelineInfo.durationUnit || 'days'})` : "Set Scene Timeline Placement & Duration"}
              className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5 border cursor-pointer ${
                document.timelineInfo?.startYear !== undefined
                  ? 'border-accent text-accent bg-accent/5 hover:bg-accent/10 font-semibold'
                  : isDarkMode 
                    ? 'border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850' 
                    : 'border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
              }`}
            >
              <Clock className={`w-3.5 h-3.5 shrink-0 ${document.timelineInfo?.startYear !== undefined ? 'text-accent' : 'text-neutral-400'}`} />
              <span className="text-[11px] font-mono">
                {document.timelineInfo?.duration ? `${document.timelineInfo.duration} ${document.timelineInfo.durationUnit || 'days'}` : 'Timeline'}
              </span>
            </button>

            {/* In This Scene Codex & Lore Drawer Trigger */}
            <button
              id="toolbar-in-this-scene-btn"
              onClick={() => setShowInThisSceneDrawer(!showInThisSceneDrawer)}
              title="View all Codex entities & lore detected in this scene"
              className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5 border cursor-pointer ${
                showInThisSceneDrawer
                  ? 'border-accent bg-accent text-white font-semibold'
                  : detectedSceneCount > 0
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                  : isDarkMode
                  ? 'border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-850'
                  : 'border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
              }`}
            >
              <BookMarked className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11px] font-mono">In This Scene</span>
              {detectedSceneCount > 0 && (
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {detectedSceneCount}
                </span>
              )}
            </button>
          </div>
        </div>

          {/* Mobile Typography Row (Shows Font, FontSize, Text Kind in a single line on mobile) */}
          {isMobileTypographyOpen && (
            <div 
              id="mobile-typography-row"
              className="flex md:hidden items-center justify-between gap-1.5 w-full pt-1.5 pb-0.5 border-t border-neutral-200/60 dark:border-neutral-800/60"
            >
              {/* 1. Font Family Selector (Mobile) */}
              <div ref={fontFamilyMobileDropdownRef} className="flex-1 min-w-0 relative">
                <button
                  id="toolbar-font-family-btn-mobile"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    applyVisualSelectionHighlight();
                    setIsFontFamilyDropdownOpen((prev) => !prev);
                    setIsBlockFormatDropdownOpen(false);
                    setIsFontSizeDropdownOpen(false);
                  }}
                  aria-label="Font family for selection"
                  title="Font family for selection"
                  className={`w-full h-7 px-2 rounded border text-xs flex items-center justify-between gap-1 transition-colors cursor-pointer truncate ${
                    isDarkMode 
                      ? 'bg-neutral-900 border-neutral-700 text-neutral-200 hover:border-neutral-500' 
                      : 'bg-white border-neutral-300 text-neutral-800 hover:border-neutral-400'
                  }`}
                >
                  <span className="truncate text-[11px]">
                    {currentSelectionFontFamily === 'serif'
                      ? 'Serif (Lora)'
                      : currentSelectionFontFamily === 'sans'
                      ? 'Sans (Inter)'
                      : currentSelectionFontFamily === 'mono'
                      ? 'Mono (Code)'
                      : currentSelectionFontFamily.startsWith('gfont_')
                      ? (loadedGoogleFontsList.find(gf => gf.id === currentSelectionFontFamily.replace('gfont_', '') || gf.name.toLowerCase() === currentSelectionFontFamily.replace('gfont_', '').toLowerCase())?.name 
                         || CURATED_GOOGLE_FONTS.find(gf => gf.id === currentSelectionFontFamily.replace('gfont_', '') || gf.name.toLowerCase() === currentSelectionFontFamily.replace('gfont_', '').toLowerCase())?.name 
                         || currentSelectionFontFamily.replace('gfont_', ''))
                      : (customFonts.find(cf => cf.id === currentSelectionFontFamily)?.name || 'Serif (Lora)')}
                  </span>
                  <ChevronDown className="w-2.5 h-2.5 text-neutral-400 shrink-0" />
                </button>

                {/* Font Family Popover Menu */}
                {isFontFamilyDropdownOpen && (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute top-full left-0 mt-1 w-56 max-h-60 overflow-y-auto rounded-lg border shadow-xl z-50 p-1 space-y-1 text-xs backdrop-blur-md ${
                      isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
                    }`}
                  >
                    <div>
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                        Standard Typefaces
                      </div>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          applyFontFamilyToSelection('serif');
                          setIsFontFamilyDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded transition-colors font-serif cursor-pointer ${
                          currentSelectionFontFamily === 'serif'
                            ? isDarkMode ? 'bg-neutral-800 font-bold text-accent' : 'bg-neutral-100 font-bold text-accent'
                            : isDarkMode ? 'hover:bg-neutral-800 text-neutral-200' : 'hover:bg-neutral-100 text-neutral-800'
                        }`}
                      >
                        Novelist Serif (Lora)
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          applyFontFamilyToSelection('sans');
                          setIsFontFamilyDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded transition-colors font-sans cursor-pointer ${
                          currentSelectionFontFamily === 'sans'
                            ? isDarkMode ? 'bg-neutral-800 font-bold text-accent' : 'bg-neutral-100 font-bold text-accent'
                            : isDarkMode ? 'hover:bg-neutral-800 text-neutral-200' : 'hover:bg-neutral-100 text-neutral-800'
                        }`}
                      >
                        Modern Sans (Inter)
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          applyFontFamilyToSelection('mono');
                          setIsFontFamilyDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded transition-colors font-mono cursor-pointer ${
                          currentSelectionFontFamily === 'mono'
                            ? isDarkMode ? 'bg-neutral-800 font-bold text-accent' : 'bg-neutral-100 font-bold text-accent'
                            : isDarkMode ? 'hover:bg-neutral-800 text-neutral-200' : 'hover:bg-neutral-100 text-neutral-800'
                        }`}
                      >
                        Drafting Mono (Code)
                      </button>
                    </div>

                    {loadedGoogleFontsList.filter(isValidGoogleFontItem).length > 0 && (
                      <div className="pt-1 border-t border-neutral-200 dark:border-neutral-800">
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                          Google Fonts
                        </div>
                        {loadedGoogleFontsList.filter(isValidGoogleFontItem).map((gf) => {
                          const val = `gfont_${gf.id}`;
                          const isActive = currentSelectionFontFamily === val;
                          return (
                            <div
                              key={gf.id}
                              className={`group/gfont flex items-center justify-between rounded px-2.5 py-1.5 transition-colors cursor-pointer ${
                                isActive
                                  ? isDarkMode ? 'bg-neutral-800 font-bold text-accent' : 'bg-neutral-100 font-bold text-accent'
                                  : isDarkMode ? 'hover:bg-neutral-800 text-neutral-200' : 'hover:bg-neutral-100 text-neutral-800'
                              }`}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                applyFontFamilyToSelection(val);
                                setIsFontFamilyDropdownOpen(false);
                              }}
                            >
                              <span style={{ fontFamily: gf.fontFamily }} className="truncate flex-1">
                                {gf.name}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => handleRemoveGoogleFont(gf.id, e)}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="opacity-60 hover:opacity-100 hover:text-red-400 text-neutral-500 p-0.5 rounded transition-opacity ml-1"
                                title={`Remove ${gf.name}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {customFonts.length > 0 && (
                      <div className="pt-1 border-t border-neutral-200 dark:border-neutral-800">
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                          Uploaded Custom Fonts
                        </div>
                        {customFonts.map((cf) => {
                          const isActive = currentSelectionFontFamily === cf.id;
                          return (
                            <button
                              key={cf.id}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                applyFontFamilyToSelection(cf.id);
                                setIsFontFamilyDropdownOpen(false);
                              }}
                              style={{ fontFamily: cf.name }}
                              className={`w-full text-left px-2.5 py-1.5 rounded transition-colors truncate cursor-pointer ${
                                isActive
                                  ? isDarkMode ? 'bg-neutral-800 font-bold text-accent' : 'bg-neutral-100 font-bold text-accent'
                                  : isDarkMode ? 'hover:bg-neutral-800 text-neutral-200' : 'hover:bg-neutral-100 text-neutral-800'
                              }`}
                            >
                              {cf.name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="pt-1 border-t border-neutral-200 dark:border-neutral-800 space-y-0.5">
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsFontFamilyDropdownOpen(false);
                          setShowGoogleFontModal(true);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded transition-colors flex items-center gap-1.5 text-accent font-medium cursor-pointer ${
                          isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                        }`}
                      >
                        ✦ Browse Google Fonts...
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsFontFamilyDropdownOpen(false);
                          fontFileInputRef.current?.click();
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded transition-colors flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400 cursor-pointer ${
                          isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                        }`}
                      >
                        ＋ Upload Font File...
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Font Size Control (Mobile) */}
              <div ref={fontSizeMobileComboboxRef} className="w-14 shrink-0 relative">
                <div 
                  className={`relative flex items-center h-7 rounded border font-mono text-xs transition-colors ${
                    isDarkMode 
                      ? 'bg-neutral-900 border-neutral-700 text-neutral-200 focus-within:border-neutral-400' 
                      : 'bg-white border-neutral-300 text-neutral-800 focus-within:border-neutral-900'
                  }`}
                >
                  <input
                    id="toolbar-font-size-input-mobile"
                    type="text"
                    value={fontSizeInputValue}
                    onMouseDown={() => applyVisualSelectionHighlight()}
                    onFocus={() => applyVisualSelectionHighlight()}
                    onChange={(e) => setFontSizeInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const num = parseInt(fontSizeInputValue, 10);
                        if (!isNaN(num) && num >= 6 && num <= 200) {
                          applyFontSizeToSelection(num);
                        }
                      }
                    }}
                    onBlur={() => {
                      const num = parseInt(fontSizeInputValue, 10);
                      if (!isNaN(num) && num >= 6 && num <= 200) {
                        applyFontSizeToSelection(num);
                      } else {
                        removeVisualSelectionHighlight();
                        setFontSizeInputValue(String(currentSelectionFontSize || 16));
                      }
                    }}
                    title="Font size (pt)"
                    className="w-7 text-center bg-transparent h-full focus:outline-none font-mono text-[11px] px-0.5"
                  />

                  <button
                    id="btn-font-size-dropdown-arrow-mobile"
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      applyVisualSelectionHighlight();
                      setIsFontSizeDropdownOpen((prev) => !prev);
                      setIsFontFamilyDropdownOpen(false);
                      setIsBlockFormatDropdownOpen(false);
                    }}
                    title="Font size presets"
                    className={`h-full px-1 border-l flex items-center justify-center transition-colors cursor-pointer ${
                      isDarkMode ? 'border-neutral-800 hover:bg-neutral-800' : 'border-neutral-200 hover:bg-neutral-100'
                    }`}
                  >
                    <ChevronDown className="w-2.5 h-2.5 text-neutral-400" />
                  </button>

                  {/* Preset Dropdown Popover */}
                  {isFontSizeDropdownOpen && (
                    <div 
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className={`absolute top-full left-1/2 -translate-x-1/2 mt-1 w-20 max-h-48 overflow-y-auto rounded-lg border shadow-xl z-50 p-1 space-y-0.5 ${
                        isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
                      }`}
                    >
                      {[8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 48, 72].map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            applyFontSizeToSelection(sz);
                            setIsFontSizeDropdownOpen(false);
                          }}
                          className={`w-full text-center py-1 text-xs rounded font-mono transition-colors cursor-pointer ${
                            currentSelectionFontSize === sz
                              ? isDarkMode ? 'bg-neutral-800 font-bold text-accent' : 'bg-neutral-100 font-bold text-accent'
                              : isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Headings & Block Styles / Text Kind (Mobile) */}
              <div ref={blockFormatMobileDropdownRef} className="flex-1 min-w-0 relative">
                <button
                  id="toolbar-block-format-btn-mobile"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    applyVisualSelectionHighlight();
                    setIsBlockFormatDropdownOpen((prev) => !prev);
                    setIsFontFamilyDropdownOpen(false);
                    setIsFontSizeDropdownOpen(false);
                  }}
                  aria-label="Text kind & style"
                  title="Text kind & style"
                  className={`w-full h-7 px-2 rounded border text-xs flex items-center justify-between gap-1 transition-colors cursor-pointer truncate ${
                    isDarkMode 
                      ? 'bg-neutral-900 border-neutral-700 text-neutral-200 hover:border-neutral-500' 
                      : 'bg-white border-neutral-300 text-neutral-800 hover:border-neutral-400'
                  }`}
                >
                  <span className="truncate text-[11px]">
                    {activeFormats.formatBlock === 'h1'
                      ? 'Title (H1)'
                      : activeFormats.formatBlock === 'h2'
                      ? 'Heading (H2)'
                      : activeFormats.formatBlock === 'h3'
                      ? 'Subhead (H3)'
                      : activeFormats.formatBlock === 'blockquote' || activeFormats.quote
                      ? 'Quote'
                      : 'Paragraph'}
                  </span>
                  <ChevronDown className="w-2.5 h-2.5 text-neutral-400 shrink-0" />
                </button>

                {/* Block Format Popover Menu */}
                {isBlockFormatDropdownOpen && (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute top-full right-0 mt-1 w-44 rounded-lg border shadow-xl z-50 p-1 space-y-0.5 text-xs backdrop-blur-md ${
                      isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
                    }`}
                  >
                    {[
                      { id: 'p', label: 'Paragraph' },
                      { id: 'h1', label: 'Chapter Title (H1)' },
                      { id: 'h2', label: 'Section Title (H2)' },
                      { id: 'h3', label: 'Scene Heading (H3)' },
                      { id: 'blockquote', label: 'Quote / Dialogue' }
                    ].map((item) => {
                      const isActive = (item.id === 'blockquote' && activeFormats.quote) || activeFormats.formatBlock === item.id;
                      const applyBlockItem = () => {
                        restoreEditorSelection();
                        if (item.id === 'p') {
                          if (activeFormats.quote) {
                            handleToggleQuote();
                          } else {
                            executeCommand('formatBlock', '<p>');
                          }
                        } else if (item.id === 'h1') {
                          executeCommand('formatBlock', '<h1>');
                        } else if (item.id === 'h2') {
                          executeCommand('formatBlock', '<h2>');
                        } else if (item.id === 'h3') {
                          executeCommand('formatBlock', '<h3>');
                        } else if (item.id === 'blockquote') {
                          handleToggleQuote();
                        }
                        setIsBlockFormatDropdownOpen(false);
                      };

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            applyBlockItem();
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
                            isActive
                              ? isDarkMode ? 'bg-neutral-800 font-bold text-accent' : 'bg-neutral-100 font-bold text-accent'
                              : isDarkMode ? 'hover:bg-neutral-800 text-neutral-200' : 'hover:bg-neutral-100 text-neutral-800'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Exit Button for Zen Mode */}
      {isZenMode && (
        <div className="fixed top-4 right-4 z-50 group">
          <button
            id="btn-exit-zen-mode"
            onClick={onToggleZenMode}
            title="Exit Zen Mode (or press Esc)"
            className={`px-3.5 py-1.5 rounded-full border text-xs font-medium flex items-center gap-2 shadow-2xl backdrop-blur-md transition-all duration-200 opacity-40 hover:opacity-100 focus:opacity-100 group-hover:opacity-100 cursor-pointer ${
              isDarkMode 
                ? 'bg-neutral-900/95 border-neutral-700 text-neutral-200 hover:bg-neutral-800' 
                : 'bg-white/95 border-neutral-300 text-neutral-800 hover:bg-neutral-100 shadow-md'
            }`}
          >
            <EnsoIcon className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-mono">Exit Zen (Esc)</span>
          </button>
        </div>
      )}

      {/* Manuscript Writing Sheet Area with Physical Word-Style Pages */}
      <main 
        id="editor-scroll-area"
        ref={editorScrollContainerRef}
        onScroll={updatePageStats}
        onTouchStart={handleEditorTouchStart}
        onTouchMove={handleEditorTouchMove}
        onTouchEnd={handleEditorTouchEnd}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setIsDraggingFileOver(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDraggingFileOver(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingFileOver(false);
          const rawFiles = Array.from(e.dataTransfer.files) as File[];
          const files = rawFiles.filter((f) => f.type.startsWith('image/'));
          if (files.length > 0) {
            const canvasRect = manuscriptCanvasRef.current?.getBoundingClientRect();
            const dropX = canvasRect ? (e.clientX - canvasRect.left) / (pageZoom / 100) : undefined;
            const dropY = canvasRect ? (e.clientY - canvasRect.top) / (pageZoom / 100) : undefined;
            handleInsertVisualImage(
              files[0],
              dropX !== undefined && dropY !== undefined
                ? { x: Math.round(dropX), y: Math.round(dropY) }
                : undefined
            );
          }
        }}
        className={`relative z-10 flex-1 overflow-y-auto p-4 sm:p-8 md:p-12 flex flex-col items-center justify-start transition-colors ${
          isDarkMode
            ? 'bg-gradient-to-b from-[#0a0a0a] via-[#0e0e0e] to-[#121212]'
            : 'bg-gradient-to-b from-[#f9f9f9] via-[#f4f4f4] to-[#ebebeb]'
        }`}
      >
        <div 
          id="manuscript-canvas"
          ref={manuscriptCanvasRef}
          style={{
            transform: pageZoom !== 100 ? `scale(${pageZoom / 100})` : undefined,
            transformOrigin: 'top center',
            width: '100%',
            maxWidth: `${pageConfig.width}px`,
          }}
          className="relative flex flex-col items-center select-text transition-all duration-200"
        >
          {/* UNDERLAY LAYER: The Physical Paper Sheets Stack */}
          <div 
            style={{ gap: `${pageConfig.gap}px` }}
            className="absolute top-0 left-0 w-full flex flex-col pointer-events-none select-none z-0"
          >
            {Array.from({ length: pageStats.total }).map((_, pageIdx) => (
              <div
                key={pageIdx}
                id={`mundus-page-sheet-${pageIdx + 1}`}
                style={{ height: `${pageConfig.height}px` }}
                className={`w-full rounded-2xl border transition-all duration-200 relative overflow-hidden ${
                  isDarkMode
                    ? 'bg-[#141414] border-neutral-800/80 shadow-[0_14px_45px_rgba(0,0,0,0.85)] text-neutral-100'
                    : 'bg-white border-neutral-200/90 shadow-[0_12px_40px_rgba(0,0,0,0.08)] text-neutral-900'
                }`}
              >
                {/* Visual Page Number in Top Right */}
                <div className="absolute top-5 right-8 text-[11px] font-mono tracking-wider text-neutral-500/60 select-none">
                  Page {pageIdx + 1}
                </div>
              </div>
            ))}
          </div>

          {/* FOREGROUND LAYER: Active Document Editable Content Stream */}
          <div
            id="novel-content-editable"
            ref={editorRef}
            contentEditable
            spellCheck={false}
            lang="en"
            suppressContentEditableWarning
            onInput={handleEditorInput}
            onKeyDown={handleKeyDown}
            style={{
              minHeight: `${pageStats.total * PAGE_CYCLE - PAGE_GAP}px`,
              paddingTop: `${pageConfig.topMargin}px`,
              paddingBottom: `${pageConfig.bottomMargin}px`,
            }}
            className="novel-editor relative z-10 w-full break-words px-6 sm:px-14 focus:outline-none font-serif-novel text-base leading-relaxed bg-transparent"
          />

          {/* VISUAL IMAGES OVERLAY LAYER: Draggable & Resizable Illustrations */}
          <VisualImageOverlay
            key={document.id}
            documentId={document.id}
            images={visualImages}
            onUpdateImage={handleUpdateVisualImage}
            onDeleteImage={handleDeleteVisualImage}
            canvasRef={manuscriptCanvasRef}
            editorRef={editorRef}
            isDarkMode={isDarkMode}
            pageZoom={pageZoom}
            documentContent={document.content}
            accentColor={accentColor}
            onImageLoad={queuePagination}
          />

          {/* INLINE AUTOCORRECT SUGGESTION (v0.7.8): fixed-position popup anchored
              to the caret. Tab accepts the correction, Esc dismisses, "+ Add"
              whitelists the word in the active project's dictionary. The red wavy
              spellcheck underline is unaffected — this popup is purely additive. */}
          {inlineSuggestion && (
            <div
              data-mundus-inline-suggestion="true"
              className={`fixed z-[80] flex items-center gap-2 rounded-xl border px-2.5 py-1.5 shadow-2xl backdrop-blur-md ${
                isDarkMode
                  ? 'bg-neutral-900/95 border-neutral-700 text-neutral-100'
                  : 'bg-white/95 border-neutral-200 text-neutral-800'
              }`}
              style={{
                top: inlineSuggestion.rectBottom + 46 > window.innerHeight
                  ? Math.max(8, inlineSuggestion.rectTop - 46)
                  : inlineSuggestion.rectBottom + 6,
                left: Math.max(8, Math.min(inlineSuggestion.rectLeft, window.innerWidth - 320)),
              }}
            >
              <span
                className="font-mono text-[11px] text-red-500 line-through decoration-red-400/80"
                title={inlineSuggestion.grammarMessage || undefined}
              >
                {inlineSuggestion.originalWord}
              </span>
              <span className="text-[10px] opacity-40">→</span>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); acceptInlineSuggestion(inlineSuggestion); }}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-0.5 text-[11px] font-semibold transition-colors"
                title={inlineSuggestion.grammarMessage || `Replace with "${inlineSuggestion.replacement}" (Tab)`}
              >
                {inlineSuggestion.replacement}
              </button>
              {inlineSuggestion.alternatives.length > 0 && (
                <span className="text-[10px] opacity-50 whitespace-nowrap">
                  or {inlineSuggestion.alternatives.join(', ')}
                </span>
              )}
              {inlineSuggestion.lintKind && (
                <span
                  className={`text-[9px] font-mono uppercase tracking-wider rounded px-1 py-0.5 border whitespace-nowrap ${
                    isDarkMode ? 'border-neutral-600 text-neutral-400' : 'border-neutral-300 text-neutral-500'
                  }`}
                >
                  {inlineSuggestion.lintKind}
                </span>
              )}
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); addInlineWordToDictionary(inlineSuggestion); }}
                className={`rounded-lg px-1.5 py-0.5 text-[10px] border transition-colors whitespace-nowrap ${
                  isDarkMode ? 'border-neutral-600 hover:bg-neutral-700/70' : 'border-neutral-300 hover:bg-neutral-100'
                }`}
                title={`Keep "${inlineSuggestion.originalWord}" — add it to this project's dictionary`}
              >
                + Add
              </button>
              <span className="text-[10px] opacity-40 font-mono whitespace-nowrap">Tab ↹</span>
            </div>
          )}

          {/* WHISTLE DICTATION STATUS (v0.7.91-NIGHTLY) — floating indicator;
              the mic button itself also toggles the session off. */}
          {sttStatus !== 'idle' && (
            <div
              data-mundus-stt-pill="true"
              className={`fixed bottom-20 right-6 z-[90] flex items-center gap-2.5 rounded-full border px-3.5 py-2 shadow-2xl backdrop-blur-md text-xs max-w-[calc(100vw-3rem)] ${
                sttStatus === 'error'
                  ? isDarkMode ? 'bg-red-950/90 border-red-800 text-red-200' : 'bg-red-50 border-red-300 text-red-800'
                  : isDarkMode ? 'bg-neutral-900/95 border-neutral-700 text-neutral-100' : 'bg-white/95 border-neutral-200 text-neutral-800'
              }`}
            >
              {sttStatus === 'listening' && (
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
              )}
              {sttStatus === 'loading' && <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />}
              {sttStatus === 'error' && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
              <span className="font-semibold whitespace-nowrap">
                {sttStatus === 'listening' ? 'Listening' : sttStatus === 'loading' ? 'Whistle STT' : 'Dictation error'}
              </span>
              {sttStatus === 'listening' && (
                <span className="font-mono opacity-60 whitespace-nowrap">
                  {Math.floor(sttElapsed / 60)}:{String(sttElapsed % 60).padStart(2, '0')}
                </span>
              )}
              {sttStatus === 'listening' && sttHeard > 0 && (
                <span className="opacity-50 whitespace-nowrap" title="Seconds of audio delivered to the model so far">
                  · {sttHeard}s heard
                </span>
              )}
              {sttNote && <span className="opacity-70 truncate">{sttNote}</span>}
              {(sttStatus === 'listening' || sttStatus === 'loading') && (
                <button
                  type="button"
                  onClick={() => void stopDictation()}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                    isDarkMode ? 'border-neutral-600 hover:bg-neutral-700/70' : 'border-neutral-300 hover:bg-neutral-100'
                  }`}
                >
                  Stop
                </button>
              )}
            </div>
          )}

        </div>

        {/* Drag & Drop Visual Indicator */}
        {isDraggingFileOver && (
          <div 
            style={{
              borderColor: accentColor || 'var(--mundus-accent, #c29b38)',
              backgroundColor: accentColor ? `${accentColor}18` : 'rgba(234, 179, 8, 0.1)'
            }}
            className="fixed inset-x-8 inset-y-16 z-30 pointer-events-none border-2 border-dashed rounded-3xl flex items-center justify-center backdrop-blur-xs"
          >
            <div 
              style={{
                borderColor: accentColor ? `${accentColor}66` : 'rgba(234, 179, 8, 0.4)'
              }}
              className="px-6 py-3.5 rounded-2xl bg-black/85 text-white shadow-2xl flex items-center gap-3 border"
            >
              <ImageIcon className="w-6 h-6 animate-bounce" style={{ color: accentColor || 'var(--mundus-accent, #c29b38)' }} />
              <div>
                <p className="font-bold text-sm">Drop image onto manuscript page</p>
                <p className="text-xs text-neutral-400">Position and resize anywhere freely</p>
              </div>
            </div>
          </div>
        )}

        {/* Generous bottom spacer so page content never touches bottom viewport edge */}
        <div className="w-full h-32 shrink-0 pointer-events-none" />
      </main>

      {/* Bottom Status Bar */}
      {!isZenMode && (
        <footer 
          id="editor-footer"
          className={`border-t shrink-0 select-none backdrop-blur-md transition-colors ${
            isDarkMode 
              ? 'bg-[#121212]/90 border-neutral-800/80 text-neutral-400' 
              : 'bg-white/90 border-neutral-200/80 text-neutral-500'
          }`}
        >
          {/* MOBILE VIEW BOTTOM BAR: Space-efficient, clean layout without wasted space */}
          <div className="flex md:hidden items-center justify-between px-3 py-1.5 text-xs w-full gap-2">
            {/* Left: Page Number (Top) and Words / Characters (Bottom) */}
            <div className="flex flex-col items-start justify-center min-w-0 flex-1">
              <span className="font-mono text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                Page {pageStats.current} of {pageStats.total}
              </span>
              <span className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                {document.wordCount.toLocaleString()} words · {document.characterCount.toLocaleString()} chars
              </span>
            </div>

            {/* Center: Target Goal Button */}
            <div className="flex items-center justify-center shrink-0">
              <button
                id="btn-writing-target-trigger-mobile"
                onClick={() => setShowTargetModal(true)}
                title="Set or view writing target for this document"
                className={`font-mono text-[11px] px-2.5 py-1 rounded-md border flex items-center gap-1.5 transition-all cursor-pointer ${
                  document.targetCount && document.targetCount > 0
                    ? (document.targetType === 'characters' ? document.characterCount : document.wordCount) >= document.targetCount
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                      : isDarkMode
                        ? 'bg-neutral-900 border-neutral-700 text-neutral-200'
                        : 'bg-white border-neutral-300 text-neutral-800 shadow-2xs'
                    : isDarkMode
                      ? 'border-neutral-800 text-neutral-400 hover:text-neutral-200'
                      : 'border-neutral-200 text-neutral-500 hover:text-neutral-800'
                }`}
              >
                <Target className="w-3 h-3 text-neutral-400 shrink-0" />
                {document.targetCount && document.targetCount > 0 ? (
                  <span>
                    {document.targetType === 'characters'
                      ? `${Math.round(((document.characterCount) / document.targetCount) * 100)}%`
                      : `${Math.round(((document.wordCount) / document.targetCount) * 100)}%`}
                  </span>
                ) : (
                  <span>Target</span>
                )}
              </button>
            </div>

            {/* Right: Saved Timing (Top Right) and Document Format (Bottom Right) */}
            <div className="flex flex-col items-end justify-center min-w-0 flex-1 text-right">
              <span className="text-[11px] font-mono text-neutral-600 dark:text-neutral-400 font-medium truncate">
                {isSaving
                  ? 'Saving...'
                  : autoSaveInterval === 'off'
                  ? 'Saved'
                  : lastSavedAt
                  ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Saved'}
              </span>
              <span 
                id="footer-page-format-badge-mobile"
                title={`${pageConfig.name} (${pageConfig.metric} · ${pageConfig.dimensions})`}
                className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 truncate"
              >
                {pageConfig.name}
              </span>
            </div>
          </div>

          {/* DESKTOP VIEW BOTTOM BAR: Standard rich desktop status bar.
              v0.7.85: min-h matches the sidebar's bottom section (8+28+8+1 = 45px)
              so the two bottom edges align; content stays vertically centered. */}
          <div className="hidden md:flex items-center justify-between px-6 py-2 min-h-[44px] text-xs w-full">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              {/* Page Count (Word-style) */}
              <span className="font-mono text-neutral-600 dark:text-neutral-300 font-medium">
                Page {pageStats.current} of {pageStats.total}
              </span>
              <span className="text-neutral-300 dark:text-neutral-700">|</span>

              <span className="font-mono">
                {document.wordCount.toLocaleString()} {document.wordCount === 1 ? 'word' : 'words'}
              </span>
              {selectionStats !== null && (
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-neutral-900 dark:text-neutral-100 bg-neutral-200/80 dark:bg-neutral-800 px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                    <span>{selectionStats.words.toLocaleString()} {selectionStats.words === 1 ? 'word' : 'words'}</span>
                    <span className="opacity-40">·</span>
                    <span>{selectionStats.chars.toLocaleString()} {selectionStats.chars === 1 ? 'char' : 'chars'}</span>
                    <span className="text-[10px] text-neutral-500 uppercase ml-0.5">selected</span>
                  </span>

                  {/* Add to Dictionary & Codex/Character Context Buttons */}
                  {(() => {
                    if (!selectedText || !selectedText.trim()) return null;

                    const cleanSel = cleanSelectionText(selectedText);
                    const isAlreadyInCustomWords = customWords.some(
                      (w) => w.trim().toLowerCase() === selectedText.trim().toLowerCase() || cleanSelectionText(w) === cleanSel
                    );
                    const matchingChar = findMatchingCharacter(selectedText, characters, codexEntries);
                    const matchingCodex = findMatchingCodex(selectedText, codexEntries);
                    const isDetectedCodexOrChar = Boolean(matchingChar || matchingCodex);

                    const showDictionaryBtn = !isAlreadyInCustomWords && !isDetectedCodexOrChar;

                    return (
                      <div className="flex items-center gap-1.5">
                        {/* Add to Dictionary Button (Only visible if not in dictionary and not detected as codex/character) */}
                        {showDictionaryBtn && (
                          <button
                            type="button"
                            onClick={() => {
                              if (selectedText) {
                                handleAddCustomWord(selectedText);
                                alert(`Added "${selectedText}" to custom dictionary!`);
                              }
                            }}
                            title={`Add "${selectedText}" to custom dictionary`}
                            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-700 transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <BookOpen className="w-3 h-3 text-accent" />
                            <span>+ Dictionary</span>
                          </button>
                        )}

                        {/* Character Dossier button */}
                        {matchingChar && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCharIdForDrawer(matchingChar.id);
                              setCharacterDrawerMode('view');
                              setShowCharacterDrawer(true);
                            }}
                            title={`Open Character Dossier for ${matchingChar.name}`}
                            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border border-purple-500/30 text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <User className="w-3 h-3 text-purple-400" />
                            <span>Dossier: {matchingChar.name}</span>
                          </button>
                        )}

                        {/* Codex Entry button */}
                        {!matchingChar && matchingCodex && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowInThisSceneDrawer(true);
                            }}
                            title={`View Codex Entry for "${matchingCodex.title}"`}
                            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border border-amber-500/30 text-amber-500 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <Sparkles className="w-3 h-3 text-amber-400" />
                            <span>Codex: {matchingCodex.title}</span>
                          </button>
                        )}

                        {/* Add Character button */}
                        {!matchingChar && !matchingCodex && (
                          <button
                            type="button"
                            onClick={() => {
                              setCharacterInitialName(selectedText ? selectedText.trim() : '');
                              setCharacterDrawerMode('create');
                              setSelectedCharIdForDrawer(null);
                              setShowCharacterDrawer(true);
                            }}
                            title={`Create new Character with Name "${selectedText}"`}
                            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <User className="w-3 h-3 text-purple-500 dark:text-purple-400" />
                            <span>+ Character</span>
                          </button>
                        )}

                        {/* Add to Codex button */}
                        {!matchingChar && !matchingCodex && (
                          <button
                            type="button"
                            onClick={() => {
                              setCodexTitleInput(selectedText || '');
                              setCodexCategoryInput(quickCodexCategories[0]?.id || 'regions');
                              setCodexSubtitleInput('');
                              setCodexOverviewInput('');
                              setShowCodexDrawer(true);
                            }}
                            title={`Create new Codex Entry with Title "${selectedText}"`}
                            className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border border-accent text-accent bg-accent/5 hover:bg-accent/10 transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <Sparkles className="w-3 h-3 text-accent" />
                            <span>+ Codex</span>
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
              <span className="text-neutral-300 dark:text-neutral-700">|</span>
              <span className="font-mono">{document.characterCount.toLocaleString()} chars</span>
              <span className="text-neutral-300 dark:text-neutral-700 hidden sm:inline">|</span>
              <span className="hidden sm:inline">~{document.readingTimeMinutes} min read</span>
              <span className="text-neutral-300 dark:text-neutral-700">|</span>

              {/* Target Goal Button & Indicator.
                  v0.7.86: with "Color Writing Target Bar by Progress" ON, this pill
                  itself fills left-to-right with the progress color (blank at 0%,
                  red <20, orange <50, yellow <80, green 80-99, glowing emerald at
                  the goal). While filling, the pill renders in its light chip style
                  in BOTH themes so the label stays readable on every fill color.
                  OFF keeps the classic pill, visually identical to v0.7.85. */}
              {(() => {
                const targetCountVal = document.targetCount || 0;
                const targetCurrentVal = document.targetType === 'characters' ? document.characterCount : document.wordCount;
                const hasTarget = targetCountVal > 0;
                const targetPercent = hasTarget ? Math.min(100, Math.round((targetCurrentVal / targetCountVal) * 100)) : 0;
                const targetGoalReached = hasTarget && targetCurrentVal >= targetCountVal;
                const pillFillClass = dynamicTargetBarColorEnabled && hasTarget
                  ? getTargetBarFillClass(targetGoalReached ? 100 : Math.min(targetPercent, 99))
                  : '';
                return (
                  <button
                    id="btn-writing-target-trigger"
                    onClick={() => setShowTargetModal(true)}
                    title="Set or view writing target for this document"
                    className={`font-mono text-[11px] px-2 py-0.5 rounded-md border flex items-center gap-1.5 transition-all cursor-pointer ${
                      pillFillClass
                        ? `relative overflow-hidden bg-white border-neutral-300 text-neutral-800 hover:border-neutral-400 shadow-2xs${targetGoalReached ? ` ${TARGET_BAR_GOAL_PILL_GLOW}` : ''}`
                        : hasTarget
                          ? targetGoalReached
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                            : isDarkMode
                              ? 'bg-neutral-900/90 border-neutral-700 text-neutral-200 hover:border-neutral-500'
                              : 'bg-white border-neutral-300 text-neutral-800 hover:border-neutral-400 shadow-2xs'
                          : isDarkMode
                            ? 'border-neutral-800/80 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
                            : 'border-neutral-200 text-neutral-500 hover:text-neutral-800 hover:border-neutral-300'
                    }`}
                  >
                    {pillFillClass && (
                      <span
                        aria-hidden="true"
                        className={`absolute inset-y-0 left-0 transition-all duration-300 ${pillFillClass}`}
                        style={{ width: `${targetPercent}%` }}
                      />
                    )}
                    <span className="relative flex items-center gap-1.5 min-w-0">
                      <Target className={`w-3 h-3 shrink-0 ${pillFillClass ? 'text-neutral-700' : 'text-neutral-400'}`} />
                      {hasTarget ? (
                        <>
                          <span>
                            {document.targetType === 'characters'
                              ? `${document.characterCount.toLocaleString()} / ${targetCountVal.toLocaleString()} chars`
                              : `${document.wordCount.toLocaleString()} / ${targetCountVal.toLocaleString()} words`}
                          </span>
                          <span className="text-[10px] font-semibold opacity-70">
                            ({targetPercent}%)
                          </span>
                          {targetGoalReached && (
                            <span className={`text-[10px] font-sans font-semibold ${pillFillClass ? 'text-neutral-900' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              ✓ Goal
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="hidden sm:inline">Set Target</span>
                      )}
                    </span>
                  </button>
                );
              })()}
            </div>

            <div className="flex items-center gap-3">
              {isPendingSync && (
                <span 
                  id="footer-sync-notice"
                  className="text-amber-600 dark:text-amber-400 text-[11px] font-mono flex items-center gap-1.5 font-medium bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30"
                >
                  <CloudOff className="w-3 h-3 text-amber-500 shrink-0" />
                  <span>Stored locally</span>
                </span>
              )}
              {/* Document Format Badge */}
              <span 
                id="footer-page-format-badge"
                title={`${pageConfig.name} (${pageConfig.metric} · ${pageConfig.dimensions})`}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 select-none shrink-0"
              >
                {pageConfig.name}
              </span>

              <span className="text-neutral-400 dark:text-neutral-500 text-[11px] font-mono">
                {isSaving
                  ? 'Saving...'
                  : autoSaveInterval === 'off'
                  ? 'Manual save (Ctrl+S)'
                  : lastSavedAt
                  ? `Saved ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                  : 'Saved'}
              </span>

              {/* MS Word-style Page Zoom Control (- 100% +) */}
              <div className="flex items-center gap-1 font-mono text-[11px] border-l border-neutral-200 dark:border-neutral-800 pl-3">
                <button
                  type="button"
                  onClick={() => setPageZoom((z) => Math.max(50, z - 10))}
                  title="Zoom Out Page"
                  className="w-5 h-5 rounded flex items-center justify-center border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-bold cursor-pointer"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => setPageZoom(100)}
                  title="Reset Zoom to 100%"
                  className="px-1.5 py-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-medium cursor-pointer"
                >
                  {pageZoom}%
                </button>
                <button
                  type="button"
                  onClick={() => setPageZoom((z) => Math.min(200, z + 10))}
                  title="Zoom In Page"
                  className="w-5 h-5 rounded flex items-center justify-center border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 font-bold cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </footer>
      )}

      {/* Writing Target Modal */}
      <WritingTargetModal
        isOpen={showTargetModal}
        onClose={() => setShowTargetModal(false)}
        currentTargetType={document.targetType || 'words'}
        currentTargetCount={document.targetCount}
        currentWords={document.wordCount}
        currentChars={document.characterCount}
        onSaveTarget={handleSaveWritingTarget}
        isDarkMode={isDarkMode}
      />

      {/* English Spell Check & Excluded Words Modal */}
      <SpellCheckModal
        isOpen={showSpellCheckModal}
        onClose={() => setShowSpellCheckModal(false)}
        spellCheckEnabled={spellCheckEnabled}
        onToggleSpellCheck={handleToggleSpellCheck}
        customWords={customWords}
        onAddWord={handleAddCustomWord}
        onRemoveWord={handleRemoveCustomWord}
        isDarkMode={isDarkMode}
      />

      {/* Snapshots & Checkpoints Modal */}
      <SnapshotsModal
        isOpen={showSnapshotsModal}
        onClose={() => setShowSnapshotsModal(false)}
        document={document}
        snapshots={snapshots}
        onCreateSnapshot={onCreateSnapshot}
        onRestoreSnapshot={onRestoreSnapshot}
        onDeleteSnapshot={onDeleteSnapshot}
        isDarkMode={isDarkMode}
        isOnline={isOnline}
      />

      {/* Word-Style Spell Check Review Drawer Panel */}
      <SpellCheckReviewPanel
        isOpen={showSpellCheckReview}
        onClose={() => setShowSpellCheckReview(false)}
        misspellings={misspellings}
        onReplaceWord={handleReplaceMisspelledWord}
        onAddToDictionary={handleAddWordFromReview}
        onIgnoreWord={handleIgnoreWord}
        onOpenFullDictionary={() => {
          setShowSpellCheckReview(false);
          setShowSpellCheckModal(true);
        }}
        highlightInDocument={highlightInDoc}
        onToggleHighlight={() => setHighlightInDoc(!highlightInDoc)}
        isDarkMode={isDarkMode}
      />

      {/* Google Fonts Browser & Loader Modal */}
      <GoogleFontModal
        isOpen={showGoogleFontModal}
        onClose={() => setShowGoogleFontModal(false)}
        onSelectFont={handleSelectGoogleFont}
        isDarkMode={isDarkMode}
      />

      {/* Scene Timeline & Duration Settings Modal */}
      <SceneTimelineModal
        isOpen={showTimelineModal}
        onClose={() => setShowTimelineModal(false)}
        document={document}
        folders={folders}
        timelineConfig={timelineConfig}
        onSaveTimelineInfo={(info) => {
          if (onSaveTimelineInfo) {
            onSaveTimelineInfo(document.id, info);
          } else {
            onUpdateDocument({ timelineInfo: info, updatedAt: new Date().toISOString() });
          }
        }}
        isDarkMode={isDarkMode}
      />

      {/* Quick New Codex Entry Drawer / Sidebar Popup (No backdrop blur) */}
      {showCodexDrawer && (
        <div
          id="codex-quick-drawer-backdrop"
          className="fixed inset-0 z-50 flex justify-end bg-black/30 transition-opacity animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCodexDrawer(false);
          }}
        >
          <div
            id="codex-quick-drawer"
            className={`w-full max-w-lg h-full border-l shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 ${
              isDarkMode ? 'bg-[#141414] border-neutral-800 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
          >
            {/* Header */}
            <div className={`p-4 border-b flex items-center justify-between ${
              isDarkMode ? 'border-neutral-800 bg-neutral-900/50' : 'border-neutral-200 bg-neutral-50/70'
            }`}>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-accent/10 border border-accent/30 text-accent">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold font-display tracking-tight">New Codex Entry</h3>
                  <p className="text-[10px] text-neutral-400">Save lore snippet directly to world encyclopedia</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCodexDrawer(false)}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  isDarkMode ? 'border-neutral-700 hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'border-neutral-200 hover:bg-neutral-100 text-neutral-500'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Fields - Aligned with CodexMode.tsx */}
            <div className="p-5 flex-1 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">Entry Title</label>
                  <input
                    type="text"
                    value={codexTitleInput}
                    onChange={(e) => setCodexTitleInput(e.target.value)}
                    placeholder="e.g., Eloria, The Black Citadel..."
                    className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-medium ${
                      isDarkMode ? 'bg-neutral-850 border-neutral-750 focus:border-accent' : 'bg-neutral-50 border-neutral-300 focus:border-accent'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">Category</label>
                  <select
                    value={codexCategoryInput}
                    onChange={(e) => setCodexCategoryInput(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-medium ${
                      isDarkMode ? 'bg-neutral-850 border-neutral-750 focus:border-accent' : 'bg-neutral-50 border-neutral-300 focus:border-accent'
                    }`}
                  >
                    {quickCodexCategories.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">Subtitle / Epithet</label>
                <input
                  type="text"
                  value={codexSubtitleInput}
                  onChange={(e) => setCodexSubtitleInput(e.target.value)}
                  placeholder="e.g., Seat of House Vance or Ancient Elven Relic"
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${
                    isDarkMode ? 'bg-neutral-850 border-neutral-750 focus:border-accent' : 'bg-neutral-50 border-neutral-300 focus:border-accent'
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">Short Summary / Overview</label>
                <textarea
                  rows={2}
                  value={codexOverviewInput}
                  onChange={(e) => setCodexOverviewInput(e.target.value)}
                  placeholder="Short overview displayed on codex cards..."
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-none resize-none ${
                    isDarkMode ? 'bg-neutral-850 border-neutral-750 focus:border-accent' : 'bg-neutral-50 border-neutral-300 focus:border-accent'
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">Full Encyclopedia Entry / History</label>
                <textarea
                  rows={4}
                  value={codexContentInput}
                  onChange={(e) => setCodexContentInput(e.target.value)}
                  placeholder="Detailed background history, specifications, climate, rules, or lore details..."
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-none resize-none font-serif ${
                    isDarkMode ? 'bg-neutral-850 border-neutral-750 focus:border-accent' : 'bg-neutral-50 border-neutral-300 focus:border-accent'
                  }`}
                />
              </div>

              {/* Accent Color Swatches & Tags */}
              <div className="space-y-3 pt-1 border-t border-neutral-200 dark:border-neutral-800">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">Card Accent Color</label>
                  <div className="flex items-center gap-2">
                    {['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6366f1'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCodexThemeColor(c)}
                        className={`w-5 h-5 rounded-full border-2 transition-all cursor-pointer ${
                          codexThemeColor === c ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">Tags</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={codexTagInput}
                      onChange={(e) => setCodexTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (codexTagInput.trim()) {
                            const clean = codexTagInput.trim().replace(/^#/, '');
                            if (!codexTags.includes(clean)) {
                              setCodexTags([...codexTags, clean]);
                            }
                            setCodexTagInput('');
                          }
                        }
                      }}
                      placeholder="Add tag and press enter..."
                      className={`flex-1 px-3 py-1.5 text-xs rounded-xl border outline-none ${
                        isDarkMode ? 'bg-neutral-850 border-neutral-750 focus:border-accent' : 'bg-neutral-50 border-neutral-300 focus:border-accent'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (codexTagInput.trim()) {
                          const clean = codexTagInput.trim().replace(/^#/, '');
                          if (!codexTags.includes(clean)) {
                            setCodexTags([...codexTags, clean]);
                          }
                          setCodexTagInput('');
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-neutral-800 text-white text-xs font-medium cursor-pointer"
                    >
                      Add
                    </button>
                  </div>

                  {codexTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {codexTags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1"
                        >
                          #{tag}
                          <button
                            type="button"
                            onClick={() => setCodexTags(codexTags.filter((t) => t !== tag))}
                            className="hover:text-red-400 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {codexSaveNotice && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span>Codex entry successfully saved!</span>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className={`p-4 border-t flex items-center justify-between ${
              isDarkMode ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50/50'
            }`}>
              <button
                type="button"
                onClick={() => setShowCodexDrawer(false)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  isDarkMode ? 'border-neutral-700 hover:bg-neutral-800' : 'border-neutral-300 hover:bg-neutral-100'
                }`}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!codexTitleInput.trim()) return;
                  if (onCreateCodexEntry) {
                    onCreateCodexEntry({
                      title: codexTitleInput.trim(),
                      category: codexCategoryInput,
                      subtitle: codexSubtitleInput.trim() || undefined,
                      overview: codexOverviewInput.trim(),
                      content: codexContentInput.trim() || codexOverviewInput.trim(),
                      themeColor: codexThemeColor,
                      tags: codexTags
                    });
                  }
                  // Automatically add newly created codex entry to custom dictionary
                  if (codexTitleInput.trim()) {
                    const updatedWords = addWordToDictionary(codexTitleInput.trim(), activeMundusId);
                    setCustomWords(updatedWords);
                    onSaveCustomWords?.(updatedWords);
                  }
                  setCodexSaveNotice(true);
                  setTimeout(() => {
                    setCodexSaveNotice(false);
                    setShowCodexDrawer(false);
                    setCodexTitleInput('');
                    setCodexCategoryInput('regions');
                    setCodexSubtitleInput('');
                    setCodexOverviewInput('');
                    setCodexContentInput('');
                    setCodexThemeColor('#8b5cf6');
                    setCodexTags([]);
                    setCodexTagInput('');
                  }, 800);
                }}
                disabled={!codexTitleInput.trim()}
                className="px-5 py-2 rounded-xl border border-accent text-accent bg-accent/5 hover:bg-accent/10 font-bold text-xs shadow-2xs hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
              >
                Save Codex Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Character Cards Sidebar Drawer */}
      <CharacterCardDrawer
        isOpen={showCharacterDrawer}
        onClose={() => setShowCharacterDrawer(false)}
        characters={characters}
        selectedCharacterId={selectedCharIdForDrawer}
        onSelectCharacterId={(id) => setSelectedCharIdForDrawer(id)}
        isDarkMode={isDarkMode}
        documentPlainText={document.plainText}
        initialMode={characterDrawerMode}
        initialName={characterInitialName}
        onCreateCharacter={onCreateCharacter}
        onUpdateCharacter={onUpdateCharacter}
        codexEntries={codexEntries}
        onCreateCodexEntry={onCreateCodexEntry}
        onGoToCharactersMode={onGoToCharactersMode}
      />

      {/* In This Scene Codex Drawer */}
      <InThisSceneDrawer
        isOpen={showInThisSceneDrawer}
        onClose={() => setShowInThisSceneDrawer(false)}
        codexEntries={codexEntries}
        characters={characters}
        documentPlainText={document.plainText}
        isDarkMode={isDarkMode}
        activeMundusId={activeMundusId}
        onNavigateToMap={onNavigateToMap}
        onSelectCharacter={(charId) => {
          setShowInThisSceneDrawer(false);
          setSelectedCharIdForDrawer(charId);
          setCharacterDrawerMode('view');
          setShowCharacterDrawer(true);
        }}
        onOpenNewCodexEntry={(initialTitle) => {
          setShowInThisSceneDrawer(false);
          setCodexTitleInput(initialTitle || '');
          setCodexCategoryInput(quickCodexCategories[0]?.id || 'regions');
          setCodexSubtitleInput('');
          setCodexOverviewInput('');
          setCodexContentInput('');
          setShowCodexDrawer(true);
        }}
        onSelectCodexEntry={(entry) => {
          setShowInThisSceneDrawer(false);
          onSelectCodexEntry?.(entry);
        }}
        onUpdateCodexEntry={onUpdateCodexEntry}
      />

      {/* Hidden File Input for Visual Image Uploads */}
      <input
        ref={visualImageInputRef}
        type="file"
        accept="image/*"
        onChange={handleVisualImageInputChange}
        className="hidden"
      />

      {/* Visual Image Upload Notice / Error Toast */}
      {visualImageError && (
        <div className="fixed bottom-12 right-6 z-50 max-w-md p-3.5 rounded-xl bg-neutral-900 border border-neutral-700 text-white shadow-2xl flex items-start justify-between gap-3 text-xs animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-start gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-neutral-200">{visualImageError}</p>
              {onOpenSettings && visualImageError.toLowerCase().includes('setting') && (
                <button
                  type="button"
                  onClick={() => {
                    setVisualImageError(null);
                    onOpenSettings();
                  }}
                  className="text-amber-400 underline hover:text-amber-300 mt-1 cursor-pointer font-medium"
                >
                  Open Settings
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setVisualImageError(null)}
            className="text-neutral-400 hover:text-white p-0.5 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating In-Document Search & Replace Bar (Ctrl+F) */}
      <FindReplaceBar
        isOpen={isFindBarOpen}
        onClose={() => setIsFindBarOpen(false)}
        editorRef={editorRef}
        isDarkMode={isDarkMode}
        accentColor={accentColor}
        initialQuery={findInitialQuery}
        onContentChange={flushInput}
      />
    </div>
  );
};
