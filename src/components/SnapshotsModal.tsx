import React, { useState } from 'react';
import { 
  History, 
  X, 
  Bookmark, 
  RotateCcw, 
  Trash2, 
  Check, 
  Calendar, 
  FileText, 
  AlertCircle,
  Eye,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon
} from 'lucide-react';
import type { DocumentSnapshot, NovelDocument } from '../types';

interface SnapshotsModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: NovelDocument;
  snapshots: DocumentSnapshot[];
  onCreateSnapshot: (name: string, description?: string) => Promise<void>;
  onRestoreSnapshot: (snapshot: DocumentSnapshot) => Promise<void>;
  onDeleteSnapshot: (snapshotId: string) => Promise<void>;
  isDarkMode: boolean;
}

export const SnapshotsModal: React.FC<SnapshotsModalProps> = ({
  isOpen,
  onClose,
  document,
  snapshots,
  onCreateSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
  isDarkMode
}) => {
  const [newSnapshotName, setNewSnapshotName] = useState('');
  const [newSnapshotDesc, setNewSnapshotDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [previewSnapshotId, setPreviewSnapshotId] = useState<string | null>(null);
  const [restoringSnapshotId, setRestoringSnapshotId] = useState<string | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [justCreatedSuccess, setJustCreatedSuccess] = useState(false);

  if (!isOpen) return null;

  const filteredSnapshots = (snapshots || []).filter(
    (s) => s && (s.documentId === document.id || !s.documentId)
  );

  const defaultSuggestedName = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Checkpoint · ${dateStr} ${timeStr}`;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSnapshotName.trim() || defaultSuggestedName();
    setIsCreating(true);
    try {
      await onCreateSnapshot(name, newSnapshotDesc.trim() || undefined);
      setNewSnapshotName('');
      setNewSnapshotDesc('');
      setJustCreatedSuccess(true);
      setTimeout(() => setJustCreatedSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to create snapshot:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleExecuteRestore = async (snapshot: DocumentSnapshot) => {
    setRestoringSnapshotId(snapshot.id);
    try {
      await onRestoreSnapshot(snapshot);
      setConfirmRestoreId(null);
      onClose();
    } catch (err) {
      console.error('Failed to restore snapshot:', err);
    } finally {
      setRestoringSnapshotId(null);
    }
  };

  return (
    <div 
      id="snapshots-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div 
        id="snapshots-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all duration-150 ${
          isDarkMode
            ? 'bg-[#141414] border-neutral-800 text-neutral-100 shadow-[0_20px_50px_rgba(0,0,0,0.8)]'
            : 'bg-white border-neutral-200 text-neutral-900 shadow-[0_20px_50px_rgba(0,0,0,0.12)]'
        }`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg border ${
              isDarkMode ? 'bg-neutral-900 border-neutral-700 text-neutral-100' : 'bg-neutral-100 border-neutral-300 text-neutral-800'
            }`}>
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">Document Checkpoints</h2>
              <p className={`text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
                Snapshots for <span className={`font-semibold ${isDarkMode ? 'text-neutral-200' : 'text-neutral-950'}`}>"{document.title || 'Untitled'}"</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Create Checkpoint Form */}
          <div className={`p-4 rounded-xl border ${
            isDarkMode ? 'bg-neutral-900/50 border-neutral-800' : 'bg-neutral-50/80 border-neutral-200'
          }`}>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Create New Checkpoint
              </span>
              <span className="text-xs font-mono text-neutral-400">
                Current text: {document.wordCount.toLocaleString()} words
              </span>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="input-checkpoint-name"
                  type="text"
                  placeholder={defaultSuggestedName()}
                  value={newSnapshotName}
                  onChange={(e) => setNewSnapshotName(e.target.value)}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border focus:outline-none transition-colors ${
                    isDarkMode 
                      ? 'bg-neutral-900 border-neutral-700 text-neutral-100 focus:border-neutral-500' 
                      : 'bg-white border-neutral-300 text-neutral-900 focus:border-neutral-500'
                  }`}
                />
                <button
                  type="submit"
                  disabled={isCreating}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg shrink-0 flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    isDarkMode
                      ? 'bg-neutral-100 hover:bg-white text-neutral-900'
                      : 'bg-neutral-900 hover:bg-black text-white'
                  }`}
                >
                  {isCreating ? (
                    'Saving...'
                  ) : justCreatedSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Saved!
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-3.5 h-3.5" />
                      Take Checkpoint
                    </>
                  )}
                </button>
              </div>

              <input
                id="input-checkpoint-desc"
                type="text"
                placeholder="Optional description / note (e.g. 'Before rewriting scene 2')"
                value={newSnapshotDesc}
                onChange={(e) => setNewSnapshotDesc(e.target.value)}
                className={`w-full px-3 py-1.5 text-xs rounded-lg border focus:outline-none transition-colors ${
                  isDarkMode 
                    ? 'bg-neutral-900/60 border-neutral-700/80 text-neutral-300 focus:border-neutral-500' 
                    : 'bg-white/80 border-neutral-300/80 text-neutral-700 focus:border-neutral-500'
                }`}
              />
            </form>
          </div>

          {/* Existing Checkpoints List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Saved Checkpoints ({filteredSnapshots.length})
              </h3>
              <span className="text-[11px] text-neutral-400">
                Synced with Cloud & Local Storage
              </span>
            </div>

            {filteredSnapshots.length === 0 ? (
              <div className={`py-12 px-4 rounded-xl border border-dashed text-center ${
                isDarkMode ? 'border-neutral-800 text-neutral-500' : 'border-neutral-300 text-neutral-400'
              }`}>
                <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">No checkpoints saved yet</p>
                <p className="text-xs mt-1 max-w-sm mx-auto">
                  Take a snapshot anytime you want to freeze a version before major edits, revisions, or deletions.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSnapshots.map((snap) => {
                  const snapDate = new Date(snap.createdAt);
                  const wordDiff = snap.wordCount - document.wordCount;
                  const isPreviewing = previewSnapshotId === snap.id;
                  const isConfirmingRestore = confirmRestoreId === snap.id;

                  return (
                    <div
                      key={snap.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isDarkMode
                          ? 'bg-neutral-900/40 border-neutral-800 hover:border-neutral-700'
                          : 'bg-white border-neutral-200 hover:border-neutral-300 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm truncate text-neutral-900 dark:text-neutral-100">
                              {snap.name}
                            </span>
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-neutral-200/70 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                              {snap.wordCount.toLocaleString()} words
                            </span>
                            {wordDiff !== 0 && (
                              <span className={`text-[10px] font-mono font-medium ${
                                wordDiff > 0 ? 'text-emerald-500' : 'text-neutral-400'
                              }`}>
                                {wordDiff > 0 ? `+${wordDiff}` : wordDiff} words vs now
                              </span>
                            )}
                          </div>

                          {snap.description && (
                            <p className="text-xs text-neutral-500 mt-1 italic">
                              "{snap.description}"
                            </p>
                          )}

                          <div className="flex items-center gap-3 mt-2 text-[11px] text-neutral-400">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {snapDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at {snapDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span>·</span>
                            <span>{snap.characterCount.toLocaleString()} chars</span>
                            {snap.visualImages && snap.visualImages.length > 0 && (
                              <>
                                <span>·</span>
                                <span className="flex items-center gap-1 text-amber-500 font-medium">
                                  <ImageIcon className="w-3 h-3" />
                                  {snap.visualImages.length} {snap.visualImages.length === 1 ? 'image' : 'images'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => setPreviewSnapshotId(isPreviewing ? null : snap.id)}
                            title="Preview Content"
                            className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
                          >
                            {isPreviewing ? <ChevronUp className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            onClick={() => setConfirmRestoreId(isConfirmingRestore ? null : snap.id)}
                            title="Revert document to this snapshot"
                            className={`px-2.5 py-1 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                              isConfirmingRestore
                                ? 'bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400'
                                : isDarkMode
                                  ? 'border-neutral-700 hover:bg-neutral-800 text-neutral-300'
                                  : 'border-neutral-300 hover:bg-neutral-100 text-neutral-700'
                            }`}
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Revert</span>
                          </button>

                          <button
                            onClick={() => onDeleteSnapshot(snap.id)}
                            title="Delete snapshot"
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Restore Confirmation Accordion */}
                      {isConfirmingRestore && (
                        <div className={`mt-3 p-3 rounded-lg border text-xs ${
                          isDarkMode
                            ? 'bg-neutral-950/80 border-amber-500/30 text-neutral-300'
                            : 'bg-amber-50/70 border-amber-300/60 text-neutral-800'
                        }`}>
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="font-semibold text-amber-700 dark:text-amber-400">
                                Revert document to "{snap.name}"?
                              </p>
                              <p className="mt-0.5 text-neutral-500 text-[11px]">
                                Your current writing will be replaced with this version. A safety checkpoint of your current document will be automatically saved before reverting.
                              </p>
                              <div className="flex items-center gap-2 mt-2.5">
                                <button
                                  onClick={() => handleExecuteRestore(snap)}
                                  disabled={restoringSnapshotId === snap.id}
                                  className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium text-xs transition-colors cursor-pointer"
                                >
                                  {restoringSnapshotId === snap.id ? 'Reverting...' : 'Yes, Revert Content'}
                                </button>
                                <button
                                  onClick={() => setConfirmRestoreId(null)}
                                  className="px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 text-xs transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Preview Snapshot Content Drawer */}
                      {isPreviewing && (
                        <div className={`mt-3 p-3.5 rounded-lg border text-xs font-serif leading-relaxed max-h-52 overflow-y-auto ${
                          isDarkMode
                            ? 'bg-neutral-950 border-neutral-800 text-neutral-300'
                            : 'bg-neutral-50 border-neutral-200 text-neutral-700'
                        }`}>
                          <div className="text-[10px] font-mono uppercase text-neutral-400 mb-1.5">
                            Snapshot Preview
                          </div>
                          <div 
                            dangerouslySetInnerHTML={{ __html: snap.content }}
                            className="novel-editor-preview prose prose-neutral dark:prose-invert max-w-none text-xs"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0 text-xs text-neutral-400">
          <span>Checkpoints are preserved in your private Firestore library.</span>
          <button
            onClick={onClose}
            className={`px-3 py-1.5 rounded-lg border transition-colors ${
              isDarkMode
                ? 'border-neutral-700 hover:bg-neutral-800 text-neutral-200'
                : 'border-neutral-300 hover:bg-neutral-100 text-neutral-700'
            }`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
