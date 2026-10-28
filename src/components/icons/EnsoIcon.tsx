import React from 'react';

interface EnsoIconProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Ensō Circle Icon (円相) - The Japanese Zen Buddhist symbol of enlightenment,
 * universe, elegance, and pure focus. Features a characteristic calligraphic open brushstroke.
 */
export const EnsoIcon: React.FC<EnsoIconProps> = ({ 
  className = 'w-3.5 h-3.5',
  style 
}) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* 
        Authentic Ensō brushstroke: an unclosed circular arc sweeping clockwise 
        from the top with a distinctive tapered opening.
      */}
      <path d="M 14.5 3.6 C 18.9 4.6 21.2 9.2 20.8 13.8 C 20.2 18.2 16.5 21.5 12 21.5 C 7.2 21.5 3.2 17.5 3.2 12.2 C 3.2 6.9 7.4 2.8 12.5 2.8 C 14.4 2.8 16.2 3.5 17.6 4.8" />
    </svg>
  );
};
