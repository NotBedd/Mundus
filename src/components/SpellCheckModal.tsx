import React, { useState } from 'react';
import { SpellCheck, Plus, X, Check, BookOpen, AlertCircle } from 'lucide-react';

interface SpellCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  spellCheckEnabled: boolean;
  onToggleSpellCheck: (enabled: boolean) => void;
  customWords: string[];
  onAddWord: (word: string) => void;
  onRemoveWord: (word: string) => void;
  isDarkMode: boolean;
}

export const SpellCheckModal: React.FC<SpellCheckModalProps> = ({
  isOpen,
  onClose,
  spellCheckEnabled,
  onToggleSpellCheck,
  customWords,
  onAddWord,
  onRemoveWord,
  isDarkMode
}) => {
  const [newWord, setNewWord] = useState('');
  const [filterQuery, setFilterQuery] = useState('');

  if (!isOpen) return null;

  const handleAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newWord.trim();
    if (trimmed) {
      onAddWord(trimmed);
      setNewWord('');
    }
  };

  const filteredWords = customWords
    .filter((w) => w.toLowerCase().includes(filterQuery.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        id="spellcheck-modal"
        className={`w-full max-w-lg rounded-2xl border shadow-2xl p-5 sm:p-6 transition-colors ${
          isDarkMode 
            ? 'bg-[#141414] border-neutral-800 text-neutral-100' 
            : 'bg-white border-neutral-200 text-neutral-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${isDarkMode ? 'bg-neutral-800 text-neutral-200' : 'bg-neutral-100 text-neutral-800'}`}>
              <SpellCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Spell Check & Dictionary</h3>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Master Toggle Section */}
        <div className={`mt-4 p-4 rounded-xl border flex items-center justify-between gap-4 ${
          isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
        }`}>
          <div>
            <div className="text-xs font-semibold">English Spell Checking</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 max-w-xs">
              Highlights misspelled words
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={spellCheckEnabled}
            onClick={() => onToggleSpellCheck(!spellCheckEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              spellCheckEnabled 
                ? isDarkMode ? 'bg-white' : 'bg-neutral-900' 
                : isDarkMode ? 'bg-neutral-800' : 'bg-neutral-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-neutral-900 shadow-md ring-0 transition duration-200 ease-in-out ${
                spellCheckEnabled 
                  ? 'translate-x-5 dark:bg-neutral-900' 
                  : 'translate-x-0 bg-white'
              }`}
            />
          </button>
        </div>

        {/* Custom Excluded Words / Character Names */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-neutral-500" />
              <label className="text-xs font-semibold">Custom Dictionary & Excluded Words</label>
            </div>
            <span className="text-[11px] font-mono text-neutral-500">
              {customWords.length} {customWords.length === 1 ? 'word' : 'words'}
            </span>
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-3">
            These won&apos;t be marked as errors
          </p>

          {/* Add Word Form */}
          <form onSubmit={handleAdd} className="flex gap-2 mb-3">
            <input
              type="text"
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              placeholder="e.g. Eldoria, Valerius, Zephyros..."
              className={`flex-1 px-3 py-1.5 text-xs rounded-lg border focus:outline-none transition-colors ${
                isDarkMode 
                  ? 'bg-neutral-900 border-neutral-700 text-white focus:border-neutral-500' 
                  : 'bg-white border-neutral-300 text-neutral-900 focus:border-neutral-700'
              }`}
            />
            <button
              type="submit"
              disabled={!newWord.trim()}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Word</span>
            </button>
          </form>

          {/* Search / Filter if more than 6 words */}
          {customWords.length > 6 && (
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter words..."
              className={`w-full px-2.5 py-1 text-[11px] mb-2 rounded-md border focus:outline-none ${
                isDarkMode ? 'bg-neutral-900 border-neutral-800 text-neutral-200' : 'bg-white border-neutral-200'
              }`}
            />
          )}

          {/* Word Badges Container */}
          <div className={`p-3 rounded-xl border max-h-48 overflow-y-auto ${
            isDarkMode ? 'bg-neutral-900/40 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
          }`}>
            {customWords.length === 0 ? (
              <div className="text-center py-6 text-xs text-neutral-400">
                No custom words added
              </div>
            ) : filteredWords.length === 0 ? (
              <div className="text-center py-4 text-xs text-neutral-400">
                No words match &quot;{filterQuery}&quot;
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {filteredWords.map((w) => (
                  <span
                    key={w}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-mono border transition-colors ${
                      isDarkMode 
                        ? 'bg-neutral-800 border-neutral-700 text-neutral-200' 
                        : 'bg-white border-neutral-200 text-neutral-800 shadow-2xs'
                    }`}
                  >
                    <span>{w}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveWord(w)}
                      title={`Remove "${w}"`}
                      className="text-neutral-400 hover:text-red-500 transition-colors ml-0.5 p-0.5 rounded hover:bg-neutral-700/50"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="mt-5 pt-3 border-t border-neutral-200 dark:border-neutral-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-accent text-accent bg-transparent hover:bg-accent/10 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
