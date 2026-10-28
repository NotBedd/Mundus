import React, { useState } from 'react';
import { Settings2, X, Check, Globe, Sparkles, Compass } from 'lucide-react';
import type { TimelineConfig } from '../../types';
import { INITIAL_TIMELINE_CONFIG } from '../../lib/initialData';

interface TimelineConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: TimelineConfig;
  timelineConfig?: TimelineConfig;
  onSaveConfig: (config: TimelineConfig) => void;
  isDarkMode: boolean;
}

export const TimelineConfigModal: React.FC<TimelineConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  timelineConfig,
  onSaveConfig,
  isDarkMode
}) => {
  const safeConfig = config || timelineConfig || INITIAL_TIMELINE_CONFIG;

  const [timeSystem, setTimeSystem] = useState<TimelineConfig['timeSystem']>(() => safeConfig.timeSystem || 'fantasy');
  const [epochName, setEpochName] = useState(() => safeConfig.epochName || 'Third Age of Sol');
  const [majorUnitName, setMajorUnitName] = useState(() => safeConfig.majorUnitName || 'Year');
  const [minorUnitName, setMinorUnitName] = useState(() => safeConfig.minorUnitName || 'Moon');
  const [subUnitName, setSubUnitName] = useState(() => safeConfig.subUnitName || 'Sol');
  const [baseYear, setBaseYear] = useState(() => safeConfig.baseYear ?? 440);
  const [unitsPerMajor, setUnitsPerMajor] = useState(() => safeConfig.unitsPerMajor ?? 12);
  const [subUnitsPerMinor, setSubUnitsPerMinor] = useState(() => safeConfig.subUnitsPerMinor ?? 30);

  if (!isOpen) return null;

  const applyPreset = (preset: 'standard' | 'fantasy' | 'scifi') => {
    setTimeSystem(preset);
    if (preset === 'standard') {
      setEpochName('Common Era (CE)');
      setMajorUnitName('Year');
      setMinorUnitName('Month');
      setSubUnitName('Day');
      setBaseYear(2024);
      setUnitsPerMajor(12);
      setSubUnitsPerMinor(30);
    } else if (preset === 'fantasy') {
      setEpochName('Third Age of Sol');
      setMajorUnitName('Cycle / Age');
      setMinorUnitName('Moon / Season');
      setSubUnitName('Day / Sol');
      setBaseYear(1042);
      setUnitsPerMajor(10);
      setSubUnitsPerMinor(36);
    } else if (preset === 'scifi') {
      setEpochName('Galactic Standard Epoch');
      setMajorUnitName('Stardate / Epoch');
      setMinorUnitName('Sector Rotation');
      setSubUnitName('Standard Sol');
      setBaseYear(3480);
      setUnitsPerMajor(16);
      setSubUnitsPerMinor(25);
    }
  };

  const handleSave = () => {
    onSaveConfig({
      timeSystem,
      epochName: epochName.trim() || 'Custom Epoch',
      majorUnitName: majorUnitName.trim() || 'Year',
      minorUnitName: minorUnitName.trim() || 'Month',
      subUnitName: subUnitName.trim() || 'Day',
      baseYear,
      unitsPerMajor: Math.max(1, unitsPerMajor),
      subUnitsPerMinor: Math.max(1, subUnitsPerMinor)
    });
    onClose();
  };

  return (
    <div 
      id="timeline-config-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col transition-all ${
          isDarkMode ? 'bg-[#141414] border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
        }`}
      >
        {/* Header */}
        <div className={`p-5 border-b flex items-center justify-between ${
          isDarkMode ? 'border-neutral-800 bg-neutral-900/50' : 'border-neutral-200 bg-neutral-50/70'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xs ${
              isDarkMode ? 'bg-neutral-800 border-neutral-700 text-accent' : 'bg-accent/10 border-accent/30 text-accent'
            }`}>
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-display flex items-center gap-2">
                <span>Configure World Calendar & Time System</span>
              </h2>
              <p className="text-xs text-neutral-400">
                Customize time units, eras, and coordinate systems for your timeline.
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

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">
          {/* Presets */}
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2 font-mono">
              System Archetype Presets
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => applyPreset('standard')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  timeSystem === 'standard'
                    ? isDarkMode ? 'border-accent bg-accent/20 text-white' : 'border-accent bg-accent/10 text-accent font-semibold'
                    : isDarkMode ? 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-700' : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                }`}
              >
                <p className="text-xs font-bold">Earth / Gregorian</p>
                <p className="text-[10px] text-neutral-500 mt-0.5">Years, Months, Days</p>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('fantasy')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  timeSystem === 'fantasy'
                    ? isDarkMode ? 'border-accent bg-accent/20 text-white' : 'border-accent bg-accent/10 text-accent font-semibold'
                    : isDarkMode ? 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-700' : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                }`}
              >
                <p className="text-xs font-bold">Fantasy / Mythic</p>
                <p className="text-[10px] text-neutral-500 mt-0.5">Ages, Moons, Sols</p>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('scifi')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  timeSystem === 'scifi'
                    ? isDarkMode ? 'border-accent bg-accent/20 text-white' : 'border-accent bg-accent/10 text-accent font-semibold'
                    : isDarkMode ? 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-700' : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                }`}
              >
                <p className="text-xs font-bold">Sci-Fi / Galactic</p>
                <p className="text-[10px] text-neutral-500 mt-0.5">Stardates & Sols</p>
              </button>
            </div>
          </div>

          {/* Epoch & Base Year */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 font-mono">
                Epoch / Calendar Name
              </label>
              <input
                type="text"
                value={epochName}
                onChange={(e) => {
                  setEpochName(e.target.value);
                  setTimeSystem('custom');
                }}
                placeholder="e.g. Third Age of Sol"
                className={`w-full px-3 py-2 rounded-lg text-xs border outline-hidden ${
                  isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 font-mono">
                Base Reference Point
              </label>
              <input
                type="number"
                value={baseYear}
                onChange={(e) => setBaseYear(parseInt(e.target.value) || 0)}
                className={`w-full px-3 py-2 rounded-lg text-xs border outline-hidden font-mono ${
                  isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                }`}
              />
            </div>
          </div>

          {/* Unit Naming */}
          <div className={`p-4 rounded-xl border space-y-3 ${
            isDarkMode ? 'bg-neutral-950/60 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
          }`}>
            <span className="text-xs font-bold font-mono text-neutral-400 uppercase tracking-wider">
              Custom Time Unit Designators
            </span>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Major Unit</label>
                <input
                  type="text"
                  value={majorUnitName}
                  onChange={(e) => {
                    setMajorUnitName(e.target.value);
                    setTimeSystem('custom');
                  }}
                  placeholder="e.g. Year / Age"
                  className={`w-full px-2.5 py-1.5 rounded-md text-xs border outline-hidden ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Minor Unit</label>
                <input
                  type="text"
                  value={minorUnitName}
                  onChange={(e) => {
                    setMinorUnitName(e.target.value);
                    setTimeSystem('custom');
                  }}
                  placeholder="e.g. Moon / Month"
                  className={`w-full px-2.5 py-1.5 rounded-md text-xs border outline-hidden ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">Sub Unit</label>
                <input
                  type="text"
                  value={subUnitName}
                  onChange={(e) => {
                    setSubUnitName(e.target.value);
                    setTimeSystem('custom');
                  }}
                  placeholder="e.g. Sol / Day"
                  className={`w-full px-2.5 py-1.5 rounded-md text-xs border outline-hidden ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">
                  {minorUnitName}s per {majorUnitName}
                </label>
                <input
                  type="number"
                  min="1"
                  value={unitsPerMajor}
                  onChange={(e) => setUnitsPerMajor(parseInt(e.target.value) || 12)}
                  className={`w-full px-2.5 py-1.5 rounded-md text-xs border outline-hidden font-mono ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">
                  {subUnitName}s per {minorUnitName}
                </label>
                <input
                  type="number"
                  min="1"
                  value={subUnitsPerMinor}
                  onChange={(e) => setSubUnitsPerMinor(parseInt(e.target.value) || 30)}
                  className={`w-full px-2.5 py-1.5 rounded-md text-xs border outline-hidden font-mono ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-end gap-2 ${
          isDarkMode ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'
        }`}>
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
            <span>Apply Time System</span>
          </button>
        </div>
      </div>
    </div>
  );
};
