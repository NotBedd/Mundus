import React from 'react';
import { Globe, Users, Scroll, ArrowRight, Sparkles, CheckCircle2, Map } from 'lucide-react';
import type { ActiveSection } from '../types';

interface SectionPreviewProps {
  section: ActiveSection;
  onReturnToEditor: () => void;
  isDarkMode: boolean;
}

export const SectionPreview: React.FC<SectionPreviewProps> = ({
  section,
  onReturnToEditor,
  isDarkMode
}) => {
  const getSectionDetails = () => {
    switch (section) {
      case 'world':
        return {
          title: 'Map Mode (Beta)',
          icon: Map,
          subtitle: 'Beta Feature',
          description:
            'Upload custom fantasy & sci-fi world maps with smooth pan-zoom controls, interactive map pins, and an indexed directory of kingdoms, cities, and geographical landmarks.',
          features: [
            'Image upload & canvas map viewer',
            'Interactive pinpoints linked to locations',
            'Location encyclopedia with notes & climate details',
            'Cross-reference locations directly in scenes'
          ]
        };
      case 'characters':
        return {
          title: 'Characters & Relationship Graph',
          icon: Users,
          subtitle: 'Upcoming',
          description:
            'Manage comprehensive character dossiers (portraits, traits, arcs, motivations) and explore connections with an interactive visual relationship graph.',
          features: [
            'Character cards with portrait uploads',
            'Dynamic relationship graph (allies, rivals, mentors, kin)',
            'Arc progress and character motivations',
            'Quick-tag characters into manuscript scenes'
          ]
        };
      case 'lore':
      default:
        return {
          title: 'Lore Mode & World Encyclopedia',
          icon: Scroll,
          subtitle: 'Upcoming',
          description:
            'Organize your magic systems, factions, timelines, and artifacts with bidirectional links to your chapters and scenes.',
          features: [
            'Categorized lore archive (Factions, Magic, History, Relics)',
            'Bidirectional chapter and scene linking',
            'Writer sidebar preview while typing in manuscript',
            'Searchable author reference desk'
          ]
        };
    }
  };

  const details = getSectionDetails();
  const Icon = details.icon;

  return (
    <div 
      id={`section-preview-${section}`}
      className={`flex-1 flex items-center justify-center p-6 sm:p-12 overflow-y-auto transition-colors ${
        isDarkMode 
          ? 'bg-gradient-to-b from-[#0a0a0a] via-[#0f0f0f] to-[#141414] text-neutral-100' 
          : 'bg-gradient-to-b from-[#f8f8f8] via-[#f3f3f3] to-[#ebebeb] text-neutral-900'
      }`}
    >
      <div className={`max-w-xl w-full p-8 sm:p-10 rounded-2xl border text-center backdrop-blur-md transition-all ${
        isDarkMode 
          ? 'bg-[#141414]/90 border-neutral-800 shadow-[0_10px_35px_rgba(0,0,0,0.5)]' 
          : 'bg-white/95 border-neutral-200 shadow-[0_10px_30px_rgba(0,0,0,0.06)]'
      }`}>
        <div className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-5 ${
          isDarkMode ? 'bg-neutral-800 text-neutral-100' : 'bg-neutral-100 text-neutral-900'
        }`}>
          <Icon className="w-7 h-7" />
        </div>

        <span className="text-xs uppercase tracking-widest font-mono font-semibold text-neutral-500">
          {details.subtitle}
        </span>
        <h1 className="text-2xl font-bold mt-1 font-display">{details.title}</h1>
        <p className={`text-sm mt-3 leading-relaxed ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
          {details.description}
        </p>

        <div className={`mt-6 p-4 rounded-xl text-left border ${
          isDarkMode ? 'bg-neutral-950/60 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
        }`}>
          <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-1.5 font-mono">
            <Sparkles className="w-3.5 h-3.5 text-neutral-400" />
            <span>Planned Blueprint</span>
          </h2>
          <ul className="space-y-1.5">
            {details.features.map((feat, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
                <span className={isDarkMode ? 'text-neutral-300' : 'text-neutral-700'}>{feat}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
