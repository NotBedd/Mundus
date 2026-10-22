import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import L from 'leaflet';
import { 
  Upload, 
  ZoomIn, 
  ZoomOut, 
  Maximize2,
  Maximize,
  Minimize,
  Focus,
  Trash2, 
  Feather,
  Plus,
  MapPin,
  Globe,
  Layers,
  Search,
  X,
  Edit3,
  BookOpen,
  User,
  Compass,
  Castle,
  Home,
  Building2,
  Sparkles,
  Swords,
  Skull,
  Wand2,
  Eye,
  EyeOff,
  Crosshair,
  UploadCloud,
  Check,
  Percent,
  Camera,
  Loader2,
  AlertCircle,
  Tag,
  Shield,
  Users,
  Scroll,
  Crown,
  Flame,
  Star,
  FileText,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Folder as FolderIcon,
  Info
} from 'lucide-react';
import { WorldModeIcon } from '../ModeIcons';
import { EnsoIcon } from '../icons/EnsoIcon';
import type { MundusProject, CodexEntry, CodexSection, Character, NovelDocument, MapMarker, Folder } from '../../types';
import { uploadImageToImgBB } from '../../lib/imgbb';
import { fileToOptimizedDataUrl } from '../../lib/imageCompressor';
import { matchesMention } from '../../lib/mentionDetection';
import { 
  saveLocalMapImage, 
  getLocalMapImage, 
  updateLocalMapMetadata, 
  deleteLocalMapImage 
} from '../../lib/mapStorage';
import {
  isFirebaseConfigured,
  DEFAULT_AUTHOR_ID,
  uploadUserMapImage,
  fetchUserMapData,
  saveUserMapMetadata,
  deleteUserMap
} from '../../lib/firebase';
import { DEFAULT_CODEX_SECTIONS } from '../../lib/codexSectionsStore';

interface MapModeProps {
  activeMundusId: string;
  activeMundusProject?: MundusProject;
  isDarkMode: boolean;
  accentColor?: string;
  codexSections?: CodexSection[];
  codexEntries?: CodexEntry[];
  characters?: Character[];
  documents?: NovelDocument[];
  folders?: Folder[];
  initialFocusMarkerId?: string | null;
  initialFocusCodexId?: string | null;
  onCreateCodexEntry?: (entry: Partial<CodexEntry>) => void;
  onUpdateCodexEntry?: (id: string, entry: Partial<CodexEntry>) => void;
  onDeleteCodexEntry?: (id: string) => void;
  onNavigateToCodex?: (codexId: string) => void;
  onNavigateToCharacter?: (characterId: string) => void;
  onReturnToEditor: () => void;
  imgbbApiKey?: string;
  onOpenSettings?: () => void;
}

// Marker category icons (the category LIST itself is per-project since v0.7.76
// and arrives via the codexSections prop)
const AVAILABLE_ICONS = [
  { name: 'Castle', icon: Castle },
  { name: 'Globe', icon: Globe },
  { name: 'MapPin', icon: MapPin },
  { name: 'Compass', icon: Compass },
  { name: 'Building2', icon: Building2 },
  { name: 'Home', icon: Home },
  { name: 'Shield', icon: Shield },
  { name: 'Users', icon: Users },
  { name: 'Crown', icon: Crown },
  { name: 'Sparkles', icon: Sparkles },
  { name: 'Wand2', icon: Wand2 },
  { name: 'Swords', icon: Swords },
  { name: 'Skull', icon: Skull },
  { name: 'Flame', icon: Flame },
  { name: 'Scroll', icon: Scroll },
  { name: 'BookOpen', icon: BookOpen },
  { name: 'Star', icon: Star },
  { name: 'Tag', icon: Tag },
  { name: 'Feather', icon: Feather },
];

const COLOR_PRESETS = [
  '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', 
  '#ef4444', '#ec4899', '#06b6d4', '#6366f1',
  '#14b8a6', '#f97316', '#a855f7', '#64748b'
];

const SUGGESTED_LOCATION_TAGS = [
  'Capital', 'Port City', 'Fortress', 'Ancient Ruins', 'Mountain Pass',
  'Sacred Site', 'Trade Hub', 'Haunted', 'Underground', 'Mystic Nexus',
  'Neutral Ground', 'Border Fortress', 'Royal Seat', 'Mining Outpost'
];

export const getIconComponent = (iconName: string) => {
  const match = AVAILABLE_ICONS.find((i) => i.name === iconName);
  return match ? match.icon : MapPin;
};

// SVG Icon generator for Leaflet DivIcon - EXACT pixel-anchor geometry
// v0.8.0: the icon chosen in the marker creation/edit menu is now drawn as
// the actual marker glyph (centered on the pin's white disc). The default
// 'MapPin' keeps the clean standard-pin look — any other icon replaces the
// empty disc with the real lucide glyph so markers are visually distinct.
const createMarkerIconHtml = (color: string, iconName: string, title: string) => {
  const safeTitle = title.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let glyphSvg = '';
  const effectiveIcon = (iconName || '').trim();
  if (effectiveIcon && effectiveIcon !== 'MapPin') {
    try {
      const IconComp = getIconComponent(effectiveIcon);
      // 14x14 glyph centered on the white disc (cx 16, cy 15, r 7):
      // left = 16 - 7 = 9, top = 15 - 7 = 8.
      glyphSvg = renderToStaticMarkup(
        React.createElement(IconComp, {
          size: 14,
          strokeWidth: 2.8,
          color: '#3f3f46',
          style: { position: 'absolute', left: '9px', top: '8px', pointerEvents: 'none' },
        })
      );
    } catch {
      glyphSvg = ''; // glyph rendering is best-effort — the pin still shows
    }
  }
  return `
    <div class="mundus-map-marker-pin group relative" style="width: 32px; height: 38px; margin: 0; padding: 0; pointer-events: auto;">
      <svg width="32" height="38" viewBox="0 0 32 38" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 5px rgba(0,0,0,0.5)); transform-origin: 16px 38px;" class="transition-transform duration-150 group-hover:scale-115">
        <path d="M16 0C7.16344 0 0 7.16344 0 16C0 26.5 14 36.5 15.3 37.4C15.7 37.7 16.3 37.7 16.7 37.4C18 36.5 32 26.5 32 16C32 7.16344 24.8366 0 16 0Z" fill="${color}" stroke="#ffffff" stroke-width="1.5" />
        <circle cx="16" cy="15" r="7" fill="#ffffff" fill-opacity="0.95" />
      </svg>
      <div class="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-neutral-900/95 text-white text-[11px] font-medium px-2 py-0.5 rounded shadow-xl whitespace-nowrap z-[999] border border-neutral-700">
        ${safeTitle}
      </div>
      ${glyphSvg}
    </div>
  `;
};

export const MapMode: React.FC<MapModeProps> = ({
  activeMundusId,
  activeMundusProject,
  isDarkMode,
  accentColor = '#8b5cf6',
  codexSections,
  codexEntries = [],
  characters = [],
  documents = [],
  folders = [],
  initialFocusMarkerId,
  initialFocusCodexId,
  onCreateCodexEntry,
  onUpdateCodexEntry,
  onDeleteCodexEntry,
  onNavigateToCodex,
  onNavigateToCharacter,
  onReturnToEditor,
  imgbbApiKey,
  onOpenSettings
}) => {
  const storageKey = `mundus_map_image_${activeMundusId || 'default'}`;
  const markersStorageKey = `mundus_map_markers_${activeMundusId || 'default'}`;
  const worldNameKey = `mundus_map_world_name_${activeMundusId || 'default'}`;

  // v0.7.76: marker categories follow the ACTIVE PROJECT's Codex sections
  // (per-project lists owned by App) instead of a global localStorage list.
  const categories = codexSections && codexSections.length > 0 ? codexSections : DEFAULT_CODEX_SECTIONS;

  // Map state
  const [mapImageUrl, setMapImageUrl] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });

  const [mapFileName, setMapFileName] = useState<string>(() => {
    try {
      return localStorage.getItem(`${storageKey}_name`) || 'World Map';
    } catch {
      return 'World Map';
    }
  });

  const [worldName, setWorldName] = useState<string>(() => {
    try {
      return localStorage.getItem(worldNameKey) || (activeMundusProject?.name ? `${activeMundusProject.name} Realm` : 'Known Realm');
    } catch {
      return 'Known Realm';
    }
  });

  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  // Markers state (resolution-independent percentage coordinates xPct, yPct)
  const [markers, setMarkers] = useState<MapMarker[]>(() => {
    try {
      const saved = localStorage.getItem(markersStorageKey);
      if (!saved) return [];
      const parsed: any[] = JSON.parse(saved);
      return parsed.map((m) => {
        let xPct = m.xPct;
        let yPct = m.yPct;
        if (typeof xPct !== 'number' || isNaN(xPct)) {
          xPct = typeof m.x === 'number' && m.x <= 100 ? m.x : 50;
        }
        if (typeof yPct !== 'number' || isNaN(yPct)) {
          yPct = typeof m.y === 'number' && m.y <= 100 ? m.y : 50;
        }
        return {
          ...m,
          xPct: Math.min(100, Math.max(0, xPct)),
          yPct: Math.min(100, Math.max(0, yPct))
        };
      });
    } catch {
      return [];
    }
  });

  // Visible category filter
  const [visibleCategories, setVisibleCategories] = useState<Set<string>>(() => {
    return new Set(categories.map((c) => c.id));
  });

  // Keep visible categories in sync when categories list changes
  useEffect(() => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      categories.forEach((c) => {
        if (!next.has(c.id)) next.add(c.id);
      });
      return next;
    });
  }, [categories]);

  // Mode & UI States
  const [isPinModeActive, setIsPinModeActive] = useState<boolean>(false);
  const isPinModeActiveRef = useRef(isPinModeActive);
  useEffect(() => {
    isPinModeActiveRef.current = isPinModeActive;
  }, [isPinModeActive]);

  // Codex entry awaiting pin placement on the map (navigated from Codex "+ Map" button).
  // When set, the next map click in Pin Mode creates the marker pre-filled from that entry.
  const [pendingPlacementCodexId, setPendingPlacementCodexId] = useState<string | null>(null);
  const pendingPlacementCodexIdRef = useRef<string | null>(null);
  const codexEntriesRef = useRef<CodexEntry[]>(codexEntries || []);
  useEffect(() => {
    codexEntriesRef.current = codexEntries || [];
  }, [codexEntries]);

  // Clear any pending codex pin placement when Pin Mode is turned off
  useEffect(() => {
    if (!isPinModeActive && pendingPlacementCodexIdRef.current !== null) {
      pendingPlacementCodexIdRef.current = null;
      setPendingPlacementCodexId(null);
    }
  }, [isPinModeActive]);
  const [isLayersPanelOpen, setIsLayersPanelOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [confirmDeleteMap, setConfirmDeleteMap] = useState<boolean>(false);
  const [isProcessingMap, setIsProcessingMap] = useState<boolean>(false);
  const [isDragOverDropzone, setIsDragOverDropzone] = useState<boolean>(false);
  const [isMapZenMode, setIsMapZenMode] = useState<boolean>(false);

  // Live coordinates hover (% and px)
  const [hoverCoordinates, setHoverCoordinates] = useState<{ xPct: number; yPct: number; pxX: number; pxY: number } | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(0);
  const [baseFitZoom, setBaseFitZoom] = useState<number>(0);
  const handledFocusKeyRef = useRef<string | null>(null);

  // Modal state for creating / editing marker
  const [editingMarker, setEditingMarker] = useState<MapMarker | null>(null);
  const [isCreatingNewMarker, setIsCreatingNewMarker] = useState<boolean>(false);

  // Form states for marker editor
  const [formTitle, setFormTitle] = useState('');
  const [formSubtitle, setFormSubtitle] = useState('');
  const [formCategory, setFormCategory] = useState('locations');
  const [formDescription, setFormDescription] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formThemeColor, setFormThemeColor] = useState('#8b5cf6');
  const [formIcon, setFormIcon] = useState('MapPin');
  const [formXPct, setFormXPct] = useState(50);
  const [formYPct, setFormYPct] = useState(50);
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formTagInput, setFormTagInput] = useState('');
  const [formLinkedCharacterIds, setFormLinkedCharacterIds] = useState<string[]>([]);
  const [formLinkedDocumentIds, setFormLinkedDocumentIds] = useState<string[]>([]);
  const [formLinkedCodexId, setFormLinkedCodexId] = useState<string | undefined>(undefined);

  // Image Upload state for marker modal
  const [isUploadingMarkerImage, setIsUploadingMarkerImage] = useState(false);
  const [markerImageNotice, setMarkerImageNotice] = useState<string | null>(null);
  const [markerImageError, setMarkerImageError] = useState<string | null>(null);
  const markerFileInputRef = useRef<HTMLInputElement>(null);

  // Selected Marker for Detail Drawer / View
  const [activeMarkerDetail, setActiveMarkerDetail] = useState<MapMarker | null>(null);

  // DOM Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const imageOverlayRef = useRef<L.ImageOverlay | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const worldNameTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Persist markers whenever updated
  useEffect(() => {
    try {
      localStorage.setItem(markersStorageKey, JSON.stringify(markers));
    } catch (e) {
      console.error('Failed to persist map markers:', e);
    }
  }, [markers, markersStorageKey]);

  // Reload data when activeMundusId changes (reads both IndexedDB and Firebase)
  useEffect(() => {
    let isCancelled = false;

    try {
      const savedImg = localStorage.getItem(storageKey);
      if (savedImg) setMapImageUrl(savedImg);
      const savedName = localStorage.getItem(`${storageKey}_name`);
      setMapFileName(savedName || 'World Map');
      const savedWorld = localStorage.getItem(worldNameKey);
      setWorldName(savedWorld || (activeMundusProject?.name ? `${activeMundusProject.name} Realm` : 'Known Realm'));
      const savedMarkers = localStorage.getItem(markersStorageKey);
      if (savedMarkers) {
        const parsed: any[] = JSON.parse(savedMarkers);
        setMarkers(parsed.map((m) => ({
          ...m,
          xPct: typeof m.xPct === 'number' ? m.xPct : 50,
          yPct: typeof m.yPct === 'number' ? m.yPct : 50
        })));
      } else {
        setMarkers([]);
      }
    } catch (e) {
      console.error('Failed to load map data from local storage:', e);
    }

    // 1. Check IndexedDB for persistent large map file (works offline & in Electron without 5MB limits)
    getLocalMapImage(activeMundusId)
      .then((localMap) => {
        if (isCancelled || !localMap) return;
        setMapImageUrl(localMap.blobUrl);
        if (localMap.fileName) setMapFileName(localMap.fileName);
        if (localMap.worldName) setWorldName(localMap.worldName);
        if (localMap.width && localMap.height) {
          setImageDimensions({ width: localMap.width, height: localMap.height });
        }
      })
      .catch((idbErr) => {
        console.warn('Could not read local map from IndexedDB:', idbErr);
      });

    // 2. Cloud Sync: Fetch map metadata from Firebase if configured
    if (isFirebaseConfigured) {
      fetchUserMapData(DEFAULT_AUTHOR_ID, activeMundusId)
        .then((cloudMap) => {
          if (isCancelled) return;
          if (cloudMap && cloudMap.imageUrl) {
            setMapImageUrl(cloudMap.imageUrl);
            if (cloudMap.fileName) setMapFileName(cloudMap.fileName);
            if (cloudMap.worldName) setWorldName(cloudMap.worldName);
            if (cloudMap.width && cloudMap.height) {
              setImageDimensions({ width: cloudMap.width, height: cloudMap.height });
            }
            try {
              localStorage.setItem(storageKey, cloudMap.imageUrl);
              if (cloudMap.fileName) localStorage.setItem(`${storageKey}_name`, cloudMap.fileName);
              if (cloudMap.worldName) localStorage.setItem(worldNameKey, cloudMap.worldName);
            } catch {}
          }
        })
        .catch((err) => {
          console.warn('Could not fetch cloud map data from Firebase:', err);
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [activeMundusId, storageKey, worldNameKey, markersStorageKey, activeMundusProject]);

  // Compute natural dimensions when image URL is set if not already present
  useEffect(() => {
    if (!mapImageUrl) {
      setImageDimensions(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setImageDimensions({ width: img.naturalWidth || 2000, height: img.naturalHeight || 1500 });
    };
    img.src = mapImageUrl;
  }, [mapImageUrl]);

  // Mention status of documents for current marker / codex entry form.
  // Whole-word matching: a marker titled "Old Keep" no longer matches inside
  // "old keeper's house", and tag "king" no longer matches "asking".
  const documentsWithMentionStatus = useMemo(() => {
    const title = formTitle.trim().toLowerCase();
    const tags = formTags.map((t) => t.trim().toLowerCase());

    return (documents || []).map((doc) => {
      let isMentioned = false;
      let mentionReason = '';

      if (title && title.length >= 2) {
        const docText = (doc.plainText || '').toLowerCase();
        const docTitle = (doc.title || '').toLowerCase();

        if (matchesMention(docTitle, title)) {
          isMentioned = true;
          mentionReason = 'In title';
        } else if (matchesMention(docText, title)) {
          isMentioned = true;
          mentionReason = 'Mentioned in text';
        } else if (tags.some((t) => t.length >= 3 && matchesMention(docText, t))) {
          isMentioned = true;
          mentionReason = 'Tag match';
        }
      }

      return {
        doc,
        isMentioned,
        mentionReason
      };
    });
  }, [documents, formTitle, formTags]);

  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  const toggleFolderCollapse = (folderId: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const documentsGroupedByFolder = useMemo(() => {
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

  // Unplaced Codex entries that do not yet have a location pin on the map
  const unplacedCodexEntries = useMemo(() => {
    return (codexEntries || []).filter((ce) => {
      return !markers.some(
        (m) =>
          (m.linkedCodexId && m.linkedCodexId === ce.id) ||
          m.id === ce.id ||
          (ce.relatedLocationIds && ce.relatedLocationIds.includes(m.id)) ||
          (m.title && ce.title && m.title.trim().toLowerCase() === ce.title.trim().toLowerCase())
      );
    });
  }, [codexEntries, markers]);

  // Initial focus on specific marker or codex entry marker when navigating from Codex / Writing Mode
  useEffect(() => {
    if (!initialFocusMarkerId && !initialFocusCodexId) return;

    const focusKey = `${initialFocusMarkerId || ''}_${initialFocusCodexId || ''}`;
    if (handledFocusKeyRef.current === focusKey) return;

    const targetMarker = markers.find((m) => {
      if (initialFocusMarkerId && m.id === initialFocusMarkerId) return true;
      if (initialFocusCodexId && (m.linkedCodexId === initialFocusCodexId || m.id === initialFocusCodexId)) return true;
      const codexEntry = (codexEntries || []).find((e) => e.id === initialFocusCodexId);
      if (codexEntry) {
        if (codexEntry.relatedLocationIds?.includes(m.id)) return true;
        if (m.title.trim().toLowerCase() === codexEntry.title.trim().toLowerCase()) return true;
      }
      return false;
    });

    if (targetMarker) {
      handledFocusKeyRef.current = focusKey;
      setActiveMarkerDetail(targetMarker);
      if (leafletMapRef.current && imageDimensions) {
        const { width, height } = imageDimensions;
        const lng = (targetMarker.xPct / 100) * width;
        const lat = height - (targetMarker.yPct / 100) * height;
        // Zoom in onto the marker smoothly when navigated from Codex
        const targetZoom = Math.max(1.25, baseFitZoom + 1.25);
        leafletMapRef.current.setView([lat, lng], targetZoom);
        setTimeout(() => {
          leafletMapRef.current?.flyTo([lat, lng], targetZoom, { animate: true, duration: 0.6 });
        }, 80);
      }
    } else if (initialFocusCodexId) {
      // Codex entry does not have a marker yet! Activate Pin Placement Mode so the user
      // clicks exactly where the pin should go - the marker is then pre-filled from this entry
      const codexEntry = (codexEntries || []).find((e) => e.id === initialFocusCodexId);
      if (codexEntry) {
        handledFocusKeyRef.current = focusKey;
        pendingPlacementCodexIdRef.current = codexEntry.id;
        setPendingPlacementCodexId(codexEntry.id);
        setEditingMarker(null);
        setIsCreatingNewMarker(false);
        setIsPinModeActive(true);
      }
    }
  }, [initialFocusMarkerId, initialFocusCodexId, markers, imageDimensions, baseFitZoom, codexEntries]);

  // World Name Debounce
  const handleWorldNameChange = (val: string) => {
    setWorldName(val);
    if (worldNameTimeoutRef.current) clearTimeout(worldNameTimeoutRef.current);
    worldNameTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(worldNameKey, val);
      } catch (e) {
        console.error('Failed to save world name:', e);
      }
      updateLocalMapMetadata(activeMundusId, { worldName: val });
      if (isFirebaseConfigured) {
        saveUserMapMetadata(DEFAULT_AUTHOR_ID, activeMundusId, { worldName: val });
      }
    }, 400);
  };

  // Helper to get Category info
  const getCategoryInfo = useCallback((catId: string): CodexSection => {
    return categories.find((c) => c.id === catId) || {
      id: catId,
      label: catId.charAt(0).toUpperCase() + catId.slice(1),
      iconName: 'MapPin',
      color: '#8b5cf6',
      desc: 'Map Location'
    };
  }, [categories]);

  // Open Marker Editor Modal
  const handleOpenMarkerModal = (marker: MapMarker, isNew: boolean = false) => {
    const matchingCodex = (codexEntries || []).find(
      (e) =>
        (marker.linkedCodexId && e.id === marker.linkedCodexId) ||
        e.id === marker.id ||
        (e.relatedLocationIds && e.relatedLocationIds.includes(marker.id)) ||
        (marker.title && e.title.trim().toLowerCase() === marker.title.trim().toLowerCase() && marker.title.trim().length >= 2)
    );

    setEditingMarker(marker);
    setIsCreatingNewMarker(isNew);
    setFormTitle(marker.title || matchingCodex?.title || '');
    setFormSubtitle(marker.subtitle || matchingCodex?.subtitle || '');
    setFormCategory(marker.category || matchingCodex?.category || 'locations');
    setFormDescription(marker.description || matchingCodex?.overview || '');
    setFormContent(marker.content || matchingCodex?.content || '');
    setFormImageUrl(marker.imageUrl || matchingCodex?.imageUrl || '');
    setFormThemeColor(marker.color || matchingCodex?.themeColor || getCategoryInfo(marker.category || 'locations').color || '#8b5cf6');
    setFormIcon(marker.icon || matchingCodex?.icon || getCategoryInfo(marker.category || 'locations').iconName || 'MapPin');
    setFormXPct(marker.xPct);
    setFormYPct(marker.yPct);

    // Merge tags from marker and matching codex
    const mergedTags = Array.from(
      new Set([...(marker.tags || []), ...(matchingCodex?.tags || [])])
    );
    setFormTags(mergedTags);
    setFormTagInput('');

    // Merge characters
    const mergedChars = Array.from(
      new Set([...(marker.linkedCharacterIds || []), ...(matchingCodex?.relatedCharacterIds || [])])
    );
    setFormLinkedCharacterIds(mergedChars);

    // Merge documents
    const mergedDocs = Array.from(
      new Set([...(marker.linkedDocumentIds || []), ...(matchingCodex?.relatedDocumentIds || [])])
    );
    setFormLinkedDocumentIds(mergedDocs);

    setFormLinkedCodexId(marker.linkedCodexId || matchingCodex?.id);
    setMarkerImageNotice(null);
    setMarkerImageError(null);
  };

  // Initialize Leaflet Map Instance
  useEffect(() => {
    if (!mapContainerRef.current || !mapImageUrl || !imageDimensions) {
      return;
    }

    // Tear down any previous map
    if (leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
    }

    const { width, height } = imageDimensions;

    // Bounds for flat coordinate system: [0, 0] to [height, width]
    const bounds = new L.LatLngBounds([0, 0], [height, width]);

    // Initialize Leaflet with Flat CRS (Simple)
    const map = L.map(mapContainerRef.current, {
      crs: L.CRS.Simple,
      minZoom: -4,
      maxZoom: 4,
      zoomDelta: 0.5,
      zoomSnap: 0.25,
      wheelPxPerZoomLevel: 80,
      zoomControl: false,
      attributionControl: false,
      maxBounds: bounds.pad(0.15),
      maxBoundsViscosity: 0.8
    });

    // Add Direct High-Resolution Image Overlay
    const imageOverlay = L.imageOverlay(mapImageUrl, bounds, {
      interactive: true,
      zIndex: 1
    }).addTo(map);

    imageOverlayRef.current = imageOverlay;

    // Add Layer Group for Markers
    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;

    // Fit map to image bounds
    map.fitBounds(bounds);
    const initialFitZoom = map.getZoom();
    setBaseFitZoom(initialFitZoom);
    setCurrentZoom(initialFitZoom);

    // Track mouse coordinates (Percentage from Top-Left: 0%..100%)
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      const pxX = Math.round(e.latlng.lng);
      const pxY = Math.round(e.latlng.lat);
      if (pxX >= 0 && pxX <= width && pxY >= 0 && pxY <= height) {
        const xPct = Number(((pxX / width) * 100).toFixed(2));
        const yPct = Number((((height - pxY) / height) * 100).toFixed(2));
        setHoverCoordinates({ xPct, yPct, pxX, pxY: height - pxY });
      } else {
        setHoverCoordinates(null);
      }
    });

    map.on('mouseout', () => {
      setHoverCoordinates(null);
    });

    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    // Map Click Listener (Adding markers when Pin Mode is enabled)
    map.on('click', (e: L.LeafletMouseEvent) => {
      const pxX = Math.round(e.latlng.lng);
      const pxY = Math.round(e.latlng.lat);
      if (pxX < 0 || pxX > width || pxY < 0 || pxY > height) return;

      const xPct = Number(((pxX / width) * 100).toFixed(2));
      const yPct = Number((((height - pxY) / height) * 100).toFixed(2));

      if (isPinModeActiveRef.current) {
        // If this pin placement was requested from a Codex entry ("+ Map" button),
        // build the marker pre-filled from that entry at the clicked coordinates
        const pendingCodexId = pendingPlacementCodexIdRef.current;
        const pendingCodex = pendingCodexId
          ? (codexEntriesRef.current || []).find((ce) => ce.id === pendingCodexId)
          : undefined;

        const newMarker: MapMarker = {
          id: `marker_${Date.now()}`,
          mundusId: activeMundusId,
          title: pendingCodex?.title || 'New Location',
          subtitle: pendingCodex?.subtitle || '',
          category: (pendingCodex?.category as MapMarker['category']) || 'locations',
          xPct,
          yPct,
          color: pendingCodex?.themeColor || accentColor || '#8b5cf6',
          icon: pendingCodex?.icon || 'MapPin',
          description: pendingCodex?.overview || '',
          content: pendingCodex?.content || '',
          imageUrl: pendingCodex?.imageUrl || undefined,
          tags: pendingCodex?.tags || [],
          linkedCharacterIds: pendingCodex?.relatedCharacterIds || [],
          linkedDocumentIds: pendingCodex?.relatedDocumentIds || [],
          linkedCodexId: pendingCodex?.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        pendingPlacementCodexIdRef.current = null;
        setPendingPlacementCodexId(null);
        handleOpenMarkerModal(newMarker, true);
        setIsPinModeActive(false);
      } else {
        setActiveMarkerDetail(null);
      }
    });

    // Right Click Context Menu to quickly drop pin
    map.on('contextmenu', (e: L.LeafletMouseEvent) => {
      const pxX = Math.round(e.latlng.lng);
      const pxY = Math.round(e.latlng.lat);
      if (pxX < 0 || pxX > width || pxY < 0 || pxY > height) return;

      const xPct = Number(((pxX / width) * 100).toFixed(2));
      const yPct = Number((((height - pxY) / height) * 100).toFixed(2));

      // Consume any pending codex pin placement (navigated from Codex "+ Map" button)
      const pendingCodexId = pendingPlacementCodexIdRef.current;
      const pendingCodex = pendingCodexId
        ? (codexEntriesRef.current || []).find((ce) => ce.id === pendingCodexId)
        : undefined;

      const newMarker: MapMarker = {
        id: `marker_${Date.now()}`,
        mundusId: activeMundusId,
        title: pendingCodex?.title || 'New Location',
        subtitle: pendingCodex?.subtitle || '',
        category: (pendingCodex?.category as MapMarker['category']) || 'locations',
        xPct,
        yPct,
        color: pendingCodex?.themeColor || accentColor || '#8b5cf6',
        icon: pendingCodex?.icon || 'MapPin',
        description: pendingCodex?.overview || '',
        content: pendingCodex?.content || '',
        imageUrl: pendingCodex?.imageUrl || undefined,
        tags: pendingCodex?.tags || [],
        linkedCharacterIds: pendingCodex?.relatedCharacterIds || [],
        linkedDocumentIds: pendingCodex?.relatedDocumentIds || [],
        linkedCodexId: pendingCodex?.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      pendingPlacementCodexIdRef.current = null;
      setPendingPlacementCodexId(null);
      handleOpenMarkerModal(newMarker, true);
      if (pendingCodex) {
        setIsPinModeActive(false);
      }
    });

    leafletMapRef.current = map;

    return () => {
      map.remove();
      leafletMapRef.current = null;
    };
  }, [mapImageUrl, imageDimensions, activeMundusId, accentColor]);

  // Sync Leaflet Markers with React State (Translating % coordinates to Leaflet CRS)
  useEffect(() => {
    const map = leafletMapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer || !imageDimensions) return;

    layer.clearLayers();
    const { width, height } = imageDimensions;

    markers.forEach((marker) => {
      // Check if category is visible
      if (!visibleCategories.has(marker.category)) {
        return;
      }

      const catInfo = getCategoryInfo(marker.category);
      const pinColor = marker.color || catInfo.color || '#8b5cf6';
      const iconName = marker.icon || catInfo.iconName || 'MapPin';

      // Translate Percentage Coordinates (Top-Left 0..100) to Leaflet CRS
      const leafletLng = (marker.xPct / 100) * width;
      const leafletLat = height - (marker.yPct / 100) * height;

      // Exact pixel anchor: 32px wide x 38px high, anchored at bottom center (16, 38)
      const customIcon = L.divIcon({
        className: 'mundus-leaflet-div-icon',
        html: createMarkerIconHtml(pinColor, iconName, marker.title),
        iconSize: [32, 38],
        iconAnchor: [16, 38],
        popupAnchor: [0, -38]
      });

      const leafletMarker = L.marker([leafletLat, leafletLng], {
        icon: customIcon,
        draggable: true
      });

      // Drag listener to update marker position in percentage
      leafletMarker.on('dragend', (e) => {
        const newLatLng = e.target.getLatLng();
        const updatedXPct = Number(Math.min(100, Math.max(0, (newLatLng.lng / width) * 100)).toFixed(2));
        const updatedYPct = Number(Math.min(100, Math.max(0, ((height - newLatLng.lat) / height) * 100)).toFixed(2));

        setMarkers((prev) =>
          prev.map((m) =>
            m.id === marker.id
              ? { ...m, xPct: updatedXPct, yPct: updatedYPct, updatedAt: new Date().toISOString() }
              : m
          )
        );
      });

      // Click listener to select marker details
      leafletMarker.on('click', () => {
        setActiveMarkerDetail(marker);
      });

      leafletMarker.addTo(layer);
    });
  }, [markers, visibleCategories, imageDimensions, getCategoryInfo]);

  // Reset / Fit Viewport to Map
  const handleFitBounds = useCallback(() => {
    if (!leafletMapRef.current || !imageDimensions) return;
    const bounds = new L.LatLngBounds([0, 0], [imageDimensions.height, imageDimensions.width]);
    leafletMapRef.current.fitBounds(bounds, { animate: true });
    // Update baseFitZoom so 0 scale is aligned with viewport fit
    setTimeout(() => {
      if (leafletMapRef.current) {
        const fitZ = leafletMapRef.current.getZoom();
        setBaseFitZoom(fitZ);
        setCurrentZoom(fitZ);
      }
    }, 250);
  }, [imageDimensions]);

  // Zoom In / Out
  const handleZoomIn = () => {
    if (leafletMapRef.current) leafletMapRef.current.zoomIn();
  };

  const handleZoomOut = () => {
    if (leafletMapRef.current) leafletMapRef.current.zoomOut();
  };

  // Fly to Marker smoothly
  const handleFlyToMarker = (marker: MapMarker) => {
    if (!leafletMapRef.current || !imageDimensions) return;
    const { width, height } = imageDimensions;
    const targetLng = (marker.xPct / 100) * width;
    const targetLat = height - (marker.yPct / 100) * height;
    leafletMapRef.current.flyTo([targetLat, targetLng], Math.max(0.5, leafletMapRef.current.getZoom()), {
      duration: 1.2
    });
    setActiveMarkerDetail(marker);
  };

  // Process & Upload Map Image File to Firebase Storage (and Local IndexedDB Cache)
  const handleProcessMapFile = async (file: File) => {
    if (!file) return;
    setIsProcessingMap(true);
    try {
      const fileName = file.name || 'World Map';

      // 1. Measure dimensions
      const localPreviewUrl = URL.createObjectURL(file);
      const img = new Image();
      
      const dims = await new Promise<{ width: number; height: number }>((resolve) => {
        img.onload = () => {
          resolve({ width: img.naturalWidth || 2000, height: img.naturalHeight || 1500 });
        };
        img.onerror = () => {
          resolve({ width: 2000, height: 1500 });
        };
        img.src = localPreviewUrl;
      });

      setImageDimensions(dims);
      setMapFileName(fileName);
      setMapImageUrl(localPreviewUrl);

      // 2. Always persist into IndexedDB immediately (works offline, in Electron, and avoids 5MB localStorage limits)
      try {
        await saveLocalMapImage(activeMundusId, file, {
          fileName,
          width: dims.width,
          height: dims.height,
          worldName,
        });
      } catch (idbErr) {
        console.warn('Could not save map to IndexedDB:', idbErr);
      }

      // 3. Upload to Firebase Storage if configured (replaces any previous map on Firebase Storage)
      if (isFirebaseConfigured) {
        try {
          const cloudDownloadUrl = await uploadUserMapImage(
            DEFAULT_AUTHOR_ID,
            activeMundusId,
            file,
            fileName,
            dims
          );
          setMapImageUrl(cloudDownloadUrl);
          try {
            localStorage.setItem(storageKey, cloudDownloadUrl);
            localStorage.setItem(`${storageKey}_name`, fileName);
          } catch (storageErr) {
            console.warn('Map URL cached in memory (localStorage notice):', storageErr);
          }
        } catch (cloudErr) {
          console.error('Failed to sync map to Firebase Storage:', cloudErr);
        }
      }
    } catch (err) {
      console.error('Failed to process map image:', err);
    } finally {
      setIsProcessingMap(false);
    }
  };

  // Handle Drag & Drop Map Image
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverDropzone(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessMapFile(e.dataTransfer.files[0]);
    }
  };

  // Delete Map Image
  const handleDeleteMap = async () => {
    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(`${storageKey}_name`);
    } catch (e) {
      console.error('Failed to clear map storage:', e);
    }

    try {
      await deleteLocalMapImage(activeMundusId);
    } catch (idbErr) {
      console.warn('Could not delete map from IndexedDB:', idbErr);
    }

    if (isFirebaseConfigured) {
      deleteUserMap(DEFAULT_AUTHOR_ID, activeMundusId).catch((err) => {
        console.error('Failed to delete map from Firebase Storage:', err);
      });
    }

    setMapImageUrl(null);
    setImageDimensions(null);
    setConfirmDeleteMap(false);
  };

  // Toggle Category Layer Visibility
  const toggleCategoryLayer = (catId: string) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  };

  // Filtered markers based on search query
  const filteredMarkers = useMemo(() => {
    if (!searchQuery.trim()) return markers;
    const q = searchQuery.toLowerCase().trim();
    return markers.filter((m) =>
      m.title.toLowerCase().includes(q) ||
      (m.subtitle && m.subtitle.toLowerCase().includes(q)) ||
      m.category.toLowerCase().includes(q) ||
      (m.description && m.description.toLowerCase().includes(q)) ||
      (m.tags && m.tags.some(t => t.toLowerCase().includes(q)))
    );
  }, [markers, searchQuery]);

  // Save Marker from Editor Modal
  const handleSaveMarkerForm = () => {
    if (!formTitle.trim()) return;

    const safeXPct = Math.min(100, Math.max(0, Number(formXPct) || 50));
    const safeYPct = Math.min(100, Math.max(0, Number(formYPct) || 50));

    const markerId = editingMarker?.id || `marker_${Date.now()}`;
    let codexId = formLinkedCodexId;

    // Find any existing matching codex entry
    let matchingCodexEntry = (codexEntries || []).find(
      (e) =>
        (codexId && e.id === codexId) ||
        (editingMarker?.id && (e.id === editingMarker.id || e.relatedLocationIds?.includes(editingMarker.id))) ||
        (editingMarker?.linkedCodexId && e.id === editingMarker.linkedCodexId) ||
        (e.title.trim().toLowerCase() === formTitle.trim().toLowerCase() && formTitle.trim().length >= 2)
    );

    if (matchingCodexEntry) {
      codexId = matchingCodexEntry.id;
      // Always mirror edits to Codex
      onUpdateCodexEntry?.(matchingCodexEntry.id, {
        title: formTitle.trim(),
        subtitle: formSubtitle.trim() || undefined,
        category: formCategory,
        overview: formDescription.trim(),
        content: formContent.trim(),
        themeColor: formThemeColor,
        icon: formIcon,
        imageUrl: formImageUrl || undefined,
        tags: formTags,
        relatedCharacterIds: formLinkedCharacterIds,
        relatedLocationIds: Array.from(new Set([...(matchingCodexEntry.relatedLocationIds || []), markerId])),
        relatedDocumentIds: formLinkedDocumentIds
      });
    } else {
      // Any added marker always creates its corresponding Codex entry!
      codexId = formLinkedCodexId || `codex_${Date.now()}`;
      onCreateCodexEntry?.({
        id: codexId,
        title: formTitle.trim(),
        subtitle: formSubtitle.trim() || undefined,
        category: formCategory,
        overview: formDescription.trim(),
        content: formContent.trim(),
        themeColor: formThemeColor,
        icon: formIcon,
        imageUrl: formImageUrl || undefined,
        tags: formTags,
        relatedCharacterIds: formLinkedCharacterIds,
        relatedLocationIds: [markerId],
        relatedDocumentIds: formLinkedDocumentIds
      });
    }

    const updatedMarker: MapMarker = {
      id: editingMarker?.id || `marker_${Date.now()}`,
      mundusId: activeMundusId,
      title: formTitle.trim(),
      subtitle: formSubtitle.trim() || undefined,
      category: formCategory,
      description: formDescription.trim(),
      content: formContent.trim(),
      imageUrl: formImageUrl || undefined,
      xPct: safeXPct,
      yPct: safeYPct,
      color: formThemeColor,
      icon: formIcon,
      linkedCodexId: codexId,
      linkedCharacterIds: formLinkedCharacterIds,
      linkedDocumentIds: formLinkedDocumentIds,
      tags: formTags,
      createdAt: editingMarker?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (isCreatingNewMarker) {
      setMarkers((prev) => [updatedMarker, ...prev]);
    } else {
      setMarkers((prev) => prev.map((m) => (m.id === updatedMarker.id ? updatedMarker : m)));
    }

    // If active marker was open in details, update it too
    if (activeMarkerDetail?.id === updatedMarker.id) {
      setActiveMarkerDetail(updatedMarker);
    }

    setEditingMarker(null);
    setIsCreatingNewMarker(false);
  };

  // Delete Marker
  const handleDeleteMarker = (id: string) => {
    setMarkers((prev) => {
      const next = prev.filter((m) => m.id !== id && String(m.id) !== String(id));
      try {
        localStorage.setItem(markersStorageKey, JSON.stringify(next));
      } catch (e) {
        console.error('Failed to persist map markers after deletion:', e);
      }
      return next;
    });
    if (activeMarkerDetail?.id === id || String(activeMarkerDetail?.id) === String(id)) {
      setActiveMarkerDetail(null);
    }
    setEditingMarker(null);
  };

  // Marker Modal Image Upload Handler
  const handleMarkerImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMarkerImageNotice(null);
    setMarkerImageError(null);
    setIsUploadingMarkerImage(true);

    try {
      if (imgbbApiKey) {
        const result = await uploadImageToImgBB(file, imgbbApiKey);
        if (result.success && result.url) {
          setFormImageUrl(result.url);
          setMarkerImageNotice(null);
        } else {
          const fallbackDataUrl = await fileToOptimizedDataUrl(file, 1600, 0.9);
          setFormImageUrl(fallbackDataUrl);
          setMarkerImageNotice('ImgBB upload failed. Cached illustration locally.');
        }
      } else {
        const localDataUrl = await fileToOptimizedDataUrl(file, 1600, 0.9);
        setFormImageUrl(localDataUrl);
        setMarkerImageNotice('Using local illustration. Add ImgBB key in Settings for cloud sync.');
      }
    } catch (err: any) {
      console.error('Image processing failed:', err);
      setMarkerImageError(err?.message || 'Failed to process image');
    } finally {
      setIsUploadingMarkerImage(false);
      if (markerFileInputRef.current) markerFileInputRef.current.value = '';
    }
  };

  // Tag helper
  const handleAddTag = (tagToAdd: string) => {
    const trimmed = tagToAdd.trim();
    if (trimmed && !formTags.includes(trimmed)) {
      setFormTags([...formTags, trimmed]);
    }
    setFormTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormTags(formTags.filter((t) => t !== tagToRemove));
  };

  // Escape key to exit Map Zen Mode
  useEffect(() => {
    if (!isMapZenMode) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMapZenMode(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isMapZenMode]);

  // Recalculate Leaflet map viewport dimensions upon Zen Mode toggle
  useEffect(() => {
    const timer = setTimeout(() => {
      leafletMapRef.current?.invalidateSize();
    }, 120);
    return () => clearTimeout(timer);
  }, [isMapZenMode]);

  return (
    <div className={`relative flex-1 flex flex-col h-full overflow-hidden select-none ${
      isMapZenMode ? 'fixed inset-0 z-[9990] w-screen h-screen' : ''
    } ${
      isDarkMode ? 'bg-[#0f0f0f] text-neutral-100' : 'bg-neutral-100 text-neutral-900'
    }`}>
      {/* Hidden File Input for Map Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleProcessMapFile(e.target.files[0]);
          }
        }}
        className="hidden"
      />

      {/* TOP BAR */}
      {!isMapZenMode && (
        <div className={`relative z-30 p-4 sm:px-6 sm:py-4 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${
          isDarkMode ? 'border-neutral-800 bg-[#111111]' : 'border-neutral-200 bg-white'
        }`}>
        {/* Left: Mode Icon & Realm Info */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onReturnToEditor}
            title="Click to return to Writing"
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-xs border transition-all cursor-pointer group hover:scale-105 active:scale-95 ${
              isDarkMode 
                ? 'bg-neutral-900 border-neutral-750 text-purple-400 hover:border-purple-400' 
                : 'bg-neutral-50 border-neutral-200 text-purple-600 hover:border-purple-400'
            }`}
          >
            <WorldModeIcon className="w-5 h-5 text-purple-400 group-hover:scale-110 transition-transform" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight font-display">
                MAP
              </h1>
            </div>
            
            <div className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
              <span className="font-mono">{markers.length} {markers.length === 1 ? 'marker recorded' : 'markers recorded'}</span>
              <span>•</span>
              <input
                type="text"
                value={worldName}
                onChange={(e) => handleWorldNameChange(e.target.value)}
                placeholder="Name this world..."
                className={`bg-transparent hover:border-b border-dashed border-neutral-500 focus:border-solid focus:border-accent focus:outline-none text-xs font-medium px-0.5 transition-colors max-w-[160px] truncate ${
                  isDarkMode ? 'text-neutral-300' : 'text-neutral-600'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Center: Search Bar in Top Bar to Search Markers */}
        {mapImageUrl && (
          <div className="flex items-center relative flex-1 max-w-xs mx-2">
            <div className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all ${
              isDarkMode 
                ? 'bg-neutral-900 border-neutral-750 focus-within:border-accent' 
                : 'bg-neutral-50 border-neutral-300 focus-within:border-accent'
            }`}>
              <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="Search markers, locations..."
                className="bg-transparent w-full focus:outline-none text-xs"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Search Dropdown Results */}
            {isSearchOpen && searchQuery.trim() && (
              <div className={`absolute top-full left-0 right-0 mt-1.5 max-h-60 overflow-y-auto rounded-lg border shadow-2xl z-[999] p-1 space-y-0.5 text-xs backdrop-blur-md ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
              }`}>
                {filteredMarkers.length > 0 ? (
                  filteredMarkers.map((marker) => {
                    const cat = getCategoryInfo(marker.category);
                    return (
                      <button
                        key={marker.id}
                        onClick={() => {
                          handleFlyToMarker(marker);
                          setIsSearchOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-md flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span 
                            className="w-2.5 h-2.5 rounded-full shrink-0" 
                            style={{ backgroundColor: marker.color || cat.color }} 
                          />
                          <span className="font-medium truncate">{marker.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[9px] font-mono text-neutral-400">
                            {marker.xPct}% , {marker.yPct}%
                          </span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-neutral-800/40 text-neutral-500 dark:text-neutral-400 shrink-0">
                            {cat.label}
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-2 text-center text-neutral-400 text-xs">
                    No markers found matching &ldquo;{searchQuery}&rdquo;
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Right Side: Upload Map (Outline style), Add Pin (Outline style), Zen Mode */}
        <div className="flex items-center gap-2">
          {/* Outline Style Upload Map button following accent color */}
          <button
            id="btn-upload-map"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{ borderColor: accentColor, color: accentColor }}
            className="px-3.5 py-1.5 rounded-lg border border-accent text-accent bg-transparent hover:bg-accent/10 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            title={mapImageUrl ? 'Replace Map Image' : 'Upload Map Image'}
          >
            <Upload className="w-4 h-4" />
            <span>Upload Map</span>
          </button>

          {mapImageUrl && (
            <button
              id="btn-add-map-pin"
              onClick={() => setIsPinModeActive((prev) => !prev)}
              style={!isPinModeActive ? { borderColor: accentColor, color: accentColor } : undefined}
              className={`px-3.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer ${
                isPinModeActive
                  ? 'border-amber-500 text-amber-500 bg-amber-500/10 animate-pulse ring-2 ring-amber-400/50'
                  : 'border-accent text-accent bg-transparent hover:bg-accent/10'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>{isPinModeActive ? 'Click Map to Place Pin' : 'Add Pin'}</span>
            </button>
          )}
        </div>
      </div>
      )}

      {/* SECONDARY CONTROLS TOOLBAR (WHEN MAP IS LOADED) */}
      {!isMapZenMode && mapImageUrl && (
        <div className={`relative z-30 px-4 sm:px-6 py-2 border-b flex items-center justify-between gap-3 shrink-0 ${
          isDarkMode ? 'border-neutral-800/80 bg-[#141414]/90' : 'border-neutral-200/90 bg-white/90'
        }`}>
          {/* Left: Map Info */}
          <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <span className={`font-medium truncate max-w-[200px] ${
              isDarkMode ? 'text-neutral-300' : 'text-neutral-600'
            }`}>
              {mapFileName || 'World Map'}
            </span>
            {imageDimensions && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800/40 text-neutral-500 dark:text-neutral-400 shrink-0">
                {imageDimensions.width} × {imageDimensions.height}px
              </span>
            )}
          </div>

          {/* Right: Map Action Controls (Layers, Zoom, Fullscreen, Clear) */}
          <div className="flex items-center gap-1.5">
            {/* Layers Toggle Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsLayersPanelOpen((prev) => !prev)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isLayersPanelOpen
                    ? 'border-accent text-accent bg-accent/10'
                    : isDarkMode
                    ? 'border-neutral-800 hover:bg-neutral-800 text-neutral-300'
                    : 'border-neutral-200 hover:bg-neutral-100 text-neutral-700'
                }`}
                title="Toggle marker categories visibility"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Layers ({visibleCategories.size})</span>
              </button>

              {/* Layers Filter Dropdown Menu */}
              {isLayersPanelOpen && (
                <div className={`absolute right-0 top-full mt-2 w-56 rounded-xl border shadow-2xl p-2 z-[999] space-y-1 backdrop-blur-md ${
                  isDarkMode ? 'bg-neutral-900/95 border-neutral-800' : 'bg-white/95 border-neutral-200'
                }`}>
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider font-mono text-neutral-400">
                    Marker Categories
                  </div>
                  {categories.map((cat) => {
                    const isVis = visibleCategories.has(cat.id);
                    const count = markers.filter((m) => m.category === cat.id).length;
                    const IconComp = getIconComponent(cat.iconName);

                    return (
                      <button
                        key={cat.id}
                        onClick={() => toggleCategoryLayer(cat.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          isVis 
                            ? isDarkMode ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-900' 
                            : 'text-neutral-500 hover:text-neutral-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-2.5 h-2.5 rounded-full shrink-0" 
                            style={{ backgroundColor: cat.color }} 
                          />
                          <IconComp className="w-3.5 h-3.5 text-neutral-400" />
                          <span>{cat.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-neutral-400">{count}</span>
                          {isVis ? <Eye className="w-3 h-3 text-accent" /> : <EyeOff className="w-3 h-3 text-neutral-600" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Fit to Bounds */}
            <button
              onClick={handleFitBounds}
              className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                isDarkMode ? 'border-neutral-800 hover:bg-neutral-800 text-neutral-300' : 'border-neutral-200 hover:bg-neutral-100 text-neutral-700'
              }`}
              title="Fit map to viewport"
            >
              <Focus className="w-3.5 h-3.5" />
            </button>

            {/* Zoom In / Out */}
            <button
              onClick={handleZoomIn}
              className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                isDarkMode ? 'border-neutral-800 hover:bg-neutral-800 text-neutral-300' : 'border-neutral-200 hover:bg-neutral-100 text-neutral-700'
              }`}
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleZoomOut}
              className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                isDarkMode ? 'border-neutral-800 hover:bg-neutral-800 text-neutral-300' : 'border-neutral-200 hover:bg-neutral-100 text-neutral-700'
              }`}
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            {/* Fullscreen Map View Button */}
            <button
              id="btn-enter-map-fullscreen"
              onClick={() => setIsMapZenMode(true)}
              className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                isDarkMode ? 'border-neutral-800 hover:bg-neutral-800 text-neutral-300' : 'border-neutral-200 hover:bg-neutral-100 text-neutral-700'
              }`}
              title="Fullscreen Map View (Hide UI)"
            >
              <Maximize className="w-3.5 h-3.5" />
            </button>

            {/* Delete Map */}
            <button
              onClick={() => setConfirmDeleteMap(true)}
              className="p-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs transition-colors cursor-pointer"
              title="Delete map image from world"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Exit Button for Map Fullscreen View */}
      {isMapZenMode && (
        <div className="fixed top-4 right-4 z-[9999] group">
          <button
            id="btn-exit-map-zen-mode"
            onClick={() => setIsMapZenMode(false)}
            title="Exit Fullscreen (or press Esc)"
            className={`px-3.5 py-1.5 rounded-full border text-xs font-medium flex items-center gap-2 shadow-2xl backdrop-blur-md transition-all duration-200 opacity-60 hover:opacity-100 focus:opacity-100 group-hover:opacity-100 cursor-pointer ${
              isDarkMode 
                ? 'bg-neutral-900/95 border-neutral-700 text-neutral-200 hover:bg-neutral-800' 
                : 'bg-white/95 border-neutral-300 text-neutral-800 hover:bg-neutral-100 shadow-md'
            }`}
          >
            <Minimize className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-mono">Exit Fullscreen (Esc)</span>
          </button>
        </div>
      )}

      {/* MAP CANVAS VIEWPORT / UPLOAD DROPZONE */}
      <div className="relative flex-1 w-full h-full overflow-hidden z-10">
        {!mapImageUrl ? (
          /* NO MAP STATE / UPLOAD DROPZONE */
          <div 
            onDragOver={(e) => { e.preventDefault(); setIsDragOverDropzone(true); }}
            onDragLeave={() => setIsDragOverDropzone(false)}
            onDrop={handleDrop}
            className="w-full h-full flex flex-col items-center justify-center p-6 text-center"
          >
            <div className={`max-w-md w-full p-8 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center gap-4 ${
              isDragOverDropzone
                ? 'border-accent bg-accent/10 scale-102'
                : isDarkMode
                ? 'border-neutral-800 bg-neutral-900/40 hover:border-neutral-700'
                : 'border-neutral-300 bg-white hover:border-neutral-400'
            }`}>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
                isDarkMode ? 'bg-purple-950/40 border border-purple-800 text-purple-400' : 'bg-purple-100 text-purple-600'
              }`}>
                <WorldModeIcon className="w-7 h-7" />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold font-display">Charter Your World Map</h3>
                <p className="text-xs text-neutral-400 max-w-sm">
                  Upload high-resolution cartography maps (PNG, JPG, WebP). Leaflet coordinates are percentage-based so uploading higher resolution versions in the future preserves all pins perfectly!
                </p>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingMap}
                className="px-5 py-2.5 rounded-xl bg-accent hover:opacity-90 text-white font-semibold text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                {isProcessingMap ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing Map...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Select Map Image</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* LEAFLET MAP CONTAINER */
          <div 
            ref={mapContainerRef} 
            className="w-full h-full bg-[#0a0a0a] cursor-crosshair"
            style={{ width: '100%', height: '100%' }}
          />
        )}

        {/* HUD: COORDINATES & STATUS BAR (BOTTOM LEFT) */}
        {mapImageUrl && (
          <div className={`absolute bottom-4 left-4 z-[1000] pointer-events-auto px-3 py-1.5 rounded-lg border text-[11px] font-mono backdrop-blur-md shadow-lg flex items-center gap-2.5 ${
            isDarkMode ? 'bg-neutral-900/85 border-neutral-800 text-neutral-300' : 'bg-white/90 border-neutral-200 text-neutral-700'
          }`}>
            <Compass className="w-3.5 h-3.5 text-accent shrink-0" />
            <div>
              {hoverCoordinates ? (
                <span>X: {hoverCoordinates.xPct}% | Y: {hoverCoordinates.yPct}%</span>
              ) : (
                <span className="text-neutral-500">Hover over map</span>
              )}
            </div>
            <div className="w-px h-3 bg-neutral-300 dark:bg-neutral-700" />
            <span className="text-neutral-400">
              Zoom: {(() => {
                const rel = Number((currentZoom - baseFitZoom).toFixed(1));
                if (Math.abs(rel) < 0.05) return '0x';
                return rel > 0 ? `+${rel}x` : `${rel}x`;
              })()}
            </span>
          </div>
        )}

        {/* PIN PLACEMENT ACTIVE BANNER */}
        {isPinModeActive && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 rounded-xl bg-amber-500 text-black font-semibold text-xs shadow-2xl flex items-center gap-2 border border-amber-400 animate-bounce">
            <Crosshair className="w-4 h-4" />
            <span>
              {pendingPlacementCodexId
                ? `Click anywhere on the map to place the pin for "${(codexEntries || []).find((ce) => ce.id === pendingPlacementCodexId)?.title || 'Codex entry'}"`
                : 'Click anywhere on the map to place a pin'}
            </span>
            <button
              onClick={() => setIsPinModeActive(false)}
              className="ml-2 px-2 py-0.5 rounded bg-black/20 hover:bg-black/30 text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}

        {/* MARKER DETAIL DRAWER / POPUP (WHEN PIN IS CLICKED) */}
        {activeMarkerDetail && (
          <div className={`absolute top-4 right-4 z-[1000] w-80 max-h-[calc(100%-2rem)] rounded-2xl border shadow-2xl overflow-y-auto backdrop-blur-md flex flex-col p-4 space-y-3.5 ${
            isDarkMode ? 'bg-neutral-900/95 border-neutral-800 text-neutral-100' : 'bg-white/95 border-neutral-200 text-neutral-900'
          }`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {activeMarkerDetail.imageUrl ? (
                  <img
                    src={activeMarkerDetail.imageUrl}
                    alt={activeMarkerDetail.title}
                    className="w-10 h-10 rounded-xl object-cover border border-neutral-200 dark:border-neutral-700 shrink-0"
                  />
                ) : (
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
                    style={{ backgroundColor: activeMarkerDetail.color || getCategoryInfo(activeMarkerDetail.category).color }}
                  >
                    {(() => {
                      const IconC = getIconComponent(activeMarkerDetail.icon || getCategoryInfo(activeMarkerDetail.category).iconName);
                      return <IconC className="w-5 h-5" />;
                    })()}
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-sm font-bold truncate font-display">
                    {activeMarkerDetail.title}
                  </h3>
                  {activeMarkerDetail.subtitle && (
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                      {activeMarkerDetail.subtitle}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={() => setActiveMarkerDetail(null)}
                className="p-1 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Category & Coordinates badge */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span 
                className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded text-white"
                style={{ backgroundColor: activeMarkerDetail.color || getCategoryInfo(activeMarkerDetail.category).color }}
              >
                {getCategoryInfo(activeMarkerDetail.category).label}
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                isDarkMode ? 'bg-neutral-800/60 text-neutral-400 border-neutral-700/50' : 'bg-neutral-100 text-neutral-600 border-neutral-200'
              }`}>
                {activeMarkerDetail.xPct}% , {activeMarkerDetail.yPct}%
              </span>
            </div>

            {/* Overview / Description */}
            {activeMarkerDetail.description && (
              <p className={`text-xs leading-relaxed p-2.5 rounded-xl border ${
                isDarkMode ? 'bg-neutral-800/40 border-neutral-800 text-neutral-300' : 'bg-neutral-100 border-neutral-200 text-neutral-700'
              }`}>
                {activeMarkerDetail.description}
              </p>
            )}

            {/* Detailed Lore Content snippet */}
            {activeMarkerDetail.content && (
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-mono font-bold text-neutral-500 dark:text-neutral-400">Lore & Notes</span>
                <p className="text-xs text-neutral-600 dark:text-neutral-300 line-clamp-4 leading-relaxed">
                  {activeMarkerDetail.content}
                </p>
              </div>
            )}

            {/* Tags */}
            {activeMarkerDetail.tags && activeMarkerDetail.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {activeMarkerDetail.tags.map((t) => (
                  <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded ${
                    isDarkMode ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                  }`}>
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Related Characters */}
            {activeMarkerDetail.linkedCharacterIds && activeMarkerDetail.linkedCharacterIds.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-mono font-bold text-neutral-500 dark:text-neutral-400">Associated Characters</span>
                <div className="space-y-1">
                  {activeMarkerDetail.linkedCharacterIds.map((charId) => {
                    const char = characters.find((c) => c.id === charId);
                    if (!char) return null;
                    return (
                      <button
                        key={charId}
                        onClick={() => onNavigateToCharacter?.(charId)}
                        className={`w-full text-left px-2 py-1 rounded text-xs flex items-center justify-between transition-colors cursor-pointer ${
                          isDarkMode ? 'bg-neutral-800/50 hover:bg-neutral-800 text-neutral-300' : 'bg-neutral-100 hover:bg-neutral-200/70 text-neutral-700'
                        }`}
                      >
                        <span className="truncate">{char.name}</span>
                        <ChevronRight className="w-3 h-3 text-neutral-400 dark:text-neutral-500" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer Action Buttons */}
            <div className={`pt-2 border-t flex items-center justify-between gap-2 ${
              isDarkMode ? 'border-neutral-800' : 'border-neutral-200'
            }`}>
              <button
                onClick={() => handleOpenMarkerModal(activeMarkerDetail, false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isDarkMode ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-100' : 'bg-neutral-200 hover:bg-neutral-300 text-neutral-800'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>

              {activeMarkerDetail.linkedCodexId && onNavigateToCodex && (
                <button
                  onClick={() => onNavigateToCodex(activeMarkerDetail.linkedCodexId!)}
                  className="px-3 py-1.5 rounded-lg border border-accent/40 text-accent hover:bg-accent/10 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Open Codex</span>
                </button>
              )}

              <button
                onClick={() => handleDeleteMarker(activeMarkerDetail.id)}
                className="p-1.5 rounded-lg text-red-500 dark:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                title="Delete Marker"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* COMPREHENSIVE CODEX-STYLE MARKER CREATION & EDITING MODAL */}
      {editingMarker && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`max-w-xl w-full rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
            isDarkMode ? 'bg-neutral-900 border-neutral-800 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-900'
          }`}>
            {/* Modal Header */}
            <div className={`p-5 border-b flex items-center justify-between shrink-0 ${
              isDarkMode ? 'border-neutral-800 bg-[#161616]' : 'border-neutral-200 bg-neutral-50'
            }`}>
              <div className="flex items-center gap-2.5">
                <div 
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs"
                  style={{ backgroundColor: formThemeColor }}
                >
                  {(() => {
                    const IconComp = getIconComponent(formIcon);
                    return <IconComp className="w-4 h-4" />;
                  })()}
                </div>
                <div>
                  <h2 className="text-base font-bold font-display">
                    {isCreatingNewMarker ? 'Add Location Pin' : `Edit '${editingMarker.title}'`}
                  </h2>
                  <span className="text-[11px] text-neutral-400">
                    Position: X: {formXPct}% | Y: {formYPct}%
                  </span>
                </div>
              </div>
              <button 
                onClick={() => {
                  setEditingMarker(null);
                  setIsCreatingNewMarker(false);
                }}
                className="text-neutral-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Scrollable Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Badge Icon & Custom Illustration Upload Section */}
              <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
              }`}>
                <div className="flex items-center gap-3.5">
                  <input
                    ref={markerFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleMarkerImageFileChange}
                    className="hidden"
                  />

                  {/* Badge Icon (Clickable to upload custom portrait) */}
                  <div className="relative group shrink-0">
                    <button
                      type="button"
                      onClick={() => markerFileInputRef.current?.click()}
                      disabled={isUploadingMarkerImage}
                      title="Click to upload custom portrait or artwork"
                      className="relative w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center text-white cursor-pointer shadow-md border border-neutral-300 dark:border-neutral-700 transition-all hover:scale-105 group-hover:ring-2 group-hover:ring-accent"
                      style={{ backgroundColor: formImageUrl ? undefined : formThemeColor }}
                    >
                      {formImageUrl ? (
                        <img
                          src={formImageUrl}
                          alt="Marker Illustration"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        (() => {
                          const IconComp = getIconComponent(formIcon);
                          return <IconComp className="w-8 h-8" />;
                        })()
                      )}

                      {/* Camera upload hover overlay */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white text-[10px] font-bold">
                        {isUploadingMarkerImage ? (
                          <Loader2 className="w-5 h-5 animate-spin text-accent" />
                        ) : (
                          <>
                            <Camera className="w-4 h-4 text-accent" />
                            <span>Upload</span>
                          </>
                        )}
                      </div>
                    </button>

                    {/* Clear image button */}
                    {formImageUrl && !isUploadingMarkerImage && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormImageUrl('');
                          setMarkerImageNotice(null);
                          setMarkerImageError(null);
                        }}
                        title="Remove custom illustration"
                        className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-md transition-transform hover:scale-110 cursor-pointer z-10"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs font-bold font-display block">
                      Location Artwork / Emblem
                    </span>
                    <p className="text-[11px] text-neutral-400 leading-snug">
                      {formImageUrl 
                        ? 'Custom illustration active. Click emblem to change or hover to remove.' 
                        : 'Click emblem to upload a portrait/scenery artwork, or customize icon below.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Upload Notification Banner */}
              {(markerImageNotice || markerImageError) && (
                <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  markerImageNotice
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle className={`w-4 h-4 shrink-0 ${markerImageNotice ? 'text-amber-500' : 'text-rose-500'}`} />
                    <span className="truncate">{markerImageNotice || markerImageError}</span>
                  </div>
                  {onOpenSettings && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="underline font-semibold text-xs cursor-pointer shrink-0"
                    >
                      Open Settings
                    </button>
                  )}
                </div>
              )}

              {/* Link Existing Codex Entry (if unplaced entries exist) */}
              {isCreatingNewMarker && unplacedCodexEntries.length > 0 && (
                <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  isDarkMode ? 'bg-neutral-850/80 border-neutral-750' : 'bg-neutral-50 border-neutral-200'
                }`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <BookOpen className="w-4 h-4 text-accent shrink-0" />
                    <div>
                      <span className="text-xs font-bold block">
                        Link Existing Codex Entry
                      </span>
                      <p className="text-[11px] text-neutral-400 leading-tight">
                        Select an entry without a map location to assign to this marker
                      </p>
                    </div>
                  </div>
                  <select
                    value={formLinkedCodexId || ''}
                    onChange={(e) => {
                      const entryId = e.target.value;
                      if (!entryId) return;
                      const chosen = (codexEntries || []).find((ce) => ce.id === entryId);
                      if (chosen) {
                        setFormTitle(chosen.title);
                        setFormSubtitle(chosen.subtitle || '');
                        setFormCategory(chosen.category || 'locations');
                        setFormDescription(chosen.overview || '');
                        setFormContent(chosen.content || '');
                        setFormImageUrl(chosen.imageUrl || '');
                        setFormThemeColor(chosen.themeColor || getCategoryInfo(chosen.category || 'locations').color);
                        setFormIcon(chosen.icon || getCategoryInfo(chosen.category || 'locations').iconName);
                        setFormTags(chosen.tags || []);
                        setFormLinkedCharacterIds(chosen.relatedCharacterIds || []);
                        setFormLinkedDocumentIds(chosen.relatedDocumentIds || []);
                        setFormLinkedCodexId(chosen.id);
                      }
                    }}
                    className={`px-3 py-1.5 text-xs rounded-xl border outline-none font-medium max-w-full sm:max-w-[210px] cursor-pointer ${
                      isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                    }`}
                  >
                    <option value="">-- Choose Codex Entry --</option>
                    {unplacedCodexEntries.map((ce) => (
                      <option key={ce.id} value={ce.id}>
                        {ce.title} ({ce.category})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Title & Category Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-500 dark:text-neutral-400">
                    Location Name *
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Marysville, Castle Ironcrest, Yuba Outpost"
                    className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none ${
                      isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-500 dark:text-neutral-400">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => {
                      const newCat = e.target.value;
                      setFormCategory(newCat);
                      const catInfo = getCategoryInfo(newCat);
                      setFormThemeColor(catInfo.color);
                      setFormIcon(catInfo.iconName);
                    }}
                    className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none cursor-pointer ${
                      isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                    }`}
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subtitle */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">
                  Subtitle / Region Tag
                </label>
                <input
                  type="text"
                  value={formSubtitle}
                  onChange={(e) => setFormSubtitle(e.target.value)}
                  placeholder="e.g. Sutter County, Seat of House Vance, River Trading Hub"
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              {/* Color Presets & Icon Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Pin Color */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-500 dark:text-neutral-400">
                    Pin Color
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormThemeColor(color)}
                        className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                          formThemeColor === color ? 'scale-125 ring-2 ring-white shadow-md' : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={formThemeColor}
                      onChange={(e) => setFormThemeColor(e.target.value)}
                      className="w-6 h-6 rounded-full cursor-pointer bg-transparent border-0"
                      title="Custom color"
                    />
                  </div>
                </div>

                {/* Icon Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-500 dark:text-neutral-400">
                    Icon Emblem
                  </label>
                  {/* v0.7.93: theme-aware container/buttons (was hardcoded dark, broken in light theme) */}
                  <div className={`flex items-center gap-1 flex-wrap max-h-24 overflow-y-auto p-1.5 rounded-xl border ${
                    isDarkMode ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-100/70'
                  }`}>
                    {AVAILABLE_ICONS.map((item) => {
                      const IconComp = item.icon;
                      const isSelected = formIcon === item.name;
                      return (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => setFormIcon(item.name)}
                          className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-accent text-white shadow-xs'
                              : isDarkMode
                                ? 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                                : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/80'
                          }`}
                          title={item.name}
                        >
                          <IconComp className="w-4 h-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Overview / Summary */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">
                  Overview / Summary
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Brief synopsis of this location, landmark, or territory..."
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none resize-none ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              {/* Detailed Encyclopedia Notes */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">
                  Detailed Encyclopedia Lore & Notes
                </label>
                <textarea
                  rows={4}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Deep lore, secrets, historical defenses, architecture, atmospheric descriptions..."
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none resize-y ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              {/* Tags Section */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-400">
                  Tags
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={formTagInput}
                    onChange={(e) => setFormTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag(formTagInput);
                      }
                    }}
                    placeholder="Type tag and press Enter..."
                    className={`flex-1 px-3 py-1.5 text-xs rounded-xl border focus:outline-none ${
                      isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => handleAddTag(formTagInput)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                      isDarkMode ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-100' : 'bg-neutral-200 hover:bg-neutral-300 text-neutral-800'
                    }`}
                  >
                    Add
                  </button>
                </div>

                {/* Selected Tags */}
                {formTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {formTags.map((tag) => (
                      <span
                        key={tag}
                        className={`px-2 py-0.5 rounded-lg text-xs flex items-center gap-1 ${
                          isDarkMode ? 'bg-neutral-800 text-neutral-300' : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                        }`}
                      >
                        <span>#{tag}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-red-400 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Suggested Tags */}
                <div className="flex flex-wrap gap-1 pt-1">
                  <span className="text-[10px] text-neutral-500 mr-1 self-center">Suggestions:</span>
                  {SUGGESTED_LOCATION_TAGS.filter((t) => !formTags.includes(t)).slice(0, 6).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleAddTag(tag)}
                      className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                        isDarkMode
                          ? 'bg-neutral-800/40 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                          : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-600 hover:text-neutral-900 border border-neutral-200'
                      }`}
                    >
                      +{tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Connected Characters */}
              <div className="space-y-2.5 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-accent" />
                    <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-500 dark:text-neutral-400">
                      Connected Characters
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
                            onClick={() => setFormLinkedCharacterIds(prev => prev.filter(id => id !== cId))}
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

                {/* Characters Selector List */}
                {characters.length === 0 ? (
                  <div className="p-3 rounded-xl border border-dashed text-center text-xs text-neutral-500 border-neutral-300 dark:border-neutral-700">
                    No characters created yet in this Mundus project.
                  </div>
                ) : (
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1 rounded-xl p-1.5 border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40">
                    {characters.map((char) => {
                      const isSelected = formLinkedCharacterIds.includes(char.id);
                      return (
                        <button
                          key={char.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setFormLinkedCharacterIds(prev => prev.filter(id => id !== char.id));
                            } else {
                              setFormLinkedCharacterIds(prev => [...prev, char.id]);
                            }
                          }}
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                            isSelected
                              ? isDarkMode
                                ? 'border-accent bg-accent/10 text-white'
                                : 'border-accent bg-accent/10 text-neutral-900'
                              : isDarkMode
                              ? 'border-neutral-800/80 bg-neutral-900/70 hover:bg-neutral-800 text-neutral-300'
                              : 'border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-5 h-5 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[10px] font-bold border ${
                              isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-neutral-200 border-neutral-300 text-neutral-700'
                            }`}>
                              {char.avatarUrl ? (
                                <img src={char.avatarUrl} alt={char.name} className="w-full h-full object-cover" />
                              ) : (
                                char.name.charAt(0).toUpperCase()
                              )}
                            </div>
                            <span className="text-xs font-semibold truncate block">
                              {char.name}
                            </span>
                          </div>
                          <div className="shrink-0">
                            {isSelected ? (
                              <Check className="w-4 h-4 text-accent" />
                            ) : (
                              <Plus className="w-4 h-4 text-neutral-500" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* MENTIONED DOCUMENTS & SCENES (SORTED BY FOLDERS & COLLAPSIBLE - FIXED BY DETECTION) */}
              <div className="space-y-2.5 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-accent" />
                    <label className="text-xs font-bold uppercase tracking-wider font-mono text-neutral-500 dark:text-neutral-400">
                      Appears / Mentioned In Documents
                    </label>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold">
                    Appears in {documentsWithMentionStatus.filter((d) => d.isMentioned).length} {documentsWithMentionStatus.filter((d) => d.isMentioned).length === 1 ? 'scene' : 'scenes'}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 leading-snug">
                  Documents where this entry appears
                </p>

                {documents.length === 0 ? (
                  <div className="p-3 rounded-xl border border-dashed text-center text-xs text-neutral-500 border-neutral-300 dark:border-neutral-700">
                    No documents created in this Mundus project yet.
                  </div>
                ) : documentsGroupedByFolder.length === 0 ? (
                  <div className="p-3 rounded-xl border border-dashed text-center text-xs text-neutral-500 border-neutral-300 dark:border-neutral-700">
                    No scenes currently mention or contain this location.
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
                                <span className={`px-1.5 py-0.5 rounded border ${
                                  isDarkMode ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-amber-500/15 text-amber-700 border-amber-500/30'
                                }`}>
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
                                    className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center justify-between gap-2 transition-all ${
                                      isDarkMode
                                        ? 'border-neutral-800/80 bg-neutral-900/40 text-neutral-300'
                                        : 'border-neutral-200 bg-white text-neutral-700'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <FileText className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                      <span className="font-medium truncate max-w-[220px]">
                                        {doc.title || 'Untitled Document'}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                                        isDarkMode
                                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                          : 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
                                      }`}>
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

            {/* Modal Footer Actions */}
            <div className={`p-4 border-t flex items-center justify-between shrink-0 ${
              isDarkMode ? 'border-neutral-800 bg-[#161616]' : 'border-neutral-200 bg-neutral-50'
            }`}>
              {!isCreatingNewMarker && editingMarker ? (
                <button
                  type="button"
                  onClick={() => handleDeleteMarker(editingMarker.id)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Pin</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingMarker(null);
                    setIsCreatingNewMarker(false);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                    isDarkMode ? 'text-neutral-400 hover:text-white' : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveMarkerForm}
                  className="px-5 py-2 rounded-xl bg-accent hover:opacity-90 text-white font-semibold text-xs shadow-md transition-all cursor-pointer"
                >
                  Save Location Pin
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MAP MODAL */}
      {confirmDeleteMap && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`max-w-sm w-full rounded-2xl border shadow-2xl p-5 space-y-4 ${
            isDarkMode ? 'bg-neutral-900 border-neutral-800 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-900'
          }`}>
            <h3 className="text-sm font-bold text-red-600 dark:text-red-400">Remove Map Image?</h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Are you sure you want to remove the current map image for this world? Your placed markers and percentage coordinates will remain saved for when you upload a new map.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteMap(false)}
                className={`px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                  isDarkMode ? 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200' : 'hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteMap}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white cursor-pointer"
              >
                Delete Map
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
