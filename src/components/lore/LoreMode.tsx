import React, { useState, useEffect } from 'react';
import { 
  Scroll, 
  Clock, 
  GitFork, 
  BookOpen, 
  Globe, 
  Sparkles, 
  ArrowRight, 
  Layers, 
  Milestone, 
  ShieldAlert, 
  Wand2, 
  Cpu, 
  Search,
  CheckCircle2,
  Calendar
} from 'lucide-react';
import type {
  NovelDocument,
  Folder,
  Character,
  TimelineEvent,
  TimelineConfig,
  SceneTimelineInfo,
  StoryNodeLink,
  CodexEntry,
  CodexSection
} from '../../types';
import { INITIAL_TIMELINE_CONFIG } from '../../lib/initialData';
import { TimelineView } from './TimelineView';
import { StoryFlowGraph } from './StoryFlowGraph';
import { CodexMode } from './CodexMode';
import { TimelineConfigModal } from './TimelineConfigModal';

interface LoreModeProps {
  initialSubView?: LoreSubView;
  initialCodexEntryId?: string | null;
  documents: NovelDocument[];
  folders: Folder[];
  characters: Character[];
  timelineEvents: TimelineEvent[];
  timelineConfig?: TimelineConfig;
  storyLinks?: StoryNodeLink[];
  codexEntries?: CodexEntry[];
  onSaveTimelineEvent: (event: Partial<TimelineEvent>) => void;
  onDeleteTimelineEvent: (id: string) => void;
  onSaveSceneTimelineInfo: (docId: string, info: SceneTimelineInfo) => void;
  onSaveTimelineConfig: (config: TimelineConfig) => void;
  codexSections?: CodexSection[];
  onSaveCodexSections?: (sections: CodexSection[]) => void;
  onSaveStoryLink: (link: Partial<StoryNodeLink>) => void;
  onDeleteStoryLink: (linkId: string) => void;
  onCreateCodexEntry: (entry: Partial<CodexEntry>) => void;
  onUpdateCodexEntry: (id: string, entry: Partial<CodexEntry>) => void;
  onDeleteCodexEntry: (id: string) => void;
  onUpdateCharacter?: (id: string, changes: Partial<Character>) => void;
  onSelectDocumentForEditor: (docId: string) => void;
  onReturnToEditor: () => void;
  isDarkMode: boolean;
  activeMundusId?: string;
  onNavigateToMap?: (codexId?: string, markerId?: string) => void;
  imgbbApiKey?: string;
  onOpenSettings?: () => void;
}

export type LoreSubView = 'hub' | 'timeline' | 'story_flow' | 'codex';

export const LoreMode: React.FC<LoreModeProps> = ({
  initialSubView = 'hub',
  initialCodexEntryId,
  documents,
  folders,
  characters,
  timelineEvents,
  timelineConfig,
  storyLinks = [],
  codexEntries = [],
  onSaveTimelineEvent,
  onDeleteTimelineEvent,
  onSaveSceneTimelineInfo,
  onSaveTimelineConfig,
  codexSections,
  onSaveCodexSections,
  onSaveStoryLink,
  onDeleteStoryLink,
  onCreateCodexEntry,
  onUpdateCodexEntry,
  onDeleteCodexEntry,
  onUpdateCharacter,
  onSelectDocumentForEditor,
  onReturnToEditor,
  isDarkMode,
  activeMundusId,
  onNavigateToMap,
  imgbbApiKey,
  onOpenSettings
}) => {
  const safeConfig = timelineConfig || INITIAL_TIMELINE_CONFIG;
  const [activeSubView, setActiveSubView] = useState<LoreSubView>(initialSubView);
  const [hubSearch, setHubSearch] = useState('');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  useEffect(() => {
    if (initialSubView) {
      setActiveSubView(initialSubView);
    }
  }, [initialSubView]);

  // Number of placed scenes on timeline
  const placedScenesCount = documents.filter((d) => d.timelineInfo?.startYear !== undefined).length;

  if (activeSubView === 'timeline') {
    return (
      <TimelineView
        documents={documents}
        folders={folders}
        characters={characters}
        timelineEvents={timelineEvents}
        timelineConfig={safeConfig}
        onSaveTimelineEvent={onSaveTimelineEvent}
        onDeleteTimelineEvent={onDeleteTimelineEvent}
        onSaveSceneTimelineInfo={onSaveSceneTimelineInfo}
        onSaveTimelineConfig={onSaveTimelineConfig}
        onUpdateCharacter={onUpdateCharacter}
        onSelectDocumentForEditor={(id) => {
          onSelectDocumentForEditor(id);
          onReturnToEditor();
        }}
        onReturnToHub={() => setActiveSubView('hub')}
        isDarkMode={isDarkMode}
      />
    );
  }

  if (activeSubView === 'story_flow') {
    return (
      <StoryFlowGraph
        activeMundusId={activeMundusId}
        documents={documents}
        folders={folders}
        storyLinks={storyLinks}
        timelineConfig={timelineConfig}
        onSaveSceneTimelineInfo={onSaveSceneTimelineInfo}
        onSaveStoryLink={onSaveStoryLink}
        onDeleteStoryLink={onDeleteStoryLink}
        onSelectDocumentForEditor={(id) => {
          onSelectDocumentForEditor(id);
          onReturnToEditor();
        }}
        onReturnToHub={() => setActiveSubView('hub')}
        isDarkMode={isDarkMode}
      />
    );
  }

  if (activeSubView === 'codex') {
    return (
      <CodexMode
        initialEntryId={initialCodexEntryId}
        codexEntries={codexEntries}
        codexSections={codexSections}
        onSaveCodexSections={onSaveCodexSections}
        characters={characters}
        documents={documents}
        folders={folders}
        activeMundusId={activeMundusId}
        onNavigateToMap={onNavigateToMap}
        onCreateCodexEntry={onCreateCodexEntry}
        onUpdateCodexEntry={onUpdateCodexEntry}
        onDeleteCodexEntry={onDeleteCodexEntry}
        onReturnToHub={() => setActiveSubView('hub')}
        onSelectDocumentForEditor={onSelectDocumentForEditor}
        isDarkMode={isDarkMode}
        imgbbApiKey={imgbbApiKey}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  return (
    <div 
      id="lore-mode-hub"
      className={`flex-1 flex flex-col h-full overflow-y-auto transition-colors ${
        isDarkMode ? 'bg-[#0a0a0a] text-neutral-100' : 'bg-[#f7f8fa] text-neutral-900'
      }`}
    >
      {/* Top Header */}
      <div className={`p-5 sm:p-6 border-b flex items-center justify-between gap-4 sticky top-0 z-20 backdrop-blur-md ${
        isDarkMode ? 'border-neutral-800 bg-[#111111]/90' : 'border-neutral-200 bg-white/90'
      }`}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onReturnToEditor}
            title="Click to return to Writing"
            className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-xs transition-all cursor-pointer group hover:scale-105 active:scale-95 ${
              isDarkMode 
                ? 'bg-neutral-900 border-neutral-700 text-neutral-200 hover:border-accent' 
                : 'bg-neutral-100 border-neutral-200 text-neutral-800 hover:border-accent'
            }`}
          >
            <Scroll className="w-5 h-5 group-hover:text-accent transition-colors" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold font-display">Lore</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Main Hub Grid Content */}
      <div className="max-w-6xl w-full mx-auto p-6 sm:p-8 space-y-8">
        {/* Quick Stats Overview Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className={`p-4 rounded-xl border ${
            isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-white border-neutral-200 shadow-2xs'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400 font-mono">Milestone Events</span>
              <Milestone className="w-4 h-4 text-accent" />
            </div>
            <p className="text-xl font-bold font-display mt-1">{timelineEvents.length}</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">Recorded on timeline</p>
          </div>

          <div className={`p-4 rounded-xl border ${
            isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-white border-neutral-200 shadow-2xs'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400 font-mono">Placed Scenes</span>
              <Clock className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-xl font-bold font-display mt-1">{placedScenesCount} / {documents.length}</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">Assigned time duration</p>
          </div>

          <div className={`p-4 rounded-xl border ${
            isDarkMode ? 'bg-neutral-900/60 border-neutral-800' : 'bg-white border-neutral-200 shadow-2xs'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400 font-mono">Story Links</span>
              <GitFork className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-xl font-bold font-display mt-1">{storyLinks.length}</p>
            <p className="text-[11px] text-neutral-500 mt-0.5">Causal & sequence links</p>
          </div>

          <button
            id="btn-lore-edit-time-system"
            onClick={() => setIsConfigModalOpen(true)}
            title="Click to edit custom calendar system & epoch"
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer group hover:border-accent ${
              isDarkMode ? 'bg-neutral-900/60 border-neutral-800 hover:bg-neutral-800/80' : 'bg-white border-neutral-200 shadow-2xs hover:bg-neutral-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-400 font-mono group-hover:text-accent transition-colors">Calendar System</span>
              <Calendar className="w-4 h-4 text-neutral-400 group-hover:text-accent group-hover:scale-110 transition-all" />
            </div>
            <p className="text-sm font-bold font-display truncate mt-1.5">{safeConfig.epochName || 'Third Age of Sol'}</p>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 flex items-center justify-between">
              <span>{safeConfig.majorUnitName || 'Year'} scale</span>
              <span className="text-[10px] underline font-mono text-neutral-500 dark:text-neutral-400 group-hover:text-accent transition-colors">Edit System →</span>
            </p>
          </button>
        </div>

        {/* Primary Sections Cards */}
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Section 1: Timeline & Chronology */}
            <div 
              id="card-lore-timeline"
              onClick={() => setActiveSubView('timeline')}
              className={`p-6 rounded-2xl border transition-all cursor-pointer group hover:scale-[1.01] hover:shadow-xl relative overflow-hidden flex flex-col justify-between ${
                isDarkMode 
                  ? 'bg-neutral-900/80 border-neutral-800 hover:border-accent' 
                  : 'bg-white border-neutral-200 hover:border-accent shadow-sm'
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-xs transition-colors ${
                    isDarkMode ? 'bg-accent/10 border-accent/30 text-accent group-hover:bg-accent/20' : 'bg-accent/10 border-accent/30 text-accent group-hover:bg-accent/20'
                  }`}>
                    <Clock className="w-6 h-6" />
                  </div>
                </div>

                <h3 className="text-lg font-bold font-display mt-4 group-hover:text-accent transition-colors">
                  Timeline & Chronology
                </h3>
                <p className={`text-xs mt-2 leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
                  View or edit a horizontal timeline for major events, character lifespans and scene historic placement, based off of the current calendar system
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                <span className="text-xs text-neutral-400 font-mono">
                  {timelineEvents.length} events • {placedScenesCount} placed scenes
                </span>
                <div className="flex items-center gap-1 text-xs font-semibold text-accent group-hover:translate-x-1 transition-transform">
                  <span>Enter Timeline</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Section 2: Story Flow & Scene Linking */}
            <div 
              id="card-lore-story-flow"
              onClick={() => setActiveSubView('story_flow')}
              className={`p-6 rounded-2xl border transition-all cursor-pointer group hover:scale-[1.01] hover:shadow-xl relative overflow-hidden flex flex-col justify-between ${
                isDarkMode 
                  ? 'bg-neutral-900/80 border-neutral-800 hover:border-blue-500/80' 
                  : 'bg-white border-neutral-200 hover:border-blue-500 shadow-sm'
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-xs transition-colors ${
                    isDarkMode ? 'bg-blue-950/40 border-blue-800 text-blue-400 group-hover:bg-blue-900/50' : 'bg-blue-50 border-blue-200 text-blue-600 group-hover:bg-blue-100'
                  }`}>
                    <GitFork className="w-6 h-6" />
                  </div>
                </div>

                <h3 className="text-lg font-bold font-display mt-4 group-hover:text-blue-400 transition-colors">
                  Story Flow & Scene Linking
                </h3>
                <p className={`text-xs mt-2 leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
                  Interactive node graph connecting chapters and scenes. Visualize causality chains, parallel POV subplots, flashbacks, foreshadowing seeds, and branching narrative forks.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                <span className="text-xs text-neutral-400 font-mono">
                  {storyLinks.length} connections • {documents.length} scene nodes
                </span>
                <div className="flex items-center gap-1 text-xs font-semibold text-blue-400 group-hover:translate-x-1 transition-transform">
                  <span>Open Story Graph</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Section 3: Codex & Encyclopedia */}
            <div 
              id="card-lore-codex"
              onClick={() => setActiveSubView('codex')}
              className={`p-6 rounded-2xl border transition-all cursor-pointer group hover:scale-[1.01] hover:shadow-xl relative overflow-hidden flex flex-col justify-between ${
                isDarkMode 
                  ? 'bg-neutral-900/80 border-neutral-800 hover:border-amber-500/80' 
                  : 'bg-white border-neutral-200 hover:border-amber-500 shadow-sm'
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-xs transition-colors ${
                    isDarkMode ? 'bg-amber-950/40 border-amber-800 text-amber-400 group-hover:bg-amber-900/50' : 'bg-amber-50 border-amber-200 text-amber-600 group-hover:bg-amber-100'
                  }`}>
                    <BookOpen className="w-6 h-6" />
                  </div>
                </div>

                <h3 className="text-lg font-bold font-display mt-4 group-hover:text-accent transition-colors">
                  World Codex & Encyclopedia
                </h3>
                <p className={`text-xs mt-2 leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
                  Encyclopedia for non-character world elements: describe houses, noble dynasties, factions, geography, castles, relics, and magic systems.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                <span className="text-xs text-neutral-400 font-mono">
                  {codexEntries.length} encyclopedia entries
                </span>
                <div className="flex items-center gap-1 text-xs font-semibold text-amber-400 group-hover:translate-x-1 transition-transform">
                  <span>Open Codex</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Upcoming Section 4: Magic & Technology Systems */}
            <div className={`p-6 rounded-2xl border opacity-75 relative ${
              isDarkMode ? 'bg-neutral-900/40 border-neutral-800' : 'bg-white border-neutral-200'
            }`}>
              <div className="flex items-start justify-between">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                  isDarkMode ? 'bg-neutral-800 border-neutral-700 text-neutral-400' : 'bg-neutral-100 border-neutral-200 text-neutral-600'
                }`}>
                  <Wand2 className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded text-neutral-500 bg-neutral-200 dark:bg-neutral-800">
                  Roadmap
                </span>
              </div>

              <h3 className="text-lg font-bold font-display mt-4">
                Magic, Tech & Cosmology Systems
              </h3>
              <p className={`text-xs mt-2 leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
                Structured rulesets for hard/soft magic, futuristic technologies, energy constraints, and pantheon hierarchies.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Time System / Calendar Configuration Modal */}
      <TimelineConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        config={safeConfig}
        onSaveConfig={onSaveTimelineConfig}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};
