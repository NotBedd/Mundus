import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  Star, 
  Clock, 
  ArrowLeft, 
  BookOpen, 
  Sparkles, 
  Download, 
  Trash2, 
  Copy, 
  BarChart2, 
  Globe, 
  CheckCircle2,
  Circle,
  Check,
  Layers,
  FolderOpen,
  Folder as FolderIcon,
  FolderPlus,
  FolderTree,
  Edit2,
  ChevronRight,
  MoreVertical,
  MoveRight,
  Compass,
  DatabaseBackup,
  ArrowUpDown,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { DoubleClickDeleteButton } from './DoubleClickDeleteButton';
import { WindRoseLogo } from './WindRoseLogo';
import type { NovelDocument, DocumentStatus, Folder, MundusProject } from '../types';
import { exportToMarkdown, exportToPdf, exportToDocx, exportToMundus, exportToHtml } from '../lib/exportUtils';
import { adjacentSwapReindex, resolveBookLayout } from '../lib/bookOrder';
import { BookExportDialog } from './BookExportDialog';

interface StartMenuProps {
  isOpen: boolean;
  onClose: () => void;
  documents: NovelDocument[];
  folders: Folder[];
  activeDocumentId: string;
  activeMundusProject?: MundusProject;
  onOpenAtlas?: () => void;
  onSelectDocument: (docId: string) => void;
  onCreateDocument: (templateType?: string, folderId?: string) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveDocument: (docId: string, folderId: string | undefined) => void;
  onUpdateDocument?: (docId: string, updates: Partial<NovelDocument>) => void;
  onDeleteDocument: (docId: string) => void;
  onDuplicateDocument: (doc: NovelDocument) => void;
  onToggleFavorite: (docId: string) => void;
  // v0.7.93: per-Mundus backup lives here (Mundus View header), not the sidebar
  onBackupMundus?: () => void;
  // v0.8.3: book-order reordering (Mundus View reorder mode) + project-level toggles
  onUpdateFolder?: (folderId: string, updates: Partial<Folder>) => void;
  onUpdateProject?: (updates: Partial<MundusProject>) => void;
  isDarkMode: boolean;
}

export const StartMenu: React.FC<StartMenuProps> = ({
  isOpen,
  onClose,
  documents,
  folders,
  activeDocumentId,
  activeMundusProject,
  onOpenAtlas,
  onSelectDocument,
  onCreateDocument,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveDocument,
  onUpdateDocument,
  onDeleteDocument,
  onDuplicateDocument,
  onToggleFavorite,
  onBackupMundus,
  onUpdateFolder,
  onUpdateProject,
  isDarkMode
}) => {
  const [activeTab, setActiveTab] = useState<'recent' | 'new' | 'info'>('recent');
  const [viewMode, setViewMode] = useState<'folders' | 'flat'>('folders');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterFavorite, setFilterFavorite] = useState<boolean>(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
  const [marqueeBox, setMarqueeBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const startMenuContentRef = useRef<HTMLDivElement>(null);
  const isMarqueeDraggingRef = useRef(false);
  const marqueeStartPosRef = useRef({ x: 0, y: 0 });
  // v0.8.3: book-order reorder mode + Export Book dialog
  const [isReorderMode, setIsReorderMode] = useState<boolean>(false);
  const [isExportBookOpen, setIsExportBookOpen] = useState<boolean>(false);

  // v0.8.3: resolved book order (folders → their docs → loose block). With no
  // manual reorders yet this resolves to the exact historical display order:
  // docs sort stable by bookOrderIndex (all undefined → array order), folders
  // by orderIndex (handleCreateFolder has always stamped it sequentially).
  // MUST run before the `if (!isOpen) return null` early return below — hooks
  // have to execute on every render, open or closed.
  const bookLayout = React.useMemo(
    () => resolveBookLayout(documents, folders, activeMundusProject),
    [documents, folders, activeMundusProject]
  );
  const loosePosition = bookLayout.loosePosition;

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    // If clicked on input, button, select, form, or interactive element, ignore
    if ((e.target as HTMLElement).closest('button, input, select, textarea, form, a, [role="button"], .interactive-action')) {
      return;
    }

    const docRow = (e.target as HTMLElement).closest('[data-startmenu-doc-id]');
    const clickedDocId = docRow ? docRow.getAttribute('data-startmenu-doc-id') : null;
    if (clickedDocId && selectedDocIds.has(clickedDocId)) {
      // User might be dragging selected documents; don't start marquee
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

        if (startMenuContentRef.current) {
          const docElements = startMenuContentRef.current.querySelectorAll('[data-startmenu-doc-id]');
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
              const id = el.getAttribute('data-startmenu-doc-id');
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
        const clickedDocRow = targetEl?.closest('[data-startmenu-doc-id]');
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

  if (!isOpen) return null;

  const toggleFolderCollapse = (folderId: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim());
      setNewFolderName('');
      setIsCreatingFolder(false);
    }
  };

  const handleRenameFolder = (e: React.FormEvent, folderId: string) => {
    e.preventDefault();
    if (editingFolderName.trim()) {
      onRenameFolder(folderId, editingFolderName.trim());
      setEditingFolderId(null);
      setEditingFolderName('');
    }
  };

  // Filter documents
  const filteredDocs = documents.filter((doc) => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.plainText.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || doc.status === filterStatus;
    const matchesFav = !filterFavorite || doc.isFavorite;
    return matchesSearch && matchesStatus && matchesFav;
  });

  // Calculate manuscript statistics
  const totalWords = documents.reduce((acc, d) => acc + (d.wordCount || 0), 0);
  const totalCharacters = documents.reduce((acc, d) => acc + (d.characterCount || 0), 0);
  const totalReadingTime = Math.ceil(totalWords / 200);

  const handleExport = (doc: NovelDocument, format: 'txt' | 'md' | 'pdf' | 'docx' | 'html' | 'mundus') => {
    if (format === 'mundus') {
      exportToMundus(doc);
      return;
    }
    if (format === 'html') {
      exportToHtml(doc);
      return;
    }
    if (format === 'md') {
      exportToMarkdown(doc);
      return;
    }
    if (format === 'pdf') {
      exportToPdf(doc);
      return;
    }
    if (format === 'docx') {
      exportToDocx(doc);
      return;
    }

    const content = doc.plainText || '';
    const mime = 'text/plain';
    const ext = 'txt';

    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** Move a document one slot up/down within its book scope (folder or loose). */
  const handleMoveDocInBook = (docId: string, direction: -1 | 1) => {
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;
    const folderId = doc.folderId && folders.some((f) => f.id === doc.folderId) ? doc.folderId : undefined;
    let scopeIds: string[] | null = null;
    if (folderId) {
      const group = bookLayout.folderGroups.find((g) => g.folder.id === folderId);
      scopeIds = group ? group.docs.map((d) => d.id) : null;
    } else {
      scopeIds = bookLayout.looseDocs.map((d) => d.id);
    }
    if (!scopeIds) return;
    const reindex = adjacentSwapReindex(scopeIds, docId, direction);
    if (!reindex) return;
    Object.entries(reindex).forEach(([id, idx]) => {
      onUpdateDocument?.(id, { bookOrderIndex: idx });
    });
  };

  /** Move a folder one slot up/down in the book order. */
  const handleMoveFolderInBook = (folderId: string, direction: -1 | 1) => {
    const seq = bookLayout.folderGroups.map((g) => g.folder.id);
    const reindex = adjacentSwapReindex(seq, folderId, direction);
    if (!reindex) return;
    Object.entries(reindex).forEach(([id, idx]) => {
      onUpdateFolder?.(id, { orderIndex: idx });
    });
  };

  // v0.8.3: the Unfiled / Loose Notes section, extracted so it can render
  // ABOVE or BELOW the folder sections (project's looseDocsPosition).
  const renderLooseSection = () => {
    // v0.8.3: resolved loose order in both modes (filters applied on top in
    // normal mode, full scope in reorder mode).
    const unfiledDocs = isReorderMode
      ? bookLayout.looseDocs
      : bookLayout.looseDocs.filter((d) => filteredDocs.some((fd) => fd.id === d.id));
    if (unfiledDocs.length === 0 && folders.length > 0) return null;

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
        className={`rounded-xl border overflow-hidden transition-all ${
          dragOverFolderId === 'unfiled'
            ? 'ring-2 ring-accent bg-accent/10'
            : isDarkMode ? 'bg-[#141414]/80 border-neutral-800' : 'bg-white border-neutral-200 shadow-xs'
        }`}
      >
        <div className={`px-5 py-3 flex items-center justify-between border-b ${
          isDarkMode ? 'bg-neutral-900/40 border-neutral-800' : 'bg-neutral-50/70 border-neutral-200'
        }`}>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-neutral-400" />
            <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              Unfiled / Loose Notes
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-neutral-200/70 dark:bg-neutral-800 text-neutral-500">
              {unfiledDocs.length} {unfiledDocs.length === 1 ? 'file' : 'files'}
            </span>
          </div>
          <button
            onClick={() => {
              onCreateDocument('blank');
              onClose();
            }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
              isDarkMode 
                ? 'border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200' 
                : 'border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Unfiled File</span>
          </button>
        </div>

        <div className="divide-y divide-neutral-200 dark:divide-neutral-800/80">
          {unfiledDocs.map((doc, docIdx) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              isActive={doc.id === activeDocumentId}
              isSelected={selectedDocIds.has(doc.id)}
              isSelectMode={isSelectMode}
              selectedDocIds={selectedDocIds}
              folders={folders}
              onToggleSelect={() => {
                setSelectedDocIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(doc.id)) next.delete(doc.id);
                  else next.add(doc.id);
                  return next;
                });
              }}
              onSelect={() => {
                onSelectDocument(doc.id);
                onClose();
              }}
              onToggleFav={() => onToggleFavorite(doc.id)}
              onDuplicate={() => onDuplicateDocument(doc)}
              onDelete={() => onDeleteDocument(doc.id)}
              onMove={(targetFolderId) => onMoveDocument(doc.id, targetFolderId)}
              onUpdateStatus={(st) => onUpdateDocument?.(doc.id, { status: st })}
              onExport={(fmt) => handleExport(doc, fmt)}
              isDarkMode={isDarkMode}
              reorderControls={isReorderMode ? {
                onMoveUp: () => handleMoveDocInBook(doc.id, -1),
                onMoveDown: () => handleMoveDocInBook(doc.id, 1),
                isFirst: docIdx === 0,
                isLast: docIdx === unfiledDocs.length - 1,
              } : undefined}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div 
      id="start-menu-overlay"
      className={`fixed inset-0 z-50 flex flex-col transition-colors duration-200 ${
        isDarkMode ? 'bg-[#0a0a0a] text-neutral-100' : 'bg-[#f7f7f7] text-neutral-900'
      }`}
    >
      {/* Floating Top Left Navigation Buttons (without sidebar) */}
      <div className="fixed top-4 left-4 z-50 flex items-center gap-2">
        <button
          id="btn-back-to-editor"
          onClick={onClose}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all shadow-md backdrop-blur-md cursor-pointer ${
            isDarkMode 
              ? 'bg-neutral-900/90 text-white border border-neutral-700/80 hover:bg-neutral-800' 
              : 'bg-white/90 text-black border border-neutral-300/80 hover:bg-neutral-100 shadow-sm'
          }`}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Mundus Modes</span>
        </button>

        {onOpenAtlas && (
          <button
            id="btn-start-menu-open-atlas"
            onClick={() => {
              onClose();
              onOpenAtlas();
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer group shadow-md backdrop-blur-md ${
              isDarkMode 
                ? 'border-neutral-700/80 bg-neutral-900/90 text-neutral-200 hover:text-white hover:bg-neutral-800' 
                : 'border-neutral-300/80 bg-white/90 text-neutral-800 hover:text-black hover:bg-neutral-100 shadow-sm'
            }`}
            title="Open Mundus Atlas"
          >
            <WindRoseLogo mini isDarkMode={isDarkMode} className="w-4 h-4 shrink-0 transition-transform duration-500 ease-out group-hover:rotate-90" />
            <span className="truncate">Mundus Atlas</span>
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <main 
        ref={startMenuContentRef} 
        onMouseDown={handleContainerMouseDown}
        className="flex-1 overflow-y-auto p-6 md:p-10 select-none relative pt-16 md:pt-10"
      >
        {/* Tab 1: Files & Folders */}
        {activeTab === 'recent' && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Header with Title and Create Buttons */}
            <div className="flex flex-col items-center justify-center text-center mb-10 pb-10 border-b border-neutral-200 dark:border-neutral-800 relative z-10">
              <div className={`p-4 rounded-full border shadow-sm mb-4 relative ${isDarkMode ? 'bg-[#141414] border-neutral-700' : 'bg-white border-neutral-200'}`}>
                <Globe className="w-8 h-8 text-accent" />
              </div>
              <div className="px-4 flex flex-col items-center">
                <h1 className="text-3xl font-bold tracking-widest uppercase font-display flex items-center justify-center gap-4">
                  <span className="w-12 h-px bg-neutral-300 dark:bg-neutral-600"></span>
                  Mundus View
                  <span className="w-12 h-px bg-neutral-300 dark:bg-neutral-600"></span>
                </h1>
                {/* Current Mundus / World Name */}
                <p className="mt-2 text-sm sm:text-base font-serif tracking-[0.2em] uppercase text-neutral-600 dark:text-neutral-400">
                  {activeMundusProject?.name || 'Prima'}
                </p>
                {/* Lowered horizontal divider line below Mundus View header */}
                <div className="w-48 h-px bg-gradient-to-r from-transparent via-neutral-300 dark:via-neutral-700 to-transparent mx-auto mt-3" />
              </div>

              {/* Manuscript Quick Stats */}
              <div className="flex items-center justify-center gap-8 mt-6 mb-8 text-sm font-mono text-neutral-500 dark:text-neutral-400">
                <div className="flex flex-col items-center">
                  <span className="text-xl font-bold text-neutral-900 dark:text-white">{totalWords.toLocaleString()}</span>
                  <span className="text-[10px] uppercase tracking-wider mt-1">Total Words</span>
                </div>
                <div className="w-px h-8 bg-neutral-200 dark:bg-neutral-800" />
                <div className="flex flex-col items-center">
                  <span className="text-xl font-bold text-neutral-900 dark:text-white">{totalReadingTime}</span>
                  <span className="text-[10px] uppercase tracking-wider mt-1">Minutes Read</span>
                </div>
                <div className="w-px h-8 bg-neutral-200 dark:bg-neutral-800" />
                <div className="flex flex-col items-center">
                  <span className="text-xl font-bold text-neutral-900 dark:text-white">{folders.length} / {documents.length}</span>
                  <span className="text-[10px] uppercase tracking-wider mt-1">Folders / Docs</span>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap justify-center">
                {/* v0.8.3: Export Book — chains the Mundus into one PDF/DOCX/EPUB in book order */}
                <button
                  id="btn-start-export-book"
                  onClick={() => setIsExportBookOpen(true)}
                  title="Export this Mundus as a single book file (PDF, DOCX or EPUB) in your book order"
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all shadow-2xs ${
                    isDarkMode 
                      ? 'border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200' 
                      : 'border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Export Book</span>
                </button>
                {/* v0.8.3: Reorder mode — arrange folders, documents and loose files; order = book order */}
                <button
                  id="btn-start-reorder"
                  onClick={() => setIsReorderMode(!isReorderMode)}
                  title="Reorder mode: arrange folders and documents — this order drives Mundus View and Export Book"
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all shadow-2xs ${
                    isReorderMode
                      ? 'bg-accent text-white border-accent shadow-2xs'
                      : isDarkMode 
                        ? 'border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200' 
                        : 'border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800'
                  }`}
                >
                  <ArrowUpDown className="w-4 h-4" />
                  <span>{isReorderMode ? 'Reordering…' : 'Reorder'}</span>
                </button>
                {/* v0.7.93: backup this Mundus — moved here from the sidebar */}
                <button
                  id="btn-start-backup-mundus"
                  onClick={() => onBackupMundus?.()}
                  title="Backup this Mundus (documents, folders, characters, codex, map…)"
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all shadow-2xs ${
                    isDarkMode 
                      ? 'border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200' 
                      : 'border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800'
                  }`}
                >
                  <DatabaseBackup className="w-4 h-4" />
                  <span>Backup Mundus</span>
                </button>
                <button
                  id="btn-start-create-folder"
                  onClick={() => setIsCreatingFolder(!isCreatingFolder)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all shadow-2xs ${
                    isDarkMode 
                      ? 'border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200' 
                      : 'border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800'
                  }`}
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>New Folder</span>
                </button>

                <button
                  id="btn-start-create-blank"
                  onClick={() => {
                    onCreateDocument('blank');
                    onClose();
                  }}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-xs ${
                    isDarkMode 
                      ? 'bg-white text-black hover:bg-neutral-200' 
                      : 'bg-black text-white hover:bg-neutral-800'
                  }`}
                >
                  <Plus className="w-4 h-4" />
                  <span>New Document</span>
                </button>
              </div>
            </div>

            {/* Inline Folder Creation */}
            {isCreatingFolder && (
              <form 
                onSubmit={handleCreateFolder}
                className={`p-4 rounded-xl border flex flex-col sm:flex-row gap-2 items-center ${
                  isDarkMode ? 'bg-neutral-900/80 border-neutral-700' : 'bg-white border-neutral-200 shadow-sm'
                }`}
              >
                <FolderIcon className="w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Enter new folder name (e.g. Act II: The Crucible)..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className={`flex-1 text-sm px-3 py-1.5 rounded-md border focus:outline-none ${
                    isDarkMode ? 'bg-black border-neutral-700 text-white' : 'bg-neutral-50 border-neutral-300 text-black'
                  }`}
                />
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-md text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-black"
                  >
                    Create Folder
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreatingFolder(false)}
                    className="px-3 py-1.5 rounded-md text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* v0.8.3: Reorder mode banner */}
            {isReorderMode && (
              <div id="reorder-banner" className={`p-4 rounded-xl border flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between ${
                isDarkMode ? 'bg-neutral-900/80 border-accent/40' : 'bg-white border-accent/50 shadow-xs'
              }`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <ArrowUpDown className="w-4 h-4 text-accent shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">Reorder mode</h3>
                    <p className={`text-[11px] ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
                      Use the arrows on folders and files to arrange the book. This order is what Mundus View shows and what Export Book follows.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <div className={`flex items-center gap-0.5 p-0.5 rounded-lg border ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-100 border-neutral-300'}`}>
                    <span className={`text-[10px] uppercase tracking-wider px-1.5 font-semibold ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>Loose files</span>
                    <button
                      id="btn-loose-position-top"
                      onClick={() => onUpdateProject?.({ looseDocsPosition: 'top' })}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                        loosePosition === 'top'
                          ? isDarkMode ? 'bg-neutral-800 text-white shadow-2xs' : 'bg-white text-black shadow-2xs'
                          : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                      }`}
                    >
                      Top
                    </button>
                    <button
                      id="btn-loose-position-bottom"
                      onClick={() => onUpdateProject?.({ looseDocsPosition: 'bottom' })}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                        loosePosition === 'bottom'
                          ? isDarkMode ? 'bg-neutral-800 text-white shadow-2xs' : 'bg-white text-black shadow-2xs'
                          : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                      }`}
                    >
                      Bottom
                    </button>
                  </div>
                  <button
                    id="btn-reorder-done"
                    onClick={() => setIsReorderMode(false)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-black cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* Filter Bar and View Mode Switcher (hidden in reorder mode) */}
            {!isReorderMode && (
            <div className={`p-4 rounded-xl border flex flex-col md:flex-row gap-3 items-center justify-between backdrop-blur-md ${
              isDarkMode ? 'bg-[#141414]/90 border-neutral-800' : 'bg-white/90 border-neutral-200 shadow-xs'
            }`}>
              {/* Select Mode Button & Search Bar */}
              <div className="flex items-center gap-2.5 flex-1 w-full">
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
                      ? `${selectedDocIds.size} scene${selectedDocIds.size > 1 ? 's' : ''} selected. Drag selected scenes to a folder, or click to clear.`
                      : isSelectMode
                        ? "Exit selection mode"
                        : "Select multiple scenes (drag mouse or click to select)"
                  }
                  className={`min-w-[32px] h-8 px-1.5 rounded-full flex items-center justify-center shrink-0 border transition-all cursor-pointer text-xs font-bold leading-none ${
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
                    <Check className="w-4 h-4 stroke-[3]" />
                  ) : (
                    <Circle className="w-4 h-4 stroke-[2]" />
                  )}
                </button>

                <div className="relative flex-1 min-w-0">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Search titles or text..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none ${
                      isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-neutral-50 border-neutral-300 text-neutral-800'
                    }`}
                  />
                </div>
              </div>

              {/* View Switcher & Status Filters */}
              <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                {/* View Mode Toggle */}
                <div className={`p-0.5 rounded-lg border flex items-center ${
                  isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-100 border-neutral-300'
                }`}>
                  <button
                    onClick={() => setViewMode('folders')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                      viewMode === 'folders'
                        ? isDarkMode ? 'bg-neutral-800 text-white shadow-2xs' : 'bg-white text-black shadow-2xs'
                        : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                    }`}
                  >
                    <FolderTree className="w-3.5 h-3.5" />
                    <span>Folders</span>
                  </button>
                  <button
                    onClick={() => setViewMode('flat')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                      viewMode === 'flat'
                        ? isDarkMode ? 'bg-neutral-800 text-white shadow-2xs' : 'bg-white text-black shadow-2xs'
                        : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>All Files</span>
                  </button>
                </div>

                {/* Status Filter */}
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-neutral-50 border-neutral-300 text-neutral-800'
                  }`}
                >
                  <option value="all">All Statuses</option>
                  <option value="draft">Drafts</option>
                  <option value="revision">In Revision</option>
                  <option value="complete">Completed</option>
                </select>

                {/* Favorite filter toggle */}
                <button
                  onClick={() => setFilterFavorite(!filterFavorite)}
                  title={filterFavorite ? 'Show all' : 'Show starred only'}
                  className={`p-1.5 rounded-lg border transition-colors ${
                    filterFavorite
                      ? 'bg-neutral-900 text-white dark:bg-white dark:text-black border-neutral-900 dark:border-white'
                      : isDarkMode
                      ? 'border-neutral-700 text-neutral-400 hover:bg-neutral-800'
                      : 'border-neutral-300 text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  <Star className="w-4 h-4" />
                </button>
              </div>
            </div>
            )}

            {/* VIEW MODE 1: Hierarchical Folders View */}
            {viewMode === 'folders' ? (
              <div className="space-y-6">
                {/* v0.8.3: loose files render on TOP when the project asks for it */}
                {loosePosition === 'top' && renderLooseSection()}
                {/* Each Folder Section (v0.8.3: resolved book order) */}
                {bookLayout.folderGroups.map(({ folder, docs: scopeDocs }, groupIdx) => {
                  const rawFolderDocs = scopeDocs;
                  // v0.8.3: the folder view ALWAYS displays the resolved book
                  // order (reorder mode shows the full scope; normal mode keeps
                  // the active search/status filters on top of that order).
                  const folderDocs = isReorderMode
                    ? scopeDocs
                    : scopeDocs.filter((d) => filteredDocs.some((fd) => fd.id === d.id));
                  const isCollapsed = !!collapsedFolders[folder.id];
                  const isFirstFolder = groupIdx === 0;
                  const isLastFolder = groupIdx === bookLayout.folderGroups.length - 1;

                  return (
                    <div 
                      key={folder.id}
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
                      className={`rounded-xl border overflow-hidden transition-all ${
                        dragOverFolderId === folder.id
                          ? 'ring-2 ring-accent bg-accent/10'
                          : isDarkMode ? 'bg-[#141414]/80 border-neutral-800' : 'bg-white border-neutral-200 shadow-xs'
                      }`}
                    >
                      {/* Folder Card Header */}
                      <div className={`px-5 py-3.5 flex items-center justify-between border-b ${
                        isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
                      }`}>
                        <div 
                          className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                          onClick={() => toggleFolderCollapse(folder.id)}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-neutral-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-neutral-400" />
                          )}
                          <FolderIcon className="w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0" />
                          
                          {editingFolderId === folder.id ? (
                            <form onSubmit={(e) => handleRenameFolder(e, folder.id)} className="flex items-center gap-2">
                              <input
                                autoFocus
                                type="text"
                                value={editingFolderName}
                                onChange={(e) => setEditingFolderName(e.target.value)}
                                onBlur={(e) => handleRenameFolder(e, folder.id)}
                                className="text-sm font-semibold px-2 py-0.5 rounded border border-neutral-400 bg-white dark:bg-black"
                              />
                            </form>
                          ) : (
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <h2 className="text-sm font-semibold truncate text-neutral-900 dark:text-neutral-100">
                                  {folder.name}
                                </h2>
                                {folderDocs.length > 0 && folderDocs.every((d) => d.status === 'complete') && (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" title="All documents in this folder are complete" />
                                )}
                              </div>
                              {folder.description && (
                                <p className="text-[11px] text-neutral-400 truncate">
                                  {folder.description}
                                </p>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-2 ml-3 hidden sm:flex">
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-neutral-200/70 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                              {folderDocs.length} docs
                            </span>
                            <span className="text-[11px] font-mono text-neutral-500">
                              {folderDocs.reduce((acc, d) => acc + (d.wordCount || 0), 0).toLocaleString()} words
                            </span>
                            <span className="text-[11px] font-mono text-neutral-500 border-l border-neutral-300 dark:border-neutral-700 pl-2">
                              ~{Math.ceil(folderDocs.reduce((acc, d) => acc + (d.wordCount || 0), 0) / 200)} min read
                            </span>
                          </div>
                        </div>

                        {/* Folder Header Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isReorderMode && (
                            <div className="flex items-center gap-0.5 mr-0.5">
                              <button
                                onClick={() => handleMoveFolderInBook(folder.id, -1)}
                                disabled={isFirstFolder}
                                title="Move folder up in book order"
                                className="p-1 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-white disabled:opacity-25 disabled:cursor-default cursor-pointer"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleMoveFolderInBook(folder.id, 1)}
                                disabled={isLastFolder}
                                title="Move folder down in book order"
                                className="p-1 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-white disabled:opacity-25 disabled:cursor-default cursor-pointer"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => {
                              onCreateDocument('blank', folder.id);
                              onClose();
                            }}
                            title={`Create new document in ${folder.name}`}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                              isDarkMode 
                                ? 'border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200' 
                                : 'border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800'
                            }`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Add File</span>
                          </button>

                          <button
                            onClick={() => {
                              setEditingFolderId(folder.id);
                              setEditingFolderName(folder.name);
                            }}
                            title="Rename folder"
                            className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <DoubleClickDeleteButton
                            onDelete={() => onDeleteFolder(folder.id)}
                            title="Double click to delete folder"
                            className="p-1 rounded text-neutral-400 hover:text-red-500"
                            iconClassName="w-3.5 h-3.5"
                          />
                        </div>
                      </div>

                      {/* Folder Content List */}
                      {!isCollapsed && (
                        <div className="divide-y divide-neutral-200 dark:divide-neutral-800/80">
                          {folderDocs.map((doc, docIdx) => (
                            <DocumentRow
                              key={doc.id}
                              doc={doc}
                              isActive={doc.id === activeDocumentId}
                              isSelected={selectedDocIds.has(doc.id)}
                              isSelectMode={isSelectMode}
                              selectedDocIds={selectedDocIds}
                              folders={folders}
                              onToggleSelect={() => {
                                setSelectedDocIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(doc.id)) next.delete(doc.id);
                                  else next.add(doc.id);
                                  return next;
                                });
                              }}
                              onSelect={() => {
                                onSelectDocument(doc.id);
                                onClose();
                              }}
                              onToggleFav={() => onToggleFavorite(doc.id)}
                              onDuplicate={() => onDuplicateDocument(doc)}
                              onDelete={() => onDeleteDocument(doc.id)}
                              onMove={(targetFolderId) => onMoveDocument(doc.id, targetFolderId)}
                              onUpdateStatus={(st) => onUpdateDocument?.(doc.id, { status: st })}
                              onExport={(fmt) => handleExport(doc, fmt)}
                              isDarkMode={isDarkMode}
                              reorderControls={isReorderMode ? {
                                onMoveUp: () => handleMoveDocInBook(doc.id, -1),
                                onMoveDown: () => handleMoveDocInBook(doc.id, 1),
                                isFirst: docIdx === 0,
                                isLast: docIdx === folderDocs.length - 1,
                              } : undefined}
                            />
                          ))}
                          {folderDocs.length === 0 && (
                            <div className="p-6 text-center text-xs text-neutral-400 italic">
                              {rawFolderDocs.length === 0
                                ? 'This folder is empty. Click "+ Add File" above to draft a new scene.'
                                : filterStatus !== 'all'
                                  ? 'No document in this folder has the selected status'
                                  : 'No document in this folder matches the selected filter'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* v0.8.3: loose files below the folders (default position) */}
                {loosePosition === 'bottom' && renderLooseSection()}
              </div>
            ) : (
              /* VIEW MODE 2: Flat List of All Documents */
              <div className={`rounded-xl border divide-y overflow-hidden ${
                isDarkMode ? 'bg-[#141414] border-neutral-800 divide-neutral-800' : 'bg-white border-neutral-200 divide-neutral-200 shadow-xs'
              }`}>
                {filteredDocs.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    isActive={doc.id === activeDocumentId}
                    isSelected={selectedDocIds.has(doc.id)}
                    isSelectMode={isSelectMode}
                    selectedDocIds={selectedDocIds}
                    folders={folders}
                    onToggleSelect={() => {
                      setSelectedDocIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(doc.id)) next.delete(doc.id);
                        else next.add(doc.id);
                        return next;
                      });
                    }}
                    onSelect={() => {
                      onSelectDocument(doc.id);
                      onClose();
                    }}
                    onToggleFav={() => onToggleFavorite(doc.id)}
                    onDuplicate={() => onDuplicateDocument(doc)}
                    onDelete={() => onDeleteDocument(doc.id)}
                    onMove={(targetFolderId) => onMoveDocument(doc.id, targetFolderId)}
                    onUpdateStatus={(st) => onUpdateDocument?.(doc.id, { status: st })}
                    onExport={(fmt) => handleExport(doc, fmt)}
                    isDarkMode={isDarkMode}
                  />

                ))}
                {filteredDocs.length === 0 && (
                  <div className="p-8 text-center text-sm text-neutral-400">
                    No documents matching your search or filters.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: New Document Templates */}
        {activeTab === 'new' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight font-display">
                Create from Template
              </h1>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
                Start drafting with structured scene beats, chapter headings, or world dossiers.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Template 1: Blank Page */}
              <div 
                onClick={() => {
                  onCreateDocument('blank');
                  onClose();
                }}
                className={`p-6 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] ${
                  isDarkMode 
                    ? 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-600' 
                    : 'bg-white border-neutral-200 hover:border-neutral-400 shadow-xs'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 flex items-center justify-center mb-4">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold mb-1">Blank Manuscript</h3>
                <p className="text-xs text-neutral-500 mb-4 leading-relaxed">
                  A fresh, distraction-free page with standard serif margins and formatting.
                </p>
                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
                  Start writing <MoveRight className="w-3.5 h-3.5" />
                </span>
              </div>

              {/* Template 2: Chapter */}
              <div 
                onClick={() => {
                  onCreateDocument('chapter');
                  onClose();
                }}
                className={`p-6 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] ${
                  isDarkMode 
                    ? 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-600' 
                    : 'bg-white border-neutral-200 hover:border-neutral-400 shadow-xs'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 flex items-center justify-center mb-4">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold mb-1">Novel Chapter Scene</h3>
                <p className="text-xs text-neutral-500 mb-4 leading-relaxed">
                  Pre-configured with Chapter H1, scene setting note, and paragraph rhythm.
                </p>
                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
                  Use Chapter template <MoveRight className="w-3.5 h-3.5" />
                </span>
              </div>

              {/* Template 3: Worldbuilding */}
              <div 
                onClick={() => {
                  onCreateDocument('world');
                  onClose();
                }}
                className={`p-6 rounded-xl border cursor-pointer transition-all hover:scale-[1.02] ${
                  isDarkMode 
                    ? 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-600' 
                    : 'bg-white border-neutral-200 hover:border-neutral-400 shadow-xs'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 flex items-center justify-center mb-4">
                  <Globe className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold mb-1">World Lore Dossier</h3>
                <p className="text-xs text-neutral-500 mb-4 leading-relaxed">
                  Structured sections for geography, factions, magic systems, and history.
                </p>
                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
                  Use World template <MoveRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Manuscript Statistics */}
        {activeTab === 'info' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight font-display">
                Manuscript Metrics
              </h1>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
                Detailed statistics across all chapters, scenes, and folders in your project.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className={`p-5 rounded-xl border ${isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-white border-neutral-200 shadow-xs'}`}>
                <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Total Manuscript Words</p>
                <p className="text-3xl font-bold font-mono mt-2 text-neutral-900 dark:text-white">
                  {totalWords.toLocaleString()}
                </p>
                <p className="text-[11px] text-neutral-400 mt-1">~{Math.round(totalWords / 250)} standard paperback pages</p>
              </div>

              <div className={`p-5 rounded-xl border ${isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-white border-neutral-200 shadow-xs'}`}>
                <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Total Reading Time</p>
                <p className="text-3xl font-bold font-mono mt-2 text-neutral-900 dark:text-white">
                  {totalReadingTime} min
                </p>
                <p className="text-[11px] text-neutral-400 mt-1">At average 200 WPM reading pace</p>
              </div>

              <div className={`p-5 rounded-xl border ${isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-white border-neutral-200 shadow-xs'}`}>
                <p className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">Total Folders & Docs</p>
                <p className="text-3xl font-bold font-mono mt-2 text-neutral-900 dark:text-white">
                  {folders.length} / {documents.length}
                </p>
                <p className="text-[11px] text-neutral-400 mt-1">{folders.length} folders, {documents.length} total files</p>
              </div>
            </div>

            {/* Folder breakdown table */}
            <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-white border-neutral-200 shadow-xs'}`}>
              <div className={`px-5 py-3 border-b ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Folder Breakdown
                </h3>
              </div>
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {folders.map((f) => {
                  const fDocs = documents.filter((d) => d.folderId === f.id);
                  const fWords = fDocs.reduce((acc, d) => acc + (d.wordCount || 0), 0);
                  return (
                    <div key={f.id} className="px-5 py-3 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <FolderIcon className="w-4 h-4 text-neutral-400" />
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">{f.name}</span>
                        <span className="text-neutral-400">({fDocs.length} files)</span>
                      </div>
                      <span className="font-mono font-semibold">{fWords.toLocaleString()} words</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Rubberband / Marquee selection box overlay */}
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
      </main>

      {/* v0.8.3: Export Book dialog (fixed overlay, safe-area padded) */}
      <BookExportDialog
        isOpen={isExportBookOpen}
        onClose={() => setIsExportBookOpen(false)}
        documents={documents}
        folders={folders}
        activeMundusProject={activeMundusProject}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};

// Row component for rendering each document in list or folder view
interface DocumentRowProps {
  doc: NovelDocument;
  isActive: boolean;
  isSelected?: boolean;
  isSelectMode?: boolean;
  selectedDocIds?: Set<string>;
  folders: Folder[];
  onToggleSelect?: () => void;
  onSelect: () => void;
  onToggleFav: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (targetFolderId: string | undefined) => void;
  onUpdateStatus?: (status: DocumentStatus) => void;
  onExport: (format: 'txt' | 'md' | 'html' | 'mundus' | 'pdf' | 'docx') => void;
  // v0.8.3: shown only in Mundus View reorder mode (book order arrows)
  reorderControls?: {
    onMoveUp: () => void;
    onMoveDown: () => void;
    isFirst: boolean;
    isLast: boolean;
  };
  isDarkMode: boolean;
}

const DocumentRow: React.FC<DocumentRowProps> = ({
  doc,
  isActive,
  isSelected,
  isSelectMode,
  selectedDocIds,
  folders,
  onToggleSelect,
  onSelect,
  onToggleFav,
  onDuplicate,
  onDelete,
  onMove,
  onUpdateStatus,
  onExport,
  reorderControls,
  isDarkMode
}) => {

  const currentFolder = folders.find((f) => f.id === doc.folderId);

  return (
    <div
      data-startmenu-doc-id={doc.id}
      draggable={true}
      onDragStart={(e) => {
        const idsToDrag = isSelected && selectedDocIds && selectedDocIds.size > 0
          ? Array.from(selectedDocIds)
          : [doc.id];
        e.dataTransfer.setData('text/plain', idsToDrag.join(','));
        e.dataTransfer.setData('application/json', JSON.stringify(idsToDrag));
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`group px-5 py-3 flex items-center justify-between gap-4 transition-colors cursor-grab active:cursor-grabbing select-none ${
        isSelected
          ? 'ring-2 ring-accent bg-accent/15 dark:bg-accent/25 font-semibold shadow-xs'
          : isActive 
            ? isDarkMode ? 'bg-neutral-800/80 text-white' : 'bg-neutral-100/90 text-black' 
            : isDarkMode ? 'hover:bg-neutral-900/60' : 'hover:bg-neutral-50'
      }`}
    >
      {/* v0.8.3: book-order arrows (reorder mode only) */}
      {reorderControls && (
        <div className="flex flex-col gap-0 shrink-0 self-center" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={reorderControls.onMoveUp}
            disabled={reorderControls.isFirst}
            title="Move up in book order"
            aria-label="Move up in book order"
            className="p-0.5 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-white disabled:opacity-25 disabled:cursor-default cursor-pointer"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={reorderControls.onMoveDown}
            disabled={reorderControls.isLast}
            title="Move down in book order"
            aria-label="Move down in book order"
            className="p-0.5 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-white disabled:opacity-25 disabled:cursor-default cursor-pointer"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* File Info (Left: Scene name above, words count & reading time below) */}
      <div 
        className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
        onClick={(e) => {
          if (isSelectMode || e.shiftKey || e.metaKey || e.ctrlKey) {
            e.stopPropagation();
            onToggleSelect?.();
            return;
          }
          onSelect();
        }}
      >
        {isSelectMode ? (
          <div 
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.();
            }}
            className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-all cursor-pointer ${
              isSelected ? 'bg-accent border-accent text-white shadow-2xs' : 'border-neutral-400 hover:border-neutral-200'
            }`}
          >
            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
          </div>
        ) : (
          <FileText className={`w-4 h-4 shrink-0 ${isSelected ? 'text-accent' : isActive ? (isDarkMode ? 'text-white' : 'text-black') : 'text-neutral-400'}`} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold truncate text-neutral-900 dark:text-neutral-100">
              {doc.title}
            </h4>
            {isActive && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-900 text-white dark:bg-white dark:text-black shrink-0">
                Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
            <span className="font-mono">{(doc.wordCount || 0).toLocaleString()} words</span>
            <span>•</span>
            <span>~{doc.readingTimeMinutes} min</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">{new Date(doc.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Middle/Right: Status Dropdown & Chapter/Folder Dropdown (Middle on Desktop, right stacked on Mobile) */}
      <div className="flex flex-col items-end sm:flex-row sm:items-center gap-1 sm:gap-3 shrink-0">
        {/* Status indicator dropdown */}
        <select
          value={doc.status || 'draft'}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            if (onUpdateStatus) {
              onUpdateStatus(e.target.value as DocumentStatus);
            }
          }}
          title="Change document status"
          aria-label="Change document status"
          className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border cursor-pointer focus:outline-none transition-colors w-auto text-center ${
            doc.status === 'complete'
              ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/40'
              : doc.status === 'revision'
              ? 'bg-amber-500/15 text-amber-600 border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/40'
              : 'bg-neutral-500/10 text-neutral-600 border-neutral-400/40 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700'
          }`}
        >
          <option value="draft" className={isDarkMode ? 'bg-neutral-900 text-white' : 'bg-white text-black'}>draft</option>
          <option value="revision" className={isDarkMode ? 'bg-neutral-900 text-white' : 'bg-white text-black'}>revision</option>
          <option value="complete" className={isDarkMode ? 'bg-neutral-900 text-white' : 'bg-white text-black'}>complete</option>
        </select>

        {/* Chapter / Folder Dropdown */}
        <div className="relative flex items-center w-auto">
          <select
            value={doc.folderId || 'unfiled'}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              const val = e.target.value === 'unfiled' ? undefined : e.target.value;
              onMove(val);
            }}
            title="Move to Chapter / Folder"
            aria-label="Move file to chapter folder"
            className={`text-[11px] px-2 py-0.5 rounded border focus:outline-none cursor-pointer w-auto max-w-[110px] sm:max-w-[140px] truncate ${
              isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-300' : 'bg-white border-neutral-300 text-neutral-700'
            }`}
          >
            <option value="unfiled">Unfiled</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right: Action Buttons (2x2 grid on mobile: favorite, copy, download, delete) */}
      <div className="grid grid-cols-2 gap-0.5 sm:flex sm:flex-row sm:items-center sm:gap-1 shrink-0">
        {/* Star Button (Top-Left on Mobile) */}
        <button
          onClick={onToggleFav}
          title={doc.isFavorite ? 'Remove star' : 'Add star'}
          className="p-1 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-white flex items-center justify-center"
        >
          <Star className={`w-3.5 h-3.5 ${doc.isFavorite ? 'fill-current text-neutral-900 dark:text-white' : ''}`} />
        </button>

        {/* Duplicate Button (Top-Right on Mobile) */}
        <button
          onClick={onDuplicate}
          title="Duplicate document"
          className="p-1 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-white flex items-center justify-center"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>

        {/* Export options (Bottom-Left on Mobile) */}
        <button
          onClick={() => onExport('md')}
          title="Export as Markdown (.md)"
          className="p-1 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-white flex items-center justify-center"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        {/* Delete (Bottom-Right on Mobile) */}
        <DoubleClickDeleteButton
          onDelete={onDelete}
          title="Double click to delete document"
          className="p-1 rounded text-neutral-400 hover:text-red-500 flex items-center justify-center"
          iconClassName="w-3.5 h-3.5"
        />
      </div>
    </div>
  );
};
