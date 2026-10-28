import React, { useState, useEffect } from 'react';
import { 
  Milestone, 
  X, 
  Check, 
  Sparkles, 
  Skull, 
  Baby, 
  Swords, 
  Compass, 
  Landmark, 
  Flame, 
  Tag, 
  Calendar,
  Users
} from 'lucide-react';
import type { TimelineEvent, TimelineEventCategory, Character, NovelDocument, TimelineConfig } from '../../types';
import { INITIAL_TIMELINE_CONFIG } from '../../lib/initialData';

interface TimelineEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventToEdit?: TimelineEvent | null;
  characters?: Character[];
  documents?: NovelDocument[];
  timelineConfig?: TimelineConfig;
  config?: TimelineConfig;
  onSaveEvent: (event: Partial<TimelineEvent>) => void;
  onDeleteEvent?: (id: string) => void;
  isDarkMode: boolean;
}

const CATEGORY_OPTIONS: { category: TimelineEventCategory; label: string; icon: any; color: string }[] = [
  { category: 'milestone', label: 'Key Milestone', icon: Milestone, color: '#a855f7' },
  { category: 'character_birth', label: 'Character Birth', icon: Baby, color: '#10b981' },
  { category: 'character_death', label: 'Character Death', icon: Skull, color: '#ef4444' },
  { category: 'battle', label: 'Battle / Conflict', icon: Swords, color: '#f97316' },
  { category: 'discovery', label: 'Discovery / Artifact', icon: Compass, color: '#06b6d4' },
  { category: 'political', label: 'Treaty / Political', icon: Landmark, color: '#3b82f6' },
  { category: 'cataclysm', label: 'Cataclysm / Event', icon: Flame, color: '#e11d48' },
  { category: 'custom', label: 'Custom Plot Event', icon: Sparkles, color: '#8b5cf6' },
];

export const TimelineEventModal: React.FC<TimelineEventModalProps> = ({
  isOpen,
  onClose,
  eventToEdit,
  characters = [],
  documents = [],
  timelineConfig,
  config,
  onSaveEvent,
  onDeleteEvent,
  isDarkMode
}) => {
  const safeConfig = timelineConfig || config || INITIAL_TIMELINE_CONFIG;

  const [title, setTitle] = useState('');
  const [timeDisplay, setTimeDisplay] = useState('');
  const [year, setYear] = useState<number>(() => safeConfig?.baseYear ?? 440);
  const [month, setMonth] = useState<number>(1);
  const [day, setDay] = useState<number>(1);
  const [category, setCategory] = useState<TimelineEventCategory>('milestone');
  const [description, setDescription] = useState('');
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string>('');
  const [color, setColor] = useState('#a855f7');

  useEffect(() => {
    if (eventToEdit) {
      setTitle(eventToEdit.title);
      setTimeDisplay(eventToEdit.timeDisplay);
      setCategory(eventToEdit.category);
      setDescription(eventToEdit.description || '');
      setSelectedCharacterIds(eventToEdit.characterIds || []);
      setSelectedSceneId(eventToEdit.sceneId || '');
      setColor(eventToEdit.color || '#a855f7');
      
      const unitsPerMajor = safeConfig.unitsPerMajor || 12;
      const parsedYear = Math.floor(eventToEdit.timeCoordinate);
      const frac = eventToEdit.timeCoordinate - parsedYear;
      const parsedMonth = Math.max(1, Math.min(unitsPerMajor, Math.floor(frac * unitsPerMajor) + 1));
      setYear(parsedYear);
      setMonth(parsedMonth);
      setDay(1);
    } else {
      setTitle('');
      setTimeDisplay('');
      setYear(safeConfig.baseYear ?? 440);
      setMonth(1);
      setDay(1);
      setCategory('milestone');
      setDescription('');
      setSelectedCharacterIds([]);
      setSelectedSceneId('');
      setColor('#a855f7');
    }
  }, [eventToEdit, safeConfig, isOpen]);

  if (!isOpen) return null;

  const handleCategorySelect = (cat: TimelineEventCategory) => {
    setCategory(cat);
    const catOpt = CATEGORY_OPTIONS.find((c) => c.category === cat);
    if (catOpt) setColor(catOpt.color);
  };

  const handleToggleCharacter = (charId: string) => {
    setSelectedCharacterIds((prev) => 
      prev.includes(charId) ? prev.filter((id) => id !== charId) : [...prev, charId]
    );
  };

  const handleSave = () => {
    if (!title.trim()) return;

    const unitsPerMajor = safeConfig.unitsPerMajor || 12;
    const subUnitsPerMinor = safeConfig.subUnitsPerMinor || 30;

    // Coordinate is calculated as Year + (Month-1)/unitsPerMajor + (Day-1)/(unitsPerMajor*subUnitsPerMinor)
    const timeCoordinate = year + ((month - 1) / unitsPerMajor) + ((day - 1) / (unitsPerMajor * subUnitsPerMinor));

    const formattedTimeDisplay = timeDisplay.trim() || 
      `${safeConfig.majorUnitName || 'Year'} ${year}, ${safeConfig.minorUnitName || 'Moon'} ${month}${day > 1 ? `, ${safeConfig.subUnitName || 'Sol'} ${day}` : ''}`;

    onSaveEvent({
      id: eventToEdit ? eventToEdit.id : `evt-${Date.now()}`,
      title: title.trim(),
      timeCoordinate,
      timeDisplay: formattedTimeDisplay,
      category,
      description: description.trim(),
      color,
      characterIds: selectedCharacterIds,
      sceneId: selectedSceneId || undefined
    });

    onClose();
  };

  return (
    <div 
      id="timeline-event-modal"
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
            <div 
              className="w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xs"
              style={{ backgroundColor: `${color}20`, borderColor: `${color}40`, color }}
            >
              <Milestone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-display">
                {eventToEdit ? 'Edit Timeline Milestone Event' : 'Add Milestone Event to Timeline'}
              </h2>
              <p className="text-xs text-neutral-400">
                Mark historic events, character births/deaths, or plot points on the chronology.
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
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Category Chips */}
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2 font-mono">
              Event Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {CATEGORY_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = category === opt.category;
                return (
                  <button
                    key={opt.category}
                    type="button"
                    onClick={() => handleCategorySelect(opt.category)}
                    className={`p-2 rounded-lg border text-left flex items-center gap-2 transition-all cursor-pointer ${
                      isSelected
                        ? isDarkMode 
                          ? 'border-accent bg-accent/20 text-white font-semibold' 
                          : 'border-accent bg-accent/10 text-accent font-semibold'
                        : isDarkMode 
                          ? 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:text-neutral-200' 
                          : 'border-neutral-200 bg-white text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: opt.color }} />
                    <span className="text-[11px] truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 font-mono">
              Event Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Siege of Ashen Gate, Birth of Prince Vance"
              className={`w-full px-3 py-2 rounded-lg text-xs border outline-hidden ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700 focus:border-accent text-white' : 'bg-white border-neutral-300 focus:border-accent text-neutral-900'
              }`}
            />
          </div>

          {/* Date Label & Coordinates */}
          <div className={`p-3.5 rounded-xl border space-y-3 ${
            isDarkMode ? 'bg-neutral-950/60 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
          }`}>
            <div>
              <label className="block text-[11px] text-neutral-400 mb-1">
                Custom Story Date (Display text)
              </label>
              <input
                type="text"
                value={timeDisplay}
                onChange={(e) => setTimeDisplay(e.target.value)}
                placeholder={`e.g. ${safeConfig.majorUnitName || 'Year'} ${year}, 14th of Frostfall`}
                className={`w-full px-2.5 py-1.5 rounded-md text-xs border outline-hidden ${
                  isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                }`}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">{safeConfig.majorUnitName || 'Year'}</label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value) || 0)}
                  className={`w-full px-2.5 py-1.5 rounded-md text-xs border outline-hidden font-mono ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">{safeConfig.minorUnitName || 'Moon'} (1-{safeConfig.unitsPerMajor || 12})</label>
                <input
                  type="number"
                  min="1"
                  max={safeConfig.unitsPerMajor || 12}
                  value={month}
                  onChange={(e) => setMonth(Math.max(1, Math.min(safeConfig.unitsPerMajor || 12, parseInt(e.target.value) || 1)))}
                  className={`w-full px-2.5 py-1.5 rounded-md text-xs border outline-hidden font-mono ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">{safeConfig.subUnitName || 'Sol'} (1-{safeConfig.subUnitsPerMinor || 30})</label>
                <input
                  type="number"
                  min="1"
                  max={safeConfig.subUnitsPerMinor || 30}
                  value={day}
                  onChange={(e) => setDay(Math.max(1, Math.min(safeConfig.subUnitsPerMinor || 30, parseInt(e.target.value) || 1)))}
                  className={`w-full px-2.5 py-1.5 rounded-md text-xs border outline-hidden font-mono ${
                    isDarkMode ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Link Characters */}
          {characters.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 font-mono flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                <span>Associated Characters</span>
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800">
                {characters.map((char) => {
                  const isLinked = selectedCharacterIds.includes(char.id);
                  return (
                    <button
                      key={char.id}
                      type="button"
                      onClick={() => handleToggleCharacter(char.id)}
                      className={`px-2 py-1 rounded-md text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
                        isLinked
                          ? 'bg-accent border-accent text-white'
                          : isDarkMode
                            ? 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                            : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: char.avatarColor || '#a855f7' }} />
                      <span>{char.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 font-mono">
              Event Description & Historical Details
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide narrative context, consequences, casualties, or lore background..."
              className={`w-full px-3 py-2 rounded-lg text-xs border outline-hidden resize-none ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700 focus:border-accent text-white' : 'bg-white border-neutral-300 focus:border-accent text-neutral-900'
              }`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between ${
          isDarkMode ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'
        }`}>
          {eventToEdit && onDeleteEvent ? (
            <button
              onClick={() => {
                onDeleteEvent(eventToEdit.id);
                onClose();
              }}
              className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer px-2 py-1"
            >
              Delete Event
            </button>
          ) : (
            <div />
          )}

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
              disabled={!title.trim()}
              className="px-4 py-1.5 rounded-lg border border-accent text-accent bg-transparent hover:bg-accent/10 disabled:opacity-50 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{eventToEdit ? 'Save Changes' : 'Add to Timeline'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
