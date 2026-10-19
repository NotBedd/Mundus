import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Clock, ChevronDown, Check, X, Sparkles, RefreshCw } from 'lucide-react';
import type { TimelineConfig } from '../../types';
import { INITIAL_TIMELINE_CONFIG } from '../../lib/initialData';

interface CalendarTimePickerPopoverProps {
  id?: string;
  label: string;
  value: string;
  onChange: (newValue: string) => void;
  timelineConfig?: TimelineConfig;
  type: 'birth' | 'death';
  isDarkMode: boolean;
  placeholder?: string;
}

export const CalendarTimePickerPopover: React.FC<CalendarTimePickerPopoverProps> = ({
  id,
  label,
  value,
  onChange,
  timelineConfig,
  type,
  isDarkMode,
  placeholder
}) => {
  const safeConfig = timelineConfig || INITIAL_TIMELINE_CONFIG;
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Form State inside picker
  const [year, setYear] = useState<number>(() => {
    const match = value.match(/-?\d+/);
    return match ? parseInt(match[0], 10) : (safeConfig.baseYear ?? 440);
  });

  const [minorUnitIdx, setMinorUnitIdx] = useState<number>(1);
  const [dayNum, setDayNum] = useState<number>(1);
  const [eventSuffix, setEventSuffix] = useState<string>('');

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Sync internal state when popover opens
  useEffect(() => {
    if (isOpen) {
      const matchYear = value.match(/-?\d+/);
      if (matchYear) setYear(parseInt(matchYear[0], 10));
      else setYear(safeConfig.baseYear ?? 440);
    }
  }, [isOpen, value, safeConfig.baseYear]);

  // Generate minor unit options list based on system units count and custom unit name
  const minorOptions = React.useMemo(() => {
    const totalUnits = safeConfig.unitsPerMajor || 12;
    const unitName = safeConfig.minorUnitName || 'Month';
    return Array.from({ length: totalUnits }, (_, i) => ({
      value: i + 1,
      label: `${unitName} ${i + 1}`
    }));
  }, [safeConfig]);

  // Calculate live preview date string (zzz DaysName, yyy MonthsName, xxx YearsName)
  const previewFormattedDate = React.useMemo(() => {
    const majorName = safeConfig.majorUnitName || 'Year';
    const minorName = safeConfig.minorUnitName || 'Month';
    const subName = safeConfig.subUnitName || 'Day';

    let dateText = `${majorName} ${year}, ${minorName} ${minorUnitIdx}, ${dayNum} ${subName}`;

    if (eventSuffix.trim()) {
      dateText += ` (${eventSuffix.trim()})`;
    }

    return dateText;
  }, [safeConfig, year, minorUnitIdx, dayNum, eventSuffix]);

  const handleApply = () => {
    onChange(previewFormattedDate);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setIsOpen(false);
  };

  const isBirth = type === 'birth';

  return (
    <div className="relative w-full" ref={popoverRef}>
      <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1">
          <Calendar className={`w-3 h-3 ${isBirth ? 'text-emerald-500' : 'text-rose-500'}`} />
          <span>{label}</span>
        </span>
        <span className="text-[10px] text-neutral-400 font-mono">
          {safeConfig.epochName || safeConfig.timeSystem}
        </span>
      </label>

      {/* Input Row with Trigger Button */}
      <div className="relative flex items-center">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || (isBirth ? 'e.g. 14 Days, 1 Months, 418 Years' : 'e.g. 14 Days, 1 Months, 440 Years (Siege of Ashen Gate)')}
          className={`w-full pl-3 pr-10 py-1.5 rounded-lg border text-xs transition-colors outline-none focus:ring-2 ${
            isBirth ? 'focus:ring-emerald-500' : 'focus:ring-rose-500'
          } ${
            isDarkMode 
              ? 'bg-neutral-950 border-neutral-700 text-white placeholder-neutral-600' 
              : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400'
          }`}
        />

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          title={`Open ${safeConfig.timeSystem} calendar date picker`}
          className={`absolute right-1 p-1 rounded-md transition-colors cursor-pointer ${
            isOpen 
              ? isBirth ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
              : isDarkMode ? 'text-neutral-400 hover:text-white hover:bg-neutral-800' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
          }`}
        >
          <Calendar className="w-4 h-4" />
        </button>
      </div>

      {/* Selector Popover Menu */}
      {isOpen && (
        <div 
          className={`absolute left-0 sm:-left-12 right-0 sm:-right-12 top-full mt-2 z-50 p-4 rounded-2xl border shadow-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-150 ${
            isDarkMode ? 'bg-[#181818] border-neutral-700 text-white shadow-black/80' : 'bg-white border-neutral-300 text-neutral-900 shadow-xl'
          }`}
        >
          {/* Header Row: Title on Left, Calendar System Name Pill on Right */}
          <div className="flex items-center justify-between pb-3 border-b-2 border-neutral-300 dark:border-neutral-700">
            <h3 className="text-sm font-bold font-display uppercase tracking-wider flex items-center gap-2">
              <Calendar className={`w-4 h-4 ${isBirth ? 'text-emerald-500' : 'text-rose-500'}`} />
              <span>{isBirth ? 'ASSIGN BIRTH DATE' : 'ASSIGN DEATH DATE'}</span>
            </h3>
            <div className={`px-2.5 py-1 rounded-xl border text-[10px] font-mono font-bold uppercase tracking-wide max-w-[150px] text-center truncate ${
              isDarkMode 
                ? 'bg-neutral-900 border-neutral-700 text-neutral-200' 
                : 'bg-neutral-100 border-neutral-300 text-neutral-800'
            }`}>
              {safeConfig.epochName || safeConfig.timeSystem || 'CALENDAR SYSTEM'}
            </div>
          </div>

          {/* Form Rows: Left Label (Unit Name (corresponding unit)) - Right Input Field */}
          <div className="space-y-3 text-xs font-mono">
            
            {/* Year Row */}
            <div className="grid grid-cols-12 gap-3 items-center">
              <label className="col-span-5 font-bold uppercase text-neutral-500 dark:text-neutral-400 text-[11px] truncate" title={`${safeConfig.majorUnitName || 'Year'} (years)`}>
                {`${safeConfig.majorUnitName || 'Year'} (years)`}
              </label>
              <div className="col-span-7 flex items-center gap-2">
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value, 10) || 0)}
                  placeholder="Year"
                  className={`w-full px-3 py-1.5 text-xs font-bold rounded-lg border outline-none font-mono ${
                    isBirth ? 'focus:ring-2 focus:ring-emerald-500' : 'focus:ring-2 focus:ring-rose-500'
                  } ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>
            </div>

            {/* Month Row */}
            <div className="grid grid-cols-12 gap-3 items-center">
              <label className="col-span-5 font-bold uppercase text-neutral-500 dark:text-neutral-400 text-[11px] truncate" title={`${safeConfig.minorUnitName || 'Month'} (months)`}>
                {`${safeConfig.minorUnitName || 'Month'} (months)`}
              </label>
              <div className="col-span-7">
                <select
                  value={minorUnitIdx}
                  onChange={(e) => setMinorUnitIdx(parseInt(e.target.value, 10) || 1)}
                  className={`w-full px-3 py-1.5 text-xs font-medium rounded-lg border outline-none cursor-pointer ${
                    isBirth ? 'focus:ring-2 focus:ring-emerald-500' : 'focus:ring-2 focus:ring-rose-500'
                  } ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                >
                  {minorOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Day Row */}
            <div className="grid grid-cols-12 gap-3 items-center">
              <label className="col-span-5 font-bold uppercase text-neutral-500 dark:text-neutral-400 text-[11px] truncate" title={`${safeConfig.subUnitName || 'Day'} (days)`}>
                {`${safeConfig.subUnitName || 'Day'} (days)`}
              </label>
              <div className="col-span-7">
                <input
                  type="number"
                  min={1}
                  max={safeConfig.subUnitsPerMinor || 30}
                  value={dayNum}
                  onChange={(e) => setDayNum(Math.max(1, Math.min(safeConfig.subUnitsPerMinor || 30, parseInt(e.target.value, 10) || 1)))}
                  placeholder="Day"
                  className={`w-full px-3 py-1.5 text-xs font-bold rounded-lg border outline-none font-mono ${
                    isBirth ? 'focus:ring-2 focus:ring-emerald-500' : 'focus:ring-2 focus:ring-rose-500'
                  } ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>
            </div>

            {/* Notes Row */}
            <div className="grid grid-cols-12 gap-3 items-center">
              <label className="col-span-5 font-bold uppercase text-neutral-500 dark:text-neutral-400 text-[11px] truncate">
                NOTES / EVENT
              </label>
              <div className="col-span-7">
                <input
                  type="text"
                  value={eventSuffix}
                  onChange={(e) => setEventSuffix(e.target.value)}
                  placeholder="e.g. Siege of Ashen Gate"
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border outline-none ${
                    isBirth ? 'focus:ring-2 focus:ring-emerald-500' : 'focus:ring-2 focus:ring-rose-500'
                  } ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white placeholder-neutral-600' : 'bg-white border-neutral-300 text-neutral-900 placeholder-neutral-400'
                  }`}
                />
              </div>
            </div>

          </div>

          {/* Formatted Date Preview - Own Full-Width Line */}
          <div className={`p-2.5 rounded-xl border space-y-0.5 ${
            isDarkMode ? 'bg-black/30 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
          }`}>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400 block">
              FORMATTED DATE
            </span>
            <p className={`text-xs font-serif font-bold break-words leading-snug ${
              isBirth ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
            }`}>
              {previewFormattedDate || '---'}
            </p>
          </div>

          {/* Action Buttons Row */}
          <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Clear Date
            </button>

            <button
              type="button"
              onClick={handleApply}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all hover:scale-[1.02] cursor-pointer ${
                isBirth 
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20' 
                  : 'border-rose-500 text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Date</span>
            </button>
          </div>

        </div>
      )}
    </div>
  );
};

function getOrdinalSuffix(i: number) {
  const j = i % 10, k = i % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}
