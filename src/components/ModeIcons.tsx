import React from 'react';

/**
 * Writing Mode Quill Icon
 * Wiggles dynamically like cursive handwriting when hovering the button.
 * Uses keyframe in index.css set to play 1 cycle and stop.
 */
export const WritingModeIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} shrink-0 overflow-visible quill-write-hover`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Writing Quill"
    >
      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
      <line x1="16" y1="8" x2="2" y2="22" />
      <line x1="17.5" y1="15" x2="9" y2="15" />
    </svg>
  );
};

/**
 * Character Mode Icon
 * In resting state, secondary person is tucked behind the primary person.
 * On hover, they separate and the secondary person reveals a complete torso with both shoulders.
 */
export const CharacterModeIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} shrink-0 overflow-visible`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Characters"
    >
      {/* Secondary Person: starts tucked behind, moves to the right on hover and displays a full torso */}
      <g className="transition-all duration-300 ease-out transform translate-x-0 group-hover:translate-x-3 opacity-80 group-hover:opacity-100">
        <circle cx="15.5" cy="7" r="3.2" />
        {/* Left shoulder of secondary person - fades in smoothly on separation to complete the full torso */}
        <path
          d="M10.5 20v-1.5a3.5 3.5 0 0 1 3.5-3.5h1.5"
          className="transition-opacity duration-300 opacity-0 group-hover:opacity-100"
        />
        {/* Right shoulder of secondary person */}
        <path d="M15.5 15h2a3.5 3.5 0 0 1 3.5 3.5v1.5" />
      </g>

      {/* Primary / Front Person: steps slightly to the left on hover */}
      <g className="transition-transform duration-300 ease-out group-hover:-translate-x-1.5">
        <circle cx="8" cy="7" r="3.5" />
        <path d="M2 20v-1.5a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1.5" />
      </g>
    </svg>
  );
};

/**
 * Lore Mode Icon
 * The ancient scroll unrolls downwards on hover without any gaps in the paper borders.
 */
export const LoreModeIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} shrink-0 overflow-visible`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Lore Scroll"
    >
      {/* Top cylinder & upper continuous side borders */}
      <path d="M19 13V5a2 2 0 0 0-2-2H4" />
      <path d="M6 3v13" />
      <path d="M19 5v9" />

      {/* Unrolling lower parchment & bottom cylinder - overlapping side borders ensure zero gaps */}
      <g className="transition-transform duration-300 ease-out group-hover:translate-y-2">
        {/* Overlapping side borders preventing any gaps during downward translation */}
        <path d="M6 9v8.5" />
        <path d="M19 7v10.5" />
        {/* Bottom cylinder curl */}
        <path d="M8 21h11a2 2 0 0 0 2-2v-1H10v1a2 2 0 1 1-4 0v-2.5" />

        {/* Written lore script lines revealed inside the unrolled parchment */}
        <line
          x1="9"
          y1="10"
          x2="16"
          y2="10"
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 stroke-[1.5]"
        />
        <line
          x1="9"
          y1="13"
          x2="14"
          y2="13"
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 stroke-[1.5]"
        />
      </g>
    </svg>
  );
};

/**
 * World-Building / Map Mode Icon
 * Seamlessly unfolds as one unified connected map on hover.
 */
export const WorldModeIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} shrink-0 overflow-visible`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Map Mode"
    >
      {/* Connected accordion map: expands and unfolds horizontally as a single unified piece */}
      <g className="transition-all duration-300 ease-out origin-center transform scale-x-85 group-hover:scale-x-110 group-hover:scale-y-95">
        {/* Continuous unified map perimeter polygon */}
        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
        {/* Internal fold crease lines permanently connected to the map */}
        <line x1="9" y1="3" x2="9" y2="18" />
        <line x1="15" y1="6" x2="15" y2="21" />
      </g>
    </svg>
  );
};

export const MapModeIcon = WorldModeIcon;

