import React, { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { APP_VERSION } from '../constants';
import mundusLogoImg from '../assets/logo-transparent.png';
import { 
  BookOpen, 
  FolderOpen, 
  Folder as FolderIcon,
  Globe, 
  Map,
  Users, 
  Scroll, 
  Plus, 
  Search, 
  Sun, 
  Moon, 
  LogOut, 
  LogIn, 
  Cloud, 
  CloudOff, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  FileText, 
  Star,
  FolderPlus,
  Edit2,
  Trash2,
  CheckCircle2,
  Circle,
  Check,
  Layers,
  FolderTree,
  X,
  Settings,
  Compass,
} from 'lucide-react';
import { DoubleClickDeleteButton } from './DoubleClickDeleteButton';
import { WindRoseLogo } from './WindRoseLogo';
import { WritingModeIcon, CharacterModeIcon, LoreModeIcon, WorldModeIcon } from './ModeIcons';
import type { NovelDocument, ActiveSection, Folder, MundusProject } from '../types';
import { isFirebaseConfigured } from '../lib/firebase';

interface SidebarProps {
  documents: NovelDocument[];
  folders: Folder[];
  activeDocId: string;
  activeSection: ActiveSection;
  accentColor?: string;
  activeMundusProject?: MundusProject;
  onOpenAtlas?: () => void;
  onSelectSection: (section: ActiveSection) => void;
  onSelectDocument: (docId: string) => void;
  onCreateDocument: (folderId?: string) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteDocument?: (docId: string) => void;
  onOpenStartMenu: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  syncStatus: 'synced' | 'saving' | 'offline' | 'error';
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  expandSidebarOnHover?: boolean;
  onOpenSettings?: () => void;
  onMoveDocument?: (docId: string, folderId: string | undefined) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  documents,
  folders,
  activeDocId,
  activeSection,
  accentColor = '#8b5cf6',
  activeMundusProject,
  onOpenAtlas,
  onSelectSection,
  onSelectDocument,
  onCreateDocument,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDeleteDocument,
  onOpenStartMenu,
  isDarkMode,
  onToggleTheme,
  syncStatus,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile,
  expandSidebarOnHover = true,
  onOpenSettings,
  onMoveDocument,
}) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [viewMode, setViewMode] = useState<'folders' | 'flat'>('folders');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
  const [marqueeBox, setMarqueeBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const fileListRef = useRef<HTMLDivElement>(null);
  const isMarqueeDraggingRef = useRef(false);
  const marqueeStartPosRef = useRef({ x: 0, y: 0 });

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    // If clicked on input, button, form, delete button, or interactive icon, don't start marquee
    if ((e.target as HTMLElement).closest('button, input, form, a, [role="button"], .interactive-action')) {
      return;
    }

    // Check if clicked directly on an already-selected row
    const docRow = (e.target as HTMLElement).closest('[data-sidebar-doc-id]');
    const clickedDocId = docRow ? docRow.getAttribute('data-sidebar-doc-id') : null;

    if (clickedDocId && selectedDocIds.has(clickedDocId)) {
      // User might be dragging selected documents; do not start marquee
      return;
    }

    marqueeStartPosRef.current = { x: e.clientX, y: e.clientY };
    isMarqueeDraggingRef.current = false;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - marqueeStartPosRef.current.x;
      const dy = moveEvent.clientY - marqueeStartPosRef.current.y;
      if (!isMarqueeDraggingRef.current && Math.hypot(dx, dy) > 4) {
        isMarqueeDraggingRef.current = true;
      }

      if (isMarqueeDraggingRef.current) {
        setMarqueeBox({
          startX: marqueeStartPosRef.current.x,
          startY: marqueeStartPosRef.current.y,
          currentX: moveEvent.clientX,
          currentY: moveEvent.clientY
        });

        const boxLeft = Math.min(marqueeStartPosRef.current.x, moveEvent.clientX);
        const boxRight = Math.max(marqueeStartPosRef.current.x, moveEvent.clientX);
        const boxTop = Math.min(marqueeStartPosRef.current.y, moveEvent.clientY);
        const boxBottom = Math.max(marqueeStartPosRef.current.y, moveEvent.clientY);

        if (fileListRef.current) {
          const docElements = fileListRef.current.querySelectorAll('[data-sidebar-doc-id]');
          const newSelected = new Set<string>();
          docElements.forEach((el) => {
            const rect = el.getBoundingClientRect();
            const intersects = !(
              rect.right < boxLeft ||
              rect.left > boxRight ||
              rect.bottom < boxTop ||
              rect.top > boxBottom
            );
            if (intersects) {
              const id = el.getAttribute('data-sidebar-doc-id');
              if (id) newSelected.add(id);
            }
          });
          setSelectedDocIds(newSelected);
          if (newSelected.size > 0) {
            setIsSelectMode(true);
          }
        }
      }
    };

    // v0.7.91 FIX: shared teardown — also invoked on dragstart, because an
    // HTML5 file drag suppresses the mouseup that would normally remove these
    // window listeners (the marquee then kept painting on every later mouse
    // move: the stuck "select area" ghost after dragging a document).
    const teardownMarquee = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('dragstart', onDragStart);
      isMarqueeDraggingRef.current = false;
      setMarqueeBox(null);
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      const wasMarqueeDragging = isMarqueeDraggingRef.current;
      teardownMarquee();

      // If user performed a simple click (not dragging a marquee)
      if (!wasMarqueeDragging) {
        const targetEl = upEvent.target as HTMLElement | null;
        const clickedDocRow = targetEl?.closest('[data-sidebar-doc-id]');
        const clickedControl = targetEl?.closest('button, input, select, textarea, form, a, [role="button"]');

        // Click was outside any scene row and not on a button or control
        if (!clickedDocRow && !clickedControl) {
          setSelectedDocIds(new Set());
          setIsSelectMode(false);
        }
      }
    };

    const onDragStart = () => {
      teardownMarquee();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('dragstart', onDragStart);
  };

  // Calculate approximate project storage usage
  const { usedStorageDisplay, storagePercentDisplay } = useMemo(() => {
    let bytes = 0;
    documents.forEach((d) => {
      bytes += (d.content?.length || 0) + (d.plainText?.length || 0) + (d.title?.length || 0) + 180;
    });
    folders.forEach((f) => {
      bytes += (f.name?.length || 0) + 90;
    });
    // Base metadata overhead (settings, dictionary, timeline, characters)
    bytes += 1024 * 16;
    
    let formatted = '';
    if (bytes < 1024 * 1024) {
      formatted = `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      formatted = `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    const percent = (bytes / (1024 * 1024 * 1024)) * 100;
    return {
      usedStorageDisplay: formatted,
      storagePercentDisplay: percent < 0.01 ? '< 0.01%' : `${percent.toFixed(2)}%`
    };
  }, [documents, folders]);

  // If Firebase is not configured, disable syncing animations and force offline status
  const effectiveSyncStatus: 'synced' | 'saving' | 'offline' | 'error' = !isFirebaseConfigured ? 'offline' : syncStatus;

  // Hover expand / collapse state with suppression when user explicitly collapsed
  const [isHovered, setIsHovered] = useState(false);
  const [isHoverSuppressed, setIsHoverSuppressed] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [collapsedSyncHover, setCollapsedSyncHover] = useState(false);
  const [collapsedSyncCoords, setCollapsedSyncCoords] = useState<{ top: number; left: number } | null>(null);
  const syncIconRef = useRef<HTMLDivElement>(null);

  const handleSyncMouseEnter = () => {
    if (syncIconRef.current) {
      const rect = syncIconRef.current.getBoundingClientRect();
      setCollapsedSyncCoords({
        top: Math.max(10, rect.top - 20),
        left: rect.right + 12
      });
      setCollapsedSyncHover(true);
    }
  };

  const handleSyncMouseLeave = () => {
    setCollapsedSyncHover(false);
  };

  const handleMouseEnter = () => {
    if (!expandSidebarOnHover || isHoverSuppressed) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
      setIsHoverSuppressed(false);
    }, 150);
  };

  const isExpanded = (!isCollapsed || isHovered) || isMobileOpen;

  const handleMundusLogoClick = () => {
    if (isExpanded) {
      // Currently open -> close it and suppress hover until cursor leaves
      setIsHovered(false);
      setIsHoverSuppressed(true);
      if (!isCollapsed) {
        onToggleCollapse();
      }
    } else {
      // Currently closed -> open and pin it open
      setIsHovered(false);
      setIsHoverSuppressed(false);
      if (isCollapsed) {
        onToggleCollapse();
      }
    }
  };

  const handleCollapseChevronClick = () => {
    setIsHovered(false);
    setIsHoverSuppressed(true);
    if (!isCollapsed) {
      onToggleCollapse();
    }
  };

  // Touch gesture tracking on mobile sidebar to close on swipe left
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartXRef.current;
    const deltaY = currentY - touchStartYRef.current;

    // Swiped left by > 45px with minimal vertical movement
    if (deltaX < -45 && Math.abs(deltaY) < 60) {
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      if (onCloseMobile) onCloseMobile();
    }
  };

  const handleTouchEnd = () => {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  const toggleFolderCollapse = (folderId: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim());
      setNewFolderName('');
      setIsCreatingFolder(false);
    }
  };

  const handleRenameFolderSubmit = (e: React.FormEvent, folderId: string) => {
    e.preventDefault();
    if (editingFolderName.trim()) {
      onRenameFolder(folderId, editingFolderName.trim());
      setEditingFolderId(null);
      setEditingFolderName('');
    }
  };

  const filteredDocs = documents.filter((d) => 
    d.title.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <>
      {/* Mobile Backdrop when drawer is open */}
      {isMobileOpen && (
        <div 
          id="mobile-sidebar-backdrop"
          onClick={onCloseMobile}
          className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs md:hidden transition-opacity"
        />
      )}

      <aside
        id="app-sidebar"
        onKeyDown={(e) => {
          // v0.7.93: keyboard-first navigation — ArrowUp/ArrowDown rove through
          // every document in the list, Enter/Space opens the focused one.
          // Reached via the Alt+Left "focus sidebar" shortcut.
          const key = e.key;
          if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Enter' && key !== ' ') return;
          const target = e.target as HTMLElement;
          const tag = target?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
          const items = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-sidebar-doc-id]'));
          if (items.length === 0) return;
          const currentIndex = items.indexOf(document.activeElement as HTMLElement);
          if (key === 'Enter' || key === ' ') {
            if (currentIndex >= 0 && target?.hasAttribute('data-sidebar-doc-id')) {
              e.preventDefault();
              target.click();
            }
            return;
          }
          if (currentIndex === -1) {
            // Focus is elsewhere in the sidebar (search box, mode buttons) —
            // the first arrow press enters the document list.
            e.preventDefault();
            items[key === 'ArrowDown' ? 0 : items.length - 1].focus();
            return;
          }
          e.preventDefault();
          const nextIndex = key === 'ArrowDown' ? Math.min(items.length - 1, currentIndex + 1) : Math.max(0, currentIndex - 1);
          if (nextIndex !== currentIndex) items[nextIndex].focus();
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`h-screen flex flex-col border-r transition-[width] duration-300 ease-in-out select-none shrink-0 backdrop-blur-md z-40 max-md:z-[90] overflow-hidden
          ${/* Mobile Drawer placement */ ''}
          max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:w-72 max-md:shadow-2xl
          ${isMobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'}
          ${/* Desktop normal layout */ ''}
          md:relative md:translate-x-0
          ${isExpanded ? 'md:w-72' : 'md:w-16'}
          ${
            isDarkMode 
              ? 'bg-[#0f0f0f]/95 border-neutral-800/80 text-neutral-200' 
              : 'bg-[#fafafa]/95 border-neutral-200/90 text-neutral-800'
          }`}
      >
        {/* Fixed Width Inner Container for smooth slide and no layout jitter */}
        <div className="w-72 min-w-72 flex flex-col h-full overflow-hidden">
          {/* Brand Header: Mundus */}
          <div className={`border-b flex items-center justify-between shrink-0 transition-all ${
            isDarkMode ? 'border-neutral-800/80' : 'border-neutral-200'
          } ${isExpanded ? 'p-3.5 gap-2 w-full' : 'w-16 h-14 p-2 justify-center'}`}>
            <button
              id="btn-brand-logo-toggle-sidebar"
              onClick={handleMundusLogoClick}
              title={isExpanded ? 'Collapse sidebar' : undefined}
              className={`flex items-center transition-colors group cursor-pointer ${
                isExpanded
                  ? 'gap-2.5 min-w-0 text-left p-1 -m-1 rounded-lg hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60'
                  : 'w-10 h-10 justify-center p-0 rounded-lg'
              }`}
            >
              <div className="w-8 h-8 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
                <img 
                  src={mundusLogoImg} 
                  alt="Mundus" 
                  className={`w-7 h-7 object-contain transition-all duration-200 select-none ${
                    isDarkMode ? 'invert brightness-125 contrast-125' : 'brightness-90 contrast-125'
                  }`} 
                />
              </div>
              {isExpanded && (
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-display font-bold text-sm tracking-widest uppercase truncate group-hover:text-black dark:group-hover:text-white transition-colors">
                      Mundus
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold bg-accent/20 text-accent border border-accent/30 shrink-0">
                      {APP_VERSION}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate tracking-tight font-medium mt-0.5">
                    {activeMundusProject?.name || 'Prima'}
                  </p>
                </div>
              )}
            </button>

            <div className="flex items-center gap-1">
              {/* Mobile close button */}
              <button
                onClick={onCloseMobile}
                className="md:hidden p-1.5 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
                title="Close sidebar"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Desktop collapse toggle - only visible when expanded to avoid clutter in collapsed rail */}
              {isExpanded && (
                <button
                  id="btn-toggle-sidebar"
                  onClick={handleCollapseChevronClick}
                  title="Collapse sidebar"
                  className={`hidden md:block p-1.5 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors cursor-pointer ${
                    isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-neutral-200/70'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

        {/* Mundus Atlas Hub Switcher */}
        <div className={`pt-2.5 px-2.5 pb-1 transition-all ${isExpanded ? 'w-full' : 'w-16 flex justify-center pt-2 px-0 pb-1'}`}>
          <button
            id="btn-open-mundus-atlas"
            onClick={() => {
              if (onOpenAtlas) onOpenAtlas();
              if (onCloseMobile) onCloseMobile();
            }}
            className={`flex items-center rounded-lg text-xs font-semibold tracking-wide transition-all shadow-2xs cursor-pointer group ${
              isExpanded 
                ? 'w-full gap-2.5 px-3 py-2 justify-start' 
                : 'w-10 h-10 justify-center p-0'
            } ${
              isDarkMode
                ? 'bg-neutral-900 border border-neutral-700/80 text-neutral-200 hover:bg-neutral-800 hover:text-white'
                : 'bg-white border border-neutral-300 text-neutral-900 hover:bg-neutral-100 hover:border-neutral-400'
            }`}
            title="Mundus Atlas"
          >
            <WindRoseLogo
              mini
              isDarkMode={isDarkMode}
              className="w-4 h-4 shrink-0 transition-transform duration-500 ease-out group-hover:rotate-90"
            />
            {isExpanded && (
              <span className="truncate">Mundus Atlas</span>
            )}
          </button>
        </div>

        {/* Start / Mundus View Hub Button */}
        <div className={`p-2.5 transition-all ${isExpanded ? 'w-full' : 'w-16 flex justify-center p-2'}`}>
          <button
            id="btn-open-start-menu"
            onClick={() => {
              onOpenStartMenu();
              if (onCloseMobile) onCloseMobile();
            }}
            className={`flex items-center rounded-lg text-xs font-semibold tracking-wide transition-all shadow-2xs cursor-pointer group ${
              isExpanded 
                ? 'w-full gap-2.5 px-3 py-2 justify-start' 
                : 'w-10 h-10 justify-center p-0'
            } ${
              isDarkMode
                ? 'bg-neutral-900 border border-neutral-700/80 text-neutral-200 hover:bg-neutral-800 hover:border-neutral-500'
                : 'bg-white border border-neutral-300 text-neutral-900 hover:bg-neutral-100 hover:border-neutral-400'
            }`}
            title="Open Mundus View"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4 shrink-0 globe-3d-icon"
              style={{ color: accentColor }}
              aria-hidden="true"
            >
              <defs>
                <radialGradient id="globe3DBody" cx="35%" cy="30%" r="75%">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
                  <stop offset="55%" stopColor="currentColor" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0.04" />
                </radialGradient>
                <radialGradient id="globe3DShine" cx="30%" cy="25%" r="22%">
                  <stop offset="0%" stopColor="white" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="white" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Sphere body — radial gradient gives 3D sphere shading */}
              <circle cx="12" cy="12" r="10" fill="url(#globe3DBody)" />

              {/* Parallels (latitude lines, static — give horizontal banding like a real globe) */}
              <ellipse cx="12" cy="12" rx="10" ry="3" fill="none" stroke="currentColor" strokeWidth="0.7" strokeOpacity="0.45" />
              <ellipse cx="12" cy="7" rx="9.3" ry="2" fill="none" stroke="currentColor" strokeWidth="0.55" strokeOpacity="0.35" />
              <ellipse cx="12" cy="17" rx="9.3" ry="2" fill="none" stroke="currentColor" strokeWidth="0.55" strokeOpacity="0.35" />

              {/* Animated meridian — scaleX animates 1 → 0 → -1 → 0 → 1 to simulate rotation around Y axis.
                  The sphere outline (drawn next) always remains a full circle so the icon never collapses
                  to a thin line — it always reads as a 3D ball with a meridian sweeping across it. */}
              <ellipse
                cx="12"
                cy="12"
                rx="10"
                ry="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.7"
                strokeOpacity="0.55"
                vectorEffect="non-scaling-stroke"
                className="globe-meridian"
              />

              {/* Sphere outline — stays as a full circle, never collapses */}
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeOpacity="0.9" />

              {/* Specular highlight — top-left shine gives 3D light-source cue */}
              <ellipse cx="9" cy="8.5" rx="3" ry="2.2" fill="url(#globe3DShine)" />
            </svg>
            {isExpanded && (
              <div className="flex items-center justify-between flex-1 min-w-0">
                <span className="truncate">Mundus View</span>
              </div>
            )}
          </button>
        </div>

        {/* Primary Navigation Rail */}
        <div className={`space-y-1 transition-all ${isExpanded ? 'px-2.5' : 'w-16 flex flex-col items-center px-0'}`}>
          <button
            id="nav-item-writing"
            onClick={() => {
              onSelectSection('editor');
              if (onCloseMobile) onCloseMobile();
            }}
            className={`flex items-center rounded-lg text-xs font-medium transition-colors cursor-pointer group ${
              isExpanded 
                ? 'w-full gap-2.5 px-3 py-2 justify-start' 
                : 'w-10 h-10 justify-center p-0'
            } ${
              activeSection === 'editor'
                ? 'border-2 border-accent text-accent font-semibold bg-transparent shadow-2xs'
                : isDarkMode ? 'text-neutral-400 hover:bg-neutral-850 hover:text-neutral-200' : 'text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900'
            }`}
            title="Writing Studio"
          >
            <WritingModeIcon className="w-4 h-4 shrink-0" />
            {isExpanded && <span>Writing</span>}
          </button>

          <button
            id="nav-item-characters"
            onClick={() => {
              onSelectSection('characters');
              if (onCloseMobile) onCloseMobile();
            }}
            className={`flex items-center rounded-lg text-xs font-medium transition-colors cursor-pointer group ${
              isExpanded 
                ? 'w-full gap-2.5 px-3 py-2 justify-start' 
                : 'w-10 h-10 justify-center p-0'
            } ${
              activeSection === 'characters'
                ? 'border-2 border-accent text-accent font-semibold bg-transparent shadow-2xs'
                : isDarkMode ? 'text-neutral-400 hover:bg-neutral-850 hover:text-neutral-200' : 'text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900'
            }`}
            title="Characters, Factions, Lineages & Dossiers"
          >
            <CharacterModeIcon className="w-4 h-4 shrink-0" />
            {isExpanded && (
              <div className="flex items-center justify-between flex-1 min-w-0">
                <span className="truncate">Characters</span>
              </div>
            )}
          </button>

          <button
            id="nav-item-lore"
            onClick={() => {
              onSelectSection('lore');
              if (onCloseMobile) onCloseMobile();
            }}
            className={`flex items-center rounded-lg text-xs font-medium transition-colors cursor-pointer group ${
              isExpanded 
                ? 'w-full gap-2.5 px-3 py-2 justify-start' 
                : 'w-10 h-10 justify-center p-0'
            } ${
              activeSection === 'lore'
                ? 'border-2 border-accent text-accent font-semibold bg-transparent shadow-2xs'
                : isDarkMode ? 'text-neutral-400 hover:bg-neutral-850 hover:text-neutral-200' : 'text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900'
            }`}
            title="Lore Mode: Timelines, Story Flow & Chronology"
          >
            <LoreModeIcon className="w-4 h-4 shrink-0" />
            {isExpanded && (
              <div className="flex items-center justify-between flex-1 min-w-0">
                <span className="truncate">Lore</span>
              </div>
            )}
          </button>

          <button
            id="nav-item-world"
            onClick={() => {
              onSelectSection('world');
              if (onCloseMobile) onCloseMobile();
            }}
            className={`flex items-center rounded-lg text-xs font-medium transition-colors cursor-pointer group ${
              isExpanded 
                ? 'w-full gap-2.5 px-3 py-2 justify-start' 
                : 'w-10 h-10 justify-center p-0'
            } ${
              activeSection === 'world'
                ? 'border-2 border-accent text-accent font-semibold bg-transparent shadow-2xs'
                : isDarkMode ? 'text-neutral-400 hover:bg-neutral-850 hover:text-neutral-200' : 'text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900'
            }`}
            title="Map (Beta)"
          >
            <WorldModeIcon className="w-4 h-4 shrink-0" />
            {isExpanded && (
              <div className="flex items-center justify-between flex-1 min-w-0">
                <span className="truncate">Map</span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                  BETA
                </span>
              </div>
            )}
          </button>
        </div>

        {/* Folders & Documents Tree Section */}
        <div className={`flex-1 flex flex-col min-h-0 mt-2.5 px-2.5 border-t pt-2.5 border-neutral-200 dark:border-neutral-800 transition-opacity duration-200 ${
          isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  Scenes & Chapters
                </span>
                {/* View mode toggle */}
                <button
                  onClick={() => setViewMode(viewMode === 'folders' ? 'flat' : 'folders')}
                  title={viewMode === 'folders' ? 'Switch to flat list' : 'Switch to folder tree'}
                  className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                >
                  {viewMode === 'folders' ? <FolderTree className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
                </button>
              </div>

              <div className="flex items-center gap-1">
                {/* v0.7.93: per-Mundus backup button moved to the Mundus View header (StartMenu) */}
                <button
                  id="btn-sidebar-new-folder"
                  onClick={() => setIsCreatingFolder(!isCreatingFolder)}
                  title="Create new folder"
                  className={`p-1 rounded transition-colors cursor-pointer ${
                    isDarkMode 
                      ? 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800' 
                      : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-200/80'
                  }`}
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
                <button
                  id="btn-sidebar-new-doc"
                  onClick={() => {
                    onCreateDocument();
                    if (onCloseMobile) onCloseMobile();
                  }}
                  title="Create new document"
                  className={`p-1 rounded transition-colors cursor-pointer ${
                    isDarkMode 
                      ? 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800' 
                      : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-200/80'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Quick Search with Select Mode Toggle */}
            <div className="flex items-center gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => {
                  if (selectedDocIds.size > 0 || isSelectMode) {
                    setIsSelectMode(false);
                    setSelectedDocIds(new Set());
                  } else {
                    setIsSelectMode(true);
                  }
                }}
                title={
                  selectedDocIds.size > 0
                    ? `${selectedDocIds.size} scene${selectedDocIds.size > 1 ? 's' : ''} selected. Drag selected items to a folder, or click to clear.`
                    : isSelectMode
                      ? "Exit selection mode"
                      : "Select multiple scenes (drag mouse or click to select)"
                }
                className={`min-w-[24px] h-6 px-1 rounded-full flex items-center justify-center shrink-0 border transition-all cursor-pointer text-[11px] font-bold leading-none ${
                  selectedDocIds.size > 0
                    ? 'bg-accent text-white border-accent shadow-2xs scale-105'
                    : isSelectMode
                      ? 'bg-accent text-white border-accent shadow-2xs'
                      : isDarkMode
                        ? 'border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 bg-neutral-900'
                        : 'border-neutral-300 text-neutral-600 hover:text-neutral-900 hover:border-neutral-400 bg-neutral-100'
                }`}
              >
                {selectedDocIds.size > 0 ? (
                  selectedDocIds.size
                ) : isSelectMode ? (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                ) : (
                  <Circle className="w-3 h-3 stroke-[2]" />
                )}
              </button>
              <div className="relative flex-1 min-w-0">
                <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  id="sidebar-search-input"
                  type="text"
                  placeholder="search"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className={`w-full pl-7 pr-2 py-1 text-xs rounded-md border focus:outline-none transition-colors ${
                    isDarkMode 
                      ? 'bg-neutral-900 border-neutral-800 text-neutral-200 focus:border-neutral-500' 
                      : 'bg-white border-neutral-300 text-neutral-800 focus:border-neutral-600'
                  }`}
                />
              </div>
            </div>

            {/* Inline New Folder Form */}
            {isCreatingFolder && (
              <form onSubmit={handleCreateFolderSubmit} className={`mb-2 p-1.5 rounded-lg border flex gap-1 ${
                isDarkMode 
                  ? 'border-neutral-700 bg-neutral-900' 
                  : 'border-neutral-300 bg-white shadow-xs'
              }`}>
                <input
                  type="text"
                  autoFocus
                  placeholder="Folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className={`flex-1 text-xs px-2 py-1 rounded border-b focus:outline-none ${
                    isDarkMode 
                      ? 'bg-neutral-900 text-neutral-100 border-neutral-600 focus:border-neutral-400' 
                      : 'bg-white text-neutral-900 border-neutral-300 focus:border-neutral-900'
                  }`}
                />
                <button
                  type="submit"
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                    isDarkMode ? 'bg-white text-black hover:bg-neutral-200' : 'bg-neutral-900 text-white hover:bg-black'
                  }`}
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder(false)}
                  className="px-1.5 py-0.5 rounded text-[11px] text-neutral-400 hover:text-neutral-600 cursor-pointer"
                >
                  Cancel
                </button>
              </form>
            )}

            {/* Documents & Folders Scrollable List with Marquee Drag-to-Select */}
            <div 
              ref={fileListRef}
              onMouseDown={handleContainerMouseDown}
              className="flex-1 overflow-y-auto space-y-1 pr-1 select-none relative"
            >
              {viewMode === 'folders' ? (
                <>
                  {/* Folders List */}
                  {folders.map((folder) => {
                    const folderDocs = filteredDocs.filter((d) => d.folderId === folder.id);
                    const isFolderCollapsed = !!collapsedFolders[folder.id];

                    return (
                      <div key={folder.id} className="space-y-0.5">
                        {/* Folder Header Row */}
                        <div 
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            setDragOverFolderId(folder.id);
                          }}
                          onDragLeave={(e) => {
                            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                            setDragOverFolderId((prev) => (prev === folder.id ? null : prev));
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragOverFolderId(null);
                            let docIds: string[] = [];
                            try {
                              const json = e.dataTransfer.getData('application/json');
                              if (json) docIds = JSON.parse(json);
                            } catch {}
                            if (docIds.length === 0) {
                              const text = e.dataTransfer.getData('text/plain');
                              if (text) docIds = text.split(',').filter(Boolean);
                            }
                            if (docIds.length > 0 && onMoveDocument) {
                              docIds.forEach((id) => onMoveDocument(id, folder.id));
                              setSelectedDocIds(new Set());
                              setIsSelectMode(false);
                            }
                          }}
                          className={`group flex items-center justify-between px-2 py-1 rounded-md text-xs hover:bg-neutral-200/70 dark:hover:bg-neutral-850 transition-colors ${
                            dragOverFolderId === folder.id ? 'ring-2 ring-accent bg-accent/20' : ''
                          }`}
                        >
                          <div 
                            className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer"
                            onClick={() => toggleFolderCollapse(folder.id)}
                          >
                            {isFolderCollapsed ? (
                              <ChevronRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                            )}
                            <FolderIcon className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 shrink-0" />
                            {editingFolderId === folder.id ? (
                              <form onSubmit={(e) => handleRenameFolderSubmit(e, folder.id)} className="flex-1 mr-1">
                                <input
                                  autoFocus
                                  type="text"
                                  value={editingFolderName}
                                  onChange={(e) => setEditingFolderName(e.target.value)}
                                  onBlur={(e) => handleRenameFolderSubmit(e, folder.id)}
                                  className={`w-full text-xs px-2 py-0.5 rounded border focus:outline-none ${
                                    isDarkMode 
                                      ? 'bg-neutral-900 text-neutral-100 border-neutral-700 focus:border-neutral-500' 
                                      : 'bg-white text-neutral-900 border-neutral-300 focus:border-neutral-900 shadow-2xs'
                                  }`}
                                />
                              </form>
                            ) : (
                              <div className="flex items-center gap-1 min-w-0 flex-1">
                                <span className="font-medium truncate text-neutral-800 dark:text-neutral-200">
                                  {folder.name}
                                </span>
                                {folderDocs.length > 0 && folderDocs.every((d) => d.status === 'complete') && (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" title="All documents in this folder are complete" />
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] text-neutral-400 font-mono px-1 rounded bg-neutral-200/50 dark:bg-neutral-800">
                              {folderDocs.length}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onCreateDocument(folder.id);
                                if (onCloseMobile) onCloseMobile();
                              }}
                              title={`Add document in ${folder.name}`}
                              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-black dark:hover:text-white transition-opacity"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingFolderId(folder.id);
                                setEditingFolderName(folder.name);
                              }}
                              title="Rename folder"
                              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-black dark:hover:text-white transition-opacity"
                            >
                              <Edit2 className="w-2.5 h-2.5" />
                            </button>
                            <DoubleClickDeleteButton
                              onDelete={() => onDeleteFolder(folder.id)}
                              title="Double click to delete folder"
                              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                              iconClassName="w-2.5 h-2.5"
                            />
                          </div>
                        </div>

                        {/* Folder Child Documents */}
                        {!isFolderCollapsed && (
                          <div className="pl-4 space-y-0.5 border-l border-neutral-200 dark:border-neutral-800 ml-3">
                            {folderDocs.map((doc) => {
                              const isActive = doc.id === activeDocId;
                              const isDocSelected = selectedDocIds.has(doc.id);
                              return (
                                <div
                                  key={doc.id}
                                  id={`sidebar-doc-${doc.id}`}
                                  data-sidebar-doc-id={doc.id}
                                  tabIndex={0}
                                  draggable={true}
                                  onDragStart={(e) => {
                                    const idsToDrag = isDocSelected
                                      ? Array.from(selectedDocIds)
                                      : [doc.id];
                                    e.dataTransfer.setData('text/plain', idsToDrag.join(','));
                                    e.dataTransfer.setData('application/json', JSON.stringify(idsToDrag));
                                    e.dataTransfer.effectAllowed = 'move';
                                  }}
                                  onClick={(e) => {
                                    if (isSelectMode || e.shiftKey || e.metaKey || e.ctrlKey) {
                                      e.stopPropagation();
                                      setSelectedDocIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(doc.id)) next.delete(doc.id);
                                        else next.add(doc.id);
                                        return next;
                                      });
                                      return;
                                    }
                                    onSelectSection('editor');
                                    onSelectDocument(doc.id);
                                    if (onCloseMobile) onCloseMobile();
                                  }}
                                  className={`group px-2 py-1 rounded-md text-xs cursor-pointer transition-all flex items-center justify-between gap-1.5 ${
                                    isDocSelected
                                      ? 'ring-1 ring-accent bg-accent/20 dark:bg-accent/30 font-semibold shadow-xs text-accent'
                                      : isActive
                                        ? isDarkMode
                                          ? 'bg-white text-black font-semibold shadow-xs'
                                          : 'bg-black text-white font-semibold shadow-xs'
                                        : isDarkMode
                                          ? 'text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100'
                                          : 'text-neutral-700 hover:bg-neutral-200/60 hover:text-neutral-900'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    {isSelectMode ? (
                                      <div className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border ${
                                        isDocSelected ? 'bg-accent border-accent text-white' : 'border-neutral-500'
                                      }`}>
                                        {isDocSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                      </div>
                                    ) : (
                                      <FileText className={`w-3 h-3 shrink-0 ${isDocSelected ? 'text-accent' : isActive ? (isDarkMode ? 'text-black' : 'text-white') : 'text-neutral-400'}`} />
                                    )}
                                    <span className="truncate">{doc.title}</span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {doc.isFavorite && (
                                      <Star className="w-2.5 h-2.5 fill-current shrink-0" />
                                    )}
                                    <span className={`text-[10px] font-mono ${isDocSelected ? 'text-accent' : isActive ? 'opacity-90' : 'text-neutral-400'}`}>
                                      {doc.wordCount || 0}w
                                    </span>
                                    {onDeleteDocument && (
                                      <DoubleClickDeleteButton
                                        onDelete={() => onDeleteDocument(doc.id)}
                                        title="Double click to delete document"
                                        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity interactive-action"
                                        iconClassName="w-2.5 h-2.5"
                                      />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            {folderDocs.length === 0 && (
                              <p className="text-[10px] text-neutral-400 py-1 pl-2 italic">
                                {documents.filter((d) => d.folderId === folder.id).length === 0
                                  ? 'Folder is empty'
                                  : 'No document in this folder matches filter'}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Unfiled Documents Section */}
                  {(() => {
                    const unfiledDocs = filteredDocs.filter((d) => !d.folderId || !folders.some(f => f.id === d.folderId));
                    return (
                      <div 
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDragOverFolderId('unfiled');
                        }}
                        onDragLeave={(e) => {
                          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                          setDragOverFolderId((prev) => (prev === 'unfiled' ? null : prev));
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOverFolderId(null);
                          let docIds: string[] = [];
                          try {
                            const json = e.dataTransfer.getData('application/json');
                            if (json) docIds = JSON.parse(json);
                          } catch {}
                          if (docIds.length === 0) {
                            const text = e.dataTransfer.getData('text/plain');
                            if (text) docIds = text.split(',').filter(Boolean);
                          }
                          if (docIds.length > 0 && onMoveDocument) {
                            docIds.forEach((id) => onMoveDocument(id, undefined));
                            setSelectedDocIds(new Set());
                            setIsSelectMode(false);
                          }
                        }}
                        className={`pt-2 space-y-0.5 rounded-md p-1 border transition-colors ${
                          dragOverFolderId === 'unfiled' ? 'border-accent bg-accent/10' : 'border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                          <span>Loose files</span>
                          <span className="text-[10px] font-mono">{unfiledDocs.length}</span>
                        </div>
                        <div className="space-y-0.5">
                          {unfiledDocs.map((doc) => {
                            const isActive = doc.id === activeDocId;
                            const isDocSelected = selectedDocIds.has(doc.id);
                            return (
                              <div
                                key={doc.id}
                                id={`sidebar-doc-${doc.id}`}
                                data-sidebar-doc-id={doc.id}
                                tabIndex={0}
                                draggable={true}
                                onDragStart={(e) => {
                                  const idsToDrag = isDocSelected
                                    ? Array.from(selectedDocIds)
                                    : [doc.id];
                                  e.dataTransfer.setData('text/plain', idsToDrag.join(','));
                                  e.dataTransfer.setData('application/json', JSON.stringify(idsToDrag));
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                onClick={(e) => {
                                  if (isSelectMode || e.shiftKey || e.metaKey || e.ctrlKey) {
                                    e.stopPropagation();
                                    setSelectedDocIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(doc.id)) next.delete(doc.id);
                                      else next.add(doc.id);
                                      return next;
                                    });
                                    return;
                                  }
                                  onSelectSection('editor');
                                  onSelectDocument(doc.id);
                                  if (onCloseMobile) onCloseMobile();
                                }}
                                className={`group px-2 py-1.5 rounded-md text-xs cursor-pointer transition-all flex items-center justify-between gap-1.5 ${
                                  isDocSelected
                                    ? 'ring-1 ring-accent bg-accent/20 dark:bg-accent/30 font-semibold shadow-xs text-accent'
                                    : isActive
                                      ? isDarkMode
                                        ? 'bg-white text-black font-semibold shadow-xs'
                                        : 'bg-black text-white font-semibold shadow-xs'
                                      : isDarkMode
                                        ? 'text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100'
                                        : 'text-neutral-700 hover:bg-neutral-200/60 hover:text-neutral-900'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  {isSelectMode ? (
                                    <div className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border ${
                                      isDocSelected ? 'bg-accent border-accent text-white' : 'border-neutral-500'
                                    }`}>
                                      {isDocSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                    </div>
                                  ) : (
                                    <FileText className={`w-3 h-3 shrink-0 ${isDocSelected ? 'text-accent' : isActive ? (isDarkMode ? 'text-black' : 'text-white') : 'text-neutral-400'}`} />
                                  )}
                                  <span className="truncate">{doc.title}</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {doc.isFavorite && (
                                    <Star className="w-2.5 h-2.5 fill-current shrink-0" />
                                  )}
                                  <span className={`text-[10px] font-mono ${isDocSelected ? 'text-accent' : isActive ? 'opacity-90' : 'text-neutral-400'}`}>
                                    {doc.wordCount || 0}w
                                  </span>
                                  {onDeleteDocument && (
                                    <DoubleClickDeleteButton
                                      onDelete={() => onDeleteDocument(doc.id)}
                                      title="Double click to delete document"
                                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity interactive-action"
                                      iconClassName="w-2.5 h-2.5"
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : (
                /* Flat List Mode */
                filteredDocs.map((doc) => {
                  const isActive = doc.id === activeDocId;
                  const isDocSelected = selectedDocIds.has(doc.id);
                  const parentFolder = folders.find((f) => f.id === doc.folderId);
                  return (
                    <div
                      key={doc.id}
                      id={`sidebar-doc-${doc.id}`}
                      data-sidebar-doc-id={doc.id}
                      tabIndex={0}
                      draggable={true}
                      onDragStart={(e) => {
                        const idsToDrag = isDocSelected
                          ? Array.from(selectedDocIds)
                          : [doc.id];
                        e.dataTransfer.setData('text/plain', idsToDrag.join(','));
                        e.dataTransfer.setData('application/json', JSON.stringify(idsToDrag));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={(e) => {
                        if (isSelectMode || e.shiftKey || e.metaKey || e.ctrlKey) {
                          e.stopPropagation();
                          setSelectedDocIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(doc.id)) next.delete(doc.id);
                            else next.add(doc.id);
                            return next;
                          });
                          return;
                        }
                        onSelectSection('editor');
                        onSelectDocument(doc.id);
                        if (onCloseMobile) onCloseMobile();
                      }}
                      className={`group px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-all flex items-center justify-between gap-1.5 ${
                        isDocSelected
                          ? 'ring-1 ring-accent bg-accent/20 dark:bg-accent/30 font-semibold shadow-xs text-accent'
                          : isActive
                            ? isDarkMode
                              ? 'bg-white text-black font-semibold shadow-xs'
                              : 'bg-black text-white font-semibold shadow-xs'
                            : isDarkMode
                              ? 'text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100'
                              : 'text-neutral-700 hover:bg-neutral-200/50 hover:text-neutral-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isSelectMode ? (
                          <div className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border ${
                            isDocSelected ? 'bg-accent border-accent text-white' : 'border-neutral-500'
                          }`}>
                            {isDocSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                        ) : (
                          <FileText className={`w-3.5 h-3.5 shrink-0 ${isDocSelected ? 'text-accent' : isActive ? (isDarkMode ? 'text-black' : 'text-white') : 'text-neutral-400'}`} />
                        )}
                        <div className="min-w-0 truncate">
                          <p className="truncate">{doc.title}</p>
                          {parentFolder && (
                            <p className="text-[10px] text-neutral-400 truncate font-mono">
                              {parentFolder.name}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {doc.isFavorite && (
                          <Star className="w-2.5 h-2.5 fill-current shrink-0" />
                        )}
                        <span className={`text-[10px] font-mono ${isDocSelected ? 'text-accent' : isActive ? 'opacity-90' : 'text-neutral-400'}`}>
                          {doc.wordCount || 0}w
                        </span>
                        {onDeleteDocument && (
                          <DoubleClickDeleteButton
                            onDelete={() => onDeleteDocument(doc.id)}
                            title="Double click to delete document"
                            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity interactive-action"
                            iconClassName="w-2.5 h-2.5"
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Rubberband / Marquee selection overlay rectangle */}
            {marqueeBox && (
              <div
                className="fixed pointer-events-none z-50 rounded border-2 border-blue-400 bg-blue-500/20 backdrop-blur-[0.5px]"
                style={{
                  left: Math.min(marqueeBox.startX, marqueeBox.currentX),
                  top: Math.min(marqueeBox.startY, marqueeBox.currentY),
                  width: Math.abs(marqueeBox.currentX - marqueeBox.startX),
                  height: Math.abs(marqueeBox.currentY - marqueeBox.startY),
                }}
              />
            )}
          </div>

        {/* Footer Controls with Monochromatic Badges */}
        <div className={`border-t shrink-0 backdrop-blur-md transition-all ${
          isExpanded ? 'w-full p-2 space-y-2' : 'w-16 py-2 px-0 space-y-2 flex flex-col items-center justify-center'
        } ${
          isDarkMode ? 'border-neutral-800/80 bg-neutral-900/60' : 'border-neutral-200 bg-neutral-100/60'
        }`}>
          {/* Cloud Sync Status & Settings / Theme */}
          {isExpanded ? (
            <div className="flex items-center justify-between text-[11px] px-1">
              <div 
                className="flex items-center gap-1.5 min-w-0 relative group cursor-default"
              >
                {effectiveSyncStatus === 'saving' ? (
                  <RefreshCw className="w-3.5 h-3.5 text-neutral-400 animate-spin shrink-0" />
                ) : effectiveSyncStatus === 'synced' ? (
                  <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <CloudOff className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                )}
                <span className={`truncate font-mono text-[10px] ${effectiveSyncStatus === 'offline' ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-500'}`}>
                  {effectiveSyncStatus === 'saving' ? 'Syncing...' : effectiveSyncStatus === 'synced' ? 'Firestore Synced' : 'Offline'}
                </span>

                {/* Storage Usage Tooltip */}
                <div className="absolute bottom-full left-0 mb-2 w-52 p-3 rounded-xl border shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 bg-white dark:bg-[#141414] border-neutral-200 dark:border-neutral-800 pointer-events-none">
                  {isFirebaseConfigured ? (
                    <>
                      <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 mb-1.5 flex items-center justify-between">
                        <span>Cloud Storage</span>
                        <span className="text-emerald-500 font-mono text-[11px]">{storagePercentDisplay}</span>
                      </div>
                      <div className="w-full h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-emerald-500 w-[1.5%]" />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-neutral-600 dark:text-neutral-400">
                        <span>Used: {usedStorageDisplay}</span>
                        <span>Total: 1.0 GB</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                        <span>Offline Storage</span>
                      </div>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-2 leading-relaxed">
                        Firebase is not configured. All changes are saved locally to your device.
                      </p>
                      <div className="flex items-center justify-between text-[10px] font-mono text-neutral-600 dark:text-neutral-400">
                        <span>Used: {usedStorageDisplay}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {/* Dark/Light mode toggle */}
                <button
                  id="btn-theme-toggle"
                  onClick={(e) => { e.stopPropagation(); onToggleTheme(); }}
                  title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    isDarkMode 
                      ? 'text-neutral-300 hover:text-white hover:bg-neutral-800' 
                      : 'text-neutral-700 hover:text-black hover:bg-neutral-200'
                  }`}
                >
                  {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>

                {/* Settings button */}
                <button
                  id="btn-sidebar-settings"
                  onClick={(e) => { e.stopPropagation(); onOpenSettings?.(); }}
                  title="Open Settings"
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    isDarkMode 
                      ? 'text-neutral-300 hover:text-white hover:bg-neutral-800' 
                      : 'text-neutral-700 hover:text-black hover:bg-neutral-200'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* Collapsed Footer: Clean Centered Column */
            <div className="w-16 flex flex-col items-center gap-2 py-1">
              <div 
                ref={syncIconRef}
                onMouseEnter={handleSyncMouseEnter}
                onMouseLeave={handleSyncMouseLeave}
                className="w-8 h-8 flex items-center justify-center cursor-default select-none pointer-events-auto relative"
              >
                {effectiveSyncStatus === 'saving' ? (
                  <RefreshCw className="w-4 h-4 text-neutral-400 animate-spin" />
                ) : effectiveSyncStatus === 'synced' ? (
                  <Cloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <CloudOff className="w-4 h-4 text-amber-500" />
                )}
              </div>

              {/* Floating Unclipped Storage Usage Tooltip when collapsed */}
              {collapsedSyncHover && collapsedSyncCoords && typeof document !== 'undefined' && createPortal(
                <div 
                  style={{ top: `${collapsedSyncCoords.top}px`, left: `${collapsedSyncCoords.left}px` }}
                  className="fixed w-56 p-3 rounded-xl border shadow-2xl z-[9999] bg-white dark:bg-[#141414] border-neutral-200 dark:border-neutral-800 pointer-events-none animate-in fade-in duration-150"
                >
                  {isFirebaseConfigured ? (
                    <>
                      <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 mb-1.5 flex items-center justify-between">
                        <span>Cloud Storage</span>
                        <span className="text-emerald-500 font-mono text-[11px]">{storagePercentDisplay}</span>
                      </div>
                      <div className="w-full h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-emerald-500 w-[1.5%]" />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-neutral-600 dark:text-neutral-400">
                        <span>Used: {usedStorageDisplay}</span>
                        <span>Total: 1.0 GB</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                        <span>Offline Storage</span>
                      </div>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-2 leading-relaxed">
                        Firebase is not configured. All changes are saved locally to your device.
                      </p>
                      <div className="flex items-center justify-between text-[10px] font-mono text-neutral-600 dark:text-neutral-400">
                        <span>Used: {usedStorageDisplay}</span>
                      </div>
                    </>
                  )}
                </div>,
                document.body
              )}

              <button
                id="btn-theme-toggle-collapsed"
                onClick={(e) => { e.stopPropagation(); onToggleTheme(); }}
                title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  isDarkMode 
                    ? 'text-neutral-300 hover:text-white hover:bg-neutral-800' 
                    : 'text-neutral-700 hover:text-black hover:bg-neutral-200'
                }`}
              >
                {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                id="btn-sidebar-settings-collapsed"
                onClick={(e) => { e.stopPropagation(); onOpenSettings?.(); }}
                title="Open Settings"
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  isDarkMode 
                    ? 'text-neutral-300 hover:text-white hover:bg-neutral-800' 
                    : 'text-neutral-700 hover:text-black hover:bg-neutral-200'
                }`}
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
      </aside>
    </>
  );
};
