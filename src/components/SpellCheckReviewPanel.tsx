import React, { useEffect, useRef } from 'react';
import { 
  CheckCircle2, 
  X, 
  BookOpen, 
  Sparkles, 
  Check, 
  ChevronRight,
  AlertTriangle
} from 'lucide-react';
import type { MisspelledWordInfo } from '../lib/spellCheckEngine';

interface SpellCheckReviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  misspellings: MisspelledWordInfo[];
  onReplaceWord: (originalWord: string, replacement: string) => void;
  onAddToDictionary: (word: string) => void;
  onIgnoreWord: (word: string) => void;
  onOpenDictionaryModal: () => void;
  highlightInDoc?: boolean;
  onToggleHighlightInDoc?: () => void;
  isDarkMode: boolean;
}

export const SpellCheckReviewPanel: React.FC<SpellCheckReviewPanelProps> = ({
  isOpen,
  onClose,
  misspellings,
  onReplaceWord,
  onAddToDictionary,
  onIgnoreWord,
  onOpenDictionaryModal,
  isDarkMode
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      // Don't close if clicking the toggle button in toolbar
      const toggleBtn = document.getElementById('toolbar-spellcheck-btn');
      if (toggleBtn && toggleBtn.contains(e.target as Node)) {
        return;
      }
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      id="spellcheck-review-panel"
      ref={panelRef}
      className={`fixed sm:absolute bottom-0 right-0 sm:top-0 sm:bottom-auto w-full sm:w-96 sm:h-full z-40 flex flex-col border-t sm:border-t-0 sm:border-l shadow-2xl backdrop-blur-md transition-all duration-200 ${
        isDarkMode 
          ? 'bg-[#141414]/95 border-neutral-800 text-neutral-100 shadow-[0_10px_40px_rgba(0,0,0,0.8)]' 
          : 'bg-white/95 border-neutral-200 text-neutral-900 shadow-[0_10px_40px_rgba(0,0,0,0.15)]'
      }`}
      style={{ maxHeight: 'calc(100vh - 4rem)' }}
    >
      {/* Panel Header */}
      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {misspellings.length > 0 && (
            <div className="p-1.5 rounded-lg border bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold tracking-tight flex items-center gap-1.5">
              <span>Spelling Review</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                misspellings.length > 0
                  ? 'bg-red-500/15 text-red-600 dark:text-red-400 font-semibold'
                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              }`}>
                {misspellings.length} {misspellings.length === 1 ? 'flag' : 'flags'}
              </span>
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            title="Close review panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>



      {/* Misspelled Words List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {misspellings.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2.5 opacity-90" />
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              No Spelling Issues Found!
            </h4>
          </div>
        ) : (
          misspellings.map((item) => (
            <div
              key={item.word}
              className={`p-3.5 rounded-xl border transition-all ${
                isDarkMode 
                  ? 'bg-neutral-900/50 border-neutral-800 hover:border-neutral-700' 
                  : 'bg-white border-neutral-200 hover:border-neutral-300 shadow-2xs'
              }`}
            >
              {/* Flagged Word & Count */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span 
                    className="font-mono font-bold text-sm tracking-wide text-red-600 dark:text-red-400 underline decoration-wavy decoration-red-500 decoration-1"
                    style={{ textUnderlineOffset: '3px' }}
                  >
                    {item.word}
                  </span>
                  {item.count > 1 && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-200/80 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                      {item.count}x in doc
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onAddToDictionary(item.word)}
                    title="Add to Custom Dictionary so it's never flagged again"
                    className="px-2 py-0.5 rounded text-[11px] font-medium border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
                  >
                    + Add
                  </button>
                  <button
                    onClick={() => onIgnoreWord(item.word)}
                    title="Ignore for this session"
                    className="px-2 py-0.5 rounded text-[11px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer"
                  >
                    Ignore
                  </button>
                </div>
              </div>

              {/* In-context snippet */}
              {item.contexts.length > 0 && (
                <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400 italic bg-neutral-100/60 dark:bg-neutral-950/60 p-2 rounded-lg font-serif">
                  "{item.contexts[0]}"
                </div>
              )}

              {/* Suggestions */}
              <div className="mt-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block mb-1.5">
                  Suggested Corrections:
                </span>
                {item.suggestions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {item.suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => onReplaceWord(item.word, suggestion)}
                        title={`Replace with '${suggestion}'`}
                        className={`px-2.5 py-1 text-xs font-mono font-medium rounded-lg border flex items-center gap-1 transition-all cursor-pointer ${
                          isDarkMode
                            ? 'bg-neutral-800/90 border-neutral-700 text-neutral-100 hover:bg-neutral-700 hover:border-neutral-500'
                            : 'bg-neutral-100 border-neutral-300 text-neutral-900 hover:bg-neutral-200 hover:border-neutral-400'
                        }`}
                      >
                        <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                        <span>{suggestion}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-neutral-400 italic">
                    No automatic suggestions. You can add it to your novelist dictionary if it's a fantasy name or fictional place!
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
