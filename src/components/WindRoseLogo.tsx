import React from 'react';

interface WindRoseLogoProps {
  className?: string;
  isDarkMode?: boolean;
  color?: string;
  mini?: boolean;
}

/**
 * Freestanding 8-point nautical wind rose / compass rose logo
 * Authentically styled after classic cartographic wind roses.
 */
export const WindRoseLogo: React.FC<WindRoseLogoProps> = ({
  className = 'w-24 h-24',
  isDarkMode = false,
  color,
  mini = false,
}) => {
  // Theme colors for crisp contrast
  const fillSolid = color || (isDarkMode ? '#f5f5f5' : '#050505');
  const fillEmpty = isDarkMode ? '#0a0a0a' : '#ffffff';
  const strokeColor = color || (isDarkMode ? '#f5f5f5' : '#050505');

  const needleStrokeWidth = mini ? 6 : 2.5;
  const dartStrokeWidth = mini ? 3.5 : 1.5;
  const spineStrokeWidth = mini ? 3.5 : 1.5;
  const eyeRadius = mini ? 20 : 17;
  const eyeStrokeWidth = mini ? 6 : 3.5;
  const dotRadius = mini ? 9 : 8;

  return (
    <svg
      viewBox="0 0 200 200"
      className={`${className} select-none`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Mundus Wind Rose"
    >
      {/* Intermediate 4 Diagonal Points (NW, NE, SE, SW) - Solid darts */}
      {/* North-East dart */}
      <polygon
        points="114,84 145,55 124,94"
        fill={fillSolid}
        stroke={strokeColor}
        strokeWidth={dartStrokeWidth}
        strokeLinejoin="round"
      />
      {/* North-West dart */}
      <polygon
        points="86,84 55,55 76,94"
        fill={fillSolid}
        stroke={strokeColor}
        strokeWidth={dartStrokeWidth}
        strokeLinejoin="round"
      />
      {/* South-West dart */}
      <polygon
        points="76,106 55,145 86,116"
        fill={fillSolid}
        stroke={strokeColor}
        strokeWidth={dartStrokeWidth}
        strokeLinejoin="round"
      />
      {/* South-East dart */}
      <polygon
        points="124,106 145,145 114,116"
        fill={fillSolid}
        stroke={strokeColor}
        strokeWidth={dartStrokeWidth}
        strokeLinejoin="round"
      />

      {/* 4 Cardinal Points with 3D Faceted Shading */}

      {/* NORTH NEEDLE */}
      {/* Left facet: Empty/White with stroke */}
      <polygon
        points="100,10 86,86 100,100"
        fill={fillEmpty}
        stroke={strokeColor}
        strokeWidth={needleStrokeWidth}
        strokeLinejoin="round"
      />
      {/* Right facet: Solid */}
      <polygon
        points="100,10 114,86 100,100"
        fill={fillSolid}
        stroke={strokeColor}
        strokeWidth={needleStrokeWidth}
        strokeLinejoin="round"
      />

      {/* SOUTH NEEDLE */}
      {/* Left facet: Solid */}
      <polygon
        points="100,190 86,114 100,100"
        fill={fillSolid}
        stroke={strokeColor}
        strokeWidth={needleStrokeWidth}
        strokeLinejoin="round"
      />
      {/* Right facet: Empty/White with stroke */}
      <polygon
        points="100,190 114,114 100,100"
        fill={fillEmpty}
        stroke={strokeColor}
        strokeWidth={needleStrokeWidth}
        strokeLinejoin="round"
      />

      {/* WEST NEEDLE */}
      {/* Top facet: Solid */}
      <polygon
        points="10,100 86,86 100,100"
        fill={fillSolid}
        stroke={strokeColor}
        strokeWidth={needleStrokeWidth}
        strokeLinejoin="round"
      />
      {/* Bottom facet: Empty/White with stroke */}
      <polygon
        points="10,100 86,114 100,100"
        fill={fillEmpty}
        stroke={strokeColor}
        strokeWidth={needleStrokeWidth}
        strokeLinejoin="round"
      />

      {/* EAST NEEDLE */}
      {/* Top facet: Empty/White with stroke */}
      <polygon
        points="190,100 114,86 100,100"
        fill={fillEmpty}
        stroke={strokeColor}
        strokeWidth={needleStrokeWidth}
        strokeLinejoin="round"
      />
      {/* Bottom facet: Solid */}
      <polygon
        points="190,100 114,114 100,100"
        fill={fillSolid}
        stroke={strokeColor}
        strokeWidth={needleStrokeWidth}
        strokeLinejoin="round"
      />

      {/* Spine divider lines for clean crisp definition */}
      <line x1="100" y1="10" x2="100" y2="190" stroke={strokeColor} strokeWidth={spineStrokeWidth} />
      <line x1="10" y1="100" x2="190" y2="100" stroke={strokeColor} strokeWidth={spineStrokeWidth} />

      {/* Center Circular Eye & Ring */}
      {/* Outer ring: masks needles beneath */}
      <circle
        cx="100"
        cy="100"
        r={eyeRadius}
        fill={fillEmpty}
        stroke={strokeColor}
        strokeWidth={eyeStrokeWidth}
      />
      {/* Center solid pivot dot */}
      <circle
        cx="100"
        cy="100"
        r={dotRadius}
        fill={fillSolid}
      />
    </svg>
  );
};
