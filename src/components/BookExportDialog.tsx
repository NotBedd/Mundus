import React, { useMemo, useRef, useState, useEffect } from 'react';
import { BookOpen, FileText, Globe, X, Check } from 'lucide-react';
import type { Folder, MundusProject, NovelDocument } from '../types';
import { bookDocumentSequence, resolveBookLayout } from '../lib/bookOrder';
import { exportBook, type BookExportFormat } from '../lib/bookExport';

/* ==================================================================
   v0.8.3 — Export Book dialog (lives inside Mundus View).

   Shows the resolved book sequence (folders as toggle groups, loose
   files as their own group per the project's looseDocsPosition), plus
   the export options: format (PDF / DOCX / EPUB), chapter headings
   from document titles, title page with book title + author.
   ================================================================== */

interface BookExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documents: NovelDocument[];
  folders: Folder[];
  activeMundusProject?: MundusProject | null;
  isDarkMode: boolean;
}

interface BookExportPrefs {
  authorName: string;
  includeTitlePage: boolean;
  includeChapterHeadings: boolean;
  includeToc: boolean;
}

const PREFS_KEY = 'mundus_book_export_prefs';

function loadPrefs(): BookExportPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        authorName: typeof parsed.authorName === 'string' ? parsed.authorName : '',
        includeTitlePage: parsed.includeTitlePage !== false,
        includeChapterHeadings: parsed.includeChapterHeadings !== false,
        includeToc: parsed.includeToc !== false,
      };
    }
  } catch (e) {}
  return { authorName: '', includeTitlePage: true, includeChapterHeadings: true, includeToc: true };
}

/** Tri-state checkbox (folder = all of its documents). */
const TriCheckbox: React.FC<{
  checked: boolean;
  indeterminate: boolean;
  onToggle: () => void;
  isDarkMode: boolean;
  testId?: string;
}> = ({ checked, indeterminate, onToggle, isDarkMode, testId }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      data-testid={testId}
      checked={checked}
      onChange={onToggle}
      className={`w-4 h-4 rounded cursor-pointer accent-current shrink-0 ${
        isDarkMode ? 'accent-amber-500' : 'accent-neutral-900'
      }`}
    />
  );
};

export const BookExportDialog: React.FC<BookExportDialogProps> = ({
  isOpen,
  onClose,
  documents,
  folders,
  activeMundusProject,
  isDarkMode,
}) => {
  const [format, setFormat] = useState<BookExportFormat>('pdf');
  const [bookTitle, setBookTitle] = useState<string>('');
  const [authorName, setAuthorName] = useState<string>('');
  const [includeTitlePage, setIncludeTitlePage] = useState(true);
  const [includeChapterHeadings, setIncludeChapterHeadings] = useState(true);
  const [includeToc, setIncludeToc] = useState(true);
  const [includedIds, setIncludedIds] = useState<Set<string>>(() => new Set(documents.map((d) => d.id)));
  const [isExporting, setIsExporting] = useState(false);
  const prefsLoadedRef = useRef(false);

  const layout = useMemo(
    () => resolveBookLayout(documents, folders, activeMundusProject),
    [documents, folders, activeMundusProject]
  );
  const sequence = useMemo(() => bookDocumentSequence(layout), [layout]);

  // Seed from prefs + project name each time the dialog opens
  useEffect(() => {
    if (!isOpen || prefsLoadedRef.current) return;
    prefsLoadedRef.current = true;
    const prefs = loadPrefs();
    setAuthorName(prefs.authorName);
    setIncludeTitlePage(prefs.includeTitlePage);
    setIncludeChapterHeadings(prefs.includeChapterHeadings);
    setIncludeToc(prefs.includeToc);
    setBookTitle(activeMundusProject?.name || '');
    setIncludedIds(new Set(documents.map((d) => d.id)));
    setFormat('pdf');
  }, [isOpen, activeMundusProject?.name, documents]);

  useEffect(() => {
    if (!isOpen) prefsLoadedRef.current = false;
  }, [isOpen]);

  const savePrefs = (patch: Partial<BookExportPrefs>) => {
    try {
      const current = loadPrefs();
      localStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...patch }));
    } catch (e) {}
  };

  if (!isOpen) return null;

  const includedCount = sequence.filter((d) => includedIds.has(d.id)).length;

  const toggleDoc = (docId: string) => {
    setIncludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const toggleGroup = (docIds: string[]) => {
    const allOn = docIds.every((id) => includedIds.has(id));
    setIncludedIds((prev) => {
      const next = new Set(prev);
      docIds.forEach((id) => {
        if (allOn) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const handleExport = async () => {
    if (isExporting || includedCount === 0) return;
    setIsExporting(true);
    try {
      const chapters = sequence.filter((d) => includedIds.has(d.id));
      await exportBook(chapters, {
        format,
        bookTitle: bookTitle.trim() || activeMundusProject?.name || 'Untitled Book',
        authorName,
        includeTitlePage,
        includeChapterHeadings,
        includeToc,
        pageFormat: activeMundusProject?.pageFormat || null,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const cardCls = isDarkMode
    ? 'bg-[#141414] border-neutral-800 text-neutral-100'
    : 'bg-white border-neutral-200 text-neutral-900';
  const subCls = isDarkMode ? 'text-neutral-400' : 'text-neutral-500';
  const rowHover = isDarkMode ? 'hover:bg-neutral-900/60' : 'hover:bg-neutral-50';
  const inputCls = isDarkMode
    ? 'bg-neutral-900 border-neutral-700 text-neutral-100'
    : 'bg-neutral-50 border-neutral-300 text-neutral-900';

  const formatButtons: { id: BookExportFormat; label: string }[] = [
    { id: 'pdf', label: 'PDF' },
    { id: 'docx', label: 'DOCX' },
    { id: 'epub', label: 'EPUB' },
  ];

  const renderDocRow = (doc: NovelDocument) => {
    const checked = includedIds.has(doc.id);
    return (
      <div
        key={doc.id}
        data-bookexport-doc-id={doc.id}
        className={`flex items-center gap-2.5 px-4 py-2 ${rowHover}`}
      >
        <TriCheckbox
          checked={checked}
          indeterminate={false}
          onToggle={() => toggleDoc(doc.id)}
          isDarkMode={isDarkMode}
          testId={`bookexport-doc-${doc.id}`}
        />
        <span className="text-xs font-medium truncate flex-1 min-w-0">{doc.title || 'Untitled Document'}</span>
        <span className={`text-[10px] font-mono shrink-0 ${subCls}`}>{(doc.wordCount || 0).toLocaleString()} words</span>
      </div>
    );
  };

  const renderGroupHeader = (label: string, docIds: string[], icon?: React.ReactNode, testId?: string) => {
    const includedInGroup = docIds.filter((id) => includedIds.has(id)).length;
    const checked = docIds.length > 0 && includedInGroup === docIds.length;
    const indeterminate = includedInGroup > 0 && includedInGroup < docIds.length;
    return (
      <div className={`flex items-center gap-2.5 px-4 py-2 border-b ${isDarkMode ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50/80'}`}>
        <TriCheckbox
          checked={checked}
          indeterminate={indeterminate}
          onToggle={() => docIds.length > 0 && toggleGroup(docIds)}
          isDarkMode={isDarkMode}
          testId={testId}
        />
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider truncate flex-1 min-w-0">{label}</span>
        <span className={`text-[10px] font-mono shrink-0 ${subCls}`}>
          {includedInGroup}/{docIds.length}
        </span>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-[2px] p-4 overflow-y-auto"
      style={{ paddingTop: 'max(1rem, var(--mundus-safe-top-effective, 0px))' }}
    >
      <div className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl my-auto ${cardCls}`}>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-accent" />
            <h3 className="font-serif text-lg font-semibold tracking-tight">Export Book</h3>
          </div>
          <button
            id="btn-bookexport-close"
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format picker */}
        <div className="mt-4">
          <p className={`text-[10px] font-mono font-semibold uppercase tracking-wider mb-1.5 ${subCls}`}>Format</p>
          <div className={`p-0.5 rounded-lg border inline-flex ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-neutral-100 border-neutral-300'}`}>
            {formatButtons.map((f) => (
              <button
                key={f.id}
                id={`btn-bookexport-format-${f.id}`}
                onClick={() => setFormat(f.id)}
                className={`px-4 py-1.5 rounded-md text-xs font-bold tracking-wide transition-all cursor-pointer ${
                  format === f.id
                    ? isDarkMode
                      ? 'bg-neutral-800 text-white shadow-2xs'
                      : 'bg-white text-black shadow-2xs'
                    : `${subCls} hover:text-current`
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title & author */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className={`text-[10px] font-mono font-semibold uppercase tracking-wider mb-1.5 ${subCls}`}>Book title</p>
            <input
              id="input-bookexport-title"
              type="text"
              value={bookTitle}
              onChange={(e) => setBookTitle(e.target.value)}
              placeholder={activeMundusProject?.name || 'Book title'}
              className={`w-full text-xs px-3 py-1.5 rounded-lg border focus:outline-none ${inputCls}`}
            />
          </div>
          <div>
            <p className={`text-[10px] font-mono font-semibold uppercase tracking-wider mb-1.5 ${subCls}`}>Author name</p>
            <input
              id="input-bookexport-author"
              type="text"
              value={authorName}
              onChange={(e) => {
                setAuthorName(e.target.value);
                savePrefs({ authorName: e.target.value });
              }}
              placeholder="Optional"
              className={`w-full text-xs px-3 py-1.5 rounded-lg border focus:outline-none ${inputCls}`}
            />
          </div>
        </div>

        {/* Options */}
        <div className="mt-4 space-y-1.5">
          {(
            [
              ['bookexport-opt-titlepage', includeTitlePage, (v: boolean) => { setIncludeTitlePage(v); savePrefs({ includeTitlePage: v }); }, 'Title page (book title & author)'],
              ['bookexport-opt-toc', includeToc, (v: boolean) => { setIncludeToc(v); savePrefs({ includeToc: v }); }, 'Chapter list page (table of contents)'],
              ['bookexport-opt-headings', includeChapterHeadings, (v: boolean) => { setIncludeChapterHeadings(v); savePrefs({ includeChapterHeadings: v }); }, 'Use document titles as chapter headings'],
            ] as [string, boolean, (v: boolean) => void, string][]
          ).map(([testId, value, setter, label]) => (
            <label
              key={testId}
              data-testid={testId}
              className="flex items-center gap-2.5 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => setter(e.target.checked)}
                className={`w-4 h-4 rounded cursor-pointer shrink-0 ${isDarkMode ? 'accent-amber-500' : 'accent-neutral-900'}`}
              />
              <span className="text-xs">{label}</span>
            </label>
          ))}
        </div>

        {/* Include list (book order) */}
        <div className="mt-4">
          <p className={`text-[10px] font-mono font-semibold uppercase tracking-wider mb-1.5 ${subCls}`}>
            Chapters — in book order ({includedCount}/{sequence.length} included)
          </p>
          <div className={`rounded-xl border overflow-hidden max-h-56 overflow-y-auto ${isDarkMode ? 'border-neutral-800' : 'border-neutral-200'}`}>
            {layout.loosePosition === 'top' && layout.looseDocs.length > 0 && (
              <>
                {renderGroupHeader('Loose files', layout.looseDocs.map((d) => d.id), <FileText className="w-3.5 h-3.5 text-neutral-400" />, 'bookexport-group-loose')}
                {layout.looseDocs.map(renderDocRow)}
              </>
            )}
            {layout.folderGroups.map((group) =>
              group.docs.length > 0 ? (
                <React.Fragment key={group.folder.id}>
                  {renderGroupHeader(group.folder.name, group.docs.map((d) => d.id), <Globe className="w-3.5 h-3.5 text-neutral-400" />, `bookexport-group-${group.folder.id}`)}
                  {group.docs.map(renderDocRow)}
                </React.Fragment>
              ) : null
            )}
            {layout.loosePosition === 'bottom' && layout.looseDocs.length > 0 && (
              <>
                {renderGroupHeader('Loose files', layout.looseDocs.map((d) => d.id), <FileText className="w-3.5 h-3.5 text-neutral-400" />, 'bookexport-group-loose')}
                {layout.looseDocs.map(renderDocRow)}
              </>
            )}
            {sequence.length === 0 && (
              <div className="p-6 text-center text-xs text-neutral-400 italic">This Mundus has no documents yet.</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            id="btn-bookexport-run"
            type="button"
            disabled={isExporting || includedCount === 0}
            onClick={() => void handleExport()}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-1.5"
          >
            {isExporting ? (
              <>
                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Exporting…
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                Export {format.toUpperCase()}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
