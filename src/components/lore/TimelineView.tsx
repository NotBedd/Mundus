import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { 
  Plus, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Settings2, 
  Calendar, 
  Clock, 
  Search, 
  Filter, 
  BookOpen, 
  Milestone, 
  Baby, 
  Skull, 
  Swords, 
  Compass, 
  Landmark, 
  Flame, 
  Sparkles, 
  ChevronRight,
  ChevronDown,
  FolderIcon,
  Tag,
  Users,
  Feather
} from 'lucide-react';
import type { 
  NovelDocument, 
  Folder, 
  Character, 
  TimelineEvent, 
  TimelineConfig, 
  SceneTimelineInfo 
} from '../../types';
import { INITIAL_TIMELINE_CONFIG } from '../../lib/initialData';
import { TimelineEventModal } from './TimelineEventModal';
import { SceneTimelineModal } from './SceneTimelineModal';
import { TimelineConfigModal } from './TimelineConfigModal';
import { CharacterDetailView } from '../characters/CharacterDetailView';

interface TimelineViewProps {
  documents: NovelDocument[];
  folders: Folder[];
  characters: Character[];
  timelineEvents: TimelineEvent[];
  timelineConfig?: TimelineConfig;
  config?: TimelineConfig;
  onSaveTimelineEvent: (event: Partial<TimelineEvent>) => void;
  onDeleteTimelineEvent: (id: string) => void;
  onSaveSceneTimelineInfo: (docId: string, info: SceneTimelineInfo) => void;
  onSaveTimelineConfig: (config: TimelineConfig) => void;
  onUpdateCharacter?: (id: string, changes: Partial<Character>) => void;
  onDeleteCharacter?: (id: string) => void;
  onSelectDocumentForEditor: (docId: string) => void;
  onReturnToHub: () => void;
  isDarkMode: boolean;
}

// Helper to parse numeric year values from numbers or formatted date strings like "Year 418", "14 Day, 1 Month, 418 Year", "395, Month 1", etc.
const parseYearValue = (val: any): number | null => {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number' && !isNaN(val)) return val;
  const str = String(val).trim();
  if (!str) return null;

  // 1. Look for number explicitly associated with Year / Years / Yr / Yrs / Cycle / Cycles / Era / Age / CE / BCE / AD / BC
  const yearKeywordMatch = str.match(/(?:year|years|yr|yrs|cycle|cycles|era|age|ce|ad|bc|bce)\s*(-?\d+(\.\d+)?)|(-?\d+(\.\d+)?)\s*(?:year|years|yr|yrs|cycle|cycles|era|age|ce|ad|bc|bce)/i);
  if (yearKeywordMatch) {
    const numStr = yearKeywordMatch[1] || yearKeywordMatch[3];
    if (numStr) {
      const num = parseFloat(numStr);
      if (!isNaN(num)) return num;
    }
  }

  // 2. Search comma-separated parts for the piece containing Year / Yr / Cycle
  const parts = str.split(/[,;]/);
  for (const part of parts) {
    if (/(?:year|yr|cycle|era|age)/i.test(part)) {
      const numMatch = part.match(/-?\d+(\.\d+)?/);
      if (numMatch) {
        const num = parseFloat(numMatch[0]);
        if (!isNaN(num)) return num;
      }
    }
  }

  // 3. Fallback: Find numbers not followed by day or month units
  const allNumberMatches = Array.from(str.matchAll(/(-?\d+(\.\d+)?)\s*([a-zA-Z]*)/g));
  if (allNumberMatches.length > 0) {
    for (let i = allNumberMatches.length - 1; i >= 0; i--) {
      const match = allNumberMatches[i];
      const unit = (match[3] || '').toLowerCase();
      if (!['day', 'days', 'month', 'months', 'hour', 'hours', 'week', 'weeks', 'st', 'nd', 'rd', 'th'].includes(unit)) {
        const num = parseFloat(match[1]);
        if (!isNaN(num)) return num;
      }
    }
  }

  // 4. Ultimate fallback: match first number
  const match = str.match(/-?\d+(\.\d+)?/);
  if (match) {
    const num = parseFloat(match[0]);
    return isNaN(num) ? null : num;
  }
  return null;
};

export const TimelineView: React.FC<TimelineViewProps> = ({
  documents,
  folders,
  characters,
  timelineEvents,
  timelineConfig,
  config,
  onSaveTimelineEvent,
  onDeleteTimelineEvent,
  onSaveSceneTimelineInfo,
  onSaveTimelineConfig,
  onUpdateCharacter,
  onDeleteCharacter,
  onSelectDocumentForEditor,
  onReturnToHub,
  isDarkMode
}) => {
  const safeConfig = timelineConfig || config || INITIAL_TIMELINE_CONFIG;
  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1); // Pixels per time unit multiplier
  const [panX, setPanX] = useState<number>(0);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [startPanX, setStartPanX] = useState<number>(0);

  // Modals state
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);
  const [isSceneModalOpen, setIsSceneModalOpen] = useState(false);
  const [selectedDocForModal, setSelectedDocForModal] = useState<NovelDocument | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [selectedCharacterCard, setSelectedCharacterCard] = useState<Character | null>(null);

  // Side card panel width & dragging state
  const [sideCardWidth, setSideCardWidth] = useState<number>(540);
  const [isDraggingSideCard, setIsDraggingSideCard] = useState<boolean>(false);

  const handleSideCardResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSideCard(true);
  };

  useEffect(() => {
    if (!isDraggingSideCard) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      setSideCardWidth(Math.max(380, Math.min(window.innerWidth - 100, newWidth)));
    };

    const handleMouseUp = () => {
      setIsDraggingSideCard(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSideCard]);

  // Collapsible Sections state
  const [isMilestonesCollapsed, setIsMilestonesCollapsed] = useState<boolean>(false);
  const [isCharactersCollapsed, setIsCharactersCollapsed] = useState<boolean>(false);
  const [isScenesCollapsed, setIsScenesCollapsed] = useState<boolean>(false);
  const [collapsedChapters, setCollapsedChapters] = useState<Record<string, boolean>>({});

  const toggleChapterCollapse = (chapterId: string) => {
    setCollapsedChapters((prev) => ({
      ...prev,
      [chapterId]: !prev[chapterId]
    }));
  };

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('all');
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEvent | null>(null);
  const [hoveredDoc, setHoveredDoc] = useState<NovelDocument | null>(null);

  // Calculate timeline boundaries from events, scenes, and character lifespans
  const { minYear, maxYear, timeSpanYears } = useMemo(() => {
    const base = safeConfig.baseYear ?? 440;
    let min = base - 5;
    let max = base + 15;

    timelineEvents.forEach((evt) => {
      const coord = typeof evt.timeCoordinate === 'number' ? evt.timeCoordinate : (parseFloat(String(evt.timeCoordinate)) || base);
      if (coord < min) min = Math.floor(coord) - 2;
      if (coord > max) max = Math.ceil(coord) + 2;
    });

    documents.forEach((doc) => {
      if (doc.timelineInfo?.startYear !== undefined && doc.timelineInfo?.startYear !== null) {
        const year = typeof doc.timelineInfo.startYear === 'number' 
          ? doc.timelineInfo.startYear 
          : (parseInt(String(doc.timelineInfo.startYear), 10) || base);
        if (!isNaN(year)) {
          if (year < min) min = year - 2;
          if (year > max) max = year + 2;
        }
      }
    });

    characters.forEach((char) => {
      const b = parseYearValue(char.birthTime);
      if (b !== null) {
        if (b < min) min = Math.floor(b) - 2;
        if (b > max) max = Math.ceil(b) + 2;
      }
      const d = parseYearValue(char.deathTime);
      if (d !== null) {
        if (d < min) min = Math.floor(d) - 2;
        if (d > max) max = Math.ceil(d) + 2;
      }
    });

    return { minYear: min, maxYear: max, timeSpanYears: Math.max(10, max - min + 1) };
  }, [timelineEvents, documents, characters, safeConfig.baseYear]);

  // Pixels per Major Unit (Year/Cycle) based on zoom
  const pixelsPerMajorUnit = Math.max(120, 240 * zoom);
  const PADDING_LEFT = 60;
  const totalTrackWidth = timeSpanYears * pixelsPerMajorUnit + PADDING_LEFT * 2;

  // Helper to convert timeCoordinate to X coordinate in pixels
  // Ensures earlier scenes/events are on the left and later ones are on the right
  const getXCoordinate = (timeVal: number): number => {
    const offsetFromMin = timeVal - minYear;
    return PADDING_LEFT + offsetFromMin * pixelsPerMajorUnit;
  };

  // Convert SceneTimelineInfo into numeric startCoordinate and spanWidth
  const getScenePlacement = (doc: NovelDocument) => {
    const info = doc.timelineInfo;
    if (!info || info.startYear === undefined || info.startYear === null) return null;

    const unitsPerMajor = safeConfig.unitsPerMajor || 12;
    const subUnitsPerMinor = safeConfig.subUnitsPerMinor || 30;

    const year = typeof info.startYear === 'number' ? info.startYear : (parseInt(String(info.startYear), 10) || 0);
    const month = typeof info.startMonth === 'number' ? info.startMonth : (parseInt(String(info.startMonth), 10) || 1);
    const day = typeof info.startDay === 'number' ? info.startDay : (parseInt(String(info.startDay), 10) || 1);
    const startCoord = year + ((month - 1) / unitsPerMajor) + ((day - 1) / (unitsPerMajor * subUnitsPerMinor));
    const startX = getXCoordinate(startCoord);

    // Calculate duration width in pixels
    let durationInMajorUnits = 0.08; // default minimum visual width
    if (info.duration && info.durationUnit) {
      const dur = typeof info.duration === 'number' ? info.duration : (parseFloat(String(info.duration)) || 1);
      switch (info.durationUnit) {
        case 'hours':
          durationInMajorUnits = dur / (unitsPerMajor * subUnitsPerMinor * 24);
          break;
        case 'days':
          durationInMajorUnits = dur / (unitsPerMajor * subUnitsPerMinor);
          break;
        case 'weeks':
          durationInMajorUnits = (dur * 7) / (unitsPerMajor * subUnitsPerMinor);
          break;
        case 'months':
          durationInMajorUnits = dur / unitsPerMajor;
          break;
        case 'years':
        case 'cycles':
          durationInMajorUnits = dur;
          break;
      }
    }

    const width = Math.max(140, durationInMajorUnits * pixelsPerMajorUnit);

    return { startX, width, startCoord };
  };

  // Bounds clamping helper: prevents dragging left past the timeline starting point (panX > 0)
  const clampPanX = useCallback((targetPanX: number) => {
    const cWidth = containerRef.current?.offsetWidth || 1200;
    const maxPanX = 0; // Starting point bound: timeline start stays pinned at left edge
    const minPanX = Math.min(0, -(totalTrackWidth - cWidth));
    return Math.max(minPanX, Math.min(maxPanX, targetPanX));
  }, [totalTrackWidth]);

  // Keep pan position strictly within bounds on zoom or track width changes
  useEffect(() => {
    setPanX((prev) => clampPanX(prev));
  }, [clampPanX, zoom]);

  // Filtered documents and events (sorted chronologically: earlier left -> later right)
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFolder = selectedFolderId === 'all' || doc.folderId === selectedFolderId;
      return matchesSearch && matchesFolder;
    });
  }, [documents, searchQuery, selectedFolderId]);

  const filteredEvents = useMemo(() => {
    return timelineEvents.filter((evt) => {
      const matchesSearch = evt.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (evt.description && evt.description.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesChar = selectedCharacterId === 'all' || (evt.characterIds && evt.characterIds.includes(selectedCharacterId));
      return matchesSearch && matchesChar;
    }).sort((a, b) => {
      const coordA = typeof a.timeCoordinate === 'number' ? a.timeCoordinate : (parseFloat(String(a.timeCoordinate)) || 0);
      const coordB = typeof b.timeCoordinate === 'number' ? b.timeCoordinate : (parseFloat(String(b.timeCoordinate)) || 0);
      return coordA - coordB;
    });
  }, [timelineEvents, searchQuery, selectedCharacterId]);

  // Character lifespans processing for timeline tracks (sorted chronologically)
  const characterLifespans = useMemo(() => {
    return characters.map((c) => {
      const b = parseYearValue(c.birthTime);
      const d = parseYearValue(c.deathTime);

      if (b === null && d === null) return null;

      const startCoord = b !== null ? b : (d !== null ? d - 10 : minYear);
      const endCoord = d !== null ? d : (b !== null ? b + 10 : maxYear);

      const startX = getXCoordinate(startCoord);
      const endX = getXCoordinate(endCoord);
      const width = Math.max(140, endX - startX);

      return {
        character: c,
        startCoord,
        endCoord,
        startX,
        width,
        hasBirth: b !== null,
        hasDeath: d !== null,
        birthVal: b,
        deathVal: d
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.startCoord - b.startCoord);
  }, [characters, minYear, maxYear, pixelsPerMajorUnit]);

  // Group scenes by chapter (folder) for timeline lanes
  const sceneLanes = useMemo(() => {
    const lanes: { id: string; name: string; color?: string; documents: NovelDocument[] }[] = [];

    // First group by defined folders
    folders.forEach((f) => {
      const folderDocs = filteredDocuments.filter((d) => d.folderId === f.id);
      lanes.push({
        id: f.id,
        name: f.name,
        color: f.color,
        documents: folderDocs
      });
    });

    // Unfiled scenes lane
    const unfiledDocs = filteredDocuments.filter((d) => !d.folderId);
    if (unfiledDocs.length > 0) {
      lanes.push({
        id: 'unfiled',
        name: 'Unfiled Scenes',
        documents: unfiledDocs
      });
    }

    return lanes;
  }, [folders, filteredDocuments]);

  // Mouse & Touch refs for pan handling
  const isRightMouseDownRef = useRef(false);
  const wasRightClickUsedRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number; panX: number } | null>(null);

  // Touch pan handlers (with e.stopPropagation() to prevent sidebar edge gesture from triggering)
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).closest('button, input, select, .interactive-card, a')) return;
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        panX: panX
      };
      setIsPanning(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (touchStartRef.current && e.touches.length === 1) {
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      setPanX(clampPanX(touchStartRef.current.panX + deltaX));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    touchStartRef.current = null;
    setIsPanning(false);
  };

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, .interactive-card, a')) return;
    if (e.button === 2) {
      isRightMouseDownRef.current = true;
      wasRightClickUsedRef.current = false;
    }
    if (e.button === 0 || e.button === 2) {
      setIsPanning(true);
      setStartPanX(e.clientX - panX);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    if (e.buttons & 2) {
      wasRightClickUsedRef.current = true;
    }
    setPanX(clampPanX(e.clientX - startPanX));
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button === 2) {
      isRightMouseDownRef.current = false;
    }
    setIsPanning(false);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    // Prevent context menu if right click was used to scroll or drag pan
    if (wasRightClickUsedRef.current || isRightMouseDownRef.current) {
      e.preventDefault();
      wasRightClickUsedRef.current = false;
    }
  };

  // Wheel and Trackpad pan/zoom handling with bounds clamping
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Detect if right mouse button is held down (bitwise AND with 2)
      const isRightClickHeld = (e.buttons & 2) !== 0 || isRightMouseDownRef.current;

      // Zoom on Ctrl/Cmd + wheel
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomDelta = e.deltaY < 0 ? 0.1 : -0.1;
        setZoom((prev) => Math.max(0.4, Math.min(3.0, prev + zoomDelta)));
        return;
      }

      // Horizontal scroll if right mouse button is held OR Shift key is pressed OR horizontal trackpad scroll
      if (isRightClickHeld || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        if (isRightClickHeld) {
          wasRightClickUsedRef.current = true;
        }
        const delta = isRightClickHeld
          ? (e.deltaY !== 0 ? e.deltaY : e.deltaX)
          : (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);

        setPanX((prev) => clampPanX(prev - delta));
        return;
      }

      // Otherwise allow standard vertical wheel scrolling to occur naturally!
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [clampPanX]);

  // Get Category Icon
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'character_birth': return Baby;
      case 'character_death': return Skull;
      case 'battle': return Swords;
      case 'discovery': return Compass;
      case 'political': return Landmark;
      case 'cataclysm': return Flame;
      default: return Milestone;
    }
  };

  return (
    <div 
      id="timeline-view-root"
      className={`flex-1 flex flex-col h-full overflow-hidden transition-colors ${
        isDarkMode ? 'bg-[#0e0e0e] text-neutral-100' : 'bg-[#f8f9fa] text-neutral-900'
      }`}
    >
      {/* Top Header & Navigation Bar */}
      <div className={`p-4 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${
        isDarkMode ? 'border-neutral-800 bg-[#121212]' : 'border-neutral-200 bg-white'
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
              isDarkMode ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-accent/10 border-accent/30 text-accent'
            }`}>
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold font-display flex items-center gap-2 group-hover:text-accent transition-colors">
                <span>Lore</span>
                <span className="text-neutral-400 text-xs font-normal">/</span>
                <span>Timeline</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold bg-accent/100/20 text-accent border border-accent/100/30">
                  {safeConfig.epochName || 'Third Age of Sol'}
                </span>
              </h1>
            </div>
          </button>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              placeholder="Search timeline..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`pl-8 pr-3 py-1.5 rounded-lg text-xs border outline-hidden w-40 sm:w-48 transition-all ${
                isDarkMode 
                  ? 'bg-neutral-900 border-neutral-700 focus:border-accent/100 text-white placeholder-neutral-500' 
                  : 'bg-neutral-50 border-neutral-300 focus:border-accent text-neutral-900 placeholder-neutral-400'
              }`}
            />
          </div>

          {/* Chapter / Folder Filter */}
          <select
            value={selectedFolderId}
            onChange={(e) => setSelectedFolderId(e.target.value)}
            className={`px-2.5 py-1.5 rounded-lg text-xs border outline-hidden ${
              isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-300' : 'bg-white border-neutral-300 text-neutral-700'
            }`}
          >
            <option value="all">All Chapters</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>

          {/* Character Filter */}
          {characters.length > 0 && (
            <select
              value={selectedCharacterId}
              onChange={(e) => setSelectedCharacterId(e.target.value)}
              className={`px-2.5 py-1.5 rounded-lg text-xs border outline-hidden ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-300' : 'bg-white border-neutral-300 text-neutral-700'
              }`}
            >
              <option value="all">All Characters</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          {/* Zoom Controls */}
          <div className="flex items-center border rounded-lg overflow-hidden border-neutral-300 dark:border-neutral-700">
            <button
              onClick={() => setZoom((prev) => Math.max(0.4, prev - 0.2))}
              title="Zoom Out"
              className="p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-[10px] font-mono font-semibold">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((prev) => Math.min(3.0, prev + 0.2))}
              title="Zoom In"
              className="p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setZoom(1); setPanX(clampPanX(0)); }}
              title="Reset View"
              className="p-1.5 border-l border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add Milestone Event Button */}
          <button
            id="btn-add-timeline-event"
            onClick={() => {
              setEditingEvent(null);
              setIsEventModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-lg border border-accent text-accent bg-accent/5 hover:bg-accent/10 font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Event</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Timeline Canvas */}
      <div 
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onContextMenu={handleContextMenu}
        className={`flex-1 relative overflow-y-auto overflow-x-hidden select-none cursor-grab custom-scrollbar ${isPanning ? 'cursor-grabbing' : ''}`}
      >
        {/* Timeline Canvas Workspace with Dynamic Offset */}
        <div 
          style={{
            transform: `translateX(${panX}px)`,
            width: `${totalTrackWidth}px`
          }}
          className="min-h-full flex flex-col justify-between"
        >
          {/* Track Content Area */}
          <div className="flex-1 pb-4">
            {/* Top Milestone Events Track */}
            <div className="pt-6 pb-4 px-6 border-b border-neutral-200/50 dark:border-neutral-800/50 relative">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setIsMilestonesCollapsed(!isMilestonesCollapsed)}
                  className="flex items-center gap-2 cursor-pointer group hover:opacity-80 transition-opacity"
                >
                  {isMilestonesCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-neutral-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-neutral-400" />
                  )}
                  <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 font-mono">
                    <Milestone className="w-4 h-4 text-accent" />
                    <span>Historical Milestone Points & Lore Events</span>
                  </span>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    ({filteredEvents.length} events)
                  </span>
                </button>
              </div>

              {!isMilestonesCollapsed && (
                <div className="relative h-20 w-full">
                  {filteredEvents.map((evt) => {
                    const x = getXCoordinate(evt.timeCoordinate);
                    const Icon = getCategoryIcon(evt.category);
                    const evtColor = evt.color || '#a855f7';

                    return (
                      <div
                        key={evt.id}
                        style={{ left: `${x}px` }}
                        className="absolute top-1 -translate-x-1/2 group z-20"
                        onMouseEnter={() => setHoveredEvent(evt)}
                        onMouseLeave={() => setHoveredEvent(null)}
                      >
                        {/* Pin button */}
                        <button
                          onClick={() => {
                            setEditingEvent(evt);
                            setIsEventModalOpen(true);
                          }}
                          className="interactive-card flex flex-col items-center cursor-pointer transition-transform hover:scale-110 active:scale-95"
                        >
                          <div 
                            className="w-7 h-7 rounded-xl flex items-center justify-center text-white shadow-md border border-white/20"
                            style={{ backgroundColor: evtColor }}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="w-0.5 h-4" style={{ backgroundColor: evtColor }} />
                          <span className="text-[10px] font-semibold truncate max-w-[120px] px-1.5 py-0.5 rounded bg-neutral-900/80 text-white backdrop-blur-xs border border-neutral-700/50">
                            {evt.title}
                          </span>
                        </button>

                        {/* Popover Preview */}
                        {hoveredEvent?.id === evt.id && (
                          <div className={`absolute top-16 left-1/2 -translate-x-1/2 w-64 p-3 rounded-xl border shadow-xl z-50 pointer-events-none transition-all ${
                            isDarkMode ? 'bg-[#181818] border-neutral-700 text-white' : 'bg-white border-neutral-200 text-neutral-900'
                          }`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: evtColor }} />
                              <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                                {evt.category.replace('_', ' ')}
                              </span>
                            </div>
                            <h4 className="text-xs font-bold font-display">{evt.title}</h4>
                            <p className="text-[11px] text-accent font-mono mt-0.5">{evt.timeDisplay}</p>
                            {evt.description && (
                              <p className="text-[11px] text-neutral-400 mt-1 line-clamp-3">{evt.description}</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Character Lifespans Track */}
            {characterLifespans.length > 0 && (
              <div className="pt-4 pb-4 px-6 border-b border-neutral-200/50 dark:border-neutral-800/50 relative">
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => setIsCharactersCollapsed(!isCharactersCollapsed)}
                    className="flex items-center gap-2 cursor-pointer group hover:opacity-80 transition-opacity"
                  >
                    {isCharactersCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-neutral-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-neutral-400" />
                    )}
                    <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 font-mono">
                      <Users className="w-4 h-4 text-pink-500" />
                      <span>Character Lifespans & Timelines</span>
                    </span>
                    <span className="text-[10px] text-neutral-500 font-mono">
                      ({characterLifespans.length} active characters)
                    </span>
                  </button>
                </div>

                {!isCharactersCollapsed && (
                  <div className="relative space-y-2 pt-1 pb-2 w-full">
                    {characterLifespans.map(({ character: char, startX, width, birthVal, deathVal, hasBirth, hasDeath }) => (
                      <div
                        key={char.id}
                        onClick={() => setSelectedCharacterCard(char)}
                        style={{ left: `${startX}px`, width: `${width}px` }}
                        className={`interactive-card relative h-10 rounded-xl border px-3 flex items-center justify-between gap-2 shadow-xs transition-all hover:scale-[1.01] hover:z-30 cursor-pointer ${
                          isDarkMode 
                            ? 'bg-pink-950/30 border-pink-800/70 text-pink-200 hover:bg-pink-900/40' 
                            : 'bg-pink-50 border-pink-200 text-pink-900 hover:bg-pink-100'
                        }`}
                        title={`Character: ${char.name}\nRole: ${char.role}\nLifespan: ${hasBirth ? `${safeConfig.majorUnitName || 'Year'} ${birthVal}` : '?'} - ${hasDeath ? `${safeConfig.majorUnitName || 'Year'} ${deathVal}` : 'Present'}`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="w-6 h-6 rounded-full bg-pink-500/20 flex items-center justify-center text-pink-400 shrink-0 border border-pink-500/30 text-[10px] font-bold">
                            {char.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs font-bold font-display truncate">
                            {char.name}
                          </span>
                          <span className="text-[10px] font-mono opacity-70 capitalize hidden sm:inline px-1.5 py-0.2 rounded bg-pink-500/10 border border-pink-500/20">
                            {char.role}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 text-[10px] font-mono font-semibold">
                          <span className="px-1.5 py-0.5 rounded bg-black/20 text-white">
                            {hasBirth ? `${safeConfig.majorUnitName || 'Year'} ${birthVal}` : '?'}
                            {' → '}
                            {hasDeath ? `${safeConfig.majorUnitName || 'Year'} ${deathVal}` : 'Present'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Middle Section: Scene & Chapter Duration Lanes */}
            <div className="px-6 py-4 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setIsScenesCollapsed(!isScenesCollapsed)}
                  className="flex items-center gap-2 cursor-pointer group hover:opacity-80 transition-opacity"
                >
                  {isScenesCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-neutral-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-neutral-400" />
                  )}
                  <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 font-mono">
                    <BookOpen className="w-4 h-4 text-blue-500" />
                    <span>Scene & Chapter Duration Spans</span>
                  </span>
                </button>
                <span className="text-[10px] text-neutral-500 hidden sm:inline">
                  Click any scene bar to adjust its timeline duration or jump to writing editor.
                </span>
              </div>

              {!isScenesCollapsed && sceneLanes.map((lane) => {
                const isChapterCollapsed = !!collapsedChapters[lane.id];
                const placedDocs = lane.documents
                  .filter((doc) => getScenePlacement(doc) !== null)
                  .sort((a, b) => {
                    const pA = getScenePlacement(a)!;
                    const pB = getScenePlacement(b)!;
                    return pA.startCoord - pB.startCoord;
                  });
                const unplacedDocs = lane.documents.filter((doc) => getScenePlacement(doc) === null);

                return (
                  <div 
                    key={lane.id}
                    className={`p-4 rounded-xl border relative ${
                      isDarkMode ? 'bg-neutral-900/40 border-neutral-800' : 'bg-white border-neutral-200 shadow-2xs'
                    }`}
                  >
                    {/* Lane Chapter Header */}
                    <button
                      onClick={() => toggleChapterCollapse(lane.id)}
                      className="flex items-center gap-2 mb-3 sticky left-4 z-10 px-2.5 py-1.5 rounded-md bg-neutral-800/90 backdrop-blur-xs text-white text-xs font-semibold border border-neutral-700 shadow-xs cursor-pointer hover:bg-neutral-700 transition-colors"
                    >
                      {isChapterCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 text-neutral-300" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-neutral-300" />
                      )}
                      <FolderIcon className="w-3.5 h-3.5 text-accent" />
                      <span>{lane.name}</span>
                      <span className="text-[10px] text-neutral-400 font-mono">
                        ({placedDocs.length} of {lane.documents.length} placed)
                      </span>
                    </button>

                    {/* Render Scenes in this Lane */}
                    {!isChapterCollapsed && (
                      placedDocs.length > 0 ? (
                        <div className="space-y-2.5 py-1 relative w-full -ml-4">
                          {placedDocs.map((doc) => {
                            const placement = getScenePlacement(doc)!;
                            const isDraft = doc.status === 'draft';
                            const startYear = doc.timelineInfo?.startYear ?? 0;
                            const startMonth = doc.timelineInfo?.startMonth ?? 1;
                            const startDay = doc.timelineInfo?.startDay ?? 1;

                            return (
                              <div key={doc.id} className="relative h-14 sm:h-16 w-full">
                                <div
                                  style={{
                                    left: `${placement.startX}px`,
                                    width: `${placement.width}px`
                                  }}
                                  className={`interactive-card absolute top-0 h-full rounded-xl border flex flex-col justify-center px-4 py-2 cursor-pointer group shadow-md transition-all hover:scale-[1.01] hover:z-30 hover:shadow-lg ${
                                    isDarkMode 
                                      ? 'bg-gradient-to-r from-neutral-900 via-neutral-850 to-neutral-900 border-neutral-700 text-white hover:border-accent/100' 
                                      : 'bg-gradient-to-r from-white via-neutral-50 to-white border-neutral-300 text-neutral-900 hover:border-accent/100'
                                  }`}
                                  onClick={() => {
                                    setSelectedDocForModal(doc);
                                    setIsSceneModalOpen(true);
                                  }}
                                >
                                  <div className="flex items-center justify-between gap-2 overflow-hidden mb-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                        isDraft ? 'bg-amber-400 ring-2 ring-amber-400/20' : 'bg-emerald-400 ring-2 ring-emerald-400/20'
                                      }`} />
                                      <span className="text-xs sm:text-sm font-bold truncate font-display group-hover:text-accent transition-colors">
                                        {doc.title}
                                      </span>
                                    </div>

                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectDocumentForEditor(doc.id);
                                      }}
                                      title="Open in Writing Studio"
                                      className="p-1 rounded-md hover:bg-neutral-700/60 text-neutral-400 hover:text-white transition-colors shrink-0"
                                    >
                                      <Feather className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                                    <span className="text-neutral-400 truncate">
                                      {safeConfig.majorUnitName || 'Yr'} {startYear}, M{startMonth}, D{startDay}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30 shrink-0">
                                      {doc.timelineInfo?.duration || 1} {doc.timelineInfo?.durationUnit || 'days'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-3 px-3 rounded-lg border border-dashed border-neutral-700/40 text-xs text-neutral-400 flex items-center justify-between gap-3">
                          <span className="italic">No scenes from this chapter placed on the timeline yet.</span>
                          {unplacedDocs.length > 0 && (
                            <button
                              onClick={() => {
                                setSelectedDocForModal(unplacedDocs[0]);
                                setIsSceneModalOpen(true);
                              }}
                              className="px-2 py-1 rounded text-[11px] font-medium border border-neutral-700 bg-neutral-800 text-neutral-200 hover:text-white hover:bg-neutral-700 cursor-pointer shrink-0 transition-colors"
                            >
                              + Place "{unplacedDocs[0].title}"
                            </button>
                          )}
                        </div>
                      )
                    )}
                  </div>
                );
              })}

              {/* Unplaced Scenes Notice Drawer */}
              {!isScenesCollapsed && documents.some((d) => !d.timelineInfo?.startYear) && (
                <div className={`p-3 rounded-xl border border-dashed flex items-center justify-between ${
                  isDarkMode ? 'border-neutral-800 bg-neutral-950/40 text-neutral-400' : 'border-neutral-300 bg-neutral-50 text-neutral-600'
                }`}>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-accent" />
                    <span className="text-xs">
                      {documents.filter((d) => !d.timelineInfo?.startYear).length} scenes do not have timeline placement yet.
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {documents.filter((d) => !d.timelineInfo?.startYear).slice(0, 3).map((d) => (
                      <button
                        key={d.id}
                        onClick={() => {
                          setSelectedDocForModal(d);
                          setIsSceneModalOpen(true);
                        }}
                        className="px-2 py-1 rounded text-[11px] font-medium border border-neutral-700 bg-neutral-800 text-white hover:bg-neutral-700 cursor-pointer"
                      >
                        + Place "{d.title}"
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Sticky Time Axis Bar (Zoom-Reactive: Years / Months / Days) */}
          <div className={`h-20 border-t px-6 flex items-center relative sticky bottom-0 z-30 shrink-0 ${
            isDarkMode ? 'border-neutral-800 bg-[#141414]' : 'border-neutral-200 bg-white shadow-lg'
          }`}>
            <div className="relative w-full h-full flex items-center">
              {Array.from({ length: timeSpanYears + 1 }).map((_, index) => {
                const currentYear = minYear + index;
                const yearX = getXCoordinate(currentYear);

                const unitsPerMajor = safeConfig.unitsPerMajor || 12;
                const minorUnitName = safeConfig.minorUnitName || 'Month';
                const subMinorUnitName = safeConfig.subMinorUnitName || 'Day';

                const showMonths = pixelsPerMajorUnit >= 220;
                const showDays = pixelsPerMajorUnit >= 480;

                return (
                  <React.Fragment key={currentYear}>
                    {/* Major Year Tick */}
                    <div 
                      style={{ left: `${yearX}px` }}
                      className="absolute top-0 bottom-0 flex flex-col items-center justify-center -translate-x-1/2 z-10"
                    >
                      <div className="w-0.5 h-4 bg-accent/100 dark:bg-accent" />
                      <span className="text-xs font-mono font-bold text-neutral-900 dark:text-neutral-100 mt-1 whitespace-nowrap">
                        {safeConfig.majorUnitName || 'Year'} {currentYear}
                      </span>
                      <span className="text-[9px] font-mono text-neutral-500">
                        {safeConfig.epochName || 'Epoch'}
                      </span>
                    </div>

                    {/* Month Sub-Ticks */}
                    {showMonths && index < timeSpanYears && (
                      Array.from({ length: unitsPerMajor - 1 }).map((_, mIdx) => {
                        const monthNum = mIdx + 2;
                        const monthRatio = (mIdx + 1) / unitsPerMajor;
                        const monthX = getXCoordinate(currentYear + monthRatio);
                        const isQuarter = monthNum % 3 === 0;
                        const showLabel = pixelsPerMajorUnit >= 360 || isQuarter;

                        return (
                          <React.Fragment key={`m-${currentYear}-${monthNum}`}>
                            <div 
                              style={{ left: `${monthX}px` }}
                              className="absolute top-0 bottom-0 flex flex-col items-center justify-center -translate-x-1/2 opacity-75"
                            >
                              <div className="w-px h-3 bg-neutral-400 dark:bg-neutral-600" />
                              {showLabel && (
                                <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 mt-0.5 whitespace-nowrap">
                                  {minorUnitName.slice(0, 3)} {monthNum}
                                </span>
                              )}
                            </div>

                            {/* Day Micro-Ticks */}
                            {showDays && (
                              Array.from({ length: 3 }).map((_, dIdx) => {
                                const dayNum = (dIdx + 1) * 10;
                                const dayRatio = monthRatio - (1 / unitsPerMajor) + (dayNum / 30) * (1 / unitsPerMajor);
                                const dayX = getXCoordinate(currentYear + dayRatio);

                                return (
                                  <div 
                                    key={`d-${currentYear}-${monthNum}-${dayNum}`}
                                    style={{ left: `${dayX}px` }}
                                    className="absolute top-0 bottom-0 flex flex-col items-center justify-center -translate-x-1/2 opacity-40"
                                  >
                                    <div className="w-px h-2 bg-neutral-400 dark:bg-neutral-600" />
                                    {pixelsPerMajorUnit >= 650 && (
                                      <span className="text-[8px] font-mono text-neutral-500 mt-0.5 whitespace-nowrap">
                                        {subMinorUnitName.slice(0, 1)}{dayNum}
                                      </span>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Timeline Quick-Navigation Bar & Scroll Control */}
      <div className={`px-4 py-2.5 border-t shrink-0 flex flex-col sm:flex-row items-center gap-3 z-20 ${
        isDarkMode ? 'border-neutral-800 bg-[#121212]' : 'border-neutral-200 bg-white'
      }`}>
        <div className="flex items-center gap-2 text-xs font-mono shrink-0">
          <span className="text-neutral-400 font-bold text-[11px] uppercase tracking-wider">Quick Navigation:</span>
          <button
            onClick={() => setPanX(clampPanX(0))}
            className={`px-2.5 py-1 rounded-md text-[11px] border font-medium transition-colors cursor-pointer ${
              isDarkMode ? 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-neutral-200' : 'bg-neutral-100 border-neutral-200 hover:bg-neutral-200 text-neutral-800'
            }`}
          >
            Start ({minYear})
          </button>
          <button
            onClick={() => {
              const cWidth = containerRef.current?.offsetWidth || 1200;
              setPanX(clampPanX(-(totalTrackWidth / 2 - cWidth / 2)));
            }}
            className={`px-2.5 py-1 rounded-md text-[11px] border font-medium transition-colors cursor-pointer ${
              isDarkMode ? 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-neutral-200' : 'bg-neutral-100 border-neutral-200 hover:bg-neutral-200 text-neutral-800'
            }`}
          >
            Center
          </button>
          <button
            onClick={() => {
              const cWidth = containerRef.current?.offsetWidth || 1200;
              setPanX(clampPanX(-(totalTrackWidth - cWidth)));
            }}
            className={`px-2.5 py-1 rounded-md text-[11px] border font-medium transition-colors cursor-pointer ${
              isDarkMode ? 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-neutral-200' : 'bg-neutral-100 border-neutral-200 hover:bg-neutral-200 text-neutral-800'
            }`}
          >
            End ({maxYear})
          </button>

          <div className={`hidden lg:flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded border shrink-0 ${
            isDarkMode 
              ? 'bg-neutral-800/50 border-neutral-700/60 text-neutral-300' 
              : 'bg-neutral-100 border-neutral-300 text-neutral-700'
          }`}>
            <span>Scroll = Vertical</span>
            <span className={isDarkMode ? "text-neutral-600" : "text-neutral-400"}>|</span>
            <span className="text-accent font-semibold">Right-Click + Scroll = Horizontal</span>
          </div>
        </div>

        {/* Range Slider for fast panning across the entire timeline span */}
        <div className="flex-1 w-full flex items-center gap-3">
          <span className="text-[10px] font-mono text-neutral-400 shrink-0 font-semibold">{minYear}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            value={(() => {
              const cWidth = containerRef.current?.offsetWidth || 1200;
              const maxPan = Math.max(1, totalTrackWidth - cWidth);
              const pct = (-panX / maxPan) * 100;
              return Math.max(0, Math.min(100, isNaN(pct) ? 0 : pct));
            })()}
            onChange={(e) => {
              const pct = parseFloat(e.target.value);
              const cWidth = containerRef.current?.offsetWidth || 1200;
              const maxPan = totalTrackWidth - cWidth;
              if (maxPan > 0) {
                setPanX(clampPanX(-(pct / 100) * maxPan));
              }
            }}
            className="flex-1 h-2.5 bg-neutral-200 dark:bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-accent transition-all"
            title="Drag slider to quickly move across the timeline"
          />
          <span className="text-[10px] font-mono text-neutral-400 shrink-0 font-semibold">{maxYear}</span>
        </div>
      </div>

      {/* Modals */}
      {isEventModalOpen && (
        <TimelineEventModal
          isOpen={isEventModalOpen}
          onClose={() => {
            setIsEventModalOpen(false);
            setEditingEvent(null);
          }}
          eventToEdit={editingEvent}
          characters={characters}
          documents={documents}
          timelineConfig={safeConfig}
          onSaveEvent={onSaveTimelineEvent}
          onDeleteEvent={onDeleteTimelineEvent}
          isDarkMode={isDarkMode}
        />
      )}

      {isSceneModalOpen && selectedDocForModal && (
        <SceneTimelineModal
          isOpen={isSceneModalOpen}
          onClose={() => {
            setIsSceneModalOpen(false);
            setSelectedDocForModal(null);
          }}
          document={selectedDocForModal}
          folders={folders}
          timelineConfig={safeConfig}
          onSaveTimelineInfo={onSaveSceneTimelineInfo}
          isDarkMode={isDarkMode}
        />
      )}

      {isConfigModalOpen && (
        <TimelineConfigModal
          isOpen={isConfigModalOpen}
          onClose={() => setIsConfigModalOpen(false)}
          config={safeConfig}
          onSaveConfig={onSaveTimelineConfig}
          isDarkMode={isDarkMode}
        />
      )}

      {selectedCharacterCard && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity cursor-pointer"
            onClick={() => setSelectedCharacterCard(null)}
          />

          {/* Side Card Panel */}
          <div 
            className={`relative h-full border-l shadow-2xl flex flex-row z-10 transition-all ${
              isDarkMode ? 'bg-[#111111] border-neutral-800' : 'bg-white border-neutral-200'
            }`}
            style={{ width: `${sideCardWidth}px` }}
          >
            {/* Draggable handle bar on left edge */}
            <div 
              onMouseDown={handleSideCardResizeMouseDown}
              className="w-2.5 hover:w-3.5 h-full bg-neutral-800/40 hover:bg-amber-500/70 cursor-col-resize flex items-center justify-center transition-all shrink-0 group select-none"
              title="Click and drag left/right to resize character panel"
            >
              <div className="w-1 h-10 rounded-full bg-neutral-600 group-hover:bg-white transition-colors" />
            </div>

            {/* Detail View Container */}
            <div className="flex-1 h-full overflow-hidden">
              <CharacterDetailView
                character={selectedCharacterCard}
                allCharacters={characters}
                onUpdate={(changes) => {
                  if (onUpdateCharacter && selectedCharacterCard) {
                    onUpdateCharacter(selectedCharacterCard.id, changes);
                    setSelectedCharacterCard((prev) => prev ? { ...prev, ...changes } : null);
                  }
                }}
                onDelete={(id) => {
                  if (onDeleteCharacter) {
                    onDeleteCharacter(id);
                  }
                  setSelectedCharacterCard(null);
                }}
                onDuplicate={() => {}}
                onClose={() => setSelectedCharacterCard(null)}
                isDarkMode={isDarkMode}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
