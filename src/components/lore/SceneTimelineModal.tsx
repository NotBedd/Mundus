import React, { useState, useEffect } from 'react';
import { Clock, Calendar, X, Check, Tag, BookOpen, AlertCircle, Sparkles } from 'lucide-react';
import type { NovelDocument, SceneTimelineInfo, Folder, TimelineConfig } from '../../types';
import { INITIAL_TIMELINE_CONFIG } from '../../lib/initialData';
import { APP_VERSION } from '../../constants';

interface SceneTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: NovelDocument | null;
  folders?: Folder[];
  timelineConfig?: TimelineConfig;
  config?: TimelineConfig;
  onSaveTimelineInfo: ((info: SceneTimelineInfo) => void) | ((docId: string, info: SceneTimelineInfo) => void);
  isDarkMode: boolean;
}

export const SceneTimelineModal: React.FC<SceneTimelineModalProps> = ({
  isOpen,
  onClose,
  document,
  folders = [],
  timelineConfig,
  config,
  onSaveTimelineInfo,
  isDarkMode
}) => {
  const safeConfig = timelineConfig || config || INITIAL_TIMELINE_CONFIG;
  const safeFolders = folders || [];

  const [startDisplay, setStartDisplay] = useState('');
  const [yearStr, setYearStr] = useState('440');
  const [monthStr, setMonthStr] = useState('1');
  const [dayStr, setDayStr] = useState('1');
  const [durationStr, setDurationStr] = useState('1');
  const [durationUnit, setDurationUnit] = useState<'hours' | 'days' | 'weeks' | 'months' | 'years' | 'cycles'>('days');
  const [timeNotes, setTimeNotes] = useState('');

  useEffect(() => {
    if (!document) return;
    if (document.timelineInfo) {
      setStartDisplay(document.timelineInfo.startDisplay || '');
      setYearStr(String(document.timelineInfo.startYear ?? safeConfig.baseYear ?? 440));
      setMonthStr(String(document.timelineInfo.startMonth ?? 1));
      setDayStr(String(document.timelineInfo.startDay ?? 1));
      setDurationStr(String(document.timelineInfo.duration ?? 1));
      setDurationUnit(document.timelineInfo.durationUnit ?? 'days');
      setTimeNotes(document.timelineInfo.timeNotes || '');
    } else {
      setStartDisplay('');
      setYearStr(String(safeConfig.baseYear ?? 440));
      setMonthStr('1');
      setDayStr('1');
      setDurationStr('1');
      setDurationUnit('days');
      setTimeNotes('');
    }
  }, [document, safeConfig.baseYear, isOpen]);

  if (!isOpen || !document) return null;

  const currentFolder = safeFolders.find((f) => f.id === document.folderId);

  const handleSave = () => {
    const parsedYear = yearStr.trim() === '' ? (safeConfig.baseYear ?? 440) : (parseInt(yearStr, 10) || 0);
    const parsedMonth = monthStr.trim() === '' ? 1 : Math.max(1, parseInt(monthStr, 10) || 1);
    const parsedDay = dayStr.trim() === '' ? 1 : Math.max(1, parseInt(dayStr, 10) || 1);
    const parsedDuration = durationStr.trim() === '' ? 1 : Math.max(0.1, parseFloat(durationStr) || 1);

    const formattedDisplay = startDisplay.trim() || 
      `${safeConfig.majorUnitName || 'Year'} ${parsedYear}, ${safeConfig.minorUnitName || 'Moon'} ${parsedMonth}${parsedDay ? `, ${safeConfig.subUnitName || 'Sol'} ${parsedDay}` : ''}`;

    const updatedInfo: SceneTimelineInfo = {
      startYear: parsedYear,
      startMonth: parsedMonth,
      startDay: parsedDay,
      startDisplay: formattedDisplay,
      duration: parsedDuration,
      durationUnit,
      timeNotes: timeNotes.trim()
    };

    if (typeof onSaveTimelineInfo === 'function') {
      if (onSaveTimelineInfo.length >= 2) {
        (onSaveTimelineInfo as (docId: string, info: SceneTimelineInfo) => void)(document.id, updatedInfo);
      } else {
        (onSaveTimelineInfo as (info: SceneTimelineInfo) => void)(updatedInfo);
      }
    }
    onClose();
  };

  const handleClear = () => {
    const emptyInfo: SceneTimelineInfo = {
      startYear: undefined,
      startMonth: undefined,
      startDay: undefined,
      startDisplay: undefined,
      duration: undefined,
      durationUnit: undefined,
      timeNotes: undefined
    };

    if (typeof onSaveTimelineInfo === 'function') {
      if (onSaveTimelineInfo.length >= 2) {
        (onSaveTimelineInfo as (docId: string, info: SceneTimelineInfo) => void)(document.id, emptyInfo);
      } else {
        (onSaveTimelineInfo as (info: SceneTimelineInfo) => void)(emptyInfo);
      }
    }
    onClose();
  };

  return (
    <div 
      id="scene-timeline-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-all ${
          isDarkMode ? 'bg-[#141414] border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
        }`}
      >
        {/* Header */}
        <div className={`p-5 border-b flex items-center justify-between ${
          isDarkMode ? 'border-neutral-800 bg-neutral-900/50' : 'border-neutral-200 bg-neutral-50/70'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xs ${
              isDarkMode ? 'bg-neutral-800 border-neutral-700 text-accent' : 'bg-accent/10 border-accent/20 text-accent'
            }`}>
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-display flex items-center gap-2">
                <span>Scene Timeline Placement</span>
              </h2>
              <p className="text-xs text-neutral-400 truncate max-w-xs">
                {document.title} {currentFolder && `• ${currentFolder.name}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Custom Date / Time Label */}
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 font-mono">
              Timeline Date Label (Formatted)
            </label>
            <input
              type="text"
              value={startDisplay}
              onChange={(e) => setStartDisplay(e.target.value)}
              placeholder={`e.g. ${safeConfig.majorUnitName || 'Year'} ${yearStr || '1042'}, 14th of Frostfall`}
              className={`w-full px-3 py-2 rounded-lg text-xs border outline-hidden transition-all ${
                isDarkMode 
                  ? 'bg-neutral-900 border-neutral-700 focus:border-accent text-white' 
                  : 'bg-white border-neutral-300 focus:border-accent text-neutral-900'
              }`}
            />
            <p className="text-[11px] text-neutral-500 mt-1">
              Custom story date text shown on cards and timeline pins. Leave blank for auto-format.
            </p>
          </div>

          {/* Coordinate numerical inputs */}
          <div className={`p-3.5 rounded-xl border space-y-3 ${
            isDarkMode ? 'bg-neutral-950/60 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-accent" />
                <span>Chronology Coordinates</span>
              </span>
              <span className="text-[10px] text-neutral-500 font-mono">
                System: {safeConfig.epochName || 'Custom'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">
                  {safeConfig.majorUnitName || 'Year'}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={yearStr}
                  onChange={(e) => setYearStr(e.target.value)}
                  placeholder={String(safeConfig.baseYear ?? 440)}
                  className={`w-full px-2.5 py-1.5 rounded-md text-xs border outline-hidden font-mono ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">
                  {safeConfig.minorUnitName || 'Moon'} (1-{safeConfig.unitsPerMajor || 12})
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={monthStr}
                  onChange={(e) => setMonthStr(e.target.value)}
                  placeholder="1"
                  className={`w-full px-2.5 py-1.5 rounded-md text-xs border outline-hidden font-mono ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">
                  {safeConfig.subUnitName || 'Sol'} (1-{safeConfig.subUnitsPerMinor || 30})
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={dayStr}
                  onChange={(e) => setDayStr(e.target.value)}
                  placeholder="1"
                  className={`w-full px-2.5 py-1.5 rounded-md text-xs border outline-hidden font-mono ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Scene Duration / Span */}
          <div className={`p-3.5 rounded-xl border space-y-3 ${
            isDarkMode ? 'bg-neutral-950/60 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span>Scene Duration on Timeline Bar</span>
              </span>
              <span className="text-[10px] text-blue-400 font-mono">Horizontal Span</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Duration Length</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={durationStr}
                  onChange={(e) => setDurationStr(e.target.value)}
                  placeholder="1"
                  className={`w-full px-2.5 py-1.5 rounded-md text-xs border outline-hidden font-mono ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Time Unit</label>
                <select
                  value={durationUnit}
                  onChange={(e) => setDurationUnit(e.target.value as any)}
                  className={`w-full px-2.5 py-1.5 rounded-md text-xs border outline-hidden ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                >
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                  <option value="months">Months / Moons</option>
                  <option value="years">Years / Cycles</option>
                  <option value="cycles">Custom Cycles</option>
                </select>
              </div>
            </div>
            <p className="text-[11px] text-neutral-500">
              Renders a proportional horizontal bar across the Chronology Graph in Lore Mode.
            </p>
          </div>

          {/* Chronological Notes */}
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 font-mono">
              Scene Chronology & Narrative Notes
            </label>
            <textarea
              rows={2}
              value={timeNotes}
              onChange={(e) => setTimeNotes(e.target.value)}
              placeholder="e.g. Occurs simultaneously with the duel at Old Basin; takes place during full eclipse."
              className={`w-full px-3 py-2 rounded-lg text-xs border outline-hidden resize-none transition-all ${
                isDarkMode 
                  ? 'bg-neutral-900 border-neutral-700 focus:border-accent text-white' 
                  : 'bg-white border-neutral-300 focus:border-accent text-neutral-900'
              }`}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className={`p-4 border-t flex items-center justify-between ${
          isDarkMode ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'
        }`}>
          <button
            onClick={handleClear}
            className="text-xs text-neutral-400 hover:text-red-400 transition-colors cursor-pointer px-2 py-1"
          >
            Clear Placement
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                isDarkMode 
                  ? 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700' 
                  : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg border border-accent text-accent bg-transparent hover:bg-accent/10 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save to Timeline</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
