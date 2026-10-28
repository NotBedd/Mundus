import React, { useState } from 'react';
import { Search, X, Check, Type } from 'lucide-react';
import { CURATED_GOOGLE_FONTS, loadGoogleFont, loadArbitraryGoogleFont, type GoogleFontItem } from '../data/googleFonts';

interface GoogleFontModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFont: (font: GoogleFontItem) => void;
  currentFontId?: string;
  isDarkMode?: boolean;
}

export const GoogleFontModal: React.FC<GoogleFontModalProps> = ({
  isOpen,
  onClose,
  onSelectFont,
  currentFontId,
  isDarkMode = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [customInput, setCustomInput] = useState('');
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  if (!isOpen) return null;

  const categories = [
    { id: 'all', label: 'All Styles' },
    { id: 'serif', label: 'Serif (Literary)' },
    { id: 'sans-serif', label: 'Sans-Serif' },
    { id: 'monospace', label: 'Monospace' },
    { id: 'handwriting', label: 'Handwriting' },
    { id: 'display', label: 'Display & Title' }
  ];

  const filteredFonts = CURATED_GOOGLE_FONTS.filter((font) => {
    const matchesSearch = font.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || font.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handlePickCurated = async (font: GoogleFontItem) => {
    await loadGoogleFont(font);
    onSelectFont(font);
    onClose();
  };

  const handleLoadCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;

    setCustomLoading(true);
    setCustomError(null);
    try {
      const font = await loadArbitraryGoogleFont(customInput.trim());
      if (font) {
        onSelectFont(font);
        onClose();
      } else {
        setCustomError(`Could not find or load Google Font "${customInput}". Check the spelling and try again.`);
      }
    } catch {
      setCustomError('Failed to load font. Ensure you have an internet connection.');
    } finally {
      setCustomLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div 
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
          isDarkMode ? 'bg-neutral-900 border-neutral-800 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-900'
        }`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-800 dark:text-neutral-200">
              <Type className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-base">Google Fonts Library</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Browse literary typefaces or type any Google Font name to apply
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

        {/* Search & Custom Input Bar */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 space-y-3 bg-neutral-50/50 dark:bg-neutral-850/50">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter curated fonts (e.g. Garamond, Baskerville, Mono)..."
                className={`w-full pl-9 pr-4 py-2 text-xs rounded-xl border focus:outline-none transition-colors ${
                  isDarkMode 
                    ? 'bg-neutral-900 border-neutral-700 text-neutral-100 placeholder-neutral-500 focus:border-neutral-500' 
                    : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400 focus:border-neutral-500'
                }`}
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium shrink-0 transition-colors cursor-pointer ${
                  selectedCategory === cat.id
                    ? isDarkMode 
                      ? 'bg-white text-neutral-950 font-semibold shadow-xs' 
                      : 'bg-neutral-900 text-white font-semibold shadow-xs'
                    : isDarkMode 
                      ? 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-800' 
                      : 'bg-neutral-200/70 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Font Cards Grid */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredFonts.length === 0 ? (
            <div className="py-8 text-center text-neutral-400 text-xs">
              No curated fonts match "{searchQuery}". You can enter any Google Font family name below!
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredFonts.map((font) => {
                const isCurrent = currentFontId === font.id;
                return (
                  <button
                    key={font.id}
                    onClick={() => handlePickCurated(font)}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer group ${
                      isCurrent
                        ? isDarkMode
                          ? 'border-white/40 bg-neutral-800 shadow-xs ring-1 ring-white/30'
                          : 'border-neutral-900/40 bg-neutral-100 shadow-xs ring-1 ring-neutral-900/30'
                        : isDarkMode
                          ? 'border-neutral-800 hover:border-neutral-700 hover:bg-neutral-850'
                          : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 w-full">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold">{font.name}</span>
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-200/60 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                          {font.category}
                        </span>
                      </div>
                      {isCurrent && (
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      )}
                    </div>
                    {/* Live Preview Sample */}
                    <div 
                      className="text-sm text-neutral-600 dark:text-neutral-300 truncate pt-1 border-t border-neutral-100 dark:border-neutral-800/60"
                      style={{ fontFamily: font.fontFamily }}
                    >
                      The quick brown fox jumps over the lazy dog.
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Custom Font Name Input Footer */}
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-850/50">
          <form onSubmit={handleLoadCustom} className="space-y-2">
            <label className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 block">
              Load Any Font by Name from Google Fonts:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="e.g. Literata, Syne, Fraunces, Nunito..."
                className={`flex-1 px-3 py-1.5 text-xs rounded-xl border focus:outline-none transition-colors ${
                  isDarkMode 
                    ? 'bg-neutral-900 border-neutral-700 text-neutral-100 placeholder-neutral-500' 
                    : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400'
                }`}
              />
              <button
                type="submit"
                disabled={customLoading || !customInput.trim()}
                className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                  isDarkMode
                    ? 'bg-white text-neutral-950 hover:bg-neutral-200'
                    : 'bg-neutral-900 text-white hover:bg-neutral-800'
                }`}
              >
                {customLoading ? 'Loading...' : 'Apply Font'}
              </button>
            </div>
            {customError && (
              <p className="text-[11px] text-red-500 dark:text-red-400">{customError}</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
