import React, { useState } from 'react';
import { Target, Check, X, Sparkles, Trash2, Clock } from 'lucide-react';
import { estimateTargetReadingMinutes, formatReadingTime, READING_WORDS_PER_MINUTE, READING_CHARS_PER_MINUTE } from '../lib/targetProgress';

interface WritingTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTargetType?: 'words' | 'characters';
  currentTargetCount?: number;
  currentWords: number;
  currentChars: number;
  onSaveTarget: (targetType: 'words' | 'characters', targetCount?: number) => void;
  isDarkMode: boolean;
}

export const WritingTargetModal: React.FC<WritingTargetModalProps> = ({
  isOpen,
  onClose,
  currentTargetType = 'words',
  currentTargetCount,
  currentWords,
  currentChars,
  onSaveTarget,
  isDarkMode
}) => {
  const [targetType, setTargetType] = useState<'words' | 'characters'>(currentTargetType || 'words');
  const [targetCount, setTargetCount] = useState<number>(currentTargetCount || 2000);

  if (!isOpen) return null;

  const currentVal = targetType === 'words' ? currentWords : currentChars;
  const progressPercent = targetCount > 0 ? Math.min(100, Math.round((currentVal / targetCount) * 100)) : 0;
  const isGoalReached = targetCount > 0 && currentVal >= targetCount;
  const remaining = targetCount > currentVal ? targetCount - currentVal : 0;
  const targetReadingMinutes = estimateTargetReadingMinutes(targetCount, targetType);

  const wordPresets = [500, 1000, 1500, 2000, 3000, 5000];
  const charPresets = [2500, 5000, 8000, 12000, 20000, 30000];

  const handleApply = () => {
    onSaveTarget(targetType, targetCount > 0 ? targetCount : undefined);
    onClose();
  };

  const handleClear = () => {
    onSaveTarget('words', undefined);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        id="writing-target-modal"
        className={`w-full max-w-md rounded-2xl border shadow-2xl p-5 sm:p-6 transition-colors ${
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
              <Target className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Writing Target & Goals</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Set a milestone for this scene or chapter</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target Type Switcher */}
        <div className="mt-4">
          <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 block">
            Measure Goal In
          </label>
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => {
                setTargetType('words');
                if (targetCount > 10000) setTargetCount(2000);
              }}
              className={`py-1.5 text-xs font-medium rounded-md transition-all ${
                targetType === 'words'
                  ? isDarkMode ? 'bg-neutral-800 text-white shadow-xs' : 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Words
            </button>
            <button
              type="button"
              onClick={() => {
                setTargetType('characters');
                if (targetCount < 1000) setTargetCount(10000);
              }}
              className={`py-1.5 text-xs font-medium rounded-md transition-all ${
                targetType === 'characters'
                  ? isDarkMode ? 'bg-neutral-800 text-white shadow-xs' : 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
              }`}
            >
              Characters
            </button>
          </div>
        </div>

        {/* Target Number Input */}
        <div className="mt-4">
          <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5 block">
            Target Count
          </label>
          <div className="relative">
            <input
              type="number"
              min={10}
              step={50}
              value={targetCount}
              onChange={(e) => setTargetCount(Math.max(0, parseInt(e.target.value) || 0))}
              className={`w-full px-3 py-2 rounded-lg border text-base font-mono font-semibold focus:outline-none transition-colors ${
                isDarkMode 
                  ? 'bg-neutral-900 border-neutral-700 text-white focus:border-neutral-500' 
                  : 'bg-white border-neutral-300 text-neutral-900 focus:border-neutral-700'
              }`}
            />
            <span className="absolute right-3 top-2.5 text-xs font-mono text-neutral-400 uppercase">
              {targetType}
            </span>
          </div>
          {targetReadingMinutes > 0 && (
            <div
              className="mt-1.5 flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400"
              title={`Estimated at ${READING_WORDS_PER_MINUTE} words or ${READING_CHARS_PER_MINUTE} characters per minute`}
            >
              <Clock className="w-3 h-3 shrink-0" />
              <span>≈ {formatReadingTime(targetReadingMinutes)} reading time</span>
            </div>
          )}
        </div>

        {/* Quick Presets */}
        <div className="mt-3">
          <div className="text-[11px] text-neutral-400 mb-1.5 font-medium">Quick Presets:</div>
          <div className="flex flex-wrap gap-1.5">
            {(targetType === 'words' ? wordPresets : charPresets).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setTargetCount(preset)}
                className={`px-2 py-1 rounded text-xs font-mono border transition-all ${
                  targetCount === preset
                    ? isDarkMode 
                      ? 'bg-neutral-800 border-neutral-500 text-white font-semibold' 
                      : 'bg-neutral-900 border-neutral-900 text-white font-semibold'
                    : isDarkMode
                      ? 'border-neutral-800 hover:bg-neutral-850 text-neutral-400 hover:text-neutral-200'
                      : 'border-neutral-200 hover:bg-neutral-100 text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {preset.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* Live Progress Preview */}
        <div className={`mt-5 p-3.5 rounded-xl border ${
          isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
        }`}>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-medium text-neutral-600 dark:text-neutral-400">
              Current Progress:
            </span>
            <span className="font-mono font-semibold">
              {currentVal.toLocaleString()} / {targetCount.toLocaleString()} {targetType} ({progressPercent}%)
            </span>
          </div>

          {/* Progress bar — v0.7.86: back to the classic monochrome preview.
              The dynamic progress colors now live in the editor's bottom-bar
              target pill (the live indicator), not in this menu. */}
          <div className="w-full h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
            <div
              className="h-full transition-all duration-300 bg-neutral-900 dark:bg-neutral-100"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="mt-2 text-[11px] flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            {isGoalReached ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Goal reached! (+{(currentVal - targetCount).toLocaleString()} over)
              </span>
            ) : (
              <span>{remaining.toLocaleString()} {targetType} remaining</span>
            )}
            <span className="font-mono">{progressPercent}% complete</span>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex items-center justify-between gap-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
          {currentTargetCount ? (
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove Goal</span>
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-opacity flex items-center gap-1.5 shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Target</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
