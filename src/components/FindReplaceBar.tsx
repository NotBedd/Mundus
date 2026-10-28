import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Search, 
  ChevronUp, 
  ChevronDown, 
  X, 
  Replace, 
  CaseSensitive, 
  WholeWord,
  Check
} from 'lucide-react';

interface FindMatch {
  node: Text;
  startOffset: number;
  endOffset: number;
  range: Range;
}

interface FindReplaceBarProps {
  isOpen: boolean;
  onClose: () => void;
  editorRef: React.RefObject<HTMLDivElement | null>;
  isDarkMode: boolean;
  accentColor?: string;
  initialQuery?: string;
  onContentChange?: () => void;
}

export const FindReplaceBar: React.FC<FindReplaceBarProps> = ({
  isOpen,
  onClose,
  editorRef,
  isDarkMode,
  accentColor = '#8b5cf6',
  initialQuery = '',
  onContentChange,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [matches, setMatches] = useState<FindMatch[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [replaceFeedback, setReplaceFeedback] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear highlights helper
  const clearHighlights = useCallback(() => {
    if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
      try {
        (CSS as any).highlights.delete('search-results');
        (CSS as any).highlights.delete('search-current');
      } catch {}
    }
  }, []);

  // Scan editor DOM for all matches
  const performSearch = useCallback(() => {
    if (!editorRef.current || !query) {
      setMatches([]);
      setCurrentIndex(0);
      clearHighlights();
      return [];
    }

    const editor = editorRef.current;
    const treeWalker = window.document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const foundMatches: FindMatch[] = [];

    // Escape regex special chars
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flags = matchCase ? 'g' : 'gi';
    const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch {
      return [];
    }

    let node: Node | null;
    while ((node = treeWalker.nextNode())) {
      const textNode = node as Text;
      const text = textNode.nodeValue || '';
      if (!text) continue;

      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        try {
          const range = window.document.createRange();
          range.setStart(textNode, match.index);
          range.setEnd(textNode, match.index + match[0].length);
          foundMatches.push({
            node: textNode,
            startOffset: match.index,
            endOffset: match.index + match[0].length,
            range,
          });
        } catch {}
        if (match.index === regex.lastIndex) regex.lastIndex++;
      }
    }

    setMatches(foundMatches);
    setCurrentIndex((prev) => (foundMatches.length === 0 ? 0 : Math.min(prev, foundMatches.length - 1)));
    return foundMatches;
  }, [query, matchCase, wholeWord, editorRef, clearHighlights]);

  // Update CSS Highlights when matches or currentIndex change
  const applyHighlights = useCallback((matchList: FindMatch[], activeIdx: number) => {
    if (typeof CSS !== 'undefined' && 'highlights' in CSS) {
      try {
        if (matchList.length === 0) {
          clearHighlights();
          return;
        }

        const allRanges = matchList.map((m) => m.range);
        const resultsHighlight = new (window as any).Highlight(...allRanges);
        (CSS as any).highlights.set('search-results', resultsHighlight);

        if (matchList[activeIdx]) {
          const currentHighlight = new (window as any).Highlight(matchList[activeIdx].range);
          (CSS as any).highlights.set('search-current', currentHighlight);
        } else {
          (CSS as any).highlights.delete('search-current');
        }
      } catch (e) {
        console.warn('Highlight API error during find:', e);
      }
    }
  }, [clearHighlights]);

  // Scroll active match into viewport smoothly
  const scrollToMatch = useCallback((match: FindMatch | undefined) => {
    if (!match) return;
    try {
      const parent = match.range.startContainer.parentElement;
      if (parent) {
        parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch {}
  }, []);

  // Run search whenever query or options change
  useEffect(() => {
    if (!isOpen) {
      clearHighlights();
      return;
    }
    const found = performSearch();
    applyHighlights(found, currentIndex);
    if (found.length > 0) {
      scrollToMatch(found[currentIndex]);
    }
  }, [isOpen, query, matchCase, wholeWord, performSearch, applyHighlights, currentIndex, scrollToMatch, clearHighlights]);

  // When bar opens or initialQuery changes, focus input
  useEffect(() => {
    if (isOpen) {
      if (initialQuery) {
        setQuery(initialQuery);
      }
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 50);
    } else {
      clearHighlights();
    }
  }, [isOpen, initialQuery, clearHighlights]);

  // Clean up highlights on unmount
  useEffect(() => {
    return () => {
      clearHighlights();
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    };
  }, [clearHighlights]);

  // Navigation handlers
  const handleNext = () => {
    if (matches.length === 0) return;
    const nextIdx = (currentIndex + 1) % matches.length;
    setCurrentIndex(nextIdx);
    applyHighlights(matches, nextIdx);
    scrollToMatch(matches[nextIdx]);
  };

  const handlePrev = () => {
    if (matches.length === 0) return;
    const prevIdx = (currentIndex - 1 + matches.length) % matches.length;
    setCurrentIndex(prevIdx);
    applyHighlights(matches, prevIdx);
    scrollToMatch(matches[prevIdx]);
  };

  // Replace single match
  const handleReplaceCurrent = () => {
    if (matches.length === 0 || !matches[currentIndex]) return;
    const target = matches[currentIndex];
    
    // Replace text inside node
    const originalText = target.node.nodeValue || '';
    const updatedText = 
      originalText.slice(0, target.startOffset) + 
      replaceText + 
      originalText.slice(target.endOffset);
    
    target.node.nodeValue = updatedText;
    
    // Notify parent to save / update stats
    onContentChange?.();

    // Re-run search and stay on current or next match
    const remaining = performSearch();
    const nextIdx = Math.min(currentIndex, Math.max(0, remaining.length - 1));
    setCurrentIndex(nextIdx);
    applyHighlights(remaining, nextIdx);
    if (remaining.length > 0) {
      scrollToMatch(remaining[nextIdx]);
    }
  };

  // Replace all matches
  const handleReplaceAll = () => {
    if (matches.length === 0) return;
    const totalToReplace = matches.length;

    // Replace in reverse order so node offsets remain valid
    for (let i = matches.length - 1; i >= 0; i--) {
      const target = matches[i];
      const originalText = target.node.nodeValue || '';
      const updatedText = 
        originalText.slice(0, target.startOffset) + 
        replaceText + 
        originalText.slice(target.endOffset);
      target.node.nodeValue = updatedText;
    }

    onContentChange?.();
    setReplaceFeedback(`Replaced ${totalToReplace} ${totalToReplace === 1 ? 'match' : 'matches'}`);
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => setReplaceFeedback(null), 2500);

    const remaining = performSearch();
    setCurrentIndex(0);
    applyHighlights(remaining, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      clearHighlights();
      onClose();
      editorRef.current?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrev();
      } else {
        handleNext();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="search"
      aria-label="Find and Replace in document"
      onKeyDown={handleKeyDown}
      className={`fixed top-16 md:top-20 right-2 md:right-6 left-2 sm:left-auto z-50 w-[calc(100vw-16px)] sm:w-auto min-w-[280px] max-w-[460px] p-2.5 rounded-xl shadow-2xl border transition-all duration-150 backdrop-blur-md ${
        isDarkMode 
          ? 'bg-neutral-900/95 border-neutral-700/80 text-neutral-100 shadow-black/60' 
          : 'bg-white/95 border-neutral-300/90 text-neutral-800 shadow-neutral-400/40'
      }`}
    >
      {/* Primary Find Row */}
      <div className="flex items-center gap-1.5">
        {/* Toggle Replace Button */}
        <button
          type="button"
          onClick={() => {
            setShowReplace(!showReplace);
            if (!showReplace) {
              setTimeout(() => replaceInputRef.current?.focus(), 50);
            }
          }}
          title={showReplace ? 'Hide Replace (Ctrl+H)' : 'Show Replace'}
          className={`p-1 rounded-md transition-colors cursor-pointer ${
            showReplace 
              ? 'text-accent bg-accent/15' 
              : isDarkMode ? 'text-neutral-400 hover:bg-neutral-800' : 'text-neutral-500 hover:bg-neutral-100'
          }`}
        >
          <Replace className="w-3.5 h-3.5" />
        </button>

        {/* Search Input Container */}
        <div className="relative flex-1 flex items-center">
          <Search className={`w-3.5 h-3.5 absolute left-2.5 pointer-events-none ${
            isDarkMode ? 'text-neutral-400' : 'text-neutral-500'
          }`} />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find in document..."
            className={`w-full text-xs font-sans pl-8 pr-16 py-1.5 rounded-lg border outline-none transition-all ${
              isDarkMode
                ? 'bg-neutral-800/80 border-neutral-700 text-neutral-100 placeholder-neutral-500 focus:border-accent focus:ring-1 focus:ring-accent/40'
                : 'bg-neutral-50 border-neutral-300 text-neutral-900 placeholder-neutral-400 focus:border-accent focus:ring-1 focus:ring-accent/40'
            }`}
          />
          {/* Match Counter Badge */}
          <div className="absolute right-2 text-[10px] font-mono pointer-events-none select-none">
            {query.trim().length > 0 ? (
              matches.length > 0 ? (
                <span className={isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}>
                  {currentIndex + 1}/{matches.length}
                </span>
              ) : (
                <span className="text-red-400 font-medium">0/0</span>
              )
            ) : null}
          </div>
        </div>

        {/* Next / Previous Buttons */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={handlePrev}
            disabled={matches.length === 0}
            title="Previous match (Shift+Enter)"
            className={`p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
              isDarkMode ? 'hover:bg-neutral-800 text-neutral-300' : 'hover:bg-neutral-100 text-neutral-700'
            }`}
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={matches.length === 0}
            title="Next match (Enter)"
            className={`p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
              isDarkMode ? 'hover:bg-neutral-800 text-neutral-300' : 'hover:bg-neutral-100 text-neutral-700'
            }`}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Match Case Toggle */}
        <button
          type="button"
          onClick={() => setMatchCase(!matchCase)}
          title={matchCase ? 'Match Case: ON' : 'Match Case: OFF'}
          className={`p-1.5 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
            matchCase 
              ? 'bg-accent/20 text-accent' 
              : isDarkMode ? 'text-neutral-400 hover:bg-neutral-800' : 'text-neutral-500 hover:bg-neutral-100'
          }`}
        >
          <CaseSensitive className="w-3.5 h-3.5" />
        </button>

        {/* Whole Word Toggle */}
        <button
          type="button"
          onClick={() => setWholeWord(!wholeWord)}
          title={wholeWord ? 'Match Whole Word: ON' : 'Match Whole Word: OFF'}
          className={`p-1.5 rounded-md transition-colors cursor-pointer ${
            wholeWord 
              ? 'bg-accent/20 text-accent' 
              : isDarkMode ? 'text-neutral-400 hover:bg-neutral-800' : 'text-neutral-500 hover:bg-neutral-100'
          }`}
        >
          <WholeWord className="w-3.5 h-3.5" />
        </button>

        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            clearHighlights();
            onClose();
            editorRef.current?.focus();
          }}
          title="Close (Esc)"
          className={`p-1.5 rounded-md transition-colors cursor-pointer ${
            isDarkMode ? 'hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200' : 'hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800'
          }`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expandable Replace Row */}
      {showReplace && (
        <div className="mt-2 pt-2 border-t border-neutral-200/60 dark:border-neutral-800/80 flex flex-wrap sm:flex-nowrap items-center gap-1.5">
          <div className="flex-1 min-w-[160px]">
            <input
              ref={replaceInputRef}
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace with..."
              className={`w-full text-xs font-sans px-2.5 py-1.5 rounded-lg border outline-none transition-all ${
                isDarkMode
                  ? 'bg-neutral-800/80 border-neutral-700 text-neutral-100 placeholder-neutral-500 focus:border-accent focus:ring-1 focus:ring-accent/40'
                  : 'bg-neutral-50 border-neutral-300 text-neutral-900 placeholder-neutral-400 focus:border-accent focus:ring-1 focus:ring-accent/40'
              }`}
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            <button
              type="button"
              onClick={handleReplaceCurrent}
              disabled={matches.length === 0}
              className={`px-2 py-1 text-xs font-medium rounded-md border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                isDarkMode 
                  ? 'border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-200' 
                  : 'border-neutral-300 bg-neutral-100 hover:bg-neutral-200 text-neutral-800'
              }`}
            >
              Replace
            </button>
            <button
              type="button"
              onClick={handleReplaceAll}
              disabled={matches.length === 0}
              className="px-2 py-1 text-xs font-medium rounded-md border text-white transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-xs"
              style={{ backgroundColor: accentColor, borderColor: accentColor }}
            >
              Replace All
            </button>
          </div>
        </div>
      )}

      {/* Transient Replace Notification */}
      {replaceFeedback && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-emerald-500 dark:text-emerald-400 animate-fadeIn">
          <Check className="w-3 h-3" />
          <span>{replaceFeedback}</span>
        </div>
      )}
    </div>
  );
};
